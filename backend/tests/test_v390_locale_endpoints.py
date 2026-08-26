"""
BUDGY v3.9.0 — locale-aware backend endpoint tests.

Covers:
  • /api/coach/chat: system prompt must contain the language directive matching
    the request locale (fr/en/de/it), regardless of chat history.
  • /api/email/parse: user-facing error codes are stable machine-readable
    strings, DATA fields (title/issuer/iban) are preserved verbatim.
  • /api/scanner/ocr: same — error codes stable, DATA preserved.

The tests import the FastAPI app directly and monkeypatch the LlmChat client
to avoid real LLM calls. They ONLY assert on payload plumbing (prompt + fields).
Real LLM behavior is out of scope for CI.
"""
from __future__ import annotations
import asyncio
import importlib
import sys
import types
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# Ensure backend package resolves
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("EMERGENT_LLM_KEY", "test-key")


@pytest.fixture(scope="module")
def app_module():
    """Import the FastAPI app once per module."""
    if "server" in sys.modules:
        del sys.modules["server"]
    mod = importlib.import_module("server")
    return mod


@pytest.fixture
def client(app_module, monkeypatch):
    """TestClient with auth deps bypassed."""
    from server import app, require_user, AuthenticatedUser

    def fake_user():
        return AuthenticatedUser(user_id="u_test", email="test@budgy.ch", role="user", raw_claims={})

    app.dependency_overrides[require_user] = fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─────────── /api/coach/chat ───────────

@pytest.mark.parametrize("locale,expected_substring", [
    ("fr", "Réponds ENTIÈREMENT en français"),
    ("en", "Respond ENTIRELY in English"),
    ("de", "Antworte VOLLSTÄNDIG auf Deutsch"),
    ("it", "Rispondi INTERAMENTE in italiano"),
])
def test_coach_chat_locale_directive_in_prompt(client, app_module, locale, expected_substring):
    """The system prompt must contain the locale directive matching the request."""
    captured_system = {}
    captured_response = "OK"

    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            captured_system["value"] = system_message

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return captured_response

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "UserMessage", lambda text: types.SimpleNamespace(text=text)), \
         patch.dict(app_module.chat_sessions, {}, clear=True):
        r = client.post(
            "/api/coach/chat",
            json={
                "session_id": f"sess_{locale}",
                "message": "Analyse mon budget",
                "locale": locale,
            },
        )
    assert r.status_code == 200, r.text
    assert expected_substring in captured_system["value"], \
        f"Expected '{expected_substring}' in system prompt for locale={locale}, got: {captured_system['value'][:200]}"


def test_coach_chat_locale_defaults_to_fr_when_missing(client, app_module):
    captured_system = {}

    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            captured_system["value"] = system_message

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return "OK"

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "UserMessage", lambda text: types.SimpleNamespace(text=text)), \
         patch.dict(app_module.chat_sessions, {}, clear=True):
        r = client.post(
            "/api/coach/chat",
            json={"session_id": "sess_default", "message": "test"},
        )
    assert r.status_code == 200, r.text
    assert "Réponds ENTIÈREMENT en français" in captured_system["value"]


def test_coach_chat_session_namespaced_by_locale(client, app_module):
    """Two calls with same session_id but different locales must NOT share history."""
    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            self.session_id = session_id
            self.system_message = system_message

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return f"echo:{self.session_id}"

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "UserMessage", lambda text: types.SimpleNamespace(text=text)):
        app_module.chat_sessions.clear()
        r1 = client.post("/api/coach/chat", json={"session_id": "s1", "message": "hi", "locale": "fr"})
        r2 = client.post("/api/coach/chat", json={"session_id": "s1", "message": "hi", "locale": "de"})
        session_count = len(app_module.chat_sessions)

    assert r1.status_code == 200 and r2.status_code == 200
    # Two distinct chat objects were created
    assert session_count == 2


# ─────────── /api/email/parse ───────────

