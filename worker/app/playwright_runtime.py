"""Shared Playwright Chromium settings for Linux/Fly (headless, no sandbox)."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Any

logger = logging.getLogger(__name__)


def _sync_chromium_executable_path() -> str | None:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            ep = p.chromium.executable_path
            return str(ep) if ep else None
    except Exception:
        return None

# Launch can be slow on cold Fly machines; outer rendered timeout must exceed this.
CHROMIUM_LAUNCH_TIMEOUT_S = float(os.environ.get("GLASSSPIDER_CHROMIUM_LAUNCH_TIMEOUT_S", "45"))

CHROMIUM_LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-setuid-sandbox",
]


def chromium_launch_kwargs() -> dict[str, Any]:
    return {
        "headless": True,
        "args": CHROMIUM_LAUNCH_ARGS,
    }


async def log_startup_diagnostics() -> None:
    """Cold-start diagnostics: Python, Playwright/Chromium path, memory, Fly env."""
    logger.info("worker_startup: python=%s", sys.version.split("\n")[0])

    try:
        import importlib.metadata

        logger.info("worker_startup: playwright_package=%s", importlib.metadata.version("playwright"))
    except Exception as exc:
        logger.warning("worker_startup: playwright_version_unknown err=%s", exc)

    path = await asyncio.to_thread(_sync_chromium_executable_path)
    if path:
        logger.info("worker_startup: chromium_executable_path=%s", path)
    else:
        logger.warning("worker_startup: chromium_executable_path unavailable (probe failed)")

    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith(("MemTotal:", "MemAvailable:")):
                    logger.info("worker_startup: %s", line.strip())
    except OSError:
        pass

    for key in ("FLY_REGION", "FLY_MACHINE_ID", "FLY_APP_NAME", "FLY_ALLOC_ID"):
        val = os.environ.get(key)
        if val:
            logger.info("worker_startup: %s=%s", key, val)
