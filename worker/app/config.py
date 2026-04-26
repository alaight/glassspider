from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    glassspider_worker_secret: str
    glassspider_worker_id: str = "glassspider-worker"
    glassspider_worker_poll_interval_seconds: int = 15
    glassspider_worker_scheduler_interval_seconds: int = 300
    glassspider_worker_user_agent: str = "GlassspiderBot/0.1 (+https://laightworks.com)"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
