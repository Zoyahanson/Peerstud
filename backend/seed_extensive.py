from __future__ import annotations

import hashlib
import json
import os
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import sqrt
from pathlib import Path
from urllib import error as url_error
from urllib import request as url_request

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

RNG = random.Random(42)
SEED_REPORT_PATH = Path(__file__).with_name("seed_report_extensive.json")
DEFAULT_SEED_PASSWORD = "peerstud123!"
VECTOR_SIZE = 1536

TOPIC_INDEX = {
    "algorithms": 0,
    "python": 1,
    "java": 2,
    "sql": 3,
    "databases": 4,
    "system_design": 5,
    "networking": 6,
    "cloud": 7,
    "linux": 8,
    "frontend": 9,
    "ui": 10,
    "react": 11,
    "nodejs": 12,
    "javascript": 13,
    "html_css": 14,
    "git": 15,
    "agile": 16,
    "testing": 17,
    "security": 18,
    "data_structures": 19,
    "probability": 20,
    "statistics": 21,
    "calculus": 22,
    "discrete_math": 23,
    "linear_algebra": 24,
    "teamwork": 25,
    "presentation": 26,
    "communication": 27,
    "project_management": 28,
    "operating_systems": 29,
    "compilers": 30,
    "computer_architecture": 31,
}

COURSES = [
    ("COMP1126", "Introduction to Computing I"),
    ("COMP1127", "Introduction to Computing II"),
    ("COMP1161", "Object-Oriented Programming"),
    ("COMP1210", "Mathematics for Computing"),
    ("COMP2130", "Systems Programming"),
    ("COMP2140", "Software Engineering"),
    ("COMP2171", "Object Oriented Design and Implementation"),
    ("COMP2190", "Net-Centric Computing"),
    ("COMP2201", "Discrete Mathematics for Computer Science"),
    ("COMP2211", "Analysis of Algorithms"),
    ("COMP2340", "Computer Systems Organization"),
    ("INFO2101", "Probability and Statistics for Computing"),
    ("INFO2111", "Data Structures"),
    ("INFO2180", "Dynamic Web Development I"),
    ("COMP3101", "Operating Systems"),
    ("COMP3161", "Database Management Systems"),
    ("COMP3191", "Principles of Computer Networking"),
    ("COMP3220", "Principles of Artificial Intelligence"),
    ("COMP3652", "Language Processors"),
    ("SWEN3165", "Software Testing"),
]


@dataclass(frozen=True)
class SeedUser:
    auth_uid: str
    email: str
    full_name: str
    year_of_study: str
    major: str
    minor: str
    current_courses: list[str]
    available_for_tutoring: bool
    strengths: str
    weak_topics: str
    offer_text: str
    need_text: str


def _unit_normalize(vector: list[float]) -> list[float]:
    magnitude = sqrt(sum(v * v for v in vector))
    if magnitude == 0:
        return vector
    return [v / magnitude for v in vector]


def _noise_at(seed: str, index: int) -> float:
    digest = hashlib.sha256(f"{seed}:{index}".encode("utf-8")).digest()
    return (digest[0] / 255.0) * 0.02


def _build_topic_vector(seed: str, topics: list[str]) -> list[float]:
    vector = [_noise_at(seed, idx) for idx in range(VECTOR_SIZE)]
    for topic in topics:
        topic_index = TOPIC_INDEX.get(topic)
        if topic_index is not None and topic_index < VECTOR_SIZE:
            vector[topic_index] += 1.0
    return _unit_normalize(vector)


def _topic_words(text: str) -> list[str]:
    lowered = text.lower()
    results: list[str] = []
    mapping = {
        "algorithm": ["algorithms", "data_structures"],
        "python": ["python"],
        "java": ["java"],
        "sql": ["sql", "databases"],
        "database": ["databases", "sql"],
        "network": ["networking"],
        "cloud": ["cloud"],
        "linux": ["linux", "operating_systems"],
        "frontend": ["frontend", "ui", "react", "javascript"],
        "react": ["react", "frontend", "javascript"],
        "testing": ["testing"],
        "security": ["security"],
        "statistics": ["statistics", "probability"],
        "probability": ["probability", "statistics"],
        "calculus": ["calculus"],
        "discrete": ["discrete_math"],
        "systems": ["operating_systems", "computer_architecture"],
    }
    for key, topics in mapping.items():
        if key in lowered:
            results.extend(topics)
    if not results:
        results = ["teamwork", "communication"]
    return sorted(set(results))


