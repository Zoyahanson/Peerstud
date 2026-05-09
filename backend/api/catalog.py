from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.api.schemas import (
    CourseSummaryResponse,
    ResourceSummaryResponse,
    UserCourseSelection,
    UserCourseSelectionResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Course, Resource, Session as StudySession, User, UserCourse, UserProfile
from backend.services.resource_storage import store_resource_file


router = APIRouter(tags=["catalog"])


def _normalize_topics(topics: list[str]) -> list[str]:
    return [topic.strip() for topic in topics if topic.strip()][:20]


def _bootstrap_user_courses_for_current_user(*, db: Session, current_user: User) -> None:
    existing_count = db.query(UserCourse).filter(UserCourse.user_id == current_user.id).count()
    if existing_count > 0:
        return

    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile or not profile.current_courses:
        return

    existing_courses = {course.title.strip().lower(): course for course in db.query(Course).all()}
    created_any = False
    for course_name in profile.current_courses:
        normalized = course_name.strip().lower()
        if not normalized:
            continue

        course = existing_courses.get(normalized)
        if not course:
            course = Course(title=course_name.strip(), description=None)
            db.add(course)
            db.flush()
            existing_courses[normalized] = course

        db.add(
            UserCourse(
                user_id=current_user.id,
                course_id=course.id,
                proficiency="average",
            )
        )
        created_any = True

    if created_any:
        db.commit()


@router.get("/courses", response_model=list[CourseSummaryResponse])
def list_courses(
    mine_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CourseSummaryResponse]:
    query = (
        db.query(
            Course,
            func.count(func.distinct(StudySession.id)).label("sessions_count"),
            func.count(func.distinct(Resource.id)).label("resources_count"),
        )
        .outerjoin(StudySession, StudySession.course_id == Course.id)
        .outerjoin(Resource, Resource.course_id == Course.id)
        .outerjoin(UserCourse, UserCourse.course_id == Course.id)
        .group_by(Course.id)
        .order_by(Course.created_at.desc())
    )

    if mine_only:
        _bootstrap_user_courses_for_current_user(db=db, current_user=current_user)
        query = query.filter(
            or_(
                UserCourse.user_id == current_user.id,
                UserCourse.supplementary_tutor_user_id == current_user.id,
            )
        )

    rows = query.all()
    return [
        CourseSummaryResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            instructor_id=None,
            student_count=int(
                db.query(func.count(func.distinct(UserCourse.user_id)))
                .filter(UserCourse.course_id == course.id)
                .scalar()
                or 0
            ),
            supplementary_tutor_count=int(
                db.query(func.count(func.distinct(UserCourse.supplementary_tutor_user_id)))
                .filter(
                    UserCourse.course_id == course.id,
                    UserCourse.supplementary_tutor_user_id.isnot(None),
                )
                .scalar()
                or 0
            ),
            sessions_count=int(sessions_count or 0),
            resources_count=int(resources_count or 0),
        )
        for course, sessions_count, resources_count in rows
    ]


@router.get("/courses/mine", response_model=list[UserCourseSelectionResponse])
def list_my_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserCourseSelectionResponse]:
    rows = (
        db.query(UserCourse, Course)
        .join(Course, Course.id == UserCourse.course_id)
        .filter(UserCourse.user_id == current_user.id)
        .order_by(Course.title.asc())
        .all()
    )
    return [
        UserCourseSelectionResponse(
            course_id=course.id,
            title=course.title,
            proficiency=user_course.proficiency,
            strong_topics=user_course.strong_topics,
            need_topics=user_course.need_topics,
            supplementary_tutor_user_id=user_course.supplementary_tutor_user_id,
        )
        for user_course, course in rows
    ]


