import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError
from supabase import Client

from app.config import get_settings
from app.models import EnqueueRequest, Job

logger = logging.getLogger(__name__)

JobHandler = Callable[[Client, Job], Awaitable[dict[str, Any]]]


def extract_job_row(data: Any) -> dict[str, Any] | None:
    """
    Normalize glassspider_claim_next_job RPC payloads.

    Postgres returns a null row as JSON null or as an object with all-null fields;
    PostgREST may wrap that in a list.
    """
    if data is None:
        return None
    if data == [] or data == {}:
        return None
    if isinstance(data, list):
        if not data:
            return None
        row = data[0]
    else:
        row = data
    if row is None:
        return None
    if not isinstance(row, dict):
        raise TypeError(f"Unexpected job claim response type: {type(row)}")
    if not row.get("id"):
        return None
    return row


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
    row = extract_job_row(response.data)
    if row is None:
        return None
    try:
        return Job.model_validate(row)
    except ValidationError:
        logger.exception(
            "Invalid job row from glassspider_claim_next_job (worker_id=%s job_id=%s)",
            worker_id,
            row.get("id"),
        )
        raise


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

    if job is None:
        return False

    logger.info("Claimed job id=%s type=%s", job.id, job.type)

    try:
        handler = handlers[job.type]
        result = await handler(db, job)
        complete_job(db, job, result)
        logger.info("Job completed id=%s type=%s", job.id, job.type)
    except Exception as exc:
        logger.exception("Job failed id=%s type=%s", job.id, job.type)
        fail_job(db, job, exc)

    return True


async def worker_loop(db: Client, handlers: dict[str, JobHandler]) -> None:
    settings = get_settings()
    poll_s = settings.glassspider_worker_poll_interval_seconds
    worker_id = settings.glassspider_worker_id

    logger.info("Worker loop started worker_id=%s poll_interval_seconds=%s", worker_id, poll_s)

    while True:
        try:
            processed = await process_one_job(db, handlers)

            if not processed:
                logger.info("No pending jobs, sleeping %s seconds", poll_s)
                await asyncio.sleep(poll_s)
        except asyncio.CancelledError:
            raise
        except ValidationError:
            # claim_next_job already logged; backoff without duplicate traceback
            await asyncio.sleep(poll_s)
        except Exception:
            logger.exception(
                "Worker loop error; sleeping %s seconds before retry (worker_id=%s)",
                poll_s,
                worker_id,
            )
            await asyncio.sleep(poll_s)
