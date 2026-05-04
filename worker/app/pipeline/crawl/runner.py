import hashlib
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup
from supabase import Client

from app.config import get_settings
from app.models import Job
from app.pipeline.crawl.url_rules import classify_url, matched_rule_label, normalise_url, should_visit_url
from app.pipeline.fetchers import fetch_with_mode, resolve_fetch_config, resolve_fetch_mode

logger = logging.getLogger(__name__)

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_crawl_job(db: Client, job: Job) -> dict[str, Any]:
    source = (
        db.table("glassspider_sources")
        .select("*")
        .eq("id", job.source_id)
        .single()
        .execute()
        .data
    )
    rules = (
        db.table("glassspider_source_rules")
        .select("*")
        .eq("source_id", job.source_id)
        .eq("is_active", True)
        .order("priority")
        .execute()
        .data
        or []
    )
    entry_urls = job.payload.get("entry_urls") or source.get("entry_urls") or []
    max_pages = int(job.payload.get("max_pages") or 25)
    fetch_mode = resolve_fetch_mode(source, job.payload)
    fetch_config = resolve_fetch_config(source, job.payload)

    if not entry_urls:
        raise ValueError("Crawl job requires entry_urls in payload or source configuration.")

    queue = deque((url, None, 0) for url in entry_urls)
    visited: set[str] = set()
    discovered: set[str] = set()
    settings = get_settings()

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        while queue and len(visited) < max_pages:
            next_url, parent_url, depth = queue.popleft()

            if next_url in visited or not should_visit_url(next_url, rules):
                continue

            visited.add(next_url)

            try:
                result = await fetch_with_mode(
                    mode=fetch_mode,
                    url=next_url,
                    client=client,
                    user_agent=settings.glassspider_worker_user_agent,
                    source_config=fetch_config,
                )
                html = result.html or result.text or ""
                content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
                soup = BeautifulSoup(html, "html.parser")
                status_value = "queued" if (result.status_code or 0) < 400 else "failed"

                db.table("glassspider_discovered_urls").upsert(
                    {
                        "source_id": job.source_id,
                        "run_id": None,
                        "url": next_url,
                        "url_type": classify_url(next_url, rules),
                        "status": status_value,
                        "parent_url": parent_url,
                        "crawl_depth": depth,
                        "http_status": result.status_code,
                        "content_hash": content_hash,
                        "matched_rule": matched_rule_label(next_url, rules),
                        "last_seen_at": _now(),
                        "last_crawled_at": _now(),
                    },
                    on_conflict="source_id,url",
                ).execute()

                for anchor in soup.select("a[href]"):
                    normalised = normalise_url(anchor.get("href", ""), source["base_url"])

                    if not normalised or normalised in visited or normalised in discovered:
                        continue

                    if not normalised.startswith(source["base_url"]) or not should_visit_url(normalised, rules):
                        continue

                    discovered.add(normalised)
                    queue.append((normalised, next_url, depth + 1))

                if result.json_data is not None:
                    for url_candidate in _discover_urls_from_json(result.json_data, source["base_url"]):
                        if url_candidate in visited or url_candidate in discovered:
                            continue
                        if not url_candidate.startswith(source["base_url"]) or not should_visit_url(url_candidate, rules):
                            continue
                        discovered.add(url_candidate)
                        queue.append((url_candidate, next_url, depth + 1))

                logger.info(
                    "Crawl fetched url=%s mode=%s status=%s discovered_requests=%s",
                    next_url,
                    fetch_mode,
                    result.status_code,
                    len(result.discovered_requests),
                )
            except Exception as exc:
                logger.warning("Crawl fetch failed url=%s mode=%s error=%s", next_url, fetch_mode, exc)
                db.table("glassspider_discovered_urls").upsert(
                    {
                        "source_id": job.source_id,
                        "run_id": None,
                        "url": next_url,
                        "url_type": classify_url(next_url, rules),
                        "status": "failed",
                        "parent_url": parent_url,
                        "crawl_depth": depth,
                        "error_message": str(exc),
                        "matched_rule": matched_rule_label(next_url, rules),
                        "last_seen_at": _now(),
                        "last_crawled_at": _now(),
                    },
                    on_conflict="source_id,url",
                ).execute()

    db.table("glassspider_sources").update({"last_crawled_at": _now()}).eq("id", job.source_id).execute()

    return {
        "pages_visited": len(visited),
        "urls_discovered": len(discovered),
        "fetch_mode": fetch_mode,
    }


def _discover_urls_from_json(data: Any, base_url: str) -> set[str]:
    discovered: set[str] = set()

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for nested in value.values():
                walk(nested)
            return
        if isinstance(value, list):
            for nested in value:
                walk(nested)
            return
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("http://") or text.startswith("https://"):
                normalised = normalise_url(text, base_url)
                if normalised:
                    discovered.add(normalised)
                return
            if text.startswith("/"):
                normalised = normalise_url(text, base_url)
                if normalised:
                    discovered.add(normalised)
                return
            if "http" in text:
                for token in text.split():
                    if token.startswith("http://") or token.startswith("https://"):
                        normalised = normalise_url(token.strip(" ,;"), base_url)
                        if normalised:
                            discovered.add(normalised)

    walk(data)
    return discovered
