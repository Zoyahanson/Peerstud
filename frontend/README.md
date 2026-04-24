# PeerStud Frontend

Next.js frontend for PeerStud dashboard, profile management, resource browsing, study groups, and Google Calendar linking.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
copy .env.local.example .env.local
```

3. Verify API URL in `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

4. Start dev server:

```bash
npm run dev
```

## Key Routes

- `/` home landing page
- `/login` login screen (demo mode fallback available)
- `/register` registration screen
- `/dashboard` sessions + Google Calendar linking
- `/dashboard/study-groups` backend-powered course summaries
- `/dashboard/resources` backend-powered resources table
- `/dashboard/settings` persistent user settings
- `/profile` profile details and profile metadata editor
- `/google-calendar-callback` OAuth popup callback handler
