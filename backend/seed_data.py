from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import sqrt
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db import SessionLocal
from backend.models import (
    ChatMessage,
    Conversation,
    ConversationParticipant,
    Course,
    Resource,
    Session as StudySession,
    SessionParticipant,
    SessionRating,
    StudyGroup,
    StudyGroupMember,
    User,
    UserProfile,
    UserSettings,
)


SEED_AUTH_UID_PREFIX = "seed-"
REPORT_PATH = Path(__file__).with_name("seed_report.json")
DEFAULT_SEED_PASSWORD = "peerstud123!"
VECTOR_SIZE = 1536


TOPIC_INDEX = {
    "algorithms": 0,
    "python": 1,
    "system_design": 2,
    "databases": 3,
    "statistics": 4,
    "probability": 5,
    "networking": 6,
    "cloud": 7,
    "linux": 8,
    "frontend": 9,
    "ui": 10,
    "calculus": 11,
    "sql": 12,
    "discrete_math": 13,
    "teamwork": 14,
    "presentation": 15,
}


@dataclass(frozen=True)
class SeedUser:
    auth_uid: str
    email: str
    full_name: str
    year_of_study: str
    faculty: str
    campus: str
    major: str
    minor: str
    current_courses: list[str]
    qualifications: str
    tutoring_experience: str
    available_for_tutoring: bool
    strengths: str
    weak_topics: str
    bio: str
    interests: str
    offer_text: str
    need_text: str
    email_alerts: bool
    adaptive_layout: bool
    desktop_reminders: bool
    reminder_minutes_before: int


SEED_USERS = [
    SeedUser(
        auth_uid="seed-alana",
        email="alana.morgan@mymona.uwi.edu",
        full_name="Alana Morgan",
        year_of_study="Year 3",
        faculty="Faculty of Science and Technology",
        campus="Mona",
        major="Computer Science",
        minor="Mathematics",
        current_courses=["COMP3035", "COMP3901", "MATH2400"],
        qualifications="Dean's list student, programming lab tutor",
        tutoring_experience="Leads weekly data structures review sessions.",
        available_for_tutoring=True,
        strengths="algorithms python system design databases",
        weak_topics="statistical inference real analysis",
        bio="Backend-focused student building reliable study workflows.",
        interests="peer tutoring hackathons developer tools",
        offer_text="Can help with Python, SQL, and architecture planning.",
        need_text="Needs help tightening statistics fundamentals.",
        email_alerts=True,
        adaptive_layout=True,
        desktop_reminders=True,
        reminder_minutes_before=20,
    ),
    SeedUser(
        auth_uid="seed-dwayne",
        email="dwayne.brown@mymona.uwi.edu",
        full_name="Dwayne Brown",
        year_of_study="Year 2",
        faculty="Faculty of Science and Technology",
        campus="Mona",
        major="Information Technology",
        minor="Management Studies",
        current_courses=["COMP3035", "INFO2101"],
        qualifications="IT support assistant, AWS Cloud Club member",
        tutoring_experience="Runs small-group revision for networking modules.",
        available_for_tutoring=True,
        strengths="networking cloud linux troubleshooting",
        weak_topics="advanced sql discrete math",
        bio="Enjoys practical labs and collaborative study sessions.",
        interests="cloud computing football campus events",
        offer_text="Can coach networking and Linux setup work.",
        need_text="Wants stronger SQL query design and database modeling.",
        email_alerts=True,
        adaptive_layout=True,
        desktop_reminders=False,
        reminder_minutes_before=45,
    ),
    SeedUser(
        auth_uid="seed-kayla",
        email="kayla.reid@uwi.edu.jm",
        full_name="Kayla Reid",
        year_of_study="Year 4",
        faculty="Faculty of Science and Technology",
        campus="Mona",
        major="Mathematics",
        minor="Computer Science",
        current_courses=["MATH2400", "STAT3001", "COMP3901"],
        qualifications="Supplemental instructor for calculus",
        tutoring_experience="Facilitates exam-prep workshops in statistics.",
        available_for_tutoring=True,
        strengths="calculus probability proofs statistics",
        weak_topics="frontend development ui polish",
        bio="Math major who likes breaking hard concepts into simple steps.",
        interests="data analysis debate society mentoring",
        offer_text="Can support statistics, probability, and exam prep.",
        need_text="Needs help with frontend implementation details.",
        email_alerts=False,
        adaptive_layout=False,
        desktop_reminders=True,
        reminder_minutes_before=30,
    ),
    SeedUser(
        auth_uid="seed-malik",
        email="malik.thomas@mymona.uwi.edu",
        full_name="Malik Thomas",
        year_of_study="Year 1",
        faculty="Faculty of Science and Technology",
        campus="Mona",
        major="Computer Science",
        minor="",
        current_courses=["COMP1126", "COMP3035"],
        qualifications="First-year class rep",
        tutoring_experience="New to tutoring but active in peer learning circles.",
        available_for_tutoring=False,
        strengths="presentation teamwork note taking",
        weak_topics="algorithms databases calculus",
        bio="First-year student looking for structure and accountability.",
        interests="gaming robotics student leadership",
        offer_text="Can organize notes and keep groups on schedule.",
        need_text="Needs support in algorithms, databases, and calculus.",
        email_alerts=True,
        adaptive_layout=True,
        desktop_reminders=True,
        reminder_minutes_before=15,
    ),
]


