from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.schemas import CourseSummaryResponse, ResourceSummaryResponse
from backend.db import get_db
from backend.dependencies import get_current_user
from backend.models import Course, Resource, Session as StudySession, User
from backend.services.firebase_storage import store_resource_file


router = APIRouter(tags=["catalog"])


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
        .group_by(Course.id)
        .order_by(Course.created_at.desc())
    )

    if mine_only:
        query = query.filter(Course.instructor_id == current_user.id)

    rows = query.all()
    return [
        CourseSummaryResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            instructor_id=course.instructor_id,
            sessions_count=int(sessions_count or 0),
            resources_count=int(resources_count or 0),
        )
        for course, sessions_count, resources_count in rows
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
