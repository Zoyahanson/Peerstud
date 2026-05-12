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
    UserCourse,
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
    credibility_score: float = 0.0
    ratings_count: int = 0


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
        qualifications="Dean's list student, certified programming tutor with 2+ years lab instruction experience, 4.8/5 avg rating",
        tutoring_experience="Leads weekly data structures review sessions. Mentors first-years in Java and Python. Published 2 peer tutoring case studies.",
        available_for_tutoring=True,
        strengths="algorithms complexity analysis system design databases sql optimization python testing documentation",
        weak_topics="statistical inference hypothesis testing real analysis probability distributions",
        bio="Backend-focused student passionate about teaching solid algorithms and scalable system design. Believes in first-principles learning.",
        interests="peer tutoring hackathons developer tools code review architecture patterns",
        offer_text="Expert-level help with sorting/searching algorithms, hash tables, tree traversals, SQL query optimization, Python design patterns, and system architecture tradeoffs.",
        need_text="Wants deeper understanding of statistical inference methods, probability distributions, and applied statistics in ML contexts.",
        email_alerts=True,
        adaptive_layout=True,
        desktop_reminders=True,
        reminder_minutes_before=20,
        credibility_score=4.8,
        ratings_count=22,
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
        qualifications="IT support assistant for 18 months, AWS Cloud Club lead, completed AWS Solutions Architect Associate prep",
        tutoring_experience="Runs small-group networking lab revision sessions. Helped 12+ peers troubleshoot configuration issues. Real-world infrastructure experience.",
        available_for_tutoring=True,
        strengths="networking tcp ip protocols linux administration cloud infrastructure troubleshooting devops containerization",
        weak_topics="advanced sql query optimization database normalization discrete mathematical structures combinatorics",
        bio="Hands-on IT enthusiast who bridges theory and practice. Enjoys solving real infrastructure problems through collaborative learning.",
        interests="cloud computing infrastructure automation DevOps football campus tech talks",
        offer_text="Practical guidance on networking protocols, Linux system administration, AWS services, Docker basics, and infrastructure troubleshooting. Can explain network models clearly.",
        need_text="Seeks SQL mastery: query optimization, indexing strategies, database design patterns, and normalized schema fundamentals.",
        email_alerts=True,
        adaptive_layout=True,
        desktop_reminders=False,
        reminder_minutes_before=45,
        credibility_score=4.2,
        ratings_count=8,
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
        qualifications="Supplemental instructor for calculus (2 years), published research on statistical literacy, 4.9/5 tutoring rating from 18+ students",
        tutoring_experience="Facilitates exam-prep workshops in statistics for 50+ students. Leads proof-writing circles. Mentors struggling math students one-on-one.",
        available_for_tutoring=True,
        strengths="calculus limits derivatives integration probability distributions hypothesis testing proofs mathematical reasoning discrete math combinatorics",
        weak_topics="frontend development ui design css responsive layouts javascript frameworks",
        bio="Math educator who breaks complex proofs into intuitive steps. Year 4 student focused on making abstract concepts concrete and memorable.",
        interests="data analysis debate society academic mentoring mathematical modeling statistics in research",
        offer_text="Deep support in calculus (limits, derivatives, integrals), probability theory, statistical inference, proof writing, discrete math, and exam prep strategies.",
        need_text="Needs practical frontend skills: CSS layout, responsive design, React fundamentals, JavaScript event handling, and modern web design principles.",
        email_alerts=False,
        adaptive_layout=False,
        desktop_reminders=True,
        reminder_minutes_before=30,
        credibility_score=4.9,
        ratings_count=28,
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
        qualifications="First-year class rep, elected by peers for leadership and organization skills, study group organizer",
        tutoring_experience="New to formal tutoring but has helped 5+ peers improve note-taking habits and study discipline. Natural organizer and motivator.",
        available_for_tutoring=False,
        strengths="collaboration organization note taking presentation public speaking time management motivation study strategies",
        weak_topics="algorithms complexity analysis database design big-o notation calculus proofs discrete structures",
        bio="First-year student bringing structure to chaotic study sessions. Excels at rallying peers and keeping groups focused on learning outcomes.",
        interests="gaming robotics student leadership peer support study techniques community building",
        offer_text="Help with study organization, note consolidation, group coordination, presentation skills, and keeping study sessions productive and focused.",
        need_text="Needs foundational computer science concepts: algorithm design, big-O analysis, database relationships, calculus, and discrete math proofs.",
        email_alerts=True,
        adaptive_layout=True,
        desktop_reminders=True,
        reminder_minutes_before=15,
        credibility_score=3.8,
        ratings_count=3,
    ),
]