SEED_VECTOR_TOPICS = {
    "seed-alana": {
        "offer": ["algorithms", "python", "system_design", "databases", "sql"],
        "need": ["statistics", "probability"],
    },
    "seed-dwayne": {
        "offer": ["networking", "cloud", "linux", "teamwork"],
        "need": ["sql", "discrete_math", "databases"],
    },
    "seed-kayla": {
        "offer": ["statistics", "probability", "calculus", "discrete_math"],
        "need": ["frontend", "ui", "system_design"],
    },
    "seed-malik": {
        "offer": ["teamwork", "presentation"],
        "need": ["algorithms", "databases", "calculus", "python"],
    },
}


def _unit_normalize(vector: list[float]) -> list[float]:
    magnitude = sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        return vector
    return [value / magnitude for value in vector]


def _noise_at(seed: str, index: int) -> float:
    digest = hashlib.sha256(f"{seed}:{index}".encode("utf-8")).digest()
    return (digest[0] / 255.0) * 0.02


def _build_topic_vector(seed: str, topics: list[str]) -> list[float]:
    vector = [_noise_at(seed, idx) for idx in range(VECTOR_SIZE)]
    for topic in topics:
        topic_index = TOPIC_INDEX.get(topic)
        if topic_index is not None:
            vector[topic_index] += 1.0
    return _unit_normalize(vector)