def _generate_seed_users() -> list[SeedUser]:
    first_names = [
        "Alex", "Brittany", "Christopher", "Danielle", "Ethan", "Faith", "Gabriel", "Hannah", "Isaac", "Jessica",
        "Kevin", "Laura", "Marcus", "Natalie", "Oscar", "Patricia", "Quentin", "Rachel", "Samuel", "Tiffany",
        "Uriel", "Victoria", "William", "Xena", "Yusef", "Zoe", "Aaron", "Bianca", "Cameron", "Dominique",
        "Elijah", "Fatima", "George", "Hailey", "Ian", "Jade", "Kareem", "Leah", "Marlon", "Naomi",
        "Orlando", "Priya", "Reece", "Sasha", "Trevor", "Uma", "Vaughn", "Wendy", "Xavier", "Yara",
    ]
    last_names = [
        "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson",
        "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "White", "Harris", "Clark",
        "Lewis", "Robinson", "Walker", "Young", "King", "Scott", "Green", "Adams", "Baker", "Nelson",
        "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards",
        "Collins", "Stewart", "Morris", "Rogers", "Reed", "Cook", "Morgan", "Bell", "Murphy", "Bailey",
    ]

    majors = ["Computer Science", "Software Engineering", "Information Technology"]
    minors = ["", "Mathematics", "Management Studies"]
    strengths = [
        "Python, SQL, algorithms and systems thinking",
        "Frontend React, UI polish, and communication",
        "Networking, Linux operations, cloud fundamentals",
        "Testing, agile teamwork, and project management",
        "Data structures, debugging, and exam prep support",
    ]
    weaknesses = [
        "Advanced calculus and probability",
        "Operating systems internals and compilers",
        "System design at scale and cloud architecture",
        "Frontend accessibility and UI consistency",
        "Database optimization and query planning",
    ]

    users: list[SeedUser] = []
    for idx in range(50):
        is_tutor = idx >= 35
        uid = f"{'tutor' if is_tutor else 'student'}_{idx + 1:02d}"
        first = first_names[idx]
        last = last_names[idx]
        name = f"{first} {last} PS"
        slug = f"{first.lower()}.{last.lower()}.ps"
        year = RNG.choice(["Year 3", "Year 4"]) if is_tutor else RNG.choice(["Year 1", "Year 2", "Year 3"])
        chosen_major = RNG.choice(majors)
        chosen_minor = RNG.choice(minors)
        my_courses = sorted(RNG.sample([code for code, _ in COURSES], k=RNG.randint(3, 6)))
        offer = RNG.choice(strengths)
        need = RNG.choice(weaknesses)
        users.append(
            SeedUser(
                auth_uid=uid,
                email=f"{slug}@mymona.uwi.edu",
                full_name=name,
                year_of_study=year,
                major=chosen_major,
                minor=chosen_minor,
                current_courses=my_courses,
                available_for_tutoring=is_tutor or RNG.random() < 0.25,
                strengths=offer,
                weak_topics=need,
                offer_text=f"Can help peers with {offer.lower()}.",
                need_text=f"Needs support in {need.lower()}.",
            )
        )
    return users


