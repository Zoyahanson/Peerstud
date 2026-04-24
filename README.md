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

## Frontend Setup (Next.js)

1. Install dependencies:

	```bash
	cd frontend
	npm install
	```

2. Configure frontend environment:

	```bash
	copy .env.local.example .env.local
	```

3. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` (default: `http://127.0.0.1:8000`).
4. Run the frontend:

	```bash
	npm run dev
	```

5. Open `http://localhost:3000`.

## Google Meet Configuration

Google Meet links are created using Google Calendar API conference data.

Set environment variables:

- `GOOGLE_SERVICE_ACCOUNT_FILE` - absolute path to service account JSON
- `GOOGLE_CALENDAR_ID` - calendar ID (optional, defaults to `primary`)
- `GOOGLE_MEET_MOCK_MODE` - set to `true` to return mock links without Google credentials

## Current API Endpoints

- `GET /`
- `GET /users/me`
- `GET /users/me/profile`
- `PUT /users/me/profile`
- `GET /users/me/settings`
- `PUT /users/me/settings`
- `GET /users/me/google-calendar/status`
- `POST /users/me/google-calendar/link/start`
- `POST /users/me/google-calendar/link/complete`
- `DELETE /users/me/google-calendar/link`
- `GET /users/{user_id}`
- `GET /matches`
- `GET /courses`
- `GET /resources`
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