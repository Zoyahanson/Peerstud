from __future__ import annotations

from datetime import datetime, timezone
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, selectinload

from backend.api.schemas import (
    SessionCreate,
    SessionParticipantResponse,
    SessionRatingCreate,
    SessionRatingResponse,
    SessionResponse,
)
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import (
    Course,
    Session as StudySession,
    SessionParticipant,
    SessionRating,
    User,
    UserProfile,
    UserSettings,
)


router = APIRouter(prefix="/sessions", tags=["sessions"])


def _serialize_session(item: StudySession, current_user_id: str) -> SessionResponse:
    participants = list(item.participants)
    confirmed_participants = [participant for participant in participants if participant.status == "confirmed"]
    invited_participants = [participant for participant in participants if participant.status == "invited"]
    average_rating = None
    if item.ratings:
        average_rating = round(sum(rating.score for rating in item.ratings) / len(item.ratings), 2)

    return SessionResponse(
        id=item.id,
        course_id=item.course_id,
        course_title=item.course.title,
        host_user_id=item.host_user_id,
        host_name=item.host.full_name,
        classroom_name=item.classroom_name,
        topic_focus=item.topic_focus,
        description=item.description,
        start_time=item.start_time,
        end_time=item.end_time,
        meet_link=item.meet_link,
        calendar_event_id=item.calendar_event_id,
        status=item.status,
        participant_count=len(confirmed_participants),
        invited_count=len(invited_participants),
        joined=any(
            participant.user_id == current_user_id and participant.status == "confirmed"
            for participant in participants
        ),
        average_rating=average_rating,
        participants=[
            SessionParticipantResponse(
                user_id=participant.user_id,
                full_name=participant.user.full_name,
                email=participant.user.email,
                status=participant.status,
                joined_at=participant.joined_at,
            )
            for participant in participants
        ],
    )


def _ensure_profile(db: Session, user_id: str) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile:
        return profile

    profile = UserProfile(user_id=user_id, current_courses=[])
    db.add(profile)
    db.flush()
    return profile


def _update_tutor_credibility(db: Session, tutor_user_id: str) -> None:
    average_score, ratings_count = (
        db.query(func.avg(SessionRating.score), func.count(SessionRating.id))
        .filter(SessionRating.tutor_user_id == tutor_user_id)
        .one()
    )
    profile = _ensure_profile(db, tutor_user_id)
    profile.credibility_score = float(average_score or 0.0)
    profile.ratings_count = int(ratings_count or 0)
    db.add(profile)


def _to_ics_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _escape_ics_text(value: str | None) -> str:
    return (value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _build_session_calendar_ics(item: StudySession) -> str:
    output = StringIO()
    output.write("BEGIN:VCALENDAR\r\n")
    output.write("VERSION:2.0\r\n")
    output.write("PRODID:-//PeerStud//Session Calendar//EN\r\n")
    output.write("CALSCALE:GREGORIAN\r\n")
    output.write("METHOD:PUBLISH\r\n")
    output.write("BEGIN:VEVENT\r\n")
    output.write(f"UID:session-{item.id}@peerstud\r\n")
    output.write(f"DTSTAMP:{_to_ics_timestamp(datetime.now(timezone.utc))}\r\n")
    output.write(f"DTSTART:{_to_ics_timestamp(item.start_time)}\r\n")
    output.write(f"DTEND:{_to_ics_timestamp(item.end_time)}\r\n")
    output.write(f"SUMMARY:{_escape_ics_text(item.topic_focus)}\r\n")
    output.write(f"LOCATION:{_escape_ics_text(item.classroom_name)}\r\n")
    if item.description:
        output.write(f"DESCRIPTION:{_escape_ics_text(item.description)}\r\n")
    if item.meet_link:
        output.write(f"URL:{item.meet_link}\r\n")
    output.write("END:VEVENT\r\n")
    output.write("END:VCALENDAR\r\n")
    return output.getvalue()


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    course_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionResponse]:
    query = db.query(StudySession).options(
        selectinload(StudySession.course),
        selectinload(StudySession.host),
        selectinload(StudySession.participants).selectinload(SessionParticipant.user),
        selectinload(StudySession.ratings),
    )
    if course_id:
        query = query.filter(StudySession.course_id == course_id)

    sessions = query.order_by(StudySession.start_time.asc()).all()
    return [_serialize_session(item, str(current_user.id)) for item in sessions]