def _wipe_existing_seed_data(db: Session) -> None:
    seed_users = db.query(User).filter(User.auth_uid.like(f"{SEED_AUTH_UID_PREFIX}%")).all()
    if not seed_users:
        return

    seed_user_ids = [user.id for user in seed_users]
    course_ids = [row[0] for row in db.query(Course.id).filter(Course.instructor_id.in_(seed_user_ids)).all()]
    session_ids = [
        row[0]
        for row in db.query(StudySession.id)
        .filter((StudySession.host_user_id.in_(seed_user_ids)) | (StudySession.course_id.in_(course_ids)))
        .all()
    ]
    group_ids = [
        row[0]
        for row in db.query(StudyGroup.id)
        .filter((StudyGroup.creator_user_id.in_(seed_user_ids)) | (StudyGroup.course_id.in_(course_ids)))
        .all()
    ]
    conversation_ids = [
        row[0]
        for row in db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id.in_(seed_user_ids))
        .distinct()
        .all()
    ]

    if conversation_ids:
        db.query(ChatMessage).filter(ChatMessage.conversation_id.in_(conversation_ids)).delete(
            synchronize_session=False
        )
        db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id.in_(conversation_ids)
        ).delete(synchronize_session=False)
        db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).delete(synchronize_session=False)

    if session_ids:
        db.query(SessionRating).filter(
            (SessionRating.session_id.in_(session_ids))
            | (SessionRating.rater_user_id.in_(seed_user_ids))
            | (SessionRating.tutor_user_id.in_(seed_user_ids))
        ).delete(synchronize_session=False)
        db.query(SessionParticipant).filter(
            (SessionParticipant.session_id.in_(session_ids))
            | (SessionParticipant.user_id.in_(seed_user_ids))
        ).delete(synchronize_session=False)
        db.query(Resource).filter(
            (Resource.session_id.in_(session_ids)) | (Resource.uploaded_by_user_id.in_(seed_user_ids))
        ).delete(synchronize_session=False)
        db.query(StudySession).filter(StudySession.id.in_(session_ids)).delete(synchronize_session=False)
    else:
        db.query(Resource).filter(Resource.uploaded_by_user_id.in_(seed_user_ids)).delete(synchronize_session=False)

    if group_ids:
        db.query(StudyGroupMember).filter(
            (StudyGroupMember.group_id.in_(group_ids)) | (StudyGroupMember.user_id.in_(seed_user_ids))
        ).delete(synchronize_session=False)
        db.query(StudyGroup).filter(StudyGroup.id.in_(group_ids)).delete(synchronize_session=False)
    else:
        db.query(StudyGroupMember).filter(StudyGroupMember.user_id.in_(seed_user_ids)).delete(
            synchronize_session=False
        )

    if course_ids:
        db.query(Course).filter(Course.id.in_(course_ids)).delete(synchronize_session=False)

    db.query(UserSettings).filter(UserSettings.user_id.in_(seed_user_ids)).delete(synchronize_session=False)
    db.query(UserProfile).filter(UserProfile.user_id.in_(seed_user_ids)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(seed_user_ids)).delete(synchronize_session=False)
    db.flush()


def _create_users(db: Session) -> dict[str, User]:
    users: dict[str, User] = {}
    for seed_user in SEED_USERS:
        user = User(
            auth_uid=seed_user.auth_uid,
            email=seed_user.email,
            full_name=seed_user.full_name,
        )
        db.add(user)
        db.flush()

        vector_topics = SEED_VECTOR_TOPICS[seed_user.auth_uid]
        offer_vector = _build_topic_vector(f"{seed_user.auth_uid}:offer", vector_topics["offer"])
        need_vector = _build_topic_vector(f"{seed_user.auth_uid}:need", vector_topics["need"])
        embedding = _unit_normalize([(offer + need) / 2.0 for offer, need in zip(offer_vector, need_vector)])

        profile = UserProfile(
            user_id=user.id,
            year_of_study=seed_user.year_of_study,
            faculty=seed_user.faculty,
            campus=seed_user.campus,
            major=seed_user.major or None,
            minor=seed_user.minor or None,
            current_courses=seed_user.current_courses,
            qualifications=seed_user.qualifications,
            tutoring_experience=seed_user.tutoring_experience,
            available_for_tutoring=seed_user.available_for_tutoring,
            strengths=seed_user.strengths,
            weak_topics=seed_user.weak_topics,
            bio=seed_user.bio,
            interests=seed_user.interests,
            offer_text=seed_user.offer_text,
            need_text=seed_user.need_text,
            embedding=embedding,
            offer_vector=offer_vector,
            need_vector=need_vector,
        )
        settings = UserSettings(
            user_id=user.id,
            email_alerts=seed_user.email_alerts,
            adaptive_layout=seed_user.adaptive_layout,
            desktop_reminders=seed_user.desktop_reminders,
            reminder_minutes_before=seed_user.reminder_minutes_before,
        )
        db.add(profile)
        db.add(settings)
        users[seed_user.auth_uid] = user

    db.flush()
    return users