def test_email_parse_preserves_verbatim_data(client, app_module):
    """DATA fields returned by the parser must NOT be translated by our layer."""
    fake_llm_json = (
        '{"document_type":"invoice","title":"Rechnung Nr. 123",'
        '"issuer":"Swisscom AG","amount":89.4,"currency":"CHF",'
        '"iban":"CH93 0076 2011 6238 5295 7","reference":"210000000003139471430009017",'
        '"category":"telecoms","confidence":0.92}'
    )

    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            self.system_message = system_message

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return fake_llm_json

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "UserMessage", lambda text: types.SimpleNamespace(text=text)):
        r = client.post(
            "/api/email/parse",
            json={
                "content": "Rechnung Swisscom",
                "subject": "Ihre Rechnung",
                "locale": "de",
            },
        )
    data = r.json()
    assert r.status_code == 200
    assert data["success"] is True
    # Verbatim, un-translated
    assert data["title"] == "Rechnung Nr. 123"
    assert data["issuer"] == "Swisscom AG"
    assert data["iban"] == "CH93 0076 2011 6238 5295 7"
    assert data["amount"] == 89.4
    assert data["currency"] == "CHF"


@pytest.mark.parametrize("locale", ["fr", "en", "de", "it"])
def test_email_parse_accepts_all_locales(client, app_module, locale):
    """Every supported locale must be accepted (200 response, not 422)."""
    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            pass

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return '{"document_type":"unknown","confidence":0.4}'

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "UserMessage", lambda text: types.SimpleNamespace(text=text)):
        r = client.post(
            "/api/email/parse",
            json={"content": "abc", "locale": locale},
        )
    assert r.status_code == 200, f"locale={locale}: {r.text}"


def test_email_parse_error_returns_stable_code(client, app_module):
    """When parsing fails, we return a stable UPPER_SNAKE_CASE code."""
    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            pass

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            raise RuntimeError("boom")

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "UserMessage", lambda text: types.SimpleNamespace(text=text)):
        r = client.post(
            "/api/email/parse",
            json={"content": "abc", "locale": "fr"},
        )
    data = r.json()
    assert r.status_code == 200
    assert data["success"] is False
    assert data["error"] == "EMAIL_PARSE_FAILED"


# ─────────── /api/scanner/ocr ───────────

def test_scanner_ocr_preserves_merchant_verbatim(client, app_module):
    """The merchant + raw_text returned by OCR must be verbatim, not translated."""
    fake_llm_json = (
        '{"document_type":"receipt","merchant":"Migros","total_amount":52.30,'
        '"currency":"CHF","date":"2026-04-15","category":"courses",'
        '"receipt_type":"ticket","items":["Yogurt","Pain","Fromage"],"confidence":0.9}'
    )

    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            pass

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return fake_llm_json

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "ImageContent", lambda image_base64: image_base64), \
         patch.object(app_module, "UserMessage", lambda **kw: types.SimpleNamespace(**kw)):
        r = client.post(
            "/api/scanner/ocr",
            json={
                "image_base64": "a" * 400,  # padding
                "locale": "en",
            },
        )
    data = r.json()
    assert r.status_code == 200
    assert data["success"] is True
    # Verbatim merchant + items (never translated to English)
    assert data["merchant"] == "Migros"
    assert data["total_amount"] == 52.30
    assert data["currency"] == "CHF"
    assert "Yogurt" in data["items"]
    assert "Fromage" in data["items"]


@pytest.mark.parametrize("locale", ["fr", "en", "de", "it"])
def test_scanner_ocr_accepts_all_locales(client, app_module, locale):
    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            pass

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            return '{"document_type":"unknown","confidence":0.4}'

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "ImageContent", lambda image_base64: image_base64), \
         patch.object(app_module, "UserMessage", lambda **kw: types.SimpleNamespace(**kw)):
        r = client.post(
            "/api/scanner/ocr",
            json={"image_base64": "b" * 400, "locale": locale},
        )
    assert r.status_code == 200, f"locale={locale}: {r.text}"


def test_scanner_ocr_error_returns_stable_code(client, app_module):
    class FakeChat:
        def __init__(self, api_key, session_id, system_message):
            pass

        def with_model(self, *a, **kw):
            return self

        async def send_message(self, msg):
            raise RuntimeError("kaboom")

    with patch.object(app_module, "LlmChat", FakeChat), \
         patch.object(app_module, "ImageContent", lambda image_base64: image_base64), \
         patch.object(app_module, "UserMessage", lambda **kw: types.SimpleNamespace(**kw)):
        r = client.post(
            "/api/scanner/ocr",
            json={"image_base64": "c" * 400, "locale": "de"},
        )
    data = r.json()
    assert r.status_code == 200
    assert data["success"] is False
    assert data["error"] == "OCR_FAILED"