def _wipe_existing_extensive_seed(db: Session) -> None:
    users = db.query(User).filter(
        (User.auth_uid.like("student_%")) | (User.auth_uid.like("tutor_%")) | (User.email.like("%.ps@mymona.uwi.edu"))
    ).all()
    if not users:
        return

    user_ids = [u.id for u in users]
    course_ids = [row[0] for row in db.query(Course.id).filter(Course.instructor_id.in_(user_ids)).all()]
    session_ids = [
        row[0]
        for row in db.query(StudySession.id)
        .filter((StudySession.host_user_id.in_(user_ids)) | (StudySession.course_id.in_(course_ids)))
        .all()
    ]
    group_ids = [
        row[0]
        for row in db.query(StudyGroup.id)
        .filter((StudyGroup.creator_user_id.in_(user_ids)) | (StudyGroup.course_id.in_(course_ids)))
        .all()
    ]
    convo_ids = [
        row[0]
        for row in db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id.in_(user_ids))
        .distinct()
        .all()
    ]

    if convo_ids:
        db.query(ChatMessage).filter(ChatMessage.conversation_id.in_(convo_ids)).delete(synchronize_session=False)
        db.query(ConversationParticipant).filter(ConversationParticipant.conversation_id.in_(convo_ids)).delete(synchronize_session=False)
        db.query(Conversation).filter(Conversation.id.in_(convo_ids)).delete(synchronize_session=False)

    if session_ids:
        db.query(SessionRating).filter(
            (SessionRating.session_id.in_(session_ids))
            | (SessionRating.rater_user_id.in_(user_ids))
            | (SessionRating.tutor_user_id.in_(user_ids))
        ).delete(synchronize_session=False)
        db.query(SessionParticipant).filter(
            (SessionParticipant.session_id.in_(session_ids)) | (SessionParticipant.user_id.in_(user_ids))
        ).delete(synchronize_session=False)
        db.query(Resource).filter(
            (Resource.session_id.in_(session_ids)) | (Resource.uploaded_by_user_id.in_(user_ids))
        ).delete(synchronize_session=False)
        db.query(StudySession).filter(StudySession.id.in_(session_ids)).delete(synchronize_session=False)

    if group_ids:
        db.query(StudyGroupMember).filter(
            (StudyGroupMember.group_id.in_(group_ids)) | (StudyGroupMember.user_id.in_(user_ids))
        ).delete(synchronize_session=False)
        db.query(StudyGroup).filter(StudyGroup.id.in_(group_ids)).delete(synchronize_session=False)

    if course_ids:
        db.query(Course).filter(Course.id.in_(course_ids)).delete(synchronize_session=False)

    db.query(UserSettings).filter(UserSettings.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(UserProfile).filter(UserProfile.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    db.flush()


def _seed(db: Session, seed_users: list[SeedUser]) -> dict[str, object]:

    # Insert users first so we have tutor IDs for course ownership.
    users_by_uid: dict[str, User] = {}
    tutor_users: list[User] = []
    for seed_user in seed_users:
        user = User(auth_uid=seed_user.auth_uid, email=seed_user.email, full_name=seed_user.full_name)
        db.add(user)
        db.flush()
        users_by_uid[seed_user.auth_uid] = user
        if seed_user.auth_uid.startswith("tutor_"):
            tutor_users.append(user)

    courses_by_code: dict[str, Course] = {}
    for index, (code, title) in enumerate(COURSES):
        owner = tutor_users[index % len(tutor_users)]
        course = Course(
            title=code,
            description=f"{title} - seeded for peer collaboration and tutoring.",
            instructor_id=owner.id,
        )
        db.add(course)
        db.flush()
        courses_by_code[code] = course

    # Profiles and settings
    for seed_user in seed_users:
        user = users_by_uid[seed_user.auth_uid]
        offer_topics = _topic_words(seed_user.offer_text)
        need_topics = _topic_words(seed_user.need_text)
        offer_vector = _build_topic_vector(f"{seed_user.auth_uid}:offer", offer_topics)
        need_vector = _build_topic_vector(f"{seed_user.auth_uid}:need", need_topics)
        embedding = _unit_normalize([(o + n) / 2.0 for o, n in zip(offer_vector, need_vector)])

        db.add(
            UserProfile(
                user_id=user.id,
                year_of_study=seed_user.year_of_study,
                faculty="Faculty of Science and Technology",
                campus="Mona",
                major=seed_user.major,
                minor=seed_user.minor or None,
                current_courses=seed_user.current_courses,
                qualifications="Peer learning contributor, active in computing labs.",
                tutoring_experience="Experienced peer tutor." if seed_user.available_for_tutoring else "Building tutoring confidence.",
                available_for_tutoring=seed_user.available_for_tutoring,
                strengths=seed_user.strengths,
                weak_topics=seed_user.weak_topics,
                bio=f"{seed_user.full_name.split()[0]} is a {seed_user.year_of_study} {seed_user.major} student.",
                interests="coding, workshops, project teams",
                offer_text=seed_user.offer_text,
                need_text=seed_user.need_text,
                embedding=embedding,
                offer_vector=offer_vector,
                need_vector=need_vector,
                credibility_score=4.4 if seed_user.auth_uid.startswith("tutor_") else 3.1 + (RNG.random() * 1.2),
                ratings_count=RNG.randint(0, 12),
            )
        )
        db.add(
            UserSettings(
                user_id=user.id,
                email_alerts=RNG.random() > 0.15,
                calendar_auto_meet=RNG.random() > 0.4,
                adaptive_layout=True,
                desktop_reminders=RNG.random() > 0.2,
                reminder_minutes_before=RNG.choice([10, 15, 20, 30, 45]),
            )
        )

    db.flush()

    all_users = list(users_by_uid.values())
    now = datetime.now(timezone.utc)
    sessions: list[StudySession] = []

    for i in range(24):
        host = RNG.choice(tutor_users)
        course = RNG.choice(list(courses_by_code.values()))
        start_time = now + timedelta(days=RNG.randint(-8, 20), hours=RNG.randint(8, 19))
        end_time = start_time + timedelta(hours=2)
        status = "completed" if start_time < now else "scheduled"
        session = StudySession(
            course_id=course.id,
            host_user_id=host.id,
            classroom_name=f"Virtual Room {i + 1}",
            topic_focus=RNG.choice([
                "Algorithms clinic",
                "Database optimization",
                "Networking fundamentals",
                "Frontend architecture",
                "OS process scheduling",
                "Statistics for computing",
            ]),
            description="Peer-led focused study session",
            start_time=start_time,
            end_time=end_time,
            meet_link=f"https://meet.jit.si/peerstud-seeded-{i + 1}",
            status=status,
        )
        db.add(session)
        db.flush()
        sessions.append(session)

        attendees = [host] + RNG.sample([u for u in all_users if u.id != host.id], k=RNG.randint(3, 8))
        for attendee in attendees:
            db.add(SessionParticipant(session_id=session.id, user_id=attendee.id, status="confirmed"))

        if status == "completed":
            for attendee in attendees:
                if attendee.id == host.id:
                    continue
                db.add(
                    SessionRating(
                        session_id=session.id,
                        rater_user_id=attendee.id,
                        tutor_user_id=host.id,
                        score=RNG.randint(4, 5),
                        feedback=RNG.choice([
                            "Clear explanations and great pacing.",
                            "Very helpful examples and practice questions.",
                            "Strong peer mentoring session.",
                        ]),
                    )
                )

    for i in range(18):
        course = RNG.choice(list(courses_by_code.values()))
        uploader = RNG.choice(all_users)
        target_session = RNG.choice(sessions)
        db.add(
            Resource(
                course_id=course.id,
                session_id=target_session.id if RNG.random() > 0.35 else None,
                uploaded_by_user_id=uploader.id,
                title=f"Study resource {i + 1}",
                url=f"https://example.com/resources/peerstud-{i + 1}.pdf",
                storage_path=f"seed/resources/peerstud-{i + 1}.pdf",
                file_name=f"peerstud-{i + 1}.pdf",
                mime_type="application/pdf",
                file_size_bytes=RNG.randint(95_000, 380_000),
                resource_type="file",
            )
        )

    groups: list[StudyGroup] = []
    for i in range(10):
        creator = RNG.choice(tutor_users)
        course = RNG.choice(list(courses_by_code.values()))
        start = now + timedelta(days=RNG.randint(1, 12), hours=RNG.randint(9, 18))
        group = StudyGroup(
            course_id=course.id,
            creator_user_id=creator.id,
            topic_focus=f"Study Group Track {i + 1}",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            target_size=RNG.randint(5, 9),
            min_size=4,
            max_size=15,
            attendance_required=True,
            inactive_after_days=21,
            system_suggested=RNG.random() > 0.5,
            status="open",
        )
        db.add(group)
        db.flush()
        groups.append(group)

        members = [creator] + RNG.sample([u for u in all_users if u.id != creator.id], k=RNG.randint(4, 9))
        for member in members[: group.target_size]:
            db.add(
                StudyGroupMember(
                    group_id=group.id,
                    user_id=member.id,
                    status="active",
                    attendance_count=RNG.randint(0, 6),
                )
            )

    for i in range(20):
        left = RNG.choice(all_users)
        right = RNG.choice([u for u in all_users if u.id != left.id])
        conv = Conversation(kind="direct")
        db.add(conv)
        db.flush()
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=left.id))
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=right.id))
        db.add(
            ChatMessage(
                conversation_id=conv.id,
                sender_user_id=left.id,
                content=RNG.choice([
                    "Can we review algorithms before the quiz?",
                    "I shared the notes in resources.",
                    "Are you joining the evening study group?",
                ]),
            )
        )

    db.flush()

    return {
        "summary": {
            "users": db.query(func.count(User.id)).filter((User.auth_uid.like("student_%")) | (User.auth_uid.like("tutor_%"))).scalar() or 0,
            "tutors": db.query(func.count(User.id)).filter(User.auth_uid.like("tutor_%")).scalar() or 0,
            "courses": db.query(func.count(Course.id)).scalar() or 0,
            "sessions": db.query(func.count(StudySession.id)).scalar() or 0,
            "study_groups": db.query(func.count(StudyGroup.id)).scalar() or 0,
            "resources": db.query(func.count(Resource.id)).scalar() or 0,
            "ratings": db.query(func.count(SessionRating.id)).scalar() or 0,
            "conversations": db.query(func.count(Conversation.id)).scalar() or 0,
            "messages": db.query(func.count(ChatMessage.id)).scalar() or 0,
        }
    }