def _seed_domain_data(db: Session, users: dict[str, User]) -> None:
    now = datetime.now(timezone.utc)

    alana = users["seed-alana"]
    dwayne = users["seed-dwayne"]
    kayla = users["seed-kayla"]
    malik = users["seed-malik"]

    comp3035 = Course(
        title="COMP3035",
        description="Database systems and collaborative application design.",
        instructor_id=alana.id,
    )
    math2400 = Course(
        title="MATH2400",
        description="Probability foundations and quantitative reasoning.",
        instructor_id=kayla.id,
    )
    comp3901 = Course(
        title="COMP3901",
        description="Software engineering project delivery and teamwork.",
        instructor_id=dwayne.id,
    )
    db.add_all([comp3035, math2400, comp3901])
    db.flush()

    session_one = StudySession(
        course_id=comp3035.id,
        host_user_id=alana.id,
        classroom_name="Engineering LT2",
        topic_focus="Query optimization and indexing",
        description="Walkthrough of joins, indexing, and query plans.",
        start_time=now + timedelta(days=1, hours=2),
        end_time=now + timedelta(days=1, hours=4),
        meet_link="https://meet.jit.si/peerstud-comp3035-query-optimization",
        status="scheduled",
    )
    session_two = StudySession(
        course_id=math2400.id,
        host_user_id=kayla.id,
        classroom_name="Science Lecture Theatre 1",
        topic_focus="Probability distributions bootcamp",
        description="Exam-prep session for distributions and expectation.",
        start_time=now + timedelta(days=2, hours=1),
        end_time=now + timedelta(days=2, hours=3),
        meet_link="https://meet.jit.si/peerstud-math2400-probability-bootcamp",
        status="scheduled",
    )
    session_three = StudySession(
        course_id=comp3901.id,
        host_user_id=dwayne.id,
        classroom_name="Remote Lab 3",
        topic_focus="Sprint planning retrospective",
        description="Working session on sprint planning and backlog cleanup.",
        start_time=now - timedelta(days=3, hours=2),
        end_time=now - timedelta(days=3),
        meet_link="https://meet.jit.si/peerstud-comp3901-sprint-retro",
        status="completed",
    )
    db.add_all([session_one, session_two, session_three])
    db.flush()

    db.add_all(
        [
            SessionParticipant(session_id=session_one.id, user_id=alana.id, status="confirmed"),
            SessionParticipant(session_id=session_one.id, user_id=dwayne.id, status="confirmed"),
            SessionParticipant(session_id=session_one.id, user_id=malik.id, status="confirmed"),
            SessionParticipant(session_id=session_two.id, user_id=kayla.id, status="confirmed"),
            SessionParticipant(session_id=session_two.id, user_id=alana.id, status="confirmed"),
            SessionParticipant(session_id=session_two.id, user_id=malik.id, status="confirmed"),
            SessionParticipant(session_id=session_three.id, user_id=dwayne.id, status="confirmed"),
            SessionParticipant(session_id=session_three.id, user_id=alana.id, status="confirmed"),
            SessionParticipant(session_id=session_three.id, user_id=kayla.id, status="confirmed"),
        ]
    )

    db.add_all(
        [
            SessionRating(
                session_id=session_three.id,
                rater_user_id=alana.id,
                tutor_user_id=dwayne.id,
                score=5,
                feedback="Clear sprint planning structure and strong facilitation.",
            ),
            SessionRating(
                session_id=session_three.id,
                rater_user_id=kayla.id,
                tutor_user_id=dwayne.id,
                score=4,
                feedback="Useful retrospective prompts and good pacing.",
            ),
        ]
    )

    db.add_all(
        [
            Resource(
                course_id=comp3035.id,
                session_id=session_one.id,
                uploaded_by_user_id=alana.id,
                title="SQL index tuning checklist",
                url="https://example.com/resources/sql-index-tuning-checklist.pdf",
                storage_path="seed/resources/sql-index-tuning-checklist.pdf",
                file_name="sql-index-tuning-checklist.pdf",
                mime_type="application/pdf",
                file_size_bytes=184320,
                resource_type="file",
            ),
            Resource(
                course_id=math2400.id,
                session_id=session_two.id,
                uploaded_by_user_id=kayla.id,
                title="Probability review sheet",
                url="https://example.com/resources/probability-review-sheet.pdf",
                storage_path="seed/resources/probability-review-sheet.pdf",
                file_name="probability-review-sheet.pdf",
                mime_type="application/pdf",
                file_size_bytes=132456,
                resource_type="file",
            ),
            Resource(
                course_id=comp3901.id,
                session_id=None,
                uploaded_by_user_id=dwayne.id,
                title="Sprint planning template",
                url="https://example.com/resources/sprint-planning-template",
                storage_path=None,
                file_name=None,
                mime_type=None,
                file_size_bytes=None,
                resource_type="link",
            ),
        ]
    )

    group_one = StudyGroup(
        course_id=comp3035.id,
        creator_user_id=alana.id,
        topic_focus="Backend/API integration sprint",
        scheduled_start=now + timedelta(days=1, hours=5),
        scheduled_end=now + timedelta(days=1, hours=7),
        target_size=6,
        min_size=5,
        max_size=15,
        attendance_required=True,
        inactive_after_days=21,
        system_suggested=False,
        status="open",
    )
    group_two = StudyGroup(
        course_id=math2400.id,
        creator_user_id=kayla.id,
        topic_focus="Probability past-paper drills",
        scheduled_start=now + timedelta(days=3, hours=2),
        scheduled_end=now + timedelta(days=3, hours=4),
        target_size=5,
        min_size=5,
        max_size=15,
        attendance_required=True,
        inactive_after_days=21,
        system_suggested=True,
        status="open",
    )
    db.add_all([group_one, group_two])
    db.flush()

    db.add_all(
        [
            StudyGroupMember(group_id=group_one.id, user_id=alana.id, status="active", attendance_count=3),
            StudyGroupMember(group_id=group_one.id, user_id=dwayne.id, status="active", attendance_count=2),
            StudyGroupMember(group_id=group_one.id, user_id=malik.id, status="active", attendance_count=1),
            StudyGroupMember(group_id=group_two.id, user_id=kayla.id, status="active", attendance_count=4),
            StudyGroupMember(group_id=group_two.id, user_id=alana.id, status="active", attendance_count=2),
        ]
    )

    conversation = Conversation(kind="direct")
    db.add(conversation)
    db.flush()
    db.add_all(
        [
            ConversationParticipant(conversation_id=conversation.id, user_id=alana.id),
            ConversationParticipant(conversation_id=conversation.id, user_id=malik.id),
            ChatMessage(
                conversation_id=conversation.id,
                sender_user_id=alana.id,
                content="I uploaded the SQL checklist. Review joins before tomorrow's session.",
            ),
            ChatMessage(
                conversation_id=conversation.id,
                sender_user_id=malik.id,
                content="Thanks, I'll go through it tonight and bring questions.",
            ),
        ]
    )

    db.flush()

    dwayne_profile = db.query(UserProfile).filter(UserProfile.user_id == dwayne.id).one()
    dwayne_profile.credibility_score = 4.5
    dwayne_profile.ratings_count = 2


