"""
v3.9.0 P3 hardening — third-pass verification suite.

Focused only on the SEC-001 column-name fix and associated P3 hardenings.

Covers:
  1. supabase_admin.fetch_by_original_transaction queries the LIVE columns
     (apple_original_transaction_id + subscription_state) and NOT the wrong
     original_transaction_id/state.
  2. SQL migration for user_subscriptions is purely additive (no CREATE TABLE)
     and defines UNIQUE index user_subscriptions_apple_orig_tx_uniq.
  3. server.py iap_validate + iap_restore fail-CLOSED with ownership_check_failed
     when the ownership lookup returns _error sentinel or raises.
  4. Full auth regression on protected endpoints (including newly-protected
     /api/export/pdf).
  5. JWT verifier accepts valid HS256, rejects tampered/expired/alg=none.
  6. JWKS negative cache: N rapid unknown-kid requests trigger at most 1 JWKS
     fetch per 30-second window.
  7. APP_ENV defaults to "production" in server.py:54 AND apple_iap.py:69.
  8. Apple fail-fast — backend up on /api/health with version=3.9.0.
  9. Webhook: no secret + fake JWS → 401 invalid_signature.
 10. Webhook: empty body → 400 empty_payload.
 11. Exception handler: malformed JSON → only {"error":"internal_server_error"}.
 12. requirements.txt: python-jose + ecdsa removed.
"""
from __future__ import annotations

import os
import re
import time
import json
import pathlib
from typing import Any, Dict

import jwt as pyjwt
import pytest
import requests

BASE_URL = "http://localhost:8001"
DEV_SECRET = "dev-only-test-secret-do-not-use-in-production-please-rotate"
BACKEND_DIR = pathlib.Path("/app/backend")
DOCS_DIR = pathlib.Path("/app/docs")


# ─── helpers ────────────────────────────────────────────────────────────────
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


def mint_asymmetric_unknown_kid(alg: str = "ES256") -> str:
    """Craft a syntactically-valid JWT with a random unknown kid so that
    _verify_asymmetric will drop into the JWKS lookup path and hit the
    negative cache after the first miss.  We don't need a real ES256/RS256
    signature — the server rejects with 401 unknown_kid BEFORE any signature
    verification when the kid is not in the JWKS cache.  We only need the
    header well-formed."""
    import base64
    header = {"alg": alg, "kid": f"nonexistent-kid-{int(time.time()*1000)}", "typ": "JWT"}
    body = {"sub": "x", "exp": int(time.time()) + 60}
    def b64(o):
        return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
    return f"{b64(header)}.{b64(body)}.AAAA"


# ─── 1. supabase_admin fetch_by_original_transaction column names ───────────
class TestSupabaseAdminColumnFix:
    def test_fetch_uses_apple_original_transaction_id(self):
        text = (BACKEND_DIR / "supabase_admin.py").read_text()
        # Locate the function block
        m = re.search(r"def fetch_by_original_transaction\(.*?\).*?^\S", text, re.DOTALL | re.MULTILINE)
        # Simpler: split file, find function, grab following ~40 lines
        idx = text.find("def fetch_by_original_transaction")
        assert idx >= 0, "fetch_by_original_transaction not found"
        block = text[idx: idx + 2000]
        # MUST use apple_original_transaction_id in filter AND select
        assert "apple_original_transaction_id=eq." in block, "filter must be on apple_original_transaction_id"
        assert "subscription_state" in block, "select must include subscription_state"
        # MUST NOT reference the legacy wrong names
        # We allow the docstring to mention them, but the query URL must not.
        # Extract just the URL construction
        url_match = re.search(r"url = \((.*?)\)", block, re.DOTALL)
        assert url_match, "URL construction not found in fetch_by_original_transaction"
        url_src = url_match.group(1)
        assert "original_transaction_id=eq." not in url_src or "apple_original_transaction_id=eq." in url_src, \
            "URL must not query legacy 'original_transaction_id' column"
        # Extra explicit: raw 'state' (not subscription_state) MUST not be in the select
        # Search for a comma-separated select ending with ',state' or ',state,'
        assert re.search(r"[,=]state[,&]", url_src) is None, "must not select the legacy 'state' column"

    def test_fail_closed_returns_error_sentinel(self):
        text = (BACKEND_DIR / "supabase_admin.py").read_text()
        idx = text.find("def fetch_by_original_transaction")
        block = text[idx: idx + 2000]
        assert '"_error"' in block, "must return {'_error': ...} sentinel on infra failure"
        assert "network" in block and ("http_" in block or "http" in block), \
            "must sentinel both httpx errors and non-200 status"


