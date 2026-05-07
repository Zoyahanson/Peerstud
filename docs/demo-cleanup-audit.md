# Demo Cleanup Audit (April 23, 2026)

This file marks code paths, scripts, and folders that can be reduced for a lighter demo and early test-user rollout.

## Safe To Simplify Now

1. Frontend animation dependency
- Status: done
- Why: `framer-motion` was only used for one heading animation.
- Changes:
  - Removed dependency from `frontend/package.json`.
  - Replaced `motion.h1` with `h1` in `frontend/app/dashboard/page.tsx`.
- Benefit: smaller bundle, fewer runtime hooks, faster startup.

2. Dead backend scheduling service
- Status: marked
- File: `backend/services/scheduling.py`
- Why: no imports or route references in backend.
- Action: safe to delete after one final manual confirmation.

3. Generated/stale runtime folders
- Status: marked
- Folders:
  - `frontend/.next/` (generated build cache)
  - `frontend/node_modules/` (dependency cache)
  - `backend/uploads/` (runtime artifacts)
- Action: keep out of source control, clean periodically.

## Keep For Now, Simplify Behind Feature Flags

1. Vector matching stack (`pgvector`, profile embeddings)
- Files:
  - `backend/models.py`
  - `backend/api/matches.py`
  - `backend/api/schemas.py`
  - `backend/api/users.py`
  - `backend/sql/init.sql`
- Why keep now: currently wired end-to-end and used by `/matches`.
- Demo simplification option:
  - Add `DEMO_SIMPLE_MATCHING=true` to bypass vector distance queries and return random or recent-user matches.
- Benefit: lower DB/index overhead while preserving endpoint contract.

2. Calendar export flow
- Files:
  - `backend/api/sessions.py`
  - `frontend/app/dashboard/virtual-sessions/page.tsx`
- Why keep now: sessions can be exported as `.ics` files without locking the product to a provider.
- Demo simplification option:
  - keep only the `.ics` export button and omit any external calendar copy elsewhere.

3. User settings endpoints
- Files:
  - `backend/api/users.py`
  - `backend/models.py`
- Why keep now: removing would require frontend navigation/UI changes.
- Demo simplification option:
  - keep read-only defaults and hide non-critical toggles in UI.

## Proposed Next Wave (Low Risk)

1. Add a backend demo mode flag (`DEMO_MODE=true`)
- Skip expensive integrations and optional external calls.

2. Add a simple matching fallback path
- Preserve response schema, avoid vector queries in demo mode.

3. Remove dead service file
- Delete `backend/services/scheduling.py` if no objections.

## Sanity Checklist Before Test Users

1. Keep auth fallback credentials documented for demo login.
2. Ensure backend starts with only PostgreSQL required.
3. Ensure frontend loads without Firebase/Google secrets where possible.
4. Seed minimum sample data for courses, profiles, and sessions.
5. Add one smoke test per critical flow: login, profile view, matches, create session.
