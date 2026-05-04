import asyncio
import logging
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, Header, HTTPException, status

from app.config import get_settings
from app.db import get_supabase
from app.jobs import enqueue_job, worker_loop
from app.models import DebugFetchRequest, DebugRenderedFetchRequest, EnqueueRequest
from app.pipeline.classify.runner import run_classify_job
from app.pipeline.crawl.runner import run_crawl_job
from app.pipeline.fetchers import fetch_with_mode
from app.pipeline.fetchers.rendered import RenderedFetchError
from app.pipeline.scrape.runner import run_scrape_job
from app.playwright_runtime import CHROMIUM_LAUNCH_TIMEOUT_S, chromium_launch_kwargs, log_startup_diagnostics
from app.scheduler import enqueue_due_crawl_jobs, scheduler_loop

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Glassspider Worker", version="0.1.0")


def require_worker_secret(x_glassspider_worker_secret: str = Header(default="")) -> None:
    settings = get_settings()

    if x_glassspider_worker_secret != settings.glassspider_worker_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid worker secret")


def require_debug_token(authorization: str = Header(default="")) -> None:
    settings = get_settings()
    expected = settings.glassspider_worker_debug_token

    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Worker debug token not configured.")

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    token = authorization.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid debug token.")


@app.on_event("startup")
async def startup() -> None:
    await log_startup_diagnostics()
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


@app.post("/debug/fetch-rendered", dependencies=[Depends(require_debug_token)])
async def debug_fetch_rendered(request: DebugRenderedFetchRequest) -> dict:
    settings = get_settings()
    rendered_config = request.rendered.model_dump(exclude_none=True)
    source_config = {"rendered": rendered_config}
    started = asyncio.get_running_loop().time()
    stage = "start"

    try:
        async with httpx.AsyncClient(
            headers={"user-agent": settings.glassspider_worker_user_agent},
            timeout=180,
            follow_redirects=True,
        ) as client:
            stage = "rendered_fetch"
            # Allow cold Chromium launch + navigation (see CHROMIUM_LAUNCH_TIMEOUT_S, overall_timeout_ms).
            result = await asyncio.wait_for(
                fetch_with_mode(
                    mode="rendered",
                    url=request.url,
                    client=client,
                    user_agent=settings.glassspider_worker_user_agent,
                    source_config=source_config,
                ),
                timeout=150,
            )
    except asyncio.TimeoutError:
        elapsed_ms = int((asyncio.get_running_loop().time() - started) * 1000)
        return {
            "ok": False,
            "error": "Rendered fetch timed out",
            "stage": stage,
            "elapsed_ms": elapsed_ms,
            "partial": {
                "title": None,
                "current_url": request.url,
                "buttons": [],
                "text_preview": "",
                "anchors_count": 0,
                "network_requests_count": 0,
            },
        }
    except RenderedFetchError as exc:
        return {
            "ok": False,
            "error": str(exc),
            "stage": exc.stage,
            "elapsed_ms": exc.elapsed_ms,
            "exception_type": exc.exception_type,
            "exception_message": exc.exception_message,
            "partial": exc.partial,
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Rendered fetch failed: {exc}") from exc

    html = result.html or ""
    capture_anchors = bool(rendered_config.get("capture_anchors", True))
    links = _extract_links(html, result.final_url or request.url) if capture_anchors and html else []
    discovered_requests = result.discovered_requests if bool(rendered_config.get("capture_network", True)) else []
    json_endpoints = [
        req
        for req in discovered_requests
        if "json" in (str(req.get("content_type") or "").lower()) or "/api/" in str(req.get("url") or "").lower()
    ]

    return {
        "ok": True,
        "worker_status": "connected",
        "requested_url": request.url,
        "final_url": result.final_url,
        "status_code": result.status_code,
        "title": result.metadata.get("title"),
        "rendered_html_length": len(html),
        "text_preview": (result.text or "")[:5000],
        "anchors": links[:500],
        "buttons_detected": result.metadata.get("buttons_detected", []),
        "discovered_requests": discovered_requests[:50],
        "json_endpoints": json_endpoints[:25],
        "warnings": result.metadata.get("warnings", []),
        "metadata": result.metadata,
        "config_echo": rendered_config,
    }


@app.get("/debug/playwright-health", dependencies=[Depends(require_debug_token)])
async def debug_playwright_health() -> dict:
    started = asyncio.get_running_loop().time()
    stage = "init"

    try:
        stage = "launch_browser"
        from playwright.async_api import async_playwright

        async with async_playwright() as playwright:
            browser = await asyncio.wait_for(
                playwright.chromium.launch(**chromium_launch_kwargs()),
                timeout=CHROMIUM_LAUNCH_TIMEOUT_S,
            )
            stage = "open_page"
            context = await browser.new_context()
            page = await context.new_page()
            await page.goto("about:blank", wait_until="domcontentloaded", timeout=5000)
            await context.close()
            await browser.close()
    except Exception as exc:
        return {
            "ok": False,
            "error": "Chromium launch failed",
            "stage": stage,
            "elapsed_ms": int((asyncio.get_running_loop().time() - started) * 1000),
            "launch_timeout_s": CHROMIUM_LAUNCH_TIMEOUT_S,
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
        }

    return {
        "ok": True,
        "stage": "complete",
        "elapsed_ms": int((asyncio.get_running_loop().time() - started) * 1000),
        "launch_timeout_s": CHROMIUM_LAUNCH_TIMEOUT_S,
    }


@app.get("/debug/routes", dependencies=[Depends(require_debug_token)])
async def debug_routes() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for route in app.routes:
        methods = sorted([method for method in getattr(route, "methods", set()) if method != "HEAD"])
        rows.append({"path": route.path, "methods": methods})
    return sorted(rows, key=lambda row: str(row["path"]))
