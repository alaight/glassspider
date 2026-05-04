from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

FetchMode = Literal["static_html", "rendered_html", "discovered_api", "declared_api"]


@dataclass
class FetchResult:
    url: str
    final_url: str
    status_code: int | None
    content_type: str | None
    html: str | None
    text: str | None
    json_data: Any | None
    discovered_requests: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_json_ready(self) -> dict[str, Any]:
        payload = asdict(self)
        return payload
