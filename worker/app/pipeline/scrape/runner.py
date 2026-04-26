from datetime import UTC, datetime
from typing import Any

import httpx
from supabase import Client

from app.config import get_settings
from app.models import Job
from app.pipeline.normalise.html import normalise_record_from_html


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _load_scoped_urls(db: Client, job: Job) -> list[dict]:
    url_ids = job.payload.get("url_ids")

    if isinstance(url_ids, list) and url_ids:
        return (
            db.table("glassspider_discovered_urls")
            .select("*")
            .eq("source_id", job.source_id)
            .in_("id", url_ids)
            .execute()
            .data
            or []
        )

    filter_payload = job.payload.get("filter")

    if not isinstance(filter_payload, dict):
        raise ValueError("Scrape job requires payload.url_ids or payload.filter.")

    query = db.table("glassspider_discovered_urls").select("*").eq("source_id", job.source_id)

    for key in ("status", "url_type", "matched_rule"):
        value = filter_payload.get(key)
        if value:
            query = query.eq(key, value)

    limit = int(filter_payload.get("limit") or 100)
    return query.limit(limit).execute().data or []


async def run_scrape_job(db: Client, job: Job) -> dict[str, Any]:
    urls = _load_scoped_urls(db, job)

    if not urls:
        return {"records_extracted": 0, "records_updated": 0}

    settings = get_settings()
    records_extracted = 0
    records_updated = 0

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        for url in urls:
            try:
                response = await client.get(url["url"])
                normalised = normalise_record_from_html(url["url"], response.text)

                raw_record = (
                    db.table("glassspider_raw_records")
                    .insert(
                        {
                            **normalised["raw"],
                            "source_id": job.source_id,
                            "discovered_url_id": url["id"],
                            "run_id": None,
                        }
                    )
                    .execute()
                    .data[0]
                )

                db.table("glassspider_bid_records").upsert(
                    {
                        **normalised["bid"],
                        "source_id": job.source_id,
                        "raw_record_id": raw_record["id"],
                    },
                    on_conflict="source_url",
                ).execute()

                db.table("glassspider_discovered_urls").update(
                    {
                        "status": "scraped",
                        "http_status": response.status_code,
                        "last_crawled_at": _now(),
                    }
                ).eq("id", url["id"]).execute()

                records_extracted += 1
                records_updated += 1
            except Exception as exc:
                db.table("glassspider_discovered_urls").update(
                    {"status": "failed", "error_message": str(exc)}
                ).eq("id", url["id"]).execute()

    db.table("glassspider_sources").update({"last_scraped_at": _now()}).eq("id", job.source_id).execute()

    return {
        "records_extracted": records_extracted,
        "records_updated": records_updated,
    }
