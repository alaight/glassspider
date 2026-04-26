# glassspider

Laightworks ecosystem product — [glassspider](https://github.com/alaight/glassspider) on GitHub.

## Application

Glassspider is a distributed bid intelligence pipeline with a Next.js control plane:

- Admin users configure procurement sources, URL rules, manual runs, and URL-map review.
- Viewer users search normalised bid records, inspect renewal windows, and export CSV data.
- Supabase stores product data and the `glassspider_jobs` queue.
- A Python worker on Fly.io owns crawl/scrape/classify execution with the service-role key.
- The first source investigation targets BidStats with cautious, low-rate, query-free crawling based on its public robots rules.

## Database

This app uses the **same Supabase/Postgres project** as the Laightworks site. **All tables created for glassspider-specific data must be prefixed with `glassspider_`** (for example `glassspider_events`). Shared hub tables stay as defined by the ecosystem.

See **`AGENTS.md`** and **`docs/CURRENT_STATE.md`** for agent/human runbooks.

## Getting started

Clone the repository and open this folder in your editor. Cursor rules live in `.cursor/rules/`.

```bash
npm install
npm run dev
```

## Environment

Create `.env.local` from `.env.example` for the Vercel/Next.js app:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_LAIGHTWORKS_LOGIN_URL=https://laightworks.com/login
GLASSSPIDER_PROJECT_SLUG=glassspider
GLASSSPIDER_ADMIN_ROLES=owner,admin
```

The web app must not be configured with `SUPABASE_SERVICE_ROLE_KEY`. It validates users, manages configuration, and enqueues jobs only.

Create worker secrets from `worker/.env.example` for Fly.io:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GLASSSPIDER_WORKER_SECRET=
GLASSSPIDER_WORKER_ID=glassspider-worker
GLASSSPIDER_WORKER_POLL_INTERVAL_SECONDS=15
GLASSSPIDER_WORKER_SCHEDULER_INTERVAL_SECONDS=300
```

## Deployment

- Deploy the Next.js app to Vercel with the web env vars above.
- Deploy the Python worker to Fly.io from the repo root with `worker/fly.toml`.
- Copy `worker/fly.toml.example` to `worker/fly.toml`, set the app name/region, then set worker secrets with `fly secrets set`.
- Run `fly deploy -c worker/fly.toml` from the repo root.
- Keep at least one Fly machine running so the worker can poll `glassspider_jobs` and schedule crawl discovery.

## Scripts

- `npm run dev`: start the local Next.js server.
- `npm run build`: build the app.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run TypeScript checks.

Worker checks:

```bash
python -m compileall worker/app
```
