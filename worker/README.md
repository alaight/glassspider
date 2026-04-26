# Glassspider Worker

Python execution plane for Glassspider crawl, scrape, and classify jobs.

## Responsibilities

- Poll `glassspider_jobs` for due `pending` jobs.
- Claim jobs atomically with `glassspider_claim_next_job(worker_id)`.
- Execute exactly one stage per job.
- Write crawl/scrape/classify output into Supabase.
- Record completion, failures, retry backoff, and last errors in the database.
- Run an internal scheduler that enqueues due crawl jobs only.

The worker must not automatically chain stages. Scrape and classify jobs require explicit selected IDs or explicit filter payloads.

## Environment

Use `worker/.env.example`:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GLASSSPIDER_WORKER_SECRET=
GLASSSPIDER_WORKER_ID=glassspider-worker
GLASSSPIDER_WORKER_POLL_INTERVAL_SECONDS=15
GLASSSPIDER_WORKER_SCHEDULER_INTERVAL_SECONDS=300
GLASSSPIDER_WORKER_USER_AGENT=GlassspiderBot/0.1 (+https://laightworks.com)
```

## Local Run

```bash
pip install -r worker/requirements.txt
uvicorn app.main:app --app-dir worker --reload --port 8080
```

## Fly.io

```bash
cp worker/fly.toml.example worker/fly.toml
fly launch -c worker/fly.toml --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GLASSSPIDER_WORKER_SECRET=...
fly deploy -c worker/fly.toml
```

Run these commands from the repository root. The Fly config lives in `worker/`, but the Docker build context is the repository root.

Keep at least one machine running so polling and the internal scheduler continue.
