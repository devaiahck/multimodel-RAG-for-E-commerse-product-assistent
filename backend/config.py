"""
Centralized configuration loaded from environment variables / .env.
Never hardcode API keys or paths directly in application modules.
"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Ollama local LLM (primary) ---
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3:8b"
    OLLAMA_TIMEOUT: int = 120  # seconds

    # --- Gemini (optional fallback / override) ---
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # --- Vector store ---
    CHROMA_DB_PATH: str = "./chroma_db"

    # --- Multimodal encoder ---
    EMBEDDING_MODEL_NAME: str = "google/siglip-base-patch16-224"

    # --- Embedding text cache (LRU+TTL, text only) ---
    EMBEDDING_CACHE_MAXSIZE: int = 512
    EMBEDDING_CACHE_TTL: int = 3600  # seconds

    # --- API / CORS & Sessions ---
    FRONTEND_ORIGINS: str = "http://127.0.0.1:5173,http://localhost:5173"
    COOKIE_SECURE: bool = False
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ]

    @property
    def frontend_origins_list(self) -> List[str]:
        origins = [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]
        return origins if origins else ["http://127.0.0.1:5173", "http://localhost:5173"]

    # --- Environment ---
    APP_ENV: str = "dev"  # "dev" | "production" | "staging"

    # --- Ingestion security ---
    # Set a non-empty secret to require X-API-Key on POST /api/v1/ingest
    INGEST_API_KEY: str = ""

    # --- n8n ingestion automation ---
    N8N_INGEST_API_KEY: str = ""

    # --- Image upload limits ---
    MAX_IMAGE_SIZE_MB: float = 10.0

    # --- Rate limiting ---
    SEARCH_RATE_LIMIT: str = "30/minute"  # e.g. "30/minute", "100/hour"

    # --- Notifications ---
    NOTIFY_PROVIDER: str = "console"  # "console" | "telegram" | "sms"
    TELEGRAM_BOT_TOKEN: str = ""
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
