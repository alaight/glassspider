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
from app.pipeline.normalise.json import normalise_records_from_json_mapping

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


def _resolve_declared_api_config(fetch_config: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    declared_api_config = fetch_config.get("declared_api")
    if not isinstance(declared_api_config, dict):
        legacy_api_cfg = fetch_config.get("api")
        declared_api_config = legacy_api_cfg if isinstance(legacy_api_cfg, dict) else {}

    extraction_mapping = source.get("extraction_mapping")
    if isinstance(extraction_mapping, dict) and extraction_mapping:
        merged = dict(declared_api_config)
        merged["field_mapping"] = extraction_mapping
        declared_api_config = merged
    return declared_api_config


def _upsert_normalised_record(
    *,
    db: Client,
    job: Job,
    normalised: dict[str, dict[str, Any]],
    discovered_url_id: str | None,
    fetch_mode: str,
    result: Any,
) -> tuple[int, int]:
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
                "discovered_url_id": discovered_url_id,
                "run_id": None,
            }
        )
        .execute()
        .data[0]
    )

    source_url = str(normalised["bid"].get("source_url") or normalised["raw"].get("source_url") or "")
    existing_bid = (
        db.table("glassspider_bid_records")
        .select("id")
        .eq("source_url", source_url)
        .limit(1)
        .execute()
        .data
        or []
    )
    created = 0 if existing_bid else 1
    updated = 1 if existing_bid else 0

    db.table("glassspider_bid_records").upsert(
        {
            **normalised["bid"],
            "source_id": job.source_id,
            "raw_record_id": raw_record["id"],
        },
        on_conflict="source_url",
    ).execute()
    return created, updated


async def _run_declared_api_extraction(
    *,
    db: Client,
    job: Job,
    source: dict[str, Any],
    fetch_mode: str,
    fetch_config: dict[str, Any],
) -> dict[str, Any]:
    settings = get_settings()
    declared_api_config = _resolve_declared_api_config(fetch_config, source)
    endpoint = str(
        job.payload.get("endpoint")
        or declared_api_config.get("endpoint")
        or source.get("base_url")
        or ""
    )
    method = str(job.payload.get("method") or declared_api_config.get("method") or "GET").upper()
    if not endpoint:
        raise ValueError("Declared API extraction requires an endpoint.")

    merged_fetch_config = dict(fetch_config)
    declared = dict(declared_api_config)
    declared["endpoint"] = endpoint
    declared["method"] = method
    merged_fetch_config["declared_api"] = declared

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        result = await fetch_with_mode(
            mode="declared_api",
            url=source.get("base_url") or endpoint,
            client=client,
            user_agent=settings.glassspider_worker_user_agent,
            source_config=merged_fetch_config,
        )

    extraction_config = {
        "record_selector": declared.get("record_selector") or "$[*]",
        "field_mapping": declared.get("field_mapping") if isinstance(declared.get("field_mapping"), dict) else {},
        "url_fields": declared.get("url_fields") if isinstance(declared.get("url_fields"), dict) else {},
    }
    mapped_records: list[dict[str, dict[str, Any]]] = []
    if result.json_data is not None:
        mapped_records = normalise_records_from_json_mapping(
            source_url=endpoint,
            payload=result.json_data,
            extraction_config=extraction_config,
        )

    records_seen = len(mapped_records)
    records_extracted = 0
    records_created = 0
    records_updated = 0
    records_skipped = 0

    for normalised in mapped_records:
        source_url = str(normalised["bid"].get("source_url") or normalised["raw"].get("source_url") or "")
        if not source_url:
            records_skipped += 1
            continue
        created, updated = _upsert_normalised_record(
            db=db,
            job=job,
            normalised=normalised,
            discovered_url_id=None,
            fetch_mode=fetch_mode,
            result=result,
        )
        records_extracted += 1
        records_created += created
        records_updated += updated

    db.table("glassspider_sources").update({"last_scraped_at": _now()}).eq("id", job.source_id).execute()
    return {
        "records_seen": records_seen,
        "records_extracted": records_extracted,
        "records_created": records_created,
        "records_updated": records_updated,
        "records_skipped": records_skipped,
        "mode": "declared_api",
        "endpoint": endpoint,
        "fetch_mode": fetch_mode,
    }


async def _run_url_map_extraction(
    *,
    db: Client,
    job: Job,
    source: dict[str, Any],
    fetch_mode: str,
    fetch_config: dict[str, Any],
) -> dict[str, Any]:
    urls = _load_scoped_urls(db, job)
    if not urls:
        return {"records_extracted": 0, "records_updated": 0, "fetch_mode": fetch_mode}

    settings = get_settings()
    declared_api_config = _resolve_declared_api_config(fetch_config, source)
    records_extracted = 0
    records_updated = 0
    records_created = 0

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
                mapped_records: list[dict[str, dict[str, Any]]] = []
                if result.json_data is not None and declared_api_config:
                    mapped_records = normalise_records_from_json_mapping(
                        source_url=url["url"],
                        payload=result.json_data,
                        extraction_config=declared_api_config,
                    )

                if not mapped_records:
                    html_input = result.html or result.text or ""
                    if not html_input and result.json_data is not None:
                        html_input = serialise_json_preview(result.json_data)
                    mapped_records = [normalise_record_from_html(url["url"], html_input)]

                for normalised in mapped_records:
                    created, updated = _upsert_normalised_record(
                        db=db,
                        job=job,
                        normalised=normalised,
                        discovered_url_id=url["id"],
                        fetch_mode=fetch_mode,
                        result=result,
                    )
                    records_extracted += 1
                    records_updated += updated
                    records_created += created

                db.table("glassspider_discovered_urls").update(
                    {
                        "status": "scraped",
                        "http_status": result.status_code,
                        "last_crawled_at": _now(),
                    }
                ).eq("id", url["id"]).execute()
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
        "records_created": records_created,
        "fetch_mode": fetch_mode,
    }


async def run_scrape_job(db: Client, job: Job) -> dict[str, Any]:
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
    if fetch_mode == "declared_api" or str(job.payload.get("mode") or "").lower() == "declared_api":
        return await _run_declared_api_extraction(
            db=db,
            job=job,
            source=source,
            fetch_mode=fetch_mode,
            fetch_config=fetch_config,
        )
    return await _run_url_map_extraction(
        db=db,
        job=job,
        source=source,
        fetch_mode=fetch_mode,
        fetch_config=fetch_config,
    )
