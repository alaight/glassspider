from typing import Any, Literal

from pydantic import BaseModel, Field


JobType = Literal["crawl", "scrape", "classify"]
JobStatus = Literal["pending", "running", "completed", "failed"]
FetchMode = Literal["static", "rendered", "api"]


class Job(BaseModel):
    id: str
    type: JobType
    source_id: str
    status: JobStatus
    payload: dict[str, Any] = Field(default_factory=dict)
    attempt_count: int
    max_attempts: int
    last_error: str | None = None
    scheduled_at: str
    started_at: str | None = None
    completed_at: str | None = None
    locked_by: str | None = None
    locked_at: str | None = None
    result: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class EnqueueRequest(BaseModel):
    type: JobType
    source_id: str
    payload: dict[str, Any] = Field(default_factory=dict)
    max_attempts: int = 3


class DebugFetchRequest(BaseModel):
    url: str
    mode: FetchMode = "static"
    source_config: dict[str, Any] = Field(default_factory=dict)


class DebugRenderedStep(BaseModel):
    type: Literal["click", "fill", "select", "wait_for_selector", "wait_for_timeout", "wait_for_network_idle"]
    selector: str | None = None
    value: str | list[str] | None = None
    milliseconds: int | None = None
    timeout_ms: int | None = None


class DebugRenderedConfig(BaseModel):
    wait_until: Literal["load", "domcontentloaded", "networkidle"] | None = None
    wait_for_selector: str | None = None
    click_selectors: list[str] = Field(default_factory=list)
    steps: list[DebugRenderedStep] = Field(default_factory=list)
    timeout_ms: int | None = None
    capture_buttons: bool = True
    capture_network: bool = True
    capture_anchors: bool = True
    request_capture_limit: int | None = None


class DebugRenderedFetchRequest(BaseModel):
    url: str
    rendered: DebugRenderedConfig = Field(default_factory=DebugRenderedConfig)
