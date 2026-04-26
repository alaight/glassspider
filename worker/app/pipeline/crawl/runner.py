import hashlib
from collections import deque
from datetime import UTC, datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup
from supabase import Client

from app.config import get_settings
from app.models import Job
from app.pipeline.crawl.url_rules import classify_url, matched_rule_label, normalise_url, should_visit_url


def _now() -> str:
    return datetime.now(UTC).isoformat()


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
                response = await client.get(next_url)
                html = response.text
                content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
                soup = BeautifulSoup(html, "html.parser")
                status_value = "queued" if response.is_success else "failed"

                db.table("glassspider_discovered_urls").upsert(
                    {
                        "source_id": job.source_id,
                        "run_id": None,
                        "url": next_url,
                        "url_type": classify_url(next_url, rules),
                        "status": status_value,
                        "parent_url": parent_url,
                        "crawl_depth": depth,
                        "http_status": response.status_code,
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
            except Exception as exc:
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
    }
