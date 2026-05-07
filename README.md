# Peerstud

PeerStud provides authenticated classroom session scheduling and profile matching using Supabase Auth + PostgreSQL + pgvector.

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

4. Set Supabase values in `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_JWT_AUDIENCE` (default `authenticated`)
- `DATABASE_URL` (point to hosted Postgres), or set:
- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_NAME`
- `DATABASE_USER`
- `DATABASE_PASSWORD`

5. Run the API:

	```bash
	uvicorn backend.main:app --reload
	```

6. Seed demo data and generate a database snapshot report:

	```bash
	python -m backend.seed_data
	```

	This writes seeded records to the configured database and outputs a report file at `backend/seed_report.json` with user accounts and aggregate datapoints.

Docker is optional and only needed if you want a local PostgreSQL + pgvector instance.

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

3. Set these in `.env.local`:

- `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ALLOWED_SCHOOL_EMAIL_DOMAINS` (set to `mymona.uwi.edu,uwi.edu.jm`)

4. Run the frontend:

	```bash
	npm run dev
	```

5. Open `http://localhost:3000`.

## Supabase Auth Setup

Configure Supabase Auth before testing login and registration:

1. In Supabase dashboard, go to `Authentication -> Providers -> Email`.
2. Enable Email provider.
3. Enable email confirmations.
4. Keep email OTP enabled (used by registration flow).
5. In `Authentication -> URL Configuration`, set:
	- Site URL: your frontend URL (local: `http://localhost:3000`)
	- Additional redirect URL: `http://localhost:3000/login`
6. In project settings, copy:
	- Project URL -> `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
	- Anon key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. Set backend env values in `backend/.env`:
	- `SUPABASE_URL`
	- `SUPABASE_JWT_AUDIENCE=authenticated`
	- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` (or a single `DATABASE_URL`)
	- `SCHOOL_EMAIL_DOMAINS=mymona.uwi.edu,uwi.edu.jm`

Auth behavior in this app:
- Registration sends an OTP to allowed organization domains only.
- Personal email domains are rejected at registration/login and backend token validation.
- Backend validates Supabase JWTs using Supabase JWKS.

## Optional Agent Skills

Install the Supabase agent skills for this repo with:

	```bash
	npx skills add supabase/agent-skills --all
	```

## Session Room And Calendar

Sessions use Jitsi-style room links. Calendar integration is provider-neutral via downloadable `.ics` invites.

## Current API Endpoints

- `GET /`
- `GET /users/me`
- `GET /users/me/profile`
- `PUT /users/me/profile`
- `GET /users/me/settings`
- `PUT /users/me/settings`
- `GET /users/{user_id}`
- `GET /matches`
- `GET /courses`
- `GET /resources`
- `GET /sessions`
- `POST /sessions`
- `GET /sessions/{session_id}/calendar`

## pgvector Verification

Run in PostgreSQL:

```sql
\i backend/sql/verify_pgvector.sql
```

Expected:
- extension `vector` exists
- tables `users`, `courses`, `user_profiles` exist
- `user_profiles.embedding` column type is vector

## Link Project Spec Schema

If you are using the project-spec schema draft and want to merge it with the
current backend schema without breaking existing endpoints, run:

```sql
\i backend/sql/project_spec_bridge.sql
```

This bridge script adds:
- project-spec compatibility columns on `users` and `user_profiles`
- dual vector fields (`offer_vector`, `need_vector`) on `user_profiles`
- additive tables (`user_courses`, `match_history`, `progress_metrics`,
  `course_progress`, `notifications`)
- indexes and triggers for credibility/progress synchronization

For architecture and ERD, see `docs/system-architecture-design.md`.

## Production Deployment Checklist

Use this checklist for the recommended stack:
- frontend on Vercel
- auth and PostgreSQL on Supabase
- FastAPI backend on Render, Railway, Fly.io, or Cloud Run

1. Supabase project setup

- Enable email/password auth in Supabase Auth.
- Configure site URL and redirect URLs for frontend routes.
- Confirm JWT audience is `authenticated` (or set your custom audience consistently).
- Apply schema migrations, including pgvector enablement and bridge SQL if needed.

2. Backend deployment

- Deploy the FastAPI service from the repository root.
- Set required env vars:
	- `DATABASE_URL`
	- `SUPABASE_URL`
	- `SUPABASE_JWT_AUDIENCE`
	- `SCHOOL_EMAIL_DOMAINS`
- Configure CORS to allow the Vercel frontend domain.
- Run a health check against `/` and auth check against `/users/me` using a valid Supabase access token.

3. Frontend deployment (Vercel)

- Set env vars in Vercel:
	- `NEXT_PUBLIC_API_BASE_URL`
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Ensure auth callback URLs in Supabase match deployed frontend URLs.
- Validate login, register, logout, and protected route redirects in production.

4. Data and vector verification

- Confirm `vector` extension exists in the production database.
- Verify profile vectors are present for users expected to be matchable.
- Validate `/matches` returns results for seeded test accounts.

5. Post-deploy smoke tests

- Register and log in with a school email account.
- Create or update profile and save vector fields.
- Run tutor search and matching endpoints.
- Create a session and verify participant and leaderboard flows.

## Deploy Backend to Render

This repository includes a Render Blueprint file at `render.yaml` for the FastAPI backend.

1. Push your latest code to GitHub.
2. In Render, click `New +` -> `Blueprint` and connect this repository.
3. Render detects `render.yaml` and creates the `peerstud-backend` web service.
4. In Render service settings, set secrets (values are intentionally not committed):
	- `DATABASE_URL` (Supabase Postgres connection string)
	- `SUPABASE_URL`
	- `SUPABASE_JWT_AUDIENCE` (keep `authenticated` unless your Supabase JWT audience differs)
	- `SCHOOL_EMAIL_DOMAINS` (for example `mymona.uwi.edu,uwi.edu.jm`)
	- `CORS_ALLOWED_ORIGINS` (for example `https://your-frontend.vercel.app`)
5. Deploy and verify:
	- `GET /` returns `PeerStud Backend Running`
	- `GET /docs` loads Swagger UI
	- Protected routes (for example `/users/me`) work with a valid Supabase access token

Notes:
- Start command is `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
- Build command is `pip install -r backend/requirements.txt`.
- CORS now reads from `CORS_ALLOWED_ORIGINS` (comma-separated values).
- File uploads are written to the local container filesystem, so uploaded files are not persistent across Render deploys or restarts.