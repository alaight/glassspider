from __future__ import annotations

import json
from typing import Any

import httpx

from app.pipeline.fetchers.api import fetch_api
from app.pipeline.fetchers.rendered import fetch_rendered
from app.pipeline.fetchers.static import fetch_static
from app.pipeline.fetchers.types import FetchMode, FetchResult


def normalise_fetch_mode(value: Any) -> FetchMode:
    if isinstance(value, str):
        lowered = value.strip().lower()
        alias = {
            "static": "static_html",
            "static_html": "static_html",
            "rendered": "rendered_html",
            "rendered_html": "rendered_html",
            "api": "declared_api",
            "declared_api": "declared_api",
            "discovered_api": "discovered_api",
        }.get(lowered)
        if alias:
            return alias
    return "static_html"


def resolve_fetch_mode(source: dict[str, Any], job_payload: dict[str, Any] | None = None) -> FetchMode:
    payload = job_payload or {}
    return normalise_fetch_mode(payload.get("fetch_mode") or source.get("fetch_mode") or "static_html")


def resolve_fetch_config(source: dict[str, Any], job_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = job_payload or {}
    source_config = source.get("fetch_config")
    payload_config = payload.get("fetch_config")

    base: dict[str, Any] = source_config if isinstance(source_config, dict) else {}
    overlay: dict[str, Any] = payload_config if isinstance(payload_config, dict) else {}

    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


async def fetch_with_mode(
    *,
    mode: FetchMode,
    url: str,
    client: httpx.AsyncClient,
    user_agent: str,
    source_config: dict[str, Any] | None = None,
) -> FetchResult:
    config = source_config or {}

    if mode in {"rendered_html", "discovered_api"}:
        rendered_cfg = config.get("rendered")
        if not isinstance(rendered_cfg, dict):
            rendered_cfg = {}
        return await fetch_rendered(url=url, rendered_config=rendered_cfg, user_agent=user_agent)

    if mode == "declared_api":
        api_cfg = config.get("declared_api")
        if not isinstance(api_cfg, dict):
            api_cfg = config.get("api")
        if not isinstance(api_cfg, dict):
            api_cfg = {}
        return await fetch_api(client=client, url=url, api_config=api_cfg)

    return await fetch_static(client=client, url=url)


def serialise_json_preview(data: Any, *, max_chars: int = 100_000) -> str:
    text = json.dumps(data, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars]
