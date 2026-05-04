from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.pipeline.fetchers.types import FetchResult

logger = logging.getLogger(__name__)


def _looks_like_data_url(url: str) -> bool:
    lower = url.lower()
    return any(token in lower for token in ("search", "filter", "product", "document", "api", "results"))


def _normalise_steps(rendered_config: dict[str, Any]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []

    configured_steps = rendered_config.get("steps")
    if isinstance(configured_steps, list):
        for step in configured_steps:
            if isinstance(step, dict):
                steps.append(step)

    click_selectors = rendered_config.get("click_selectors")
    if isinstance(click_selectors, list):
        for selector in click_selectors:
            if isinstance(selector, str) and selector.strip():
                steps.append({"type": "click", "selector": selector.strip()})

    wait_for_selector = rendered_config.get("wait_for_selector")
    if isinstance(wait_for_selector, str) and wait_for_selector.strip():
        steps.append({"type": "wait_for_selector", "selector": wait_for_selector.strip()})

    return steps


async def _apply_step(page: Any, step: dict[str, Any], timeout_ms: int) -> None:
    step_type = str(step.get("type") or "").strip().lower()

    if step_type == "click":
        selector = str(step.get("selector") or "").strip()
        if not selector:
            raise ValueError("Rendered step `click` requires `selector`.")
        await page.click(selector, timeout=timeout_ms)
        return

    if step_type == "fill":
        selector = str(step.get("selector") or "").strip()
        value = str(step.get("value") or "")
        if not selector:
            raise ValueError("Rendered step `fill` requires `selector`.")
        await page.fill(selector, value, timeout=timeout_ms)
        return

    if step_type == "select":
        selector = str(step.get("selector") or "").strip()
        value = step.get("value")
        if not selector:
            raise ValueError("Rendered step `select` requires `selector`.")
        if isinstance(value, list):
            await page.select_option(selector, value=[str(v) for v in value], timeout=timeout_ms)
        else:
            await page.select_option(selector, value=str(value or ""), timeout=timeout_ms)
        return

    if step_type == "wait_for_selector":
        selector = str(step.get("selector") or "").strip()
        if not selector:
            raise ValueError("Rendered step `wait_for_selector` requires `selector`.")
        await page.wait_for_selector(selector, timeout=timeout_ms)
        return

    if step_type == "wait_for_timeout":
        duration = int(step.get("timeout_ms") or step.get("value") or 1000)
        await page.wait_for_timeout(max(duration, 0))
        return

    if step_type == "wait_for_network_idle":
        await page.wait_for_load_state("networkidle", timeout=timeout_ms)
        return

    raise ValueError(f"Unsupported rendered step type: `{step_type}`")


async def fetch_rendered(*, url: str, rendered_config: dict[str, Any], user_agent: str) -> FetchResult:
    started = time.perf_counter()
    timeout_ms = int(rendered_config.get("timeout_ms") or 30_000)
    wait_until = str(rendered_config.get("wait_until") or "networkidle")
    wait_until = wait_until if wait_until in {"load", "domcontentloaded", "networkidle"} else "networkidle"

    discovered_requests: list[dict[str, Any]] = []
    request_limit = int(rendered_config.get("request_capture_limit") or 40)
    response_tasks: list[asyncio.Task[Any]] = []

    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        raise RuntimeError("Playwright is unavailable in this worker image.") from exc

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=user_agent)
        page = await context.new_page()

        async def handle_response(response: Any) -> None:
            if len(discovered_requests) >= request_limit:
                return
            request = response.request
            resource_type = request.resource_type
            content_type = str(response.headers.get("content-type") or "")
            candidate = resource_type in {"xhr", "fetch"} or "json" in content_type.lower() or _looks_like_data_url(response.url)
            if not candidate:
                return

            preview: str | None = None
            if "json" in content_type.lower() or resource_type in {"xhr", "fetch"} or _looks_like_data_url(response.url):
                try:
                    body_text = await response.text()
                    if body_text:
                        preview = body_text[:1000]
                except Exception:
                    preview = None

            discovered_requests.append(
                {
                    "url": response.url,
                    "method": request.method,
                    "status": response.status,
                    "content_type": content_type or None,
                    "request_post_data": request.post_data,
                    "preview": preview,
                }
            )

        def on_response(response: Any) -> None:
            response_tasks.append(asyncio.create_task(handle_response(response)))

        page.on("response", on_response)

        metadata: dict[str, Any] = {
            "fetch_mode": "rendered",
            "wait_until": wait_until,
            "timeout_ms": timeout_ms,
            "step_errors": [],
        }
        final_url = url
        status_code: int | None = None
        html: str | None = None
        text: str | None = None

        try:
            response = await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            status_code = response.status if response else None

            steps = _normalise_steps(rendered_config)
            metadata["steps_applied"] = steps
            for index, step in enumerate(steps):
                try:
                    await _apply_step(page, step, timeout_ms)
                except Exception as exc:
                    message = f"Step {index + 1} failed ({step.get('type')}): {exc}"
                    metadata["step_errors"].append(message)
                    logger.warning(message)
                    raise

            final_url = page.url
            title = await page.title()
            html = await page.content()
            text = (await page.inner_text("body"))[:500_000]
            metadata["title"] = title
            metadata["rendered_html_size"] = len(html or "")
            if response_tasks:
                await asyncio.gather(*response_tasks, return_exceptions=True)
        finally:
            await context.close()
            await browser.close()

    metadata["duration_ms"] = int((time.perf_counter() - started) * 1000)
    metadata["discovered_request_count"] = len(discovered_requests)

    return FetchResult(
        url=url,
        final_url=final_url,
        status_code=status_code,
        content_type="text/html",
        html=html,
        text=text,
        json_data=None,
        discovered_requests=discovered_requests,
        metadata=metadata,
    )
