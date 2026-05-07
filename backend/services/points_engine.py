from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, text
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


def _load_streak_days(db: Session) -> dict[str, int]:
    # Compute current contiguous-day streak in SQL to avoid pulling large activity tables into Python.
    sql = text(
        """
        with activity_days as (
            select user_id::text as user_id, date(joined_at) as day
            from session_participants
            where joined_at is not null
            union
            select user_id::text as user_id, date(joined_at) as day
            from study_group_members
            where joined_at is not null
            union
            select uploaded_by_user_id::text as user_id, date(created_at) as day
            from resources
            where created_at is not null
        ),
        ordered as (
            select
                user_id,
                day,
                row_number() over (partition by user_id order by day desc) as rn
            from activity_days
        ),
        grouped as (
            select
                user_id,
                day,
                (day + (rn || ' day')::interval)::date as streak_group
            from ordered
        ),
        current_group as (
            select user_id, streak_group
            from grouped
            where day = current_date
        )
        select g.user_id, count(*)::int as streak_days
        from grouped g
        join current_group c on c.user_id = g.user_id and c.streak_group = g.streak_group
        group by g.user_id
        """
    )
    rows = db.execute(sql).all()
    return {str(user_id): int(streak_days) for user_id, streak_days in rows}


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

    hosted_counts = {str(uid): int(c) for uid, c in db.query(StudySession.host_user_id, func.count(StudySession.id)).group_by(StudySession.host_user_id).all()}
    joined_counts = {str(uid): int(c) for uid, c in db.query(SessionParticipant.user_id, func.count(SessionParticipant.id)).group_by(SessionParticipant.user_id).all()}
    resource_counts = {str(uid): int(c) for uid, c in db.query(Resource.uploaded_by_user_id, func.count(Resource.id)).group_by(Resource.uploaded_by_user_id).all()}
    group_counts = {str(uid): int(c) for uid, c in db.query(StudyGroupMember.user_id, func.count(StudyGroupMember.id)).group_by(StudyGroupMember.user_id).all()}

    streak_days_map = _load_streak_days(db)
    now = datetime.now(timezone.utc)
    snapshots = {}

    for user, profile in users_with_profiles:
        uid = str(user.id)
        snapshots[uid] = UserPointsSnapshot(
            user_id=uid,
            sessions_hosted=(sh := hosted_counts.get(uid, 0)),
            sessions_joined=(sj := joined_counts.get(uid, 0)),
            resources_shared=(rs := resource_counts.get(uid, 0)),
            study_groups_joined=(sg := group_counts.get(uid, 0)),
            streak_days=(sd := streak_days_map.get(uid, 0)),
            credibility_score=(cs := float(profile.credibility_score if profile else 0.0)),
            ratings_count=(rc := int(profile.ratings_count if profile else 0)),
            study_points=(sp := _compute_study_points(sessions_joined=sj, resources_shared=rs, study_groups_joined=sg, streak_days=sd)),
            tutor_points=(tp := _compute_tutor_points(sessions_hosted=sh, credibility_score=cs, ratings_count=rc)),
            total_points=sp + tp,
        )
        if profile:
            profile.study_points = snapshots[uid].study_points
            profile.tutor_points = snapshots[uid].tutor_points
            profile.total_points = snapshots[uid].total_points
            profile.points_last_computed_at = now
            db.add(profile)

    db.commit()
    return snapshots
