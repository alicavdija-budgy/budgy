"""
Backend Robustness Test Suite — IAP endpoints + smoke regression tests.
Target: https://chf-guardian-wallet.preview.emergentagent.com/api

Goal: Verify IAP endpoints are robust + graceful when APPLE_PRIVATE_KEY_P8 is
missing (no fake Pro activation), and existing endpoints did not regress.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

import requests

BASE = "https://chf-guardian-wallet.preview.emergentagent.com/api"
TIMEOUT = 30

results: list[dict[str, Any]] = []


def _record(name: str, ok: bool, http_code, details: str) -> None:
    status = "PASS" if ok else "FAIL"
    results.append({"name": name, "status": status, "http": http_code, "details": details})
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {name} -- HTTP {http_code} -- {details}")


def _summary_body(body: Any, max_len: int = 320) -> str:
    try:
        s = json.dumps(body, ensure_ascii=False, default=str)
    except Exception:
        s = str(body)
    return s if len(s) <= max_len else s[: max_len - 3] + "..."


def test_iap_health() -> None:
    name = "1. GET /api/iap/health"
    try:
        r = requests.get(f"{BASE}/iap/health", timeout=TIMEOUT)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 200:
        _record(name, False, r.status_code, f"expected 200 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    expected_keys = {"iap_ready", "supabase_ready", "missing", "sandbox", "products"}
    missing_keys = expected_keys - set(body.keys())
    if missing_keys:
        _record(name, False, r.status_code, f"missing keys: {missing_keys} -- body={_summary_body(body)}")
        return

    issues = []
    if body.get("iap_ready") is not False:
        issues.append(f"iap_ready expected False, got {body.get('iap_ready')!r}")
    if not isinstance(body.get("missing"), list):
        issues.append(f"missing[] expected list, got {type(body.get('missing'))}")
    elif "APPLE_PRIVATE_KEY_P8" not in body.get("missing", []):
        issues.append(f"missing[] should contain 'APPLE_PRIVATE_KEY_P8', got {body['missing']}")

    raw = json.dumps(body)
    for forbid in ("BEGIN PRIVATE KEY", "BEGIN EC PRIVATE", "-----BEGIN"):
        if forbid in raw:
            issues.append(f"SECRET LEAK: '{forbid}' found in body")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(
            name,
            True,
            r.status_code,
            f"iap_ready=False, missing={body.get('missing')}, sandbox={body.get('sandbox')}, "
            f"supabase_ready={body.get('supabase_ready')}, products={body.get('products')}",
        )


def test_iap_me_unknown_user() -> None:
    name = "2. GET /api/iap/me?user_id=<zero-uuid>"
    try:
        r = requests.get(
            f"{BASE}/iap/me",
            params={"user_id": "00000000-0000-0000-0000-000000000000"},
            timeout=TIMEOUT,
        )
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 200:
        _record(name, False, r.status_code, f"expected 200 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    issues = []
    if "is_pro" not in body:
        issues.append("missing 'is_pro' key")
    if "subscription_state" not in body:
        issues.append("missing 'subscription_state' key")
    if body.get("is_pro") is not False:
        issues.append(f"is_pro expected False, got {body.get('is_pro')!r}")
    state = body.get("subscription_state")
    if state != "FREE":
        issues.append(f"subscription_state expected 'FREE', got {state!r}")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(name, True, r.status_code, f"is_pro=False, subscription_state='FREE' -- body={_summary_body(body)}")


def test_iap_validate_no_keys() -> None:
    name = "3. POST /api/iap/validate (no keys configured)"
    payload = {
        "platform": "ios",
        "product_id": "com.budgy.ch.budgy.monthly",
        "transaction_id": "fake_txn_123",
        "user_id": "00000000-0000-0000-0000-000000000000",
    }
    try:
        r = requests.post(f"{BASE}/iap/validate", json=payload, timeout=TIMEOUT)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 503:
        _record(name, False, r.status_code, f"expected 503 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    inner = body.get("detail") if isinstance(body, dict) and "detail" in body else body

    issues = []
    if not isinstance(inner, dict):
        issues.append(f"unexpected response shape (no dict): {type(inner)}")
    else:
        if inner.get("error") != "iap_not_configured":
            issues.append(f"error expected 'iap_not_configured', got {inner.get('error')!r}")
        miss = inner.get("missing")
        if not isinstance(miss, list) or "APPLE_PRIVATE_KEY_P8" not in miss:
            issues.append(f"missing[] should contain 'APPLE_PRIVATE_KEY_P8', got {miss!r}")
        if inner.get("valid") is not False:
            issues.append(f"valid expected False, got {inner.get('valid')!r}")
        if inner.get("ok") is not False:
            issues.append(f"ok expected False, got {inner.get('ok')!r}")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(
            name,
            True,
            r.status_code,
            f"error='iap_not_configured', valid=False, ok=False -- missing={inner.get('missing')}",
        )


def test_iap_restore_no_keys() -> None:
    name = "4. POST /api/iap/restore (no keys configured)"
    payload = {
        "original_transaction_id": "fake_orig_123",
        "user_id": "00000000-0000-0000-0000-000000000000",
    }
    try:
        r = requests.post(f"{BASE}/iap/restore", json=payload, timeout=TIMEOUT)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 503:
        _record(name, False, r.status_code, f"expected 503 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    inner = body.get("detail") if isinstance(body, dict) and "detail" in body else body

    issues = []
    if not isinstance(inner, dict):
        issues.append(f"unexpected response shape: {type(inner)}")
    else:
        if inner.get("error") != "iap_not_configured":
            issues.append(f"error expected 'iap_not_configured', got {inner.get('error')!r}")
        miss = inner.get("missing")
        if not isinstance(miss, list) or "APPLE_PRIVATE_KEY_P8" not in miss:
            issues.append(f"missing[] should contain 'APPLE_PRIVATE_KEY_P8', got {miss!r}")
        if inner.get("valid") is not False:
            issues.append(f"valid expected False, got {inner.get('valid')!r}")
        if inner.get("ok") is not False:
            issues.append(f"ok expected False, got {inner.get('ok')!r}")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(
            name,
            True,
            r.status_code,
            f"error='iap_not_configured', valid=False, ok=False -- missing={inner.get('missing')}",
        )


def test_iap_validate_empty_body() -> None:
    name = "5. POST /api/iap/validate (empty body)"
    try:
        r = requests.post(f"{BASE}/iap/validate", json={}, timeout=TIMEOUT)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code == 500:
        _record(name, False, r.status_code, f"500 = crash, NOT acceptable -- body={r.text[:300]}")
        return

    if r.status_code in (503, 422, 200):
        try:
            body = r.json()
        except Exception:
            body = r.text
        _record(name, True, r.status_code, f"acceptable status (no crash) -- body={_summary_body(body)}")
    else:
        _record(name, False, r.status_code, f"unexpected status -- body={r.text[:300]}")


def test_iap_validate_unknown_product() -> None:
    name = "6. POST /api/iap/validate (unknown product)"
    payload = {"platform": "ios", "product_id": "com.unknown.product", "transaction_id": "x"}
    try:
        r = requests.post(f"{BASE}/iap/validate", json=payload, timeout=TIMEOUT)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code == 500:
        _record(name, False, r.status_code, f"500 = crash, NOT acceptable -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        body = r.text

    if r.status_code == 200:
        if isinstance(body, dict) and body.get("valid") is False and "unknown_product" in str(body.get("error", "")):
            _record(name, True, 200, f"valid=False, error={body.get('error')!r}")
        elif isinstance(body, dict) and body.get("valid") is False:
            _record(name, True, 200, f"valid=False -- body={_summary_body(body)}")
        else:
            _record(name, False, 200, f"valid should be False -- body={_summary_body(body)}")
    elif r.status_code == 503:
        _record(name, True, 503, f"missing-keys path (acceptable) -- body={_summary_body(body)}")
    else:
        _record(name, False, r.status_code, f"unexpected status -- body={_summary_body(body)}")


def test_health() -> None:
    name = "7a. GET /api/health"
    try:
        r = requests.get(f"{BASE}/health", timeout=TIMEOUT)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 200:
        _record(name, False, r.status_code, f"expected 200 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    issues = []
    if body.get("status") != "ok":
        issues.append(f"status expected 'ok', got {body.get('status')!r}")
    if body.get("app") != "Budgy":
        issues.append(f"app expected 'Budgy', got {body.get('app')!r}")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(name, True, r.status_code, f"status=ok, app=Budgy -- body={_summary_body(body)}")


def test_email_parse() -> None:
    name = "7b. POST /api/email/parse (Swisscom)"
    payload = {
        "content": "Facture Swisscom CHF 89.50 due 30.04.2026",
        "subject": "Facture",
        "from_addr": "facture@swisscom.ch",
    }
    try:
        r = requests.post(f"{BASE}/email/parse", json=payload, timeout=60)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 200:
        _record(name, False, r.status_code, f"expected 200 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    issues = []
    if body.get("success") is not True:
        issues.append(f"success expected True, got {body.get('success')!r}")
    if body.get("amount") is None:
        issues.append("amount missing/null")
    if body.get("currency") is None:
        issues.append("currency missing/null")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(
            name,
            True,
            r.status_code,
            f"success=True, amount={body.get('amount')}, currency={body.get('currency')}, "
            f"due_date={body.get('due_date')}, issuer={body.get('issuer')}",
        )


def test_voice_parse() -> None:
    name = "7c. POST /api/voice/parse (25 francs Migros)"
    payload = {"text": "25 francs chez Migros", "locale": "fr-CH"}
    try:
        r = requests.post(f"{BASE}/voice/parse", json=payload, timeout=60)
    except Exception as e:
        _record(name, False, "ERR", f"request failed: {e}")
        return

    if r.status_code != 200:
        _record(name, False, r.status_code, f"expected 200 -- body={r.text[:300]}")
        return

    try:
        body = r.json()
    except Exception:
        _record(name, False, r.status_code, f"non-json body: {r.text[:300]}")
        return

    issues = []
    if body.get("success") is not True:
        issues.append(f"success expected True, got {body.get('success')!r}")
    amount = body.get("amount")
    try:
        amt_f = float(amount) if amount is not None else None
    except Exception:
        amt_f = None
    if amt_f is None or abs(amt_f - 25.0) > 1.0:
        issues.append(f"amount expected ~25, got {amount!r}")
    if body.get("type") != "expense":
        issues.append(f"type expected 'expense', got {body.get('type')!r}")

    if issues:
        _record(name, False, r.status_code, "; ".join(issues) + f" -- body={_summary_body(body)}")
    else:
        _record(
            name,
            True,
            r.status_code,
            f"success=True, amount={amount}, type={body.get('type')}, merchant={body.get('merchant')}",
        )


def main() -> int:
    print(f"=== Budgy Backend Robustness Test ===")
    print(f"Target: {BASE}\n")

    tests = [
        test_iap_health,
        test_iap_me_unknown_user,
        test_iap_validate_no_keys,
        test_iap_restore_no_keys,
        test_iap_validate_empty_body,
        test_iap_validate_unknown_product,
        test_health,
        test_email_parse,
        test_voice_parse,
    ]
    for t in tests:
        t()
        time.sleep(0.2)

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    print(f"\n=== RESULTS: {passed}/{len(results)} passed ({failed} failed) ===")

    if failed:
        print("\n--- FAILED TESTS ---")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  FAIL {r['name']} (HTTP {r['http']}): {r['details']}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
