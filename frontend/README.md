# PeerStud Frontend

Next.js frontend for PeerStud dashboard, profile management, resource browsing, study groups, and Supabase-authenticated access.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
copy .env.local.example .env.local
```

3. Configure `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ALLOWED_SCHOOL_EMAIL_DOMAINS=mymona.uwi.edu,uwi.edu.jm
```

## Supabase Auth Prerequisites

Before using `/register` and `/login`, configure Supabase:

1. Enable Email provider in `Authentication -> Providers`.
2. Enable email confirmation and email OTP.
3. Set Site URL to your frontend URL (for local: `http://localhost:3000`).

Registration uses OTP verification and only allows listed organization domains.

4. Start dev server:

```bash
npm run dev
```

## Key Routes

- `/` home landing page
- `/login` login screen (demo mode fallback available)
- `/register` registration screen
- `/dashboard` sessions overview and quick room access
- `/dashboard/study-groups` backend-powered course summaries
- `/dashboard/resources` backend-powered resources table
- `/dashboard/settings` reminders and provider-neutral calendar guidance
- `/profile` profile details and profile metadata editor