SEED_VECTOR_TOPICS = {
    "seed-alana": {
        "offer": ["algorithms", "python", "system_design", "databases", "sql", "testing", "data_structures"],
        "need": ["statistics", "probability", "linear_algebra"],
    },
    "seed-dwayne": {
        "offer": ["networking", "cloud", "linux", "system_design", "operating_systems"],
        "need": ["sql", "databases", "discrete_math", "data_structures"],
    },
    "seed-kayla": {
        "offer": ["statistics", "probability", "calculus", "discrete_math", "linear_algebra"],
        "need": ["frontend", "nodejs", "javascript", "html_css"],
    },
    "seed-malik": {
        "offer": ["teamwork", "presentation", "communication", "project_management"],
        "need": ["algorithms", "data_structures", "calculus", "python", "discrete_math"],
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
    course_ids = [
        row[0]
        for row in db.query(Course.id)
        .join(UserCourse, UserCourse.course_id == Course.id)
        .filter(
            (UserCourse.user_id.in_(seed_user_ids))
            | (UserCourse.supplementary_tutor_user_id.in_(seed_user_ids))
        )
        .distinct()
        .all()
    ]
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
        db.query(UserCourse).filter(UserCourse.course_id.in_(course_ids)).delete(synchronize_session=False)
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
            credibility_score=seed_user.credibility_score,
            ratings_count=seed_user.ratings_count,
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
    )
    math2400 = Course(
        title="MATH2400",
        description="Probability foundations and quantitative reasoning.",
    )
    comp3901 = Course(
        title="COMP3901",
        description="Software engineering project delivery and teamwork.",
    )
    db.add_all([comp3035, math2400, comp3901])
    db.flush()

    db.add_all(
        [
            UserCourse(
                user_id=alana.id,
                course_id=comp3035.id,
                proficiency="strong",
                specific_topics="query optimization, indexing",
            ),
            UserCourse(
                user_id=dwayne.id,
                course_id=comp3035.id,
                proficiency="average",
                specific_topics="joins and schema design",
                supplementary_tutor_user_id=alana.id,
            ),
            UserCourse(
                user_id=malik.id,
                course_id=comp3035.id,
                proficiency="weak",
                specific_topics="normalization and SQL practice",
                supplementary_tutor_user_id=alana.id,
            ),
            UserCourse(
                user_id=kayla.id,
                course_id=math2400.id,
                proficiency="strong",
                specific_topics="probability distributions",
            ),
            UserCourse(
                user_id=alana.id,
                course_id=math2400.id,
                proficiency="average",
                specific_topics="expected value and variance",
                supplementary_tutor_user_id=kayla.id,
            ),
            UserCourse(
                user_id=malik.id,
                course_id=math2400.id,
                proficiency="weak",
                specific_topics="discrete random variables",
                supplementary_tutor_user_id=kayla.id,
            ),
            UserCourse(
                user_id=dwayne.id,
                course_id=comp3901.id,
                proficiency="strong",
                specific_topics="agile delivery and retrospectives",
            ),
            UserCourse(
                user_id=alana.id,
                course_id=comp3901.id,
                proficiency="average",
                specific_topics="API planning and integrations",
                supplementary_tutor_user_id=dwayne.id,
            ),
            UserCourse(
                user_id=kayla.id,
                course_id=comp3901.id,
                proficiency="average",
                specific_topics="project coordination",
                supplementary_tutor_user_id=dwayne.id,
            ),
        ]
    )

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