def _build_report(db: Session) -> dict[str, object]:
    users = db.query(User).filter(User.auth_uid.like(f"{SEED_AUTH_UID_PREFIX}%")).order_by(User.full_name.asc()).all()
    user_ids = [user.id for user in users]

    sessions_hosted = dict(
        db.query(StudySession.host_user_id, func.count(StudySession.id))
        .filter(StudySession.host_user_id.in_(user_ids))
        .group_by(StudySession.host_user_id)
        .all()
    )
    sessions_joined = dict(
        db.query(SessionParticipant.user_id, func.count(SessionParticipant.id))
        .filter(SessionParticipant.user_id.in_(user_ids))
        .group_by(SessionParticipant.user_id)
        .all()
    )
    study_groups_joined = dict(
        db.query(StudyGroupMember.user_id, func.count(StudyGroupMember.id))
        .filter(StudyGroupMember.user_id.in_(user_ids), StudyGroupMember.status == "active")
        .group_by(StudyGroupMember.user_id)
        .all()
    )
    resources_shared = dict(
        db.query(Resource.uploaded_by_user_id, func.count(Resource.id))
        .filter(Resource.uploaded_by_user_id.in_(user_ids))
        .group_by(Resource.uploaded_by_user_id)
        .all()
    )
    chat_messages_sent = dict(
        db.query(ChatMessage.sender_user_id, func.count(ChatMessage.id))
        .filter(ChatMessage.sender_user_id.in_(user_ids))
        .group_by(ChatMessage.sender_user_id)
        .all()
    )

    report_users: list[dict[str, object]] = []
    for user in users:
        profile = user.profile
        settings = user.settings
        report_users.append(
            {
                "id": str(user.id),
                "auth_uid": user.auth_uid,
                "email": user.email,
                "full_name": user.full_name,
                "year_of_study": profile.year_of_study if profile else None,
                "faculty": profile.faculty if profile else None,
                "campus": profile.campus if profile else None,
                "major": profile.major if profile else None,
                "minor": profile.minor if profile else None,
                "current_courses": profile.current_courses if profile else [],
                "available_for_tutoring": profile.available_for_tutoring if profile else False,
                "credibility_score": float(profile.credibility_score if profile else 0.0),
                "ratings_count": int(profile.ratings_count if profile else 0),
                "has_embedding": bool(profile and profile.embedding is not None),
                "has_offer_vector": bool(profile and profile.offer_vector is not None),
                "has_need_vector": bool(profile and profile.need_vector is not None),
                "email_alerts": settings.email_alerts if settings else None,
                "adaptive_layout": settings.adaptive_layout if settings else None,
                "desktop_reminders": settings.desktop_reminders if settings else None,
                "reminder_minutes_before": settings.reminder_minutes_before if settings else None,
                "datapoints": {
                    "hosted_sessions": int(sessions_hosted.get(user.id, 0)),
                    "joined_sessions": int(sessions_joined.get(user.id, 0)),
                    "study_groups_joined": int(study_groups_joined.get(user.id, 0)),
                    "resources_shared": int(resources_shared.get(user.id, 0)),
                    "chat_messages_sent": int(chat_messages_sent.get(user.id, 0)),
                },
            }
        )

    summary = {
        "users": db.query(func.count(User.id)).filter(User.auth_uid.like(f"{SEED_AUTH_UID_PREFIX}%")).scalar() or 0,
        "courses": db.query(func.count(Course.id)).scalar() or 0,
        "sessions": db.query(func.count(StudySession.id)).scalar() or 0,
        "study_groups": db.query(func.count(StudyGroup.id)).scalar() or 0,
        "resources": db.query(func.count(Resource.id)).scalar() or 0,
        "conversations": db.query(func.count(Conversation.id)).scalar() or 0,
        "chat_messages": db.query(func.count(ChatMessage.id)).scalar() or 0,
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report_path": str(REPORT_PATH),
        "default_password": DEFAULT_SEED_PASSWORD,
        "auth_note": "Seeded accounts are created in the app users table; create matching Supabase Auth users manually with the default password for login tests.",
        "summary": summary,
        "users": report_users,
    }


def main() -> None:
    session = SessionLocal()
    try:
        _wipe_existing_seed_data(session)
        users = _create_users(session)
        _seed_domain_data(session, users)
        session.commit()

        report = _build_report(session)
        REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Seeded data successfully. Report written to {REPORT_PATH}")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()