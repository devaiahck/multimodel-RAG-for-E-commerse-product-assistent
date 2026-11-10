"""
Ollama HTTP client — thin wrapper around the Ollama REST API.

Sends a prompt to the local Ollama instance and returns the generated text.
Designed for Qwen3:8B but compatible with any model loaded in Ollama.

Usage:
    from services.ollama_client import generate_text
    result = generate_text("Your prompt here")
"""

import json
import logging
import socket
import urllib.parse
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


async def generate_text(
    prompt: str,
    system: Optional[str] = None,
    model: Optional[str] = None,
    timeout: Optional[int] = None,
) -> str:
    """
    Send a prompt to Ollama and return the generated text.

    :param prompt: The user prompt.
    :param system: Optional system instruction prepended to the prompt.
    :param model: Override model name (defaults to settings.OLLAMA_MODEL).
    :param timeout: HTTP timeout in seconds (defaults to settings.OLLAMA_TIMEOUT).
    :returns: Generated text string.
    :raises RuntimeError: If Ollama is unreachable or returns a non-200 status.
    """
    model = model or settings.OLLAMA_MODEL
    timeout = timeout or settings.OLLAMA_TIMEOUT
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"

    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,   # low temperature → more deterministic comparisons
            "top_p": 0.9,
        },
    }
    if system:
        payload["system"] = system

    logger.debug("Sending prompt to Ollama model '%s' at %s", model, url)

    # Pre-check TCP socket to fail fast in 0.2s if server is not running
    parsed = urllib.parse.urlparse(settings.OLLAMA_BASE_URL)
    host = parsed.hostname or "127.0.0.1"
    if host == "localhost":
        host = "127.0.0.1"
    port = parsed.port or 11434
    try:
        with socket.create_connection((host, port), timeout=0.2):
            pass
    except Exception as sock_err:
        raise RuntimeError(f"Cannot reach Ollama at {host}:{port}: {sock_err}") from sock_err

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=2.0)) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "").strip()

    except httpx.ConnectError as exc:
        raise RuntimeError(
            f"Cannot connect to Ollama at {settings.OLLAMA_BASE_URL}. "
            "Make sure Ollama is running (`ollama serve`) and the model is pulled "
            f"(`ollama pull {model}`)."
        ) from exc

    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"Ollama returned HTTP {exc.response.status_code}: {exc.response.text}"
        ) from exc

    except Exception as exc:
        raise RuntimeError(f"Unexpected error calling Ollama: {exc}") from exc


async def check_ollama_health(model: Optional[str] = None) -> dict:
    """
    Probe Ollama and verify the requested model is available.

    Returns a dict with keys:
        - reachable (bool)
        - model_available (bool)
        - error (str | None)
    """
    model = model or settings.OLLAMA_MODEL
    result = {"reachable": False, "model_available": False, "error": None}

    try:
        # Pre-check TCP socket to fail fast in 0.2s if server is not running
        parsed = urllib.parse.urlparse(settings.OLLAMA_BASE_URL)
        host = parsed.hostname or "127.0.0.1"
        if host == "localhost":
            host = "127.0.0.1"
        port = parsed.port or 11434
        try:
            with socket.create_connection((host, port), timeout=0.2):
                pass
        except Exception as sock_err:
            result["error"] = f"Cannot reach Ollama at {host}:{port}: {sock_err}"
            return result

        async with httpx.AsyncClient(timeout=5) as client:
            # List models endpoint
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            result["reachable"] = True

            models = resp.json().get("models", [])
            available_names = [m.get("name", "") for m in models]
            # Match on base name in case tag differs (e.g., "qwen3:8b" vs "qwen3:8b-instruct")
            result["model_available"] = any(
                model.split(":")[0] in name for name in available_names
            )

    except Exception as exc:
        result["error"] = str(exc)

    return result
