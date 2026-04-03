# Peerstud

PeerStud provides authenticated classroom session scheduling and profile matching using PostgreSQL + pgvector.

## Backend Setup

1. Create and activate a virtual environment.
2. Install dependencies:

	```bash
	pip install -r backend/requirements.txt
	```

3. Configure environment variables:

	```bash
	copy backend\.env.example backend\.env
	```

4. Start PostgreSQL + pgvector:

	```bash
	docker compose up -d
	```

5. Run the API:

	```bash
	uvicorn backend.main:app --reload
	```

## Frontend Firebase Auth Setup

1. Copy Firebase config template:

	```bash
	copy frontend\firebase-config.example.js frontend\firebase-config.js
	```

2. Fill Firebase config values in `frontend/firebase-config.js`.
3. Serve frontend (example with VS Code Live Server) and open `frontend/index.html`.

The frontend supports:
- Email/password signup
- Email/password login
- Google OAuth popup login
- Session-scoped auth persistence
- Authenticated call to `GET /users/me`

## Google Meet Configuration

Google Meet links are created using Google Calendar API conference data.

Set environment variables:

- `GOOGLE_SERVICE_ACCOUNT_FILE` - absolute path to service account JSON
- `GOOGLE_CALENDAR_ID` - calendar ID (optional, defaults to `primary`)
- `GOOGLE_MEET_MOCK_MODE` - set to `true` to return mock links without Google credentials

## Current API Endpoints

- `GET /`
- `GET /users/me`
- `PUT /users/me/profile`
- `GET /users/{user_id}`
- `GET /matches`
- `GET /sessions`
- `POST /sessions`

## pgvector Verification

Run in PostgreSQL:

```sql
\i backend/sql/verify_pgvector.sql
```

Expected:
- extension `vector` exists
- tables `users`, `courses`, `user_profiles` exist
- `user_profiles.embedding` column type is vector

For architecture and ERD, see `docs/system-architecture-design.md`.