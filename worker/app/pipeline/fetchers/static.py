from __future__ import annotations

import time

import httpx

from app.pipeline.fetchers.types import FetchResult


async def fetch_static(*, client: httpx.AsyncClient, url: str) -> FetchResult:
    started = time.perf_counter()
    response = await client.get(url)
    content_type = response.headers.get("content-type")
    text = response.text
    html = text if "html" in (content_type or "").lower() else None

    return FetchResult(
        url=url,
        final_url=str(response.url),
        status_code=response.status_code,
        content_type=content_type,
        html=html,
        text=text[:500_000],
        json_data=None,
        discovered_requests=[],
        metadata={
            "fetch_mode": "static",
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "response_bytes": len(response.content),
        },
    )
