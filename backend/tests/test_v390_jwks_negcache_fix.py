"""
v3.9.0 — JWKS negative-cache bypass FIX verification.

Previous iteration (16) documented a RED bug:
    10 rapid requests with unknown-kid ES256 token → 11 'JWKS refreshed' events
    (should be ≤ 1 per 30-second window).

Root cause:
    (1) `_verify_asymmetric` retried with force_refresh=True on first miss.
    (2) `_get_jwks_key_for_kid` bypassed the negative cache when force_refresh=True.

Fix applied in /app/backend/auth.py:
    (a) Removed the force_refresh=True retry in _verify_asymmetric.
    (b) _get_jwks_key_for_kid now honors _JWKS_NEG_KIDS regardless of force_refresh.
    (c) Added last_fetch_gap >= _JWKS_NEG_TTL rate-limit to prevent storms.

This suite verifies the fix + minimal regression.
"""
from __future__ import annotations

import os
import re
import time
import json
import base64
import pathlib
from typing import Any, Dict

import jwt as pyjwt
import pytest
import requests

BASE_URL = "http://localhost:8001"
DEV_SECRET = "dev-only-test-secret-do-not-use-in-production-please-rotate"
BACKEND_DIR = pathlib.Path("/app/backend")
LOG_PATH = "/var/log/supervisor/backend.err.log"