@router.put("/courses/mine", response_model=list[UserCourseSelectionResponse])
def upsert_my_courses(
    payload: list[UserCourseSelection],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserCourseSelectionResponse]:
    selected_course_ids = {item.course_id for item in payload}

    valid_course_ids = {
        row[0]
        for row in db.query(Course.id).filter(Course.id.in_(selected_course_ids)).all()
    }
    if len(valid_course_ids) != len(selected_course_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more courses are invalid")

    existing_rows = (
        db.query(UserCourse)
        .filter(UserCourse.user_id == current_user.id)
        .all()
    )
    existing_by_course_id = {row.course_id: row for row in existing_rows}

    for row in existing_rows:
        if row.course_id not in selected_course_ids:
            db.delete(row)

    for item in payload:
        if item.proficiency not in {"strong", "average", "weak"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="proficiency must be strong, average, or weak")

        record = existing_by_course_id.get(item.course_id)
        if not record:
            record = UserCourse(user_id=current_user.id, course_id=item.course_id)

        record.proficiency = item.proficiency
        record.strong_topics = _normalize_topics(item.strong_topics)
        record.need_topics = _normalize_topics(item.need_topics)
        record.supplementary_tutor_user_id = item.supplementary_tutor_user_id
        db.add(record)

    selected_titles = [
        row[0]
        for row in db.query(Course.title).filter(Course.id.in_(selected_course_ids)).order_by(Course.title.asc()).all()
    ]
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id, current_courses=selected_titles)
    else:
        profile.current_courses = selected_titles
    db.add(profile)

    db.commit()

    rows = (
        db.query(UserCourse, Course)
        .join(Course, Course.id == UserCourse.course_id)
        .filter(UserCourse.user_id == current_user.id)
        .order_by(Course.title.asc())
        .all()
    )
    return [
        UserCourseSelectionResponse(
            course_id=course.id,
            title=course.title,
            proficiency=user_course.proficiency,
            strong_topics=user_course.strong_topics,
            need_topics=user_course.need_topics,
            supplementary_tutor_user_id=user_course.supplementary_tutor_user_id,
        )
        for user_course, course in rows
    ]


@router.get("/resources", response_model=list[ResourceSummaryResponse])
def list_resources(
    course_id: str | None = None,
    session_id: str | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ResourceSummaryResponse]:
    query = db.query(Resource)
    if course_id:
        query = query.filter(Resource.course_id == course_id)
    if session_id:
        query = query.filter(Resource.session_id == session_id)

    resources = query.order_by(Resource.created_at.desc()).all()
    return [
        ResourceSummaryResponse(
            id=item.id,
            course_id=item.course_id,
            session_id=item.session_id,
            title=item.title,
            url=item.url,
            storage_path=item.storage_path,
            file_name=item.file_name,
            mime_type=item.mime_type,
            file_size_bytes=item.file_size_bytes,
            resource_type=item.resource_type,
            created_at=item.created_at,
        )
        for item in resources
    ]


@router.post("/resources/upload", response_model=ResourceSummaryResponse)
async def upload_resource(
    course_id: str = Form(...),
    title: str = Form(...),
    resource_type: str = Form("file"),
    session_id: str | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceSummaryResponse:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    if session_id:
        session = db.query(StudySession).filter(StudySession.id == session_id).first()
        if not session or str(session.course_id) != course_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session must belong to the selected course",
            )

    upload_result = await store_resource_file(upload=file, course_id=course_id, session_id=session_id)
    resource = Resource(
        course_id=course_id,
        session_id=session_id,
        uploaded_by_user_id=current_user.id,
        title=title,
        url=str(upload_result["url"]),
        storage_path=str(upload_result["storage_path"]),
        file_name=str(upload_result["file_name"]),
        mime_type=str(upload_result["mime_type"]),
        file_size_bytes=int(upload_result["file_size_bytes"]),
        resource_type=resource_type,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)

    return ResourceSummaryResponse(
        id=resource.id,
        course_id=resource.course_id,
        session_id=resource.session_id,
        title=resource.title,
        url=resource.url,
        storage_path=resource.storage_path,
        file_name=resource.file_name,
        mime_type=resource.mime_type,
        file_size_bytes=resource.file_size_bytes,
        resource_type=resource.resource_type,
        created_at=resource.created_at,
    )
