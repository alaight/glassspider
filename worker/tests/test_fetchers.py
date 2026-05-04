from __future__ import annotations

import asyncio
import os
import sys
import unittest

import httpx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.pipeline.fetchers import fetch_with_mode, resolve_fetch_config, resolve_fetch_mode
from app.pipeline.fetchers.rendered import _normalise_steps


class FetchersTestCase(unittest.TestCase):
    def test_resolve_fetch_mode_defaults_static(self) -> None:
        source = {"fetch_mode": None}
        payload = {}
        self.assertEqual(resolve_fetch_mode(source, payload), "static")

    def test_resolve_fetch_mode_payload_override(self) -> None:
        source = {"fetch_mode": "static"}
        payload = {"fetch_mode": "rendered"}
        self.assertEqual(resolve_fetch_mode(source, payload), "rendered")

    def test_resolve_fetch_config_merges_nested_dicts(self) -> None:
        source = {"fetch_config": {"rendered": {"wait_until": "networkidle", "timeout_ms": 30000}, "api": {"method": "GET"}}}
        payload = {"fetch_config": {"rendered": {"wait_for_selector": ".product-card"}}}
        merged = resolve_fetch_config(source, payload)
        self.assertEqual(merged["rendered"]["wait_until"], "networkidle")
        self.assertEqual(merged["rendered"]["wait_for_selector"], ".product-card")
        self.assertEqual(merged["api"]["method"], "GET")

    def test_rendered_step_normalisation_includes_legacy_click_selectors(self) -> None:
        cfg = {
            "click_selectors": ["button:has-text('Apply filters')"],
            "wait_for_selector": ".product-card",
            "steps": [{"type": "wait_for_timeout", "timeout_ms": 500}],
        }
        steps = _normalise_steps(cfg)
        self.assertEqual(steps[0]["type"], "wait_for_timeout")
        self.assertEqual(steps[1]["type"], "click")
        self.assertEqual(steps[2]["type"], "wait_for_selector")

    def test_static_fetch_mode_path(self) -> None:
        async def run() -> None:
            transport = httpx.MockTransport(
                lambda request: httpx.Response(
                    status_code=200,
                    headers={"content-type": "text/html; charset=utf-8"},
                    text="<html><body><a href='/x'>x</a></body></html>",
                    request=request,
                )
            )
            async with httpx.AsyncClient(transport=transport, follow_redirects=True) as client:
                result = await fetch_with_mode(
                    mode="static",
                    url="https://example.com",
                    client=client,
                    user_agent="GlassspiderTest/1.0",
                    source_config={},
                )
            self.assertEqual(result.status_code, 200)
            self.assertIsNotNone(result.html)
            self.assertEqual(result.metadata.get("fetch_mode"), "static")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
