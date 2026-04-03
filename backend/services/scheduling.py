from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID, uuid4

from fastapi import HTTPException, status

from backend.schemas import Classroom, ClassroomCreate, Schedule, ScheduleCreate


class SchedulingService:
    def __init__(self) -> None:
        self._classrooms: dict[UUID, Classroom] = {}
        self._schedules: dict[UUID, Schedule] = {}

    def list_classrooms(self) -> list[Classroom]:
        return list(self._classrooms.values())

    def create_classroom(self, payload: ClassroomCreate) -> Classroom:
        classroom = Classroom(id=uuid4(), **payload.model_dump())
        self._classrooms[classroom.id] = classroom
        return classroom

    def get_classroom(self, classroom_id: UUID) -> Classroom:
        classroom = self._classrooms.get(classroom_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        return classroom

    def list_schedules(self, classroom_id: UUID | None = None) -> list[Schedule]:
        schedules = list(self._schedules.values())
        if classroom_id is None:
            return schedules
        return [item for item in schedules if item.classroom_id == classroom_id]

    def create_schedule(
        self,
        payload: ScheduleCreate,
        *,
        meet_link: str | None = None,
        calendar_event_id: str | None = None,
    ) -> Schedule:
        self.get_classroom(payload.classroom_id)

        if payload.end_time <= payload.start_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="end_time must be after start_time",
            )

        self._assert_no_overlap(
            classroom_id=payload.classroom_id,
            start_time=payload.start_time,
            end_time=payload.end_time,
        )

        schedule = Schedule(
            id=uuid4(),
            classroom_id=payload.classroom_id,
            title=payload.title,
            description=payload.description,
            start_time=payload.start_time,
            end_time=payload.end_time,
            attendee_emails=payload.attendee_emails,
            meet_link=meet_link,
            calendar_event_id=calendar_event_id,
        )
        self._schedules[schedule.id] = schedule
        return schedule

    def _assert_no_overlap(
        self,
        *,
        classroom_id: UUID,
        start_time,
        end_time,
    ) -> None:
        existing_for_room: Iterable[Schedule] = (
            item for item in self._schedules.values() if item.classroom_id == classroom_id
        )

        for existing in existing_for_room:
            has_overlap = start_time < existing.end_time and end_time > existing.start_time
            if has_overlap:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Schedule overlaps with an existing classroom booking",
                )