# ─── helpers ────────────────────────────────────────────────────────────────
def _b64(o: Dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()


def mint_hs256(sub: str = "11111111-1111-1111-1111-111111111111",
               exp_offset: int = 3600,
               aud: str = "authenticated",
               extra: Dict[str, Any] | None = None) -> str:
    payload = {
        "sub": sub,
        "aud": aud,
        "exp": int(time.time()) + exp_offset,
        "email": "usera@budgy.ch",
        "role": "authenticated",
    }
    if extra:
        payload.update(extra)
    return pyjwt.encode(payload, DEV_SECRET, algorithm="HS256")


def mint_unknown_kid_token(kid: str, alg: str = "ES256") -> str:
    """Craft a syntactically-valid JWT with a given unknown kid.
    Server rejects at kid-lookup BEFORE signature verification, so the
    signature bytes are irrelevant."""
    header = {"alg": alg, "kid": kid, "typ": "JWT"}
    body = {"sub": "x", "exp": int(time.time()) + 60}
    return f"{_b64(header)}.{_b64(body)}.AAAA"


def truncate_log() -> None:
    """Truncate the backend supervisor error log (where JWKS logs go)."""
    try:
        with open(LOG_PATH, "wb") as f:
            f.truncate(0)
    except OSError as e:
        pytest.skip(f"cannot truncate {LOG_PATH}: {e}")


def read_log() -> str:
    try:
        with open(LOG_PATH, "rb") as f:
            return f.read().decode(errors="ignore")
    except OSError:
        return ""


def count_jwks_refreshes() -> int:
    return read_log().count("JWKS refreshed")


def _fire_and_wait_flush() -> None:
    # Small delay so the log line reliably flushes to disk before we read.
    time.sleep(0.3)


# ─── 1. Primary fix: 10 rapid requests, same unknown kid ────────────────────
class TestJWKSNegCacheFix:
    def test_10_rapid_same_kid_at_most_one_refresh(self):
        """The main fix: 10 rapid requests with the SAME unknown kid must
        trigger AT MOST 1 JWKS refresh (or 0 if within neg-cache TTL of a
        prior kid). Fail if > 1."""
        # Use a kid unique to this test to avoid interference from previous runs
        kid = f"fake-unknown-kid-fix-{int(time.time() * 1000)}"
        tok = mint_unknown_kid_token(kid, "ES256")
        truncate_log()

        codes = []
        for _ in range(10):
            r = requests.get(f"{BASE_URL}/api/iap/me",
                             headers={"Authorization": f"Bearer {tok}"}, timeout=10)
            codes.append(r.status_code)
        _fire_and_wait_flush()

        assert all(c == 401 for c in codes), f"non-401 codes: {codes}"
        n = count_jwks_refreshes()
        assert n <= 1, (
            f"FIX DEFEATED: JWKS refreshed {n} times for 10 same-kid requests "
            f"(expected ≤ 1). log-snippet: {read_log()[:1000]!r}"
        )

    def test_50_rapid_same_kid_still_at_most_one_refresh(self):
        """50 rapid requests with the SAME unknown kid over ~5s must still
        trigger ≤ 1 JWKS refresh (neg-cache TTL is 30s)."""
        kid = f"fake-unknown-kid-50-{int(time.time() * 1000)}"
        tok = mint_unknown_kid_token(kid, "ES256")
        truncate_log()

        t0 = time.time()
        codes = []
        for _ in range(50):
            r = requests.get(f"{BASE_URL}/api/iap/me",
                             headers={"Authorization": f"Bearer {tok}"}, timeout=10)
            codes.append(r.status_code)
        elapsed = time.time() - t0
        _fire_and_wait_flush()

        assert all(c == 401 for c in codes), f"non-401 codes: {codes}"
        n = count_jwks_refreshes()
        assert n <= 1, (
            f"FIX DEFEATED: JWKS refreshed {n} times for 50 same-kid requests "
            f"in {elapsed:.2f}s (expected ≤ 1)."
        )

    def test_5_different_unknown_kids_at_most_one_refresh(self):
        """5 requests with 5 DIFFERENT unknown kids in rapid succession must
        trigger ≤ 1 JWKS refresh (anti-amplification rate-limiter fires because
        last_fetch_gap < _JWKS_NEG_TTL after the first fetch)."""
        truncate_log()

        codes = []
        base = int(time.time() * 1000)
        for i in range(5):
            kid = f"fake-unknown-kid-diff-{base}-{i}"
            tok = mint_unknown_kid_token(kid, "ES256")
            r = requests.get(f"{BASE_URL}/api/iap/me",
                             headers={"Authorization": f"Bearer {tok}"}, timeout=10)
            codes.append(r.status_code)
        _fire_and_wait_flush()

        assert all(c == 401 for c in codes), f"non-401 codes: {codes}"
        n = count_jwks_refreshes()
        assert n <= 1, (
            f"FIX DEFEATED: JWKS refreshed {n} times for 5 different-kid "
            f"requests (expected ≤ 1)."
        )


# ─── 2. Code-structural verification of the fix ─────────────────────────────
class TestFixCodeStructure:
    def test_verify_asymmetric_no_force_refresh_retry(self):
        """_verify_asymmetric must NOT retry with force_refresh=True on miss."""
        src = (BACKEND_DIR / "auth.py").read_text()
        idx = src.find("def _verify_asymmetric")
        assert idx >= 0
        end = src.find("\ndef ", idx + 1)
        body = src[idx: end if end > 0 else idx + 3000]
        # The buggy retry pattern must be gone.
        assert "force_refresh=True" not in body, (
            "_verify_asymmetric still contains a force_refresh=True retry — "
            "this is the bug that must have been removed."
        )

    def test_get_jwks_key_neg_cache_honored_before_refresh(self):
        """_get_jwks_key_for_kid must consult _JWKS_NEG_KIDS BEFORE any
        potential network refresh, and unconditionally (regardless of
        force_refresh)."""
        src = (BACKEND_DIR / "auth.py").read_text()
        idx = src.find("def _get_jwks_key_for_kid")
        assert idx >= 0
        end = src.find("\ndef ", idx + 1)
        body = src[idx: end if end > 0 else idx + 3000]
        neg_pos = body.find("_JWKS_NEG_KIDS.get(kid)")
        refresh_pos = body.find("_refresh_jwks_locked()")
        assert 0 <= neg_pos < refresh_pos, (
            "negative-cache check must come BEFORE the refresh call"
        )
        # Also assert the neg-cache guard is NOT gated by `if not force_refresh`
        # right before the neg-cache read (regression on the fix).
        window = body[max(0, neg_pos - 200): neg_pos]
        assert "if not force_refresh" not in window, (
            "neg-cache short-circuit must NOT be gated by force_refresh"
        )


# ─── 3. Regression: auth flows still work ───────────────────────────────────
class TestAuthRegression:
    def test_valid_hs256_200(self):
        tok = mint_hs256()
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text[:200]}"

    def test_missing_token_401(self):
        r = requests.get(f"{BASE_URL}/api/iap/me", timeout=10)
        assert r.status_code == 401
        assert r.json().get("error") == "missing_token"

    def test_tampered_hs256_401_invalid_signature(self):
        tok = mint_hs256()
        # Flip the last char of the signature segment
        head, body, sig = tok.split(".")
        tampered_sig = sig[:-1] + ("A" if sig[-1] != "A" else "B")
        bad = f"{head}.{body}.{tampered_sig}"
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {bad}"}, timeout=10)
        assert r.status_code == 401
        assert r.json().get("error") == "invalid_signature", r.text

    def test_alg_none_401(self):
        header = {"alg": "none", "typ": "JWT"}
        body = {"sub": "x", "exp": int(time.time()) + 60, "aud": "authenticated"}
        tok = f"{_b64(header)}.{_b64(body)}."
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert r.status_code == 401
        assert r.json().get("error") == "algorithm_not_allowed"