def _sync_auth_users(seed_users: list[SeedUser]) -> dict[str, int]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not service_role_key:
        print("Skipping Supabase Auth sync (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing).")
        return {"created": 0, "skipped": 0, "failed": 0}

    admin_url = f"{supabase_url}/auth/v1/admin/users"
    created = 0
    skipped = 0
    failed = 0

    for seed_user in seed_users:
        first_name, _, last_name = seed_user.full_name.partition(" ")
        payload = {
            "email": seed_user.email,
            "password": DEFAULT_SEED_PASSWORD,
            "email_confirm": True,
            "user_metadata": {
                "first_name": first_name,
                "last_name": last_name,
                "full_name": seed_user.full_name,
            },
        }

        request = url_request.Request(
            admin_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with url_request.urlopen(request, timeout=20) as response:
                if response.status in (200, 201):
                    created += 1
                else:
                    failed += 1
        except url_error.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="ignore")
            except Exception:
                body = ""
            lowered = body.lower()
            if exc.code in (400, 409, 422) and "already" in lowered:
                skipped += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    return {"created": created, "skipped": skipped, "failed": failed}


def main() -> None:
    session = SessionLocal()
    try:
        print("Seeding extensive dataset...")
        seed_users = _generate_seed_users()
        _wipe_existing_extensive_seed(session)
        result = _seed(session, seed_users)
        session.commit()

        print("Syncing Supabase Auth users...")
        auth_sync = _sync_auth_users(seed_users)
        print(
            f"Auth sync complete: created={auth_sync['created']}, skipped={auth_sync['skipped']}, failed={auth_sync['failed']}"
        )

        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "default_password": DEFAULT_SEED_PASSWORD,
            "auth_note": "Seed script attempts to create matching Supabase Auth users via Admin API.",
            "auth_sync": auth_sync,
            **result,
        }
        SEED_REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("Seeding complete.")
        print(json.dumps(report["summary"], indent=2))
        print(f"Report written to {SEED_REPORT_PATH}")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