@router.post("", response_model=SessionResponse)
def create_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionResponse:
    if payload.end_time <= payload.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_time must be after start_time",
        )

    course = db.query(Course).filter(Course.id == payload.course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    overlap = (
        db.query(StudySession)
        .filter(
            and_(
                StudySession.classroom_name == payload.classroom_name,
                StudySession.start_time < payload.end_time,
                StudySession.end_time > payload.start_time,
            )
        )
        .first()
    )
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Classroom already booked for that time range",
        )

    meet_link = payload.meet_link.strip() if payload.meet_link and payload.meet_link.strip() else None
    calendar_event_id = None
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    reminder_minutes_before = payload.reminder_minutes_before
    if reminder_minutes_before is None and user_settings:
        reminder_minutes_before = user_settings.reminder_minutes_before

    invite_emails = {str(email).strip().lower() for email in payload.invite_emails if str(email).strip()}

    study_session = StudySession(
        course_id=payload.course_id,
        host_user_id=current_user.id,
        classroom_name=payload.classroom_name,
        topic_focus=payload.topic_focus,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        meet_link=meet_link,
        calendar_event_id=calendar_event_id,
    )
    db.add(study_session)
    db.flush()
    db.add(SessionParticipant(session_id=study_session.id, user_id=current_user.id, status="confirmed"))

    if invite_emails:
        invited_users = (
            db.query(User)
            .filter(func.lower(User.email).in_(invite_emails), User.id != current_user.id)
            .all()
        )
        for invited_user in invited_users:
            db.add(
                SessionParticipant(
                    session_id=study_session.id,
                    user_id=invited_user.id,
                    status="invited",
                )
            )

    db.commit()

    created = (
        db.query(StudySession)
        .options(
            selectinload(StudySession.course),
            selectinload(StudySession.host),
            selectinload(StudySession.participants).selectinload(SessionParticipant.user),
            selectinload(StudySession.ratings),
        )
        .filter(StudySession.id == study_session.id)
        .first()
    )
    return _serialize_session(created, str(current_user.id))


@router.post("/{session_id}/join", response_model=SessionResponse)
def join_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionResponse:
    study_session = (
        db.query(StudySession)
        .options(
            selectinload(StudySession.course),
            selectinload(StudySession.host),
            selectinload(StudySession.participants).selectinload(SessionParticipant.user),
            selectinload(StudySession.ratings),
        )
        .filter(StudySession.id == session_id)
        .first()
    )
    if not study_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    participant = next((item for item in study_session.participants if item.user_id == current_user.id), None)
    if not participant:
        db.add(SessionParticipant(session_id=study_session.id, user_id=current_user.id, status="confirmed"))
        db.commit()
    elif participant.status != "confirmed":
        participant.status = "confirmed"
        participant.joined_at = datetime.now(timezone.utc)
        db.add(participant)
        db.commit()

    refreshed = (
        db.query(StudySession)
        .options(
            selectinload(StudySession.course),
            selectinload(StudySession.host),
            selectinload(StudySession.participants).selectinload(SessionParticipant.user),
            selectinload(StudySession.ratings),
        )
        .filter(StudySession.id == session_id)
        .first()
    )
    return _serialize_session(refreshed, str(current_user.id))


@router.get("/{session_id}/calendar")
def download_session_calendar_event(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    study_session = (
        db.query(StudySession)
        .options(selectinload(StudySession.participants))
        .filter(StudySession.id == session_id)
        .first()
    )
    if not study_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    is_participant = any(participant.user_id == current_user.id for participant in study_session.participants)
    if study_session.host_user_id != current_user.id and not is_participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to export this session")

    slug = "".join(char.lower() if char.isalnum() else "-" for char in study_session.topic_focus).strip("-") or "session"
    return Response(
        content=_build_session_calendar_ics(study_session),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="peerstud-{slug}.ics"'},
    )


@router.post("/{session_id}/ratings", response_model=SessionRatingResponse)
def rate_session(
    session_id: str,
    payload: SessionRatingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionRatingResponse:
    study_session = (
        db.query(StudySession)
        .options(selectinload(StudySession.participants))
        .filter(StudySession.id == session_id)
        .first()
    )
    if not study_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if study_session.end_time > datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ratings are only allowed after a session ends")
    if study_session.host_user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot rate your own session")
    if not any(participant.user_id == current_user.id for participant in study_session.participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Join the session before leaving a rating")

    rating = (
        db.query(SessionRating)
        .filter(SessionRating.session_id == session_id, SessionRating.rater_user_id == current_user.id)
        .first()
    )
    if not rating:
        rating = SessionRating(
            session_id=session_id,
            rater_user_id=current_user.id,
            tutor_user_id=study_session.host_user_id,
            score=payload.score,
            feedback=payload.feedback,
        )
    else:
        rating.score = payload.score
        rating.feedback = payload.feedback

    db.add(rating)
    db.flush()
    _update_tutor_credibility(db, str(study_session.host_user_id))
    db.commit()
    db.refresh(rating)
    return SessionRatingResponse(
        session_id=rating.session_id,
        tutor_user_id=rating.tutor_user_id,
        score=rating.score,
        feedback=rating.feedback,
        created_at=rating.created_at,
    )
