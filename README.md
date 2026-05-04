# glassspider

Laightworks ecosystem product — [glassspider](https://github.com/alaight/glassspider) on GitHub.

## Application

Glassspider is an operational crawl/extract/classify pipeline with a Next.js **control-plane console** (not a marketing site):

- **Operators (admin roles)** explore arbitrary URLs safely, configure sources/rules, inspect the discovered URL map, queue jobs, and watch job/run telemetry.
- **All granted product users** can browse normalised **`glassspider_bid_records`**, filter (including full‑text keyword search), inspect raw capture and classifications where present, and export CSV.
- Supabase holds configuration, the URL map, raw/canonical rows, classifications, and **`glassspider_jobs`**.
- A Python worker on Fly.io owns crawl/scrape/classify execution using the **service-role** key.
- Sources declare a fetch strategy (`static`, `rendered`, or `api`) with optional JSON config (`fetch_config`) so JavaScript-heavy listing/filter pages can be handled without changing the pipeline stage model.
- Canonical routes: **`/explore`** · **`/sources`** (+ `/sources/[id]`) · **`/url-map`** · **`/runs`** · **`/data`** · **`/records/[id]`**. **`/`** sends admins to `/explore`, others to `/data`. **`/admin/*`** and **`/dashboard/*`** redirect to these paths.

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
GLASSSPIDER_WORKER_BASE_URL=https://glassspider.fly.dev
GLASSSPIDER_WORKER_DEBUG_TOKEN=
```

**Shared Laightworks sign-in (`*.laightworks.com`):** set `SUPABASE_AUTH_COOKIE_DOMAIN=laightworks.com` on **both** this app **and** the Laightworks hub’s Next.js/SSR Supabase clients with the **same** value (`domain` cookie option after login/refreshes). Omit locally unless you intentionally test SSO on a deployed host group. Hub-only apex cookies cannot be read by `glaspspider.laightworks.com`; without shared domain scope users look “logged in” on laightworks.com but Glassspider still redirects to `/login`.

The web app must not be configured with `SUPABASE_SERVICE_ROLE_KEY`. It validates users, manages configuration, and enqueues jobs only.

Create worker secrets from `worker/.env.example` for Fly.io:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GLASSSPIDER_WORKER_SECRET=
GLASSSPIDER_WORKER_DEBUG_TOKEN=
GLASSSPIDER_WORKER_ID=glassspider-worker
GLASSSPIDER_WORKER_POLL_INTERVAL_SECONDS=15
GLASSSPIDER_WORKER_SCHEDULER_INTERVAL_SECONDS=300
```

## Deployment

- Deploy the Next.js app to Vercel with the web env vars above.
- Deploy the Python worker to Fly.io with **`worker/fly.toml`** from the **repo root** (Docker build context is the repository root; see **`worker/README.md`**).
- Copy `worker/fly.toml.example` to `worker/fly.toml`, set the app name/region, then set worker secrets with `fly secrets set`.
- Deploy with: `fly deploy -c worker/fly.toml -a glassspider` (from the repo root).
- Keep at least one Fly machine running so the worker can poll `glassspider_jobs` and schedule crawl discovery. An empty queue is a normal idle state (poll + sleep); see **`docs/CURRENT_STATE.md`** (Worker runtime) and **`worker/README.md`**.

## Scripts

- `npm run dev`: start the local Next.js server.
- `npm run build`: build the app.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run TypeScript checks.

Worker checks:

```bash
python -m compileall worker/app
python -m unittest discover worker/tests
```