# ─── 2. SQL migration additive on user_subscriptions ────────────────────────
class TestSQLMigrationAdditive:
    def test_unique_index_on_apple_original_transaction_id(self):
        sql = (DOCS_DIR / "SUPABASE_SECURITY_V3_9_0.sql").read_text()
        assert "user_subscriptions_apple_orig_tx_uniq" in sql
        assert "apple_original_transaction_id" in sql
        # Verify the UNIQUE index is on the correct column
        idx = sql.find("user_subscriptions_apple_orig_tx_uniq")
        window = sql[idx: idx + 500]
        assert "apple_original_transaction_id" in window, "UNIQUE index must target apple_original_transaction_id"

    def test_no_create_table_user_subscriptions(self):
        sql = (DOCS_DIR / "SUPABASE_SECURITY_V3_9_0.sql").read_text()
        # No CREATE TABLE (case-insensitive) on user_subscriptions
        assert not re.search(r"create\s+table\s+(if\s+not\s+exists\s+)?public\.user_subscriptions",
                             sql, re.IGNORECASE), \
            "migration must be additive — no CREATE TABLE on user_subscriptions"


# ─── 3. server.py fail-closed on ownership check ────────────────────────────
class TestServerFailClosed:
    def test_ownership_check_failed_present(self):
        text = (BACKEND_DIR / "server.py").read_text()
        assert "ownership_check_failed" in text
        assert "transaction_already_owned" in text
        assert text.count("ownership_check_failed") >= 2, \
            "expected error present in both iap_validate and iap_restore"

    def test_error_sentinel_handled(self):
        text = (BACKEND_DIR / "server.py").read_text()
        # Fail-closed uses .get("_error") from the sentinel
        assert '_error' in text
        # iap_validate uses fetch_by_original_transaction
        assert "fetch_by_original_transaction" in text


# ─── 4. Auth regression on all protected endpoints ──────────────────────────
PROTECTED_ENDPOINTS = [
    ("POST", "/api/coach/chat", {}),
    ("POST", "/api/scanner/ocr", {}),
    ("POST", "/api/email/parse", {}),
    ("POST", "/api/optimizer/analyze", {}),
    ("POST", "/api/voice/parse", {}),
    ("POST", "/api/iap/validate", {}),
    ("POST", "/api/iap/restore", {}),
    ("GET",  "/api/iap/me", None),
    ("GET",  "/api/family/groups", None),
    ("GET",  "/api/alerts/11111111-1111-1111-1111-111111111111", None),
    ("POST", "/api/export/pdf", {"expenses": []}),
]


@pytest.mark.parametrize("method,path,body", PROTECTED_ENDPOINTS)
def test_protected_requires_auth(method, path, body):
    kwargs = {"timeout": 10}
    if body is not None:
        kwargs["json"] = body
    r = requests.request(method, f"{BASE_URL}{path}", **kwargs)
    assert r.status_code == 401, f"{method} {path} → {r.status_code} (want 401)"
    try:
        payload = r.json()
    except Exception:
        payload = {}
    assert payload.get("error") == "missing_token", \
        f"{method} {path} → error={payload.get('error')} (want missing_token)"


