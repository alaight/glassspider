from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from bs4 import BeautifulSoup

from app.pipeline.fetchers.types import FetchResult
from app.playwright_runtime import CHROMIUM_LAUNCH_TIMEOUT_S, chromium_launch_kwargs

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
    optional = bool(step.get("optional", False))
    step_timeout = int(step.get("timeout_ms") or timeout_ms)

    def _optional_warning(exc: Exception) -> str:
        return f"Optional step failed ({step_type}): {exc}"

    if step_type == "click":
        selector = str(step.get("selector") or "").strip()
        if not selector:
            raise ValueError("Rendered step `click` requires `selector`.")
        selectors = [selector]
        if "apply filters" in selector.lower():
            selectors.extend(
                [
                    "button:has-text('Apply filters')",
                    "text=Apply filters",
                    "button >> text=Apply filters",
                    "[aria-label*='Apply']",
                ]
            )

        last_error: Exception | None = None
        seen: set[str] = set()
        for candidate in selectors:
            if candidate in seen:
                continue
            seen.add(candidate)
            try:
                await page.locator(candidate).first.click(timeout=step_timeout)
                return
            except Exception as exc:
                last_error = exc

        if last_error is not None:
            if optional:
                logger.warning(_optional_warning(last_error))
                return
            raise last_error
        return

    if step_type == "fill":
        selector = str(step.get("selector") or "").strip()
        value = str(step.get("value") or "")
        if not selector:
            raise ValueError("Rendered step `fill` requires `selector`.")
        try:
            await page.fill(selector, value, timeout=step_timeout)
        except Exception as exc:
            if optional:
                logger.warning(_optional_warning(exc))
                return
            raise
        return

    if step_type == "select":
        selector = str(step.get("selector") or "").strip()
        value = step.get("value")
        if not selector:
            raise ValueError("Rendered step `select` requires `selector`.")
        try:
            if isinstance(value, list):
                await page.select_option(selector, value=[str(v) for v in value], timeout=step_timeout)
            else:
                await page.select_option(selector, value=str(value or ""), timeout=step_timeout)
        except Exception as exc:
            if optional:
                logger.warning(_optional_warning(exc))
                return
            raise
        return

    if step_type == "wait_for_selector":
        selector = str(step.get("selector") or "").strip()
        if not selector:
            raise ValueError("Rendered step `wait_for_selector` requires `selector`.")
        try:
            await page.wait_for_selector(selector, timeout=step_timeout)
        except Exception as exc:
            if optional:
                logger.warning(_optional_warning(exc))
                return
            raise
        return

    if step_type == "wait_for_timeout":
        duration = int(step.get("milliseconds") or step.get("timeout_ms") or step.get("value") or 1000)
        await page.wait_for_timeout(max(duration, 0))
        return

    if step_type == "wait_for_network_idle":
        try:
            await page.wait_for_load_state("networkidle", timeout=step_timeout)
        except Exception as exc:
            if optional:
                logger.warning(_optional_warning(exc))
                return
            raise
        return

    raise ValueError(f"Unsupported rendered step type: `{step_type}`")


class RenderedFetchError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        stage: str,
        elapsed_ms: int,
        partial: dict[str, Any],
        exception_type: str | None = None,
        exception_message: str | None = None,
    ):
        super().__init__(message)
        self.stage = stage
        self.elapsed_ms = elapsed_ms
        self.partial = partial
        self.exception_type = exception_type
        self.exception_message = exception_message


