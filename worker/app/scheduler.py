import asyncio
import logging
from datetime import datetime, timezone

from supabase import Client

from app.config import get_settings
from app.jobs import enqueue_job
from app.models import EnqueueRequest

logger = logging.getLogger(__name__)


def _cadence_due(cadence: str | None, last_run: str | None) -> bool:
    if not cadence or cadence == "manual":
        return False

    unit = cadence[-1]
    try:
        amount = int(cadence[:-1])
    except ValueError:
        return False

    multipliers = {
        "h": 60 * 60,
        "d": 24 * 60 * 60,
        "w": 7 * 24 * 60 * 60,
    }
    seconds = amount * multipliers.get(unit, 0)

    if seconds <= 0:
        return False

    if not last_run:
        return True

    parsed = datetime.fromisoformat(last_run.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - parsed).total_seconds() >= seconds


def enqueue_due_crawl_jobs(db: Client) -> list[str]:
    sources = (
        db.table("glassspider_sources")
        .select("*")
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    queued: list[str] = []

    for source in sources:
        if not _cadence_due(source.get("crawl_frequency"), source.get("last_crawled_at")):
            continue

        job = enqueue_job(
            db,
            EnqueueRequest(
                type="crawl",
                source_id=source["id"],
                payload={
                    "entry_urls": source.get("entry_urls") or [],
                    "max_pages": 25,
                    "fetch_mode": source.get("fetch_mode") or "static_html",
                    "fetch_config": source.get("fetch_config") or {},
                    "scheduled_by": "worker-scheduler",
                },
            ),
        )
        queued.append(job.id)

    return queued


async def scheduler_loop(db: Client) -> None:
    settings = get_settings()

    while True:
        try:
            queued = enqueue_due_crawl_jobs(db)
            if queued:
                logger.info("Queued due crawl jobs: %s", ", ".join(queued))
        except Exception:
            logger.exception("Scheduler pass failed")

        await asyncio.sleep(settings.glassspider_worker_scheduler_interval_seconds)
