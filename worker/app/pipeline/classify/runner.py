from typing import Any

from supabase import Client

from app.models import Job
from app.pipeline.normalise.html import classify_sector, relevance_score


def _load_scoped_records(db: Client, job: Job) -> list[dict]:
    record_ids = job.payload.get("bid_record_ids")

    if isinstance(record_ids, list) and record_ids:
        return (
            db.table("glassspider_bid_records")
            .select("*")
            .eq("source_id", job.source_id)
            .in_("id", record_ids)
            .execute()
            .data
            or []
        )

    filter_payload = job.payload.get("filter")

    if not isinstance(filter_payload, dict):
        raise ValueError("Classify job requires payload.bid_record_ids or payload.filter.")

    query = db.table("glassspider_bid_records").select("*").eq("source_id", job.source_id)

    for key in ("review_status", "sector_primary"):
        value = filter_payload.get(key)
        if value:
            query = query.eq(key, value)

    limit = int(filter_payload.get("limit") or 100)
    return query.limit(limit).execute().data or []


async def run_classify_job(db: Client, job: Job) -> dict[str, Any]:
    records = _load_scoped_records(db, job)
    classified = 0

    for record in records:
        text = f"{record.get('title') or ''} {record.get('description') or ''}"
        sector = classify_sector(text)
        labels = [] if sector == "unclassified" else [sector]
        confidence = relevance_score(text)

        db.table("glassspider_classifications").upsert(
            {
                "bid_record_id": record["id"],
                "raw_record_id": record.get("raw_record_id"),
                "classifier": "deterministic-sector-v1",
                "prompt_version": "none",
                "labels": labels,
                "confidence": confidence,
                "output": {
                    "sector_primary": sector,
                    "relevance_score": confidence,
                },
                "review_status": "needs_review" if sector == "unclassified" else "pending",
            },
            on_conflict="bid_record_id,raw_record_id,classifier,prompt_version",
        ).execute()
        classified += 1

    return {"records_classified": classified}
