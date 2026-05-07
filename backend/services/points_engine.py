from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import Resource, Session as StudySession, SessionParticipant, StudyGroupMember, User, UserProfile


@dataclass(frozen=True)
class UserPointsSnapshot:
    user_id: str
    sessions_hosted: int
    sessions_joined: int
    resources_shared: int
    study_groups_joined: int
    streak_days: int
    credibility_score: float
    ratings_count: int
    study_points: int
    tutor_points: int
    total_points: int


def _calculate_streak_days(activity_dates: list[datetime | None]) -> int:
    valid_dates = [item for item in activity_dates if item is not None]
    if not valid_dates:
        return 0

    ordered_days = sorted({item.date() for item in valid_dates}, reverse=True)
    streak = 0
    previous_day = None
    for day in ordered_days:
        if previous_day is None:
            streak = 1
            previous_day = day
            continue
        if (previous_day - day).days == 1:
            streak += 1
            previous_day = day
            continue
        break
    return streak


def _compute_study_points(*, sessions_joined: int, resources_shared: int, study_groups_joined: int, streak_days: int) -> int:
    return (
        (sessions_joined * 10)
        + (resources_shared * 12)
        + (study_groups_joined * 8)
        + (streak_days * 6)
    )


def _compute_tutor_points(*, sessions_hosted: int, credibility_score: float, ratings_count: int) -> int:
    base = (sessions_hosted * 15) + int(round(ratings_count * 6)) + int(round(credibility_score * 20))

    # Bonus tiers mirror leaderboard signal quality for tutors.
    if ratings_count >= 10 and credibility_score >= 4.5:
        base += 12
    elif ratings_count >= 5 and credibility_score >= 4.0:
        base += 6

    if sessions_hosted >= 8:
        base += 6

    return max(base, 0)


def recompute_all_user_points(db: Session) -> dict[str, UserPointsSnapshot]:
    users_with_profiles = db.query(User, UserProfile).outerjoin(UserProfile, UserProfile.user_id == User.id).all()

    hosted_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(StudySession.host_user_id, func.count(StudySession.id))
            .group_by(StudySession.host_user_id)
            .all()
        )
    }
    joined_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(SessionParticipant.user_id, func.count(SessionParticipant.id))
            .group_by(SessionParticipant.user_id)
            .all()
        )
    }
    resource_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(Resource.uploaded_by_user_id, func.count(Resource.id))
            .group_by(Resource.uploaded_by_user_id)
            .all()
        )
    }
    group_counts = {
        str(user_id): int(count)
        for user_id, count in (
            db.query(StudyGroupMember.user_id, func.count(StudyGroupMember.id))
            .group_by(StudyGroupMember.user_id)
            .all()
        )
    }

    activity_by_user: dict[str, list[datetime | None]] = {}

    for user_id, joined_at in db.query(SessionParticipant.user_id, SessionParticipant.joined_at).all():
        activity_by_user.setdefault(str(user_id), []).append(joined_at)

    for user_id, joined_at in db.query(StudyGroupMember.user_id, StudyGroupMember.joined_at).all():
        activity_by_user.setdefault(str(user_id), []).append(joined_at)

    for user_id, created_at in db.query(Resource.uploaded_by_user_id, Resource.created_at).all():
        activity_by_user.setdefault(str(user_id), []).append(created_at)

    now = datetime.now(timezone.utc)
    snapshots: dict[str, UserPointsSnapshot] = {}

    for user, profile in users_with_profiles:
        user_id = str(user.id)
        sessions_hosted = hosted_counts.get(user_id, 0)
        sessions_joined = joined_counts.get(user_id, 0)
        resources_shared = resource_counts.get(user_id, 0)
        study_groups_joined = group_counts.get(user_id, 0)
        streak_days = _calculate_streak_days(activity_by_user.get(user_id, []))

        credibility_score = float(profile.credibility_score if profile else 0.0)
        ratings_count = int(profile.ratings_count if profile else 0)

        study_points = _compute_study_points(
            sessions_joined=sessions_joined,
            resources_shared=resources_shared,
            study_groups_joined=study_groups_joined,
            streak_days=streak_days,
        )
        tutor_points = _compute_tutor_points(
            sessions_hosted=sessions_hosted,
            credibility_score=credibility_score,
            ratings_count=ratings_count,
        )
        total_points = study_points + tutor_points

        snapshots[user_id] = UserPointsSnapshot(
            user_id=user_id,
            sessions_hosted=sessions_hosted,
            sessions_joined=sessions_joined,
            resources_shared=resources_shared,
            study_groups_joined=study_groups_joined,
            streak_days=streak_days,
            credibility_score=credibility_score,
            ratings_count=ratings_count,
            study_points=study_points,
            tutor_points=tutor_points,
            total_points=total_points,
        )

        if profile is not None:
            profile.study_points = study_points
            profile.tutor_points = tutor_points
            profile.total_points = total_points
            profile.points_last_computed_at = now
            db.add(profile)

    db.commit()
    return snapshots
