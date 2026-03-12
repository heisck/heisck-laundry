# Heisck Laundry Tracking v1

Laundry order tracking system with:
- Admin package creation and status management
- Weekly processing cycles with auto rollover
- Arkesel SMS notifications to package-linked numbers only
- Private customer tracking links + QR codes
- Weekly PDF and CSV report export snapshots

## Stack
- Next.js (App Router, TypeScript)
- Supabase Auth + Supabase Postgres
- Arkesel SMS API
- Vercel deploy + cron

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy env template:
```bash
cp .env.example .env.local
```

3. Set environment variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_FETCH_TIMEOUT_MS` (default `10000`, minimum enforced `10000`)
- `NEXT_PUBLIC_SUPABASE_FETCH_TIMEOUT_MS` (default `10000`, minimum enforced `10000`)
- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `3`)
- `DATABASE_CONNECT_TIMEOUT_SECONDS` (default `15`, minimum enforced `15`)
- `DATABASE_IDLE_TIMEOUT_SECONDS` (default `20`)
- `DATABASE_RETRY_ATTEMPTS` (default `2`)
- `DATABASE_RETRY_DELAY_MS` (default `500`)
- `DATABASE_SSL_MODE` (`require` for Supabase)
- `TRACKING_TOKEN_SECRET` (minimum 32 characters)
- `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
- `ARKESEL_BASE_URL` (default `https://sms.arkesel.com`)
- `ARKESEL_REQUEST_TIMEOUT_MS` (default `5000`)
- `ARKESEL_API_KEY`
- `ARKESEL_SENDER_ID` (max 11 characters; must match your approved sender ID)
- `CRON_SECRET` (recommended for cron endpoint protection)

4. Apply database schema using:
`supabase/migrations/20260310_initial_schema.sql`

5. Create at least one admin user in Supabase Auth (email/password).

6. Run locally:
```bash
npm run dev
```

7. Open:
- Admin login: `http://localhost:3000/admin/login`
- Tracking links: `http://localhost:3000/track/<token>`

## Core API Endpoints

- `GET /api/admin/dashboard` (combined admin snapshot)
- `GET /api/health/live` (liveness probe)
- `POST /api/admin/weeks/start`
- `GET /api/admin/weeks/current`
- `POST /api/admin/weeks/:id/close`
- `GET /api/admin/weeks`
- `GET /api/admin/weeks/:id/report.csv`
- `GET /api/admin/weeks/:id/report.pdf`
- `POST /api/admin/packages`
- `GET /api/admin/packages`
- `PATCH /api/admin/packages/:id/status`
- `GET /api/admin/packages/:id/notifications`
- `GET /api/cron/weeks/auto-close`

## Cron

`vercel.json` is configured to call:
`/api/cron/weeks/auto-close` once per day at `00:00 UTC`.

This schedule is compatible with Vercel Hobby. If you move to Vercel Pro, you can switch back to a more frequent cron.

If `CRON_SECRET` is set, pass it in `x-cron-secret` header (or `?secret=` query).

## Troubleshooting Slow Dashboard / 500 Errors

If `/api/admin/*` requests take 10-20 seconds then fail:
- Confirm `DATABASE_URL` is a valid Supabase Postgres or Supabase pooler connection string.
- Prefer Supabase **Session Pooler** URL for local/dev (`pooler.supabase.com`).
- Keep `DATABASE_POOL_MAX=3` to avoid exhausting Supabase connection limits in dev mode.
- Keep `DATABASE_SSL_MODE=require`.
