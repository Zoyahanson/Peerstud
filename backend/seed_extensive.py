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

from dotenv import load_dotenv
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy import column
from sqlalchemy.orm import Session
from sqlalchemy.inspection import inspect

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

RNG = random.Random(42)

VECTOR_SIZE = 1536
DEFAULT_SEED_PASSWORD = "peerstud123!"
SEED_REPORT_PATH = Path(__file__).with_name("seed_report_extensive.json")

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ENV = REPO_ROOT / "backend" / ".env"
ROOT_ENV = REPO_ROOT / ".env"

if BACKEND_ENV.exists():
    load_dotenv(BACKEND_ENV)
elif ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)
else:
    load_dotenv()

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
}

COURSES = [
    ("COMP1126", "Introduction to Computing I"),
    ("COMP1127", "Introduction to Computing II"),
    ("COMP2140", "Software Engineering"),
    ("COMP2211", "Analysis of Algorithms"),
    ("COMP3161", "Database Management Systems"),
    ("COMP3191", "Computer Networking"),
    ("INFO2180", "Dynamic Web Development"),
    ("COMP3101", "Operating Systems"),
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
    bio: str
    interests: str
    offer_text: str
    need_text: str
    qualifications: str
    tutoring_experience: str


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

        if topic_index is not None:
            vector[topic_index] += 1.0

    return _unit_normalize(vector)


def _topic_words(text: str) -> list[str]:
    lowered = text.lower()

    mapping = {
        "algorithm": ["algorithms", "data_structures"],
        "python": ["python"],
        "sql": ["sql", "databases"],
        "database": ["databases"],
        "network": ["networking"],
        "linux": ["linux"],
        "frontend": ["frontend", "react", "javascript"],
        "react": ["react", "frontend"],
        "statistics": ["statistics", "probability"],
        "calculus": ["calculus"],
    }

    results = []

    for key, values in mapping.items():
        if key in lowered:
            results.extend(values)

    return sorted(set(results or ["teamwork", "communication"]))


def _generate_seed_users() -> list[SeedUser]:
    first_names = [
        "Alex", "Brittany", "Chris", "Danielle", "Ethan",
        "Faith", "Gabriel", "Hannah", "Isaac", "Jessica",
        "Kevin", "Laura", "Marcus", "Natalie", "Oscar",
        "Patricia", "Quentin", "Rachel", "Samuel", "Tiffany",
        "Uriel", "Victoria", "William", "Xena", "Yusef",
        "Zoe", "Aaron", "Bianca", "Cameron", "Dominique",
        "Elijah", "Fatima", "George", "Hailey", "Ian",
        "Jade", "Kareem", "Leah", "Marlon", "Naomi",
        "Orlando", "Priya", "Reece", "Sasha", "Trevor",
        "Uma", "Vaughn", "Wendy", "Xavier", "Yara",
    ]

    last_names = [
        "Johnson", "Brown", "Williams", "Miller", "Davis",
        "Wilson", "Moore", "Taylor", "Thomas", "Jackson",
        "Martin", "Lee", "Clark", "Walker", "Young",
        "Allen", "King", "Scott", "Green", "Baker",
        "Adams", "Nelson", "Hill", "Campbell", "Mitchell",
        "Roberts", "Carter", "Phillips", "Evans", "Turner",
        "Parker", "Collins", "Edwards", "Stewart", "Morris",
        "Rogers", "Reed", "Cook", "Morgan", "Bell",
        "Murphy", "Bailey", "Rivera", "Cooper", "Richardson",
        "Cox", "Howard", "Ward", "Torres", "Peterson",
    ]

    majors = [
        "Computer Science",
        "Information Technology",
        "Software Engineering",
    ]

    minors = [
        "",
        "Mathematics",
        "Management Studies",
    ]

    strengths = [
        "Python SQL algorithms",
        "Frontend React UI",
        "Networking Linux cloud",
        "Testing agile teamwork",
        "Database optimization",
    ]

    weaknesses = [
        "Calculus and statistics",
        "Operating systems",
        "System design",
        "Frontend accessibility",
        "Advanced SQL tuning",
    ]

    users = []

    for idx in range(50):
        first = first_names[idx]
        last = last_names[idx]

        is_tutor = idx >= 35

        auth_uid = f"seed-user-{idx+1:02d}"

        users.append(
            SeedUser(
                auth_uid=auth_uid,
                email=f"{first.lower()}.{last.lower()}@mymona.uwi.edu",
                full_name=f"{first} {last}",
                year_of_study=RNG.choice(
                    ["Year 1", "Year 2", "Year 3", "Year 4"]
                ),
                major=RNG.choice(majors),
                minor=RNG.choice(minors),
                current_courses=sorted(
                    RNG.sample(
                        [c[0] for c in COURSES],
                        k=RNG.randint(3, 5),
                    )
                ),
                available_for_tutoring=is_tutor,
                strengths=RNG.choice(strengths),
                weak_topics=RNG.choice(weaknesses),
                bio="Focused on collaborative learning and practical computing.",
                interests="coding, study groups, hackathons",
                offer_text="Happy to help peers understand difficult concepts.",
                need_text="Looking for deeper understanding in advanced topics.",
                qualifications="Active computing student and peer contributor.",
                tutoring_experience=(
                    "Experienced peer tutor."
                    if is_tutor
                    else "Growing tutoring confidence."
                ),
            )
        )

    return users


def build_user_settings(user_id):
    """
    Build UserSettings safely using ONLY columns
    that actually exist on the ORM model.
    """

    possible_values = {
        "user_id": user_id,
        "email_alerts": True,
        "adaptive_layout": True,
        "desktop_reminders": True,
        "reminder_minutes_before": random.choice([10, 20, 30, 45]),
        "weekly_progress_digest": True,
        "focus_mode_enabled": False,
        "show_online_status": True,
        "onboarding_completed": False,
        "availability_slots": [],
        "matching_preference": "peers_only",
        "study_style_preference": "both",
        "preferred_session_length_minutes": 60,
        "include_graduate_tutors": False,

        # OPTIONAL / NEWER FIELDS
        "calendar_auto_meet": True,
        "calendar_sync_enabled": False,
        "push_notifications": True,
    }

    # Only keep fields that ACTUALLY exist on ORM model
    valid_columns = {
        c.key for c in inspect(UserSettings).mapper.column_attrs
    }

    filtered = {
        k: v for k, v in possible_values.items()
        if k in valid_columns
    }

    return UserSettings(**filtered)


def _wipe_existing_seed_data(db: Session) -> None:
    users = db.query(User).filter(
        User.auth_uid.like("seed-user-%")
    ).all()

    if not users:
        return

    user_ids = [u.id for u in users]

    conversation_ids = [
        row[0]
        for row in db.query(
            ConversationParticipant.conversation_id
        )
        .filter(
            ConversationParticipant.user_id.in_(user_ids)
        )
        .distinct()
        .all()
    ]

    if conversation_ids:
        db.query(ChatMessage).filter(
            ChatMessage.conversation_id.in_(conversation_ids)
        ).delete(synchronize_session=False)

        db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id.in_(conversation_ids)
        ).delete(synchronize_session=False)

        db.query(Conversation).filter(
            Conversation.id.in_(conversation_ids)
        ).delete(synchronize_session=False)

    db.query(SessionRating).filter(
        (SessionRating.rater_user_id.in_(user_ids))
        | (SessionRating.tutor_user_id.in_(user_ids))
    ).delete(synchronize_session=False)

    db.query(SessionParticipant).filter(
        SessionParticipant.user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(Resource).filter(
        Resource.uploaded_by_user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(StudyGroupMember).filter(
        StudyGroupMember.user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(StudyGroup).filter(
        StudyGroup.creator_user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(StudySession).filter(
        StudySession.host_user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(UserCourse).filter(
        UserCourse.user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(UserSettings).filter(
        UserSettings.user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(UserProfile).filter(
        UserProfile.user_id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.query(User).filter(
        User.id.in_(user_ids)
    ).delete(synchronize_session=False)

    db.flush()


def _sync_auth_users(seed_users: list[SeedUser]) -> None:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not service_role_key:
        print("Skipping auth sync.")
        return

    admin_url = f"{supabase_url}/auth/v1/admin/users"

    for seed_user in seed_users:
        payload = {
            "email": seed_user.email,
            "password": DEFAULT_SEED_PASSWORD,
            "email_confirm": True,
            "user_metadata": {
                "full_name": seed_user.full_name,
                "year_of_study": seed_user.year_of_study,
                "major": seed_user.major,
                "minor": seed_user.minor or None,
                "bio": seed_user.bio,
                "interests": seed_user.interests,
                "available_for_tutoring": seed_user.available_for_tutoring,
                "strengths": seed_user.strengths,
                "weak_topics": seed_user.weak_topics,
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
            url_request.urlopen(request, timeout=20)
        except url_error.HTTPError:
            pass
        except Exception:
            pass


def _seed(db: Session, seed_users: list[SeedUser]) -> dict:
    users_by_uid = {}

    for seed_user in seed_users:
        user = User(
            auth_uid=seed_user.auth_uid,
            email=seed_user.email,
            full_name=seed_user.full_name,
        )

        db.add(user)
        db.flush()

        users_by_uid[seed_user.auth_uid] = user

        offer_topics = _topic_words(seed_user.strengths)
        need_topics = _topic_words(seed_user.weak_topics)

        offer_vector = _build_topic_vector(
            f"{seed_user.auth_uid}:offer",
            offer_topics,
        )

        need_vector = _build_topic_vector(
            f"{seed_user.auth_uid}:need",
            need_topics,
        )

        embedding = _unit_normalize([
            (o + n) / 2.0
            for o, n in zip(offer_vector, need_vector)
        ])

        db.add(
            UserProfile(
                user_id=user.id,
                year_of_study=seed_user.year_of_study,
                faculty="Faculty of Science and Technology",
                campus="Mona",
                major=seed_user.major,
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
                credibility_score=(
                    4.5 if seed_user.available_for_tutoring else 3.2
                ),
                ratings_count=RNG.randint(0, 15),
            )
        )

        db.add(build_user_settings(user.id))

    db.flush()

    courses_by_code = {}

    for code, title in COURSES:
        course = Course(
            title=code,
            name=title,
            department="Computing",
            faculty="Faculty of Science and Technology",
            description=f"{title} collaborative course.",
        )

        db.add(course)
        db.flush()

        courses_by_code[code] = course

    all_users = list(users_by_uid.values())

    for user in all_users:
        profile = db.query(UserProfile).filter_by(
            user_id=user.id
        ).first()

        for code in profile.current_courses:
            if code not in courses_by_code:
                continue

            db.add(
                UserCourse(
                    user_id=user.id,
                    course_id=courses_by_code[code].id,
                    proficiency=RNG.choice(
                        ["weak", "average", "strong"]
                    ),
                    specific_topics="Peer collaboration",
                )
            )

    db.flush()

    now = datetime.now(timezone.utc)

    sessions = []

    for i in range(20):
        host = RNG.choice(all_users)
        course = RNG.choice(list(courses_by_code.values()))

        start_time = now + timedelta(
            days=RNG.randint(-5, 15)
        )

        session = StudySession(
            course_id=course.id,
            host_user_id=host.id,
            classroom_name=f"Room {i+1}",
            topic_focus=RNG.choice([
                "Algorithms",
                "SQL optimization",
                "Frontend systems",
                "Networking",
                "Statistics",
            ]),
            description="Collaborative peer study session.",
            start_time=start_time,
            end_time=start_time + timedelta(hours=2),
            meet_link=f"https://meet.jit.si/peerstud-{i+1}",
            status=(
                "completed"
                if start_time < now
                else "scheduled"
            ),
        )

        db.add(session)
        db.flush()

        sessions.append(session)

        attendees = RNG.sample(
            all_users,
            k=RNG.randint(4, 8),
        )

        for attendee in attendees:
            db.add(
                SessionParticipant(
                    session_id=session.id,
                    user_id=attendee.id,
                    status="confirmed",
                )
            )

    for i in range(10):
        creator = RNG.choice(all_users)
        course = RNG.choice(list(courses_by_code.values()))

        group = StudyGroup(
            course_id=course.id,
            creator_user_id=creator.id,
            topic_focus=f"Study Group {i+1}",
            scheduled_start=now + timedelta(days=i + 1),
            scheduled_end=now + timedelta(days=i + 1, hours=2),
            target_size=8,
            min_size=4,
            max_size=15,
            attendance_required=True,
            inactive_after_days=21,
            system_suggested=False,
            status="open",
        )

        db.add(group)
        db.flush()

        members = RNG.sample(all_users, k=6)

        for member in members:
            db.add(
                StudyGroupMember(
                    group_id=group.id,
                    user_id=member.id,
                    status="active",
                    attendance_count=RNG.randint(0, 5),
                )
            )

    for i in range(15):
        convo = Conversation(kind="direct")

        db.add(convo)
        db.flush()

        left, right = RNG.sample(all_users, 2)

        db.add(
            ConversationParticipant(
                conversation_id=convo.id,
                user_id=left.id,
            )
        )

        db.add(
            ConversationParticipant(
                conversation_id=convo.id,
                user_id=right.id,
            )
        )

        db.add(
            ChatMessage(
                conversation_id=convo.id,
                sender_user_id=left.id,
                content="Ready for tomorrow's study session?",
            )
        )

    db.flush()

    return {
        "summary": {
            "users": len(all_users),
            "courses": len(courses_by_code),
            "sessions": 20,
            "groups": 10,
        }
    }


def main() -> None:
    session = SessionLocal()

    try:
        print("Seeding extensive dataset...")

        seed_users = _generate_seed_users()

        _wipe_existing_seed_data(session)

        result = _seed(session, seed_users)

        session.commit()

        print("Syncing auth users...")
        _sync_auth_users(seed_users)

        report = {
            "generated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "summary": result["summary"],
        }

        SEED_REPORT_PATH.write_text(
            json.dumps(report, indent=2),
            encoding="utf-8",
        )

        print("Seeding complete.")
        print(json.dumps(report, indent=2))

    except Exception:
        session.rollback()
        raise

    finally:
        session.close()


if __name__ == "__main__":
    main()