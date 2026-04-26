import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from supabase import Client

from app.config import get_settings
from app.models import EnqueueRequest, Job

logger = logging.getLogger(__name__)

JobHandler = Callable[[Client, Job], Awaitable[dict[str, Any]]]


def enqueue_job(db: Client, request: EnqueueRequest) -> Job:
    response = db.rpc(
        "glassspider_enqueue_job",
        {
            "p_type": request.type,
            "p_source_id": request.source_id,
            "p_payload": request.payload,
            "p_scheduled_at": datetime.now(UTC).isoformat(),
            "p_max_attempts": request.max_attempts,
            "p_created_by": None,
        },
    ).execute()
    return Job.model_validate(response.data)


def claim_next_job(db: Client, worker_id: str) -> Job | None:
    response = db.rpc("glassspider_claim_next_job", {"p_worker_id": worker_id}).execute()

    if not response.data:
        return None

    return Job.model_validate(response.data)


def complete_job(db: Client, job: Job, result: dict[str, Any]) -> None:
    db.rpc(
        "glassspider_complete_job",
        {
            "p_job_id": job.id,
            "p_worker_id": job.locked_by,
            "p_result": result,
        },
    ).execute()


def fail_job(db: Client, job: Job, error: Exception) -> None:
    delay_seconds = min(60 * (2 ** max(job.attempt_count - 1, 0)), 60 * 60)
    retry_at = datetime.now(UTC) + timedelta(seconds=delay_seconds)
    db.rpc(
        "glassspider_fail_job",
        {
            "p_job_id": job.id,
            "p_worker_id": job.locked_by,
            "p_error": str(error),
            "p_retry_at": retry_at.isoformat(),
        },
    ).execute()


async def process_one_job(db: Client, handlers: dict[str, JobHandler]) -> bool:
    settings = get_settings()
    job = claim_next_job(db, settings.glassspider_worker_id)

    if not job:
        return False

    logger.info("Claimed job %s (%s)", job.id, job.type)

    try:
        handler = handlers[job.type]
        result = await handler(db, job)
        complete_job(db, job, result)
        logger.info("Completed job %s", job.id)
    except Exception as exc:
        logger.exception("Failed job %s", job.id)
        fail_job(db, job, exc)

    return True


async def worker_loop(db: Client, handlers: dict[str, JobHandler]) -> None:
    settings = get_settings()

    while True:
        processed = await process_one_job(db, handlers)

        if not processed:
            await asyncio.sleep(settings.glassspider_worker_poll_interval_seconds)
