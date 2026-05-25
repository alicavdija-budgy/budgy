"""
BUDGY — LLM Client (LiteLLM-based, self-hosted compatible)

Drop-in replacement for the previous `emergentintegrations.llm.chat` API.
Provides:
    - LlmChat(api_key, session_id, system_message)
        .with_model(provider, model)
        .send_message(UserMessage(text=..., file_contents=[ImageContent(...)]))
    - UserMessage(text, file_contents=[])
    - ImageContent(image_base64=...)

Internally uses **litellm** which speaks natively to OpenAI, Anthropic, Google,
Azure, etc. — no Emergent-hosted proxy involved.

Env vars (configured via Coolify):
    LLM_PROVIDER          openai (default) | anthropic | gemini | azure ...
    LLM_MODEL             gpt-4o-mini (default for openai)
    OPENAI_API_KEY        if provider=openai
    ANTHROPIC_API_KEY     if provider=anthropic
    GEMINI_API_KEY        if provider=gemini
    LLM_TIMEOUT_SECONDS   default 60
"""
from __future__ import annotations

import os
import logging
from typing import Any, Dict, List, Optional

import litellm

log = logging.getLogger("llm")

# ────────────────────────────────────────────────────────────
# Config helpers
# ────────────────────────────────────────────────────────────
_DEFAULT_MODEL_BY_PROVIDER = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-sonnet-20241022",
    "gemini": "gemini-1.5-flash",
    "google": "gemini-1.5-flash",
    "azure": "gpt-4o-mini",
}


def _resolve_model(provider: str, model: str) -> str:
    """
    Map (provider, model) → LiteLLM model string.

    LiteLLM expects prefixes for non-OpenAI providers:
        openai     → "gpt-4o-mini"
        anthropic  → "anthropic/claude-3-5-sonnet-20241022"
        gemini     → "gemini/gemini-1.5-flash"
        azure      → "azure/<deployment>"
    """
    p = (provider or "openai").lower().strip()
    m = (model or _DEFAULT_MODEL_BY_PROVIDER.get(p, "gpt-4o-mini")).strip()
    if p == "openai":
        return m
    if p == "anthropic":
        return m if m.startswith("anthropic/") else f"anthropic/{m}"
    if p in ("gemini", "google"):
        return m if m.startswith("gemini/") else f"gemini/{m}"
    if p == "azure":
        return m if m.startswith("azure/") else f"azure/{m}"
    return m


def _resolve_api_key(provider: str, explicit_key: str = "") -> Optional[str]:
    """
    Prefer the explicit api_key passed to LlmChat; otherwise look up the
    provider-specific env var. Returns None if nothing is configured (caller
    decides whether to fail).
    """
    if explicit_key:
        return explicit_key
    p = (provider or "openai").lower().strip()
    if p == "openai":
        return os.getenv("OPENAI_API_KEY") or None
    if p == "anthropic":
        return os.getenv("ANTHROPIC_API_KEY") or None
    if p in ("gemini", "google"):
        return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or None
    if p == "azure":
        return os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_API_KEY") or None
    return None


# ────────────────────────────────────────────────────────────
# Public message types (API-compatible with emergentintegrations)
# ────────────────────────────────────────────────────────────
class ImageContent:
    """Image attachment — accepts a base64-encoded string (no data: prefix needed)."""

    def __init__(self, image_base64: str = "", mime: str = "image/jpeg"):
        # Strip any data-URL prefix to keep callers happy
        if "," in image_base64 and image_base64.startswith("data:"):
            image_base64 = image_base64.split(",", 1)[1]
        self.image_base64 = image_base64
        self.mime = mime or "image/jpeg"

    def to_openai_part(self) -> Dict[str, Any]:
        url = f"data:{self.mime};base64,{self.image_base64}"
        return {"type": "image_url", "image_url": {"url": url}}


class UserMessage:
    """User-side message wrapper."""

    def __init__(self, text: str = "", file_contents: Optional[List[Any]] = None):
        self.text = text or ""
        self.file_contents = file_contents or []

    def to_openai_content(self) -> Any:
        """Build the `content` field for OpenAI-compatible chat completion."""
        if not self.file_contents:
            return self.text
        parts: List[Dict[str, Any]] = [{"type": "text", "text": self.text}]
        for fc in self.file_contents:
            if hasattr(fc, "to_openai_part"):
                parts.append(fc.to_openai_part())
        return parts


# ────────────────────────────────────────────────────────────
# Chat session
# ────────────────────────────────────────────────────────────
class LlmChat:
    """Stateful chat object — keeps message history per session."""

    def __init__(
        self,
        api_key: str = "",
        session_id: str = "",
        system_message: str = "",
    ):
        self.api_key = api_key or ""
        self.session_id = session_id or ""
        self.system_message = system_message or ""
        self.provider = (os.getenv("LLM_PROVIDER") or "openai").lower()
        self.model = os.getenv("LLM_MODEL") or _DEFAULT_MODEL_BY_PROVIDER.get(self.provider, "gpt-4o-mini")
        self.max_tokens: Optional[int] = None
        self._history: List[Dict[str, Any]] = []
        if self.system_message:
            self._history.append({"role": "system", "content": self.system_message})

    # Fluent setters (compat with emergent API)
    def with_model(self, provider: str, model: str) -> "LlmChat":
        self.provider = (provider or self.provider).lower()
        self.model = model or self.model
        return self

    def with_max_tokens(self, max_tokens: int) -> "LlmChat":
        self.max_tokens = int(max_tokens) if max_tokens else None
        return self

    async def send_message(self, msg: UserMessage) -> str:
        """Send a message and return the assistant's text reply."""
        api_key = _resolve_api_key(self.provider, self.api_key)
        if not api_key:
            raise RuntimeError(
                f"No API key for LLM provider '{self.provider}'. "
                f"Set the appropriate env var (OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY)."
            )
        model = _resolve_model(self.provider, self.model)
        self._history.append({"role": "user", "content": msg.to_openai_content()})

        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": self._history,
            "api_key": api_key,
            "timeout": float(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
        }
        if self.max_tokens:
            kwargs["max_tokens"] = self.max_tokens

        try:
            resp = await litellm.acompletion(**kwargs)
        except Exception as exc:  # pragma: no cover — log & re-raise
            log.error("[llm] %s/%s call failed: %s", self.provider, model, exc)
            # Remove the unanswered user message so the next attempt restarts clean
            if self._history and self._history[-1]["role"] == "user":
                self._history.pop()
            raise

        # LiteLLM mimics the OpenAI shape
        try:
            text = resp["choices"][0]["message"]["content"] or ""
        except Exception:
            text = str(resp)
        self._history.append({"role": "assistant", "content": text})
        return text


__all__ = ["LlmChat", "UserMessage", "ImageContent"]
