from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from backend.api.schemas import (
    StudyGroupCreate,
    StudyGroupMemberResponse,
    StudyGroupRecommendationResponse,
    StudyGroupResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Course, Session as StudySession, StudyGroup, StudyGroupMember, User, UserProfile


router = APIRouter(prefix="/study-groups", tags=["study-groups"])


def _normalize_tokens(value: str | None) -> set[str]:
    if not value:
        return set()
    normalized = value.lower().replace(",", " ").replace("/", " ")
    return {token for token in normalized.split() if len(token) > 2}


def _active_members(group: StudyGroup) -> list[StudyGroupMember]:
    return [member for member in group.members if member.status == "active"]


def _prune_inactive_members(group: StudyGroup) -> bool:
    changed = False
    cutoff = datetime.now(timezone.utc) - timedelta(days=group.inactive_after_days)
    for member in group.members:
        if member.status == "active" and member.last_active_at < cutoff:
            member.status = "removed_inactive"
            changed = True
    return changed


def _serialize_group(group: StudyGroup, current_user_id: str) -> StudyGroupResponse:
    active_members = _active_members(group)
    member_responses = [
        StudyGroupMemberResponse(
            user_id=member.user_id,
            full_name=member.user.full_name,
            email=member.user.email,
            status=member.status,
            attendance_count=member.attendance_count,
            joined_at=member.joined_at,
            last_active_at=member.last_active_at,
        )
        for member in active_members
    ]
    member_count = len(active_members)
    return StudyGroupResponse(
        id=group.id,
        course_id=group.course_id,
        course_title=group.course.title,
        topic_focus=group.topic_focus,
        scheduled_start=group.scheduled_start,
        scheduled_end=group.scheduled_end,
        target_size=group.target_size,
        min_size=group.min_size,
        max_size=group.max_size,
        attendance_required=group.attendance_required,
        inactive_after_days=group.inactive_after_days,
        system_suggested=group.system_suggested,
        status=group.status,
        member_count=member_count,
        open_slots=max(group.max_size - member_count, 0),
        joined=any(member.user_id == current_user_id for member in active_members),
        members=member_responses,
    )


def _load_groups(*, db: Session, course_id: str | None = None) -> list[StudyGroup]:
    query = db.query(StudyGroup).options(
        selectinload(StudyGroup.course),
        selectinload(StudyGroup.members).selectinload(StudyGroupMember.user),
    )
    if course_id:
        query = query.filter(StudyGroup.course_id == course_id)
    return query.order_by(StudyGroup.scheduled_start.asc()).all()


def _group_score(group: StudyGroup, current_profile: UserProfile | None) -> tuple[int, int]:
    active_members = _active_members(group)
    size_score = -abs(group.target_size - len(active_members))
    complement_score = 0
    if current_profile:
        my_strengths = _normalize_tokens(current_profile.strengths)
        my_weak_topics = _normalize_tokens(current_profile.weak_topics)
        for member in active_members:
            profile = member.user.profile
            if not profile:
                continue
            complement_score += len(my_weak_topics & _normalize_tokens(profile.strengths))
            complement_score += len(my_strengths & _normalize_tokens(profile.weak_topics))
    return (complement_score, size_score)


def _build_suggested_times(course: Course, db: Session) -> tuple[datetime, datetime]:
    upcoming_session = (
        db.query(StudySession)
        .filter(StudySession.course_id == course.id)
        .order_by(StudySession.start_time.asc())
        .first()
    )
    if upcoming_session:
        return upcoming_session.start_time, upcoming_session.end_time

    start = datetime.now(timezone.utc) + timedelta(days=2)
    start = start.replace(hour=18, minute=0, second=0, microsecond=0)
    end = start + timedelta(minutes=90)
    return start, end


@router.get("", response_model=list[StudyGroupResponse])
def list_study_groups(
    course_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudyGroupResponse]:
    groups = _load_groups(db=db, course_id=course_id)
    changed = False
    for group in groups:
        changed = _prune_inactive_members(group) or changed
    if changed:
        db.commit()

    return [_serialize_group(group, str(current_user.id)) for group in groups]


@router.get("/recommendation", response_model=StudyGroupRecommendationResponse)
def recommend_study_group(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyGroupRecommendationResponse:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    current_profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    groups = _load_groups(db=db, course_id=course_id)
    changed = False
    for group in groups:
        changed = _prune_inactive_members(group) or changed
    if changed:
        db.commit()

    enrolled_profiles = [
        profile
        for profile in db.query(UserProfile).all()
        if course.title.lower() in {course_name.lower() for course_name in profile.current_courses}
    ]
    enrolled_count = len(enrolled_profiles)
    eligible_groups = [
        group
        for group in groups
        if group.status == "open"
        and group.scheduled_end > datetime.now(timezone.utc)
        and len(_active_members(group)) < group.max_size
        and not any(member.user_id == current_user.id and member.status == "active" for member in group.members)
    ]

    if eligible_groups:
        recommended_group = max(eligible_groups, key=lambda group: _group_score(group, current_profile))
        complementary_signals: list[str] = []
        if current_profile and current_profile.weak_topics:
            complementary_signals.append("Members in this group can offset some of your weak-topic areas.")
        if current_profile and current_profile.strengths:
            complementary_signals.append("Your strengths can add balance to this group.")
        member_count = len(_active_members(recommended_group))
        return StudyGroupRecommendationResponse(
            course_id=course.id,
            course_title=course.title,
            enrolled_count=enrolled_count,
            recommendation_type="join_existing",
            message=f"{member_count} students are preparing for {recommended_group.topic_focus}. Join this group?",
            suggested_group=_serialize_group(recommended_group, str(current_user.id)),
            complementary_signals=complementary_signals,
        )

    suggested_start, suggested_end = _build_suggested_times(course, db)
    target_size = min(max(enrolled_count, 5), 15) if enrolled_count else 6
    topic_focus = f"{course.title} Midterm Prep"
    complementary_signals = []
    if current_profile and current_profile.weak_topics:
        complementary_signals.append("Choose a topic focus that targets your current weak topics.")
    if current_profile and current_profile.strengths:
        complementary_signals.append("Your strengths make you a strong anchor member for a new group.")

    return StudyGroupRecommendationResponse(
        course_id=course.id,
        course_title=course.title,
        enrolled_count=enrolled_count,
        recommendation_type="create_suggested",
        message=f"No balanced group is open yet for {course.title}. Start a suggested group for this topic?",
        suggested_topic_focus=topic_focus,
        suggested_start=suggested_start,
        suggested_end=suggested_end,
        complementary_signals=complementary_signals,
    )


@router.post("", response_model=StudyGroupResponse)
def create_study_group(
    payload: StudyGroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyGroupResponse:
    if payload.scheduled_end <= payload.scheduled_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scheduled_end must be after scheduled_start",
        )

    course = db.query(Course).filter(Course.id == payload.course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    group = StudyGroup(
        course_id=course.id,
        creator_user_id=current_user.id,
        topic_focus=payload.topic_focus,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        target_size=payload.target_size,
        min_size=5,
        max_size=15,
        attendance_required=True,
        inactive_after_days=21,
        system_suggested=False,
        status="open",
    )
    db.add(group)
    db.flush()

    membership = StudyGroupMember(
        group_id=group.id,
        user_id=current_user.id,
        status="active",
        attendance_count=0,
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(membership)
    db.commit()

    created_group = _load_groups(db=db, course_id=str(course.id))
    group = next(item for item in created_group if item.id == group.id)
    return _serialize_group(group, str(current_user.id))


@router.post("/{group_id}/join", response_model=StudyGroupResponse)
def join_study_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyGroupResponse:
    group = (
        db.query(StudyGroup)
        .options(
            selectinload(StudyGroup.course),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.user),
        )
        .filter(StudyGroup.id == group_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study group not found")

    if _prune_inactive_members(group):
        db.commit()
        db.refresh(group)

    membership = next((member for member in group.members if member.user_id == current_user.id), None)
    if membership and membership.status == "active":
        return _serialize_group(group, str(current_user.id))

    if len(_active_members(group)) >= group.max_size:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Study group is already full")

    if membership:
        membership.status = "active"
        membership.last_active_at = datetime.now(timezone.utc)
    else:
        membership = StudyGroupMember(
            group_id=group.id,
            user_id=current_user.id,
            status="active",
            attendance_count=0,
            last_active_at=datetime.now(timezone.utc),
        )
        db.add(membership)

    db.commit()
    refreshed_group = (
        db.query(StudyGroup)
        .options(
            selectinload(StudyGroup.course),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.user),
        )
        .filter(StudyGroup.id == group.id)
        .first()
    )
    return _serialize_group(refreshed_group, str(current_user.id))


@router.post("/{group_id}/attendance", response_model=StudyGroupResponse)
def mark_group_attendance(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyGroupResponse:
    group = (
        db.query(StudyGroup)
        .options(
            selectinload(StudyGroup.course),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.user),
        )
        .filter(StudyGroup.id == group_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study group not found")

    membership = next(
        (member for member in group.members if member.user_id == current_user.id and member.status == "active"),
        None,
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Join the group before tracking attendance")

    membership.attendance_count += 1
    membership.last_active_at = datetime.now(timezone.utc)
    db.commit()

    refreshed_group = (
        db.query(StudyGroup)
        .options(
            selectinload(StudyGroup.course),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.user),
        )
        .filter(StudyGroup.id == group.id)
        .first()
    )
    return _serialize_group(refreshed_group, str(current_user.id))