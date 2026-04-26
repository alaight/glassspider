import asyncio
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, status

from app.config import get_settings
from app.db import get_supabase
from app.jobs import enqueue_job, worker_loop
from app.models import EnqueueRequest
from app.pipeline.classify.runner import run_classify_job
from app.pipeline.crawl.runner import run_crawl_job
from app.pipeline.scrape.runner import run_scrape_job
from app.scheduler import enqueue_due_crawl_jobs, scheduler_loop

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Glassspider Worker", version="0.1.0")


def require_worker_secret(x_glassspider_worker_secret: str = Header(default="")) -> None:
    settings = get_settings()

    if x_glassspider_worker_secret != settings.glassspider_worker_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid worker secret")


@app.on_event("startup")
async def startup() -> None:
    db = get_supabase()
    handlers = {
        "crawl": run_crawl_job,
        "scrape": run_scrape_job,
        "classify": run_classify_job,
    }
    asyncio.create_task(worker_loop(db, handlers))
    asyncio.create_task(scheduler_loop(db))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/jobs/enqueue", dependencies=[Depends(require_worker_secret)])
async def enqueue(request: EnqueueRequest) -> dict[str, str]:
    db = get_supabase()
    job = enqueue_job(db, request)
    return {"job_id": job.id, "status": job.status}


@app.post("/jobs/enqueue-due", dependencies=[Depends(require_worker_secret)])
async def enqueue_due() -> dict[str, list[str]]:
    db = get_supabase()
    return {"job_ids": enqueue_due_crawl_jobs(db)}