# ─── 5. JWT validation regression ───────────────────────────────────────────
class TestJWTValidation:
    def test_valid_hs256_accepted(self):
        tok = mint_hs256()
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        # Anything except 401 = auth accepted (may still return 4xx/5xx for missing config)
        assert r.status_code != 401, f"valid JWT was rejected: {r.status_code} {r.text[:200]}"

    def test_tampered_signature_rejected(self):
        tok = mint_hs256()
        tampered = tok[:-4] + ("AAAA" if tok[-4:] != "AAAA" else "BBBB")
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {tampered}"}, timeout=10)
        assert r.status_code == 401
        assert r.json().get("error") == "invalid_signature"

    def test_expired_token_rejected(self):
        tok = mint_hs256(exp_offset=-60)
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert r.status_code == 401
        assert r.json().get("error") == "token_expired"

    def test_alg_none_rejected(self):
        import base64
        header = {"alg": "none", "typ": "JWT"}
        body = {"sub": "x", "exp": int(time.time()) + 60, "aud": "authenticated"}
        def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
        tok = f"{b64(header)}.{b64(body)}."
        r = requests.get(f"{BASE_URL}/api/iap/me",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert r.status_code == 401
        assert r.json().get("error") == "algorithm_not_allowed"


# ─── 6. JWKS negative cache anti-amplification ──────────────────────────────
class TestJWKSNegativeCache:
    def test_neg_cache_code_structure_present(self):
        """Structural check — negative cache datastructures + guard exist."""
        auth_src = (BACKEND_DIR / "auth.py").read_text()
        assert "_JWKS_NEG_KIDS" in auth_src
        assert "_JWKS_NEG_TTL" in auth_src
        fn_idx = auth_src.find("def _get_jwks_key_for_kid")
        assert fn_idx >= 0
        next_def = auth_src.find("\ndef ", fn_idx + 1)
        body = auth_src[fn_idx: next_def if next_def > 0 else fn_idx + 3000]
        neg_pos = body.find("_JWKS_NEG_KIDS.get(kid)")
        refresh_pos = body.find("_refresh_jwks_locked()")
        assert 0 <= neg_pos < refresh_pos

    def test_neg_cache_empirically_short_circuits(self):
        """v3.9.0 anti-amplification: 10 rapid requests with the SAME unknown
        kid must trigger AT MOST 1 JWKS HTTP fetch (per the 30s neg-cache TTL).

        BUG: `_verify_asymmetric` retries with `force_refresh=True` which
        bypasses the negative-cache guard — so every request currently
        triggers a real JWKS HTTP fetch, defeating the hardening.
        """
        log_path = "/var/log/supervisor/backend.err.log"
        try:
            before_size = os.path.getsize(log_path)
        except OSError:
            pytest.skip("no supervisor log available")

        tok = mint_asymmetric_unknown_kid("ES256")
        codes = []
        for _ in range(10):
            r = requests.get(f"{BASE_URL}/api/iap/me",
                             headers={"Authorization": f"Bearer {tok}"}, timeout=10)
            codes.append(r.status_code)
        assert all(c == 401 for c in codes)

        with open(log_path, "rb") as f:
            f.seek(before_size)
            delta = f.read().decode(errors="ignore")
        refresh_count = delta.count("JWKS refreshed")
        assert refresh_count <= 1, (
            f"JWKS refresh triggered {refresh_count} times for 10 requests with "
            "same unknown kid — anti-amplification hardening DEFEATED "
            "(likely by force_refresh=True retry in _verify_asymmetric bypassing "
            "the negative cache)."
        )


# ─── 7. APP_ENV defaults consistent (production) ────────────────────────────
class TestAppEnvDefaults:
    def test_server_default_production(self):
        text = (BACKEND_DIR / "server.py").read_text()
        # server.py line ~54
        assert re.search(r'APP_ENV\s*=\s*os\.getenv\(\s*["\']APP_ENV["\']\s*,\s*["\']production["\']',
                         text), "server.py APP_ENV must default to production"

    def test_apple_iap_default_production(self):
        text = (BACKEND_DIR / "apple_iap.py").read_text()
        # apple_iap.py line ~69 uses `or "production"` fallback
        assert re.search(r'_APP_ENV\s*=\s*\(os\.getenv\(\s*["\']APP_ENV["\']\).*?["\']production["\']',
                         text, re.DOTALL), \
            "apple_iap.py _APP_ENV must default to production"


# ─── 8. Backend health / Apple fail-fast passed ─────────────────────────────
def test_backend_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert body.get("version") == "3.9.0"
    assert body.get("env") == "production"


# ─── 9. Webhook no-secret / fake JWS ────────────────────────────────────────
def test_webhook_no_secret_fake_jws_401():
    r = requests.post(
        f"{BASE_URL}/api/iap/webhook/apple",
        json={"signedPayload": "eyJhbGciOiJub25lIn0.eyJmb28iOiJiYXIifQ."},
        timeout=10,
    )
    assert r.status_code == 401, f"got {r.status_code} body={r.text[:200]}"
    try:
        err = r.json().get("error", "")
    except Exception:
        err = ""
    assert err in ("invalid_signature", "bad_secret", "missing_secret"), \
        f"expected invalid_signature; got {err}"


# ─── 10. Webhook empty body → 400 empty_payload ─────────────────────────────
def test_webhook_empty_body_400():
    r = requests.post(f"{BASE_URL}/api/iap/webhook/apple", json={}, timeout=10)
    assert r.status_code == 400
    assert r.json().get("error") == "empty_payload"


# ─── 11. Malformed JSON does not leak stack trace ───────────────────────────
def test_malformed_json_no_leak():
    tok = mint_hs256()
    r = requests.post(
        f"{BASE_URL}/api/coach/chat",
        data=b"{ not json",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        timeout=10,
    )
    # Should be 4xx or 5xx sanitized — no traceback in body
    body_text = r.text.lower()
    assert "traceback" not in body_text
    assert "at 0x" not in body_text
    # If 500, body must be exactly the sanitized envelope
    if r.status_code == 500:
        assert r.json() == {"error": "internal_server_error"}


# ─── 12. requirements.txt: python-jose + ecdsa removed ──────────────────────
def test_requirements_no_python_jose_no_ecdsa():
    req = (BACKEND_DIR / "requirements.txt").read_text()
    # Match at line-start to avoid false positive on 'jose' inside other names
    lines = [l.strip().lower() for l in req.splitlines() if l.strip()]
    for l in lines:
        assert not l.startswith("python-jose"), f"python-jose still present: {l}"
        assert not l.startswith("ecdsa"), f"ecdsa still present: {l}"
