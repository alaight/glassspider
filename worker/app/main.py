import asyncio
import logging
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, Header, HTTPException, status

from app.config import get_settings
from app.db import get_supabase
from app.jobs import enqueue_job, worker_loop
from app.models import DebugFetchRequest, EnqueueRequest
from app.pipeline.classify.runner import run_classify_job
from app.pipeline.crawl.runner import run_crawl_job
from app.pipeline.fetchers import fetch_with_mode
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


def _extract_links(html: str, base_url: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[dict[str, str]] = []
    seen: set[str] = set()

    for anchor in soup.select("a[href]"):
        href = (anchor.get("href") or "").strip()
        if not href:
            continue
        absolute = urljoin(base_url, href).split("#")[0]
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        label = anchor.get_text(" ", strip=True)[:280] or absolute
        links.append({"href": href, "absoluteUrl": absolute, "label": label})

    return links


@app.post("/debug/fetch", dependencies=[Depends(require_worker_secret)])
async def debug_fetch(request: DebugFetchRequest) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        result = await fetch_with_mode(
            mode=request.mode,
            url=request.url,
            client=client,
            user_agent=settings.glassspider_worker_user_agent,
            source_config=request.source_config,
        )

    html = result.html or ""
    links = _extract_links(html, result.final_url or request.url) if html else []
    json_endpoints = [
        req
        for req in result.discovered_requests
        if "json" in (str(req.get("content_type") or "").lower()) or "/api/" in str(req.get("url") or "").lower()
    ]

    return {
        "mode": request.mode,
        "requested_url": request.url,
        "result": result.to_json_ready(),
        "title": result.metadata.get("title"),
        "links": links,
        "json_endpoints": json_endpoints[:25],
    }