async def fetch_rendered(*, url: str, rendered_config: dict[str, Any], user_agent: str) -> FetchResult:
    started = time.perf_counter()
    timeout_ms = int(rendered_config.get("timeout_ms") or 30_000)
    # Must exceed Chromium cold launch (see CHROMIUM_LAUNCH_TIMEOUT_S) plus navigation and steps.
    overall_timeout_ms = int(rendered_config.get("overall_timeout_ms") or 120_000)
    goto_timeout_ms = int(rendered_config.get("goto_timeout_ms") or 15_000)
    post_load_wait_ms = int(rendered_config.get("post_load_wait_ms") or 2_000)
    wait_until = str(rendered_config.get("wait_until") or "domcontentloaded")
    wait_until = wait_until if wait_until in {"load", "domcontentloaded", "networkidle"} else "domcontentloaded"

    discovered_requests: list[dict[str, Any]] = []
    capture_network = bool(rendered_config.get("capture_network", True))
    request_limit = int(rendered_config.get("request_capture_limit") or 40) if capture_network else 0
    response_tasks: list[asyncio.Task[Any]] = []
    stage = "init"
    partial: dict[str, Any] = {
        "title": None,
        "current_url": url,
        "buttons": [],
        "text_preview": "",
        "anchors_count": 0,
        "network_requests_count": 0,
        "warnings": [],
    }

    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        raise RenderedFetchError(
            "Playwright is unavailable in this worker image.",
            stage="playwright_import",
            elapsed_ms=int((time.perf_counter() - started) * 1000),
            partial=partial,
        ) from exc

    async def _render_once() -> FetchResult:
        nonlocal stage
        logger.info("rendered_fetch:start url=%s", url)
        stage = "launch_browser"
        async with async_playwright() as playwright:
            try:
                browser = await asyncio.wait_for(
                    playwright.chromium.launch(**chromium_launch_kwargs()),
                    timeout=CHROMIUM_LAUNCH_TIMEOUT_S,
                )
            except Exception as exc:
                partial["warnings"].append(f"Chromium launch failed: {type(exc).__name__}: {exc}")
                logger.exception("rendered_fetch:failed stage=launch_browser")
                raise RenderedFetchError(
                    "Chromium launch failed",
                    stage="launch_browser",
                    elapsed_ms=int((time.perf_counter() - started) * 1000),
                    partial=partial,
                    exception_type=type(exc).__name__,
                    exception_message=str(exc),
                ) from exc
            logger.info("rendered_fetch:browser_launched")
            context = await browser.new_context(user_agent=user_agent)
            page = await context.new_page()

            async def route_handler(route: Any) -> None:
                if route.request.resource_type in {"image", "font", "media"}:
                    await route.abort()
                else:
                    await route.continue_()

            if bool(rendered_config.get("block_heavy_resources", True)):
                stage = "route_setup"
                await page.route("**/*", route_handler)

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
                partial["network_requests_count"] = len(discovered_requests)

            def on_response(response: Any) -> None:
                response_tasks.append(asyncio.create_task(handle_response(response)))

            if capture_network:
                page.on("response", on_response)

            metadata: dict[str, Any] = {
                "fetch_mode": "rendered",
                "wait_until": wait_until,
                "timeout_ms": timeout_ms,
                "goto_timeout_ms": goto_timeout_ms,
                "overall_timeout_ms": overall_timeout_ms,
                "step_errors": [],
                "warnings": partial["warnings"],
            }
            final_url = url
            status_code: int | None = None
            html: str | None = None
            text: str | None = None

            try:
                stage = "goto"
                response = await page.goto(url, wait_until=wait_until, timeout=goto_timeout_ms)
                status_code = response.status if response else None
                logger.info("rendered_fetch:goto_complete elapsed_ms=%s", int((time.perf_counter() - started) * 1000))

                stage = "post_load_wait"
                await page.wait_for_timeout(max(post_load_wait_ms, 0))

                stage = "steps"
                steps = _normalise_steps(rendered_config)
                metadata["steps_applied"] = steps
                for index, step in enumerate(steps):
                    logger.info("rendered_fetch:step_start type=%s selector=%s", step.get("type"), step.get("selector"))
                    try:
                        await _apply_step(page, step, timeout_ms)
                        logger.info("rendered_fetch:step_complete type=%s", step.get("type"))
                    except Exception as exc:
                        message = f"Step {index + 1} failed ({step.get('type')}): {exc}"
                        metadata["step_errors"].append(message)
                        partial["warnings"].append(message)
                        logger.exception("rendered_fetch:failed stage=steps")
                        raise

                stage = "extract"
                final_url = page.url
                partial["current_url"] = final_url
                title = await page.title()
                partial["title"] = title
                html = await page.content()
                soup = BeautifulSoup(html or "", "html.parser")
                partial["anchors_count"] = len(soup.select("a[href]"))
                text = (await page.inner_text("body"))[:500_000]
                partial["text_preview"] = text[:5000]
                metadata["title"] = title
                metadata["rendered_html_size"] = len(html or "")
                capture_buttons = bool(rendered_config.get("capture_buttons", True))
                if capture_buttons:
                    try:
                        buttons = await page.locator("button").all_inner_texts()
                        metadata["buttons_detected"] = [value.strip() for value in buttons if value.strip()][:100]
                        partial["buttons"] = metadata["buttons_detected"]
                        logger.info("rendered_fetch:buttons_detected count=%s", len(metadata["buttons_detected"]))
                    except Exception as exc:
                        warning = f"Button capture failed: {exc}"
                        partial["warnings"].append(warning)
                        metadata["warnings"].append(warning)
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

    try:
        return await asyncio.wait_for(_render_once(), timeout=overall_timeout_ms / 1000)
    except asyncio.TimeoutError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.exception("rendered_fetch:failed stage=%s", stage)
        raise RenderedFetchError(
            "Rendered fetch timed out",
            stage=stage,
            elapsed_ms=elapsed_ms,
            partial=partial,
            exception_type=type(exc).__name__,
            exception_message=str(exc),
        ) from exc
    except RenderedFetchError:
        raise
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.exception("rendered_fetch:failed stage=%s", stage)
        raise RenderedFetchError(
            f"Rendered fetch failed: {exc}",
            stage=stage,
            elapsed_ms=elapsed_ms,
            partial=partial,
            exception_type=type(exc).__name__,
            exception_message=str(exc),
        ) from exc
