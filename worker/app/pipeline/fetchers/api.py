from __future__ import annotations

import time
from typing import Any

import httpx

from app.pipeline.fetchers.types import FetchResult


async def fetch_api(*, client: httpx.AsyncClient, url: str, api_config: dict[str, Any]) -> FetchResult:
    started = time.perf_counter()
    endpoint = str(api_config.get("endpoint") or url)
    method = str(api_config.get("method") or "GET").upper()
    headers = api_config.get("headers") if isinstance(api_config.get("headers"), dict) else {}
    payload = api_config.get("payload")

    request_kwargs: dict[str, Any] = {"headers": headers}
    if method in {"POST", "PUT", "PATCH", "DELETE"} and payload is not None:
        request_kwargs["json"] = payload

    response = await client.request(method, endpoint, **request_kwargs)
    content_type = response.headers.get("content-type")
    text = response.text

    json_data: Any | None = None
    if "json" in (content_type or "").lower():
        try:
            json_data = response.json()
        except Exception:
            json_data = None

    return FetchResult(
        url=url,
        final_url=str(response.url),
        status_code=response.status_code,
        content_type=content_type,
        html=text if "html" in (content_type or "").lower() else None,
        text=text[:500_000] if text else None,
        json_data=json_data,
        discovered_requests=[],
        metadata={
            "fetch_mode": "declared_api",
            "endpoint": endpoint,
            "method": method,
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "response_bytes": len(response.content),
        },
    )