# ─── 4. Regression: IAP ownership sentinels present ─────────────────────────
def test_iap_ownership_sentinels_present():
    src = (BACKEND_DIR / "server.py").read_text()
    assert "transaction_already_owned" in src
    assert "ownership_check_failed" in src


# ─── 5. Regression: /api/health returns 200 v3.9.0 ──────────────────────────
def test_health_ok_v390():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert body.get("version") == "3.9.0"


# ─── 6. Regression: webhook no secret + fake JWS → 401 ──────────────────────
def test_webhook_no_secret_fake_jws_401():
    r = requests.post(
        f"{BASE_URL}/api/iap/webhook/apple",
        json={"signedPayload": "eyJhbGciOiJub25lIn0.eyJmb28iOiJiYXIifQ."},
        timeout=10,
    )
    assert r.status_code == 401, f"got {r.status_code} body={r.text[:200]}"
    err = ""
    try:
        err = r.json().get("error", "")
    except Exception:
        pass
    assert err in ("invalid_signature", "bad_secret", "missing_secret"), \
        f"expected invalid_signature-family; got {err}"


# ─── 7. Regression: protected endpoints all 401 missing_token ───────────────
PROTECTED_ENDPOINTS = [
    ("POST", "/api/coach/chat"),
    ("POST", "/api/voice/parse"),
    ("POST", "/api/scanner/ocr"),
    ("POST", "/api/email/parse"),
    ("POST", "/api/optimizer/analyze"),
    ("POST", "/api/export/pdf"),
    ("POST", "/api/family/create"),
    # /api/alerts/{user_id} — GET requires auth (per server.py:633)
    ("GET", "/api/alerts/some-id-1234"),
    ("POST", "/api/iap/validate"),
    ("POST", "/api/iap/restore"),
    ("GET", "/api/iap/me"),
]


@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
def test_protected_endpoint_missing_token_401(method, path):
    url = f"{BASE_URL}{path}"
    if method == "GET":
        r = requests.get(url, timeout=10)
    elif method == "POST":
        r = requests.post(url, json={}, timeout=10)
    elif method == "DELETE":
        r = requests.delete(url, timeout=10)
    else:
        pytest.skip(f"unsupported method {method}")
    assert r.status_code == 401, (
        f"{method} {path}: expected 401, got {r.status_code} body={r.text[:200]}"
    )
    err = ""
    try:
        err = r.json().get("error", "")
    except Exception:
        pass
    assert err == "missing_token", (
        f"{method} {path}: expected error=missing_token, got {err!r}"
    )
