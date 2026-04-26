from typing import Any, Literal

from pydantic import BaseModel, Field


JobType = Literal["crawl", "scrape", "classify"]
JobStatus = Literal["pending", "running", "completed", "failed"]


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
