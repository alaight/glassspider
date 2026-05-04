import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from supabase import Client

from app.config import get_settings
from app.models import Job
from app.pipeline.fetchers import (
    fetch_with_mode,
    resolve_fetch_config,
    resolve_fetch_mode,
    serialise_json_preview,
)
from app.pipeline.normalise.html import normalise_record_from_html

logger = logging.getLogger(__name__)

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    source = (
        db.table("glassspider_sources")
        .select("*")
        .eq("id", job.source_id)
        .single()
        .execute()
        .data
    )
    fetch_mode = resolve_fetch_mode(source, job.payload)
    fetch_config = resolve_fetch_config(source, job.payload)
    records_extracted = 0
    records_updated = 0

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        for url in urls:
            try:
                result = await fetch_with_mode(
                    mode=fetch_mode,
                    url=url["url"],
                    client=client,
                    user_agent=settings.glassspider_worker_user_agent,
                    source_config=fetch_config,
                )
                html_input = result.html or result.text or ""
                if not html_input and result.json_data is not None:
                    html_input = serialise_json_preview(result.json_data)
                normalised = normalise_record_from_html(url["url"], html_input)
                existing_metadata = normalised["raw"].get("raw_metadata")
                metadata_payload = existing_metadata if isinstance(existing_metadata, dict) else {}
                metadata_payload["fetch"] = {
                    "mode": fetch_mode,
                    "url": result.url,
                    "final_url": result.final_url,
                    "status_code": result.status_code,
                    "content_type": result.content_type,
                    "discovered_requests_count": len(result.discovered_requests),
                    "metadata": result.metadata,
                }
                if result.discovered_requests:
                    metadata_payload["fetch"]["discovered_requests"] = result.discovered_requests[:20]
                normalised["raw"]["raw_metadata"] = metadata_payload

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
                        "http_status": result.status_code,
                        "last_crawled_at": _now(),
                    }
                ).eq("id", url["id"]).execute()

                records_extracted += 1
                records_updated += 1
                logger.info(
                    "Scrape fetched url=%s mode=%s status=%s requests=%s",
                    url["url"],
                    fetch_mode,
                    result.status_code,
                    len(result.discovered_requests),
                )
            except Exception as exc:
                logger.warning("Scrape failed url=%s mode=%s error=%s", url["url"], fetch_mode, exc)
                db.table("glassspider_discovered_urls").update(
                    {"status": "failed", "error_message": str(exc)}
                ).eq("id", url["id"]).execute()

    db.table("glassspider_sources").update({"last_scraped_at": _now()}).eq("id", job.source_id).execute()

    return {
        "records_extracted": records_extracted,
        "records_updated": records_updated,
        "fetch_mode": fetch_mode,
    }
