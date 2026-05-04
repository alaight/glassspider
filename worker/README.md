# Glassspider Worker

Python execution plane for Glassspider crawl, scrape, and classify jobs.

## Responsibilities

- Poll `glassspider_jobs` for due `pending` jobs (interval: `GLASSSPIDER_WORKER_POLL_INTERVAL_SECONDS`, default 15).
- Claim jobs atomically with `glassspider_claim_next_job(worker_id)`. When the queue is empty, the RPC yields no row; Supabase may return **`null`**, **`[]`**, **`{}`**, **`[null]`**, or a **dict with all-null fields**. The worker’s **`extract_job_row`** logic treats anything **without a truthy `id`** as **no job** (idle). Only then does it call **`Job.model_validate`**, so an empty queue does not raise validation errors.
- Execute exactly one stage per job.
- Write crawl/scrape/classify output into Supabase.
- Record completion, failures, retry backoff, and last errors in the database.
- Run an internal scheduler that enqueues due crawl jobs only.
- Apply source-level fetch strategy (`static`, `rendered` via Playwright Chromium, or `api`) inside crawl/scrape handlers.

The worker must not automatically chain stages. Scrape and classify jobs require explicit selected IDs or explicit filter payloads.

## Environment

Use `worker/.env.example`:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GLASSSPIDER_WORKER_SECRET=
GLASSSPIDER_WORKER_DEBUG_TOKEN=
GLASSSPIDER_WORKER_ID=glassspider-worker
GLASSSPIDER_WORKER_POLL_INTERVAL_SECONDS=15
GLASSSPIDER_WORKER_SCHEDULER_INTERVAL_SECONDS=300
GLASSSPIDER_WORKER_USER_AGENT=GlassspiderBot/0.1 (+https://laightworks.com)
```

## Local Run

```bash
pip install -r worker/requirements.txt
python -m playwright install --with-deps chromium
uvicorn app.main:app --app-dir worker --reload --port 8080
```

## Fly.io

From the **repository root**:

```bash
cp worker/fly.toml.example worker/fly.toml
fly launch -c worker/fly.toml --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GLASSSPIDER_WORKER_SECRET=... GLASSSPIDER_WORKER_DEBUG_TOKEN=...
fly deploy -c worker/fly.toml -a glassspider
```

Docker build context is the **repo root**; `worker/Dockerfile` copies `worker/requirements.txt` and `worker/app`.

Keep at least one machine running so polling and the internal scheduler continue.

## Observed behaviour

- **Started:** logs that the worker loop started with `worker_id` and poll interval.
- **Idle:** `No pending jobs, sleeping N seconds` once per idle poll.
- **Work:** logs claimed job `id`/`type`, completion, or failure (with traceback on handler errors or on malformed rows that pass the `id` check).
- **Rendered fetch diagnostics:** logs include selector/step failures, request discovery counts, and rendered HTML size metadata.

## Debug endpoints (bearer token)

- `GET /debug/playwright-health` launches Chromium, opens `about:blank`, and closes it (quick runtime smoke check).
- `POST /debug/fetch-rendered` runs the rendered fetch flow and returns diagnostics / partial failure state.
- `GET /debug/routes` lists registered worker routes.

All `/debug/*` endpoints require `Authorization: Bearer <GLASSSPIDER_WORKER_DEBUG_TOKEN>`.
