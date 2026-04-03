from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from backend.api.schemas import SessionCreate, SessionResponse
from backend.config import settings
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Course, GoogleCalendarConnection, Session as StudySession, User
from backend.services.google_calendar_oauth import create_meet_event_for_linked_account


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    course_id: str | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionResponse]:
    query = db.query(StudySession)
    if course_id:
        query = query.filter(StudySession.course_id == course_id)

    sessions = query.order_by(StudySession.start_time.asc()).all()
    return [
        SessionResponse(
            id=item.id,
            course_id=item.course_id,
            host_user_id=item.host_user_id,
            classroom_name=item.classroom_name,
            start_time=item.start_time,
            end_time=item.end_time,
            meet_link=item.meet_link,
            status=item.status,
        )
        for item in sessions
    ]


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

    meet_link = payload.meet_link
    if payload.generate_meet and meet_link is None:
        connection = (
            db.query(GoogleCalendarConnection)
            .filter(GoogleCalendarConnection.user_id == current_user.id)
            .first()
        )
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Link a Google Calendar account first before generating a Meet link",
            )

        meet_result = create_meet_event_for_linked_account(
            connection=connection,
            calendar_id=settings.google_calendar_id,
            title=payload.classroom_name,
            description=None,
            start_time=payload.start_time,
            end_time=payload.end_time,
            attendee_emails=[current_user.email],
        )
        meet_link = meet_result.get("meet_link")

    study_session = StudySession(
        course_id=payload.course_id,
        host_user_id=current_user.id,
        classroom_name=payload.classroom_name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        meet_link=meet_link,
    )
    db.add(study_session)
    db.commit()
    db.refresh(study_session)

    return SessionResponse(
        id=study_session.id,
        course_id=study_session.course_id,
        host_user_id=study_session.host_user_id,
        classroom_name=study_session.classroom_name,
        start_time=study_session.start_time,
        end_time=study_session.end_time,
        meet_link=study_session.meet_link,
        status=study_session.status,
    )
