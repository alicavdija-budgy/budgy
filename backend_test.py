#!/usr/bin/env python3
"""
SMOKE + REGRESSION TEST — Budgy backend after self-hosted production refactor.

Validates:
  - GET /health (root, for Coolify) and GET /api/health both respond
  - GET /api/iap/health and GET /api/iap/me (graceful, no crash)
  - LiteLLM-backed endpoints still work: /api/email/parse and /api/voice/parse
  - CORS preflight enforces ALLOWED_ORIGINS list
  - No endpoint returns HTML or 500. Content-Type is application/json
    (except OPTIONS preflight which may be text/plain).
"""
import json
import sys
import requests

ROOT = "https://chf-guardian-wallet.preview.emergentagent.com"
BASE = f"{ROOT}/api"
TIMEOUT = 60

results = []


def check(name, ok, info=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}  {info}")
    results.append((name, ok, info))
    return ok


def is_json(resp):
    ct = resp.headers.get("content-type", "")
    is_json_ct = "application/json" in ct.lower()
    try:
        data = resp.json()
    except Exception:
        data = None
    return is_json_ct, data, ct


def section(title):
    print(f"\n=== {title} ===")


# ---------------------------------------------------------------------
# 1) GET /health (root, for Coolify probes)
# ---------------------------------------------------------------------
section("TEST 1 — GET /health (root, Coolify probe)")
try:
    r = requests.get(f"{ROOT}/health", timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  CT={r.headers.get('content-type')}")
    is_json_ct, data, ct = is_json(r)
    print(f"  body={json.dumps(data, ensure_ascii=False)[:300] if data else r.text[:300]}")
    check("/health is not 404", r.status_code != 404, f"got {r.status_code}")
    check("/health returns HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("/health Content-Type is application/json", is_json_ct, f"got {ct}")
    check("/health body is valid JSON", data is not None)
    if data:
        check("/health status == 'ok'", data.get("status") == "ok", f"got {data.get('status')}")
        check("/health service == 'budgy-api'", data.get("service") == "budgy-api", f"got {data.get('service')}")
        check("/health has version string", isinstance(data.get("version"), str) and len(data.get("version", "")) > 0,
              f"got {data.get('version')!r}")
        check("/health has env key", "env" in data, f"keys={list(data.keys())}")
except Exception as e:
    check("/health request did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 2) GET /api/health
# ---------------------------------------------------------------------
section("TEST 2 — GET /api/health")
try:
    r = requests.get(f"{BASE}/health", timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  CT={r.headers.get('content-type')}")
    is_json_ct, data, ct = is_json(r)
    print(f"  body={json.dumps(data, ensure_ascii=False)[:300] if data else r.text[:300]}")
    check("/api/health returns HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("/api/health Content-Type is application/json", is_json_ct, f"got {ct}")
    check("/api/health body is valid JSON", data is not None)
    if data:
        check("/api/health status == 'ok'", data.get("status") == "ok", f"got {data.get('status')}")
        check("/api/health app == 'Budgy'", data.get("app") == "Budgy", f"got {data.get('app')}")
        check("/api/health has version string", isinstance(data.get("version"), str) and len(data.get("version", "")) > 0,
              f"got {data.get('version')!r}")
except Exception as e:
    check("/api/health request did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 3) GET /api/iap/health
# ---------------------------------------------------------------------
section("TEST 3 — GET /api/iap/health")
try:
    r = requests.get(f"{BASE}/iap/health", timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  CT={r.headers.get('content-type')}")
    is_json_ct, data, ct = is_json(r)
    print(f"  body={json.dumps(data, ensure_ascii=False)[:400] if data else r.text[:400]}")
    check("/api/iap/health returns HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("/api/iap/health Content-Type is application/json", is_json_ct, f"got {ct}")
    check("/api/iap/health body is valid JSON", data is not None)
    if data:
        for k in ("iap_ready", "supabase_ready", "missing", "sandbox", "products"):
            check(f"/api/iap/health has key '{k}'", k in data, f"keys={list(data.keys())}")
        check("/api/iap/health.missing is a list", isinstance(data.get("missing"), list),
              f"type={type(data.get('missing')).__name__}")
except Exception as e:
    check("/api/iap/health request did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 4) GET /api/iap/me?user_id=<zero-uuid>
# ---------------------------------------------------------------------
section("TEST 4 — GET /api/iap/me?user_id=<zero-uuid>")
try:
    r = requests.get(f"{BASE}/iap/me", params={"user_id": "00000000-0000-0000-0000-000000000000"}, timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  CT={r.headers.get('content-type')}")
    is_json_ct, data, ct = is_json(r)
    print(f"  body={json.dumps(data, ensure_ascii=False)[:300] if data else r.text[:300]}")
    check("/api/iap/me returns HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("/api/iap/me Content-Type is application/json", is_json_ct, f"got {ct}")
    check("/api/iap/me body is valid JSON", data is not None)
    if data:
        check("/api/iap/me is_pro == False", data.get("is_pro") is False, f"got {data.get('is_pro')}")
        check("/api/iap/me subscription_state == 'FREE'",
              str(data.get("subscription_state", "")).upper() == "FREE",
              f"got {data.get('subscription_state')}")
except Exception as e:
    check("/api/iap/me request did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 5) POST /api/email/parse — Swisscom — validates LiteLLM path
# ---------------------------------------------------------------------
section("TEST 5 — POST /api/email/parse (LiteLLM path)")
try:
    payload = {"content": "Facture Swisscom CHF 89.50 échéance 30.04.2026"}
    r = requests.post(f"{BASE}/email/parse", json=payload, timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  CT={r.headers.get('content-type')}")
    is_json_ct, data, ct = is_json(r)
    print(f"  body={json.dumps(data, ensure_ascii=False)[:500] if data else r.text[:500]}")
    check("/api/email/parse returns HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("/api/email/parse Content-Type is application/json", is_json_ct, f"got {ct}")
    check("/api/email/parse body is valid JSON", data is not None)
    if data:
        check("/api/email/parse success == True", data.get("success") is True, f"got success={data.get('success')}")
        amt = data.get("amount")
        check("/api/email/parse amount ≈ 89.50", isinstance(amt, (int, float)) and abs(float(amt) - 89.5) < 0.01,
              f"got amount={amt}")
        check("/api/email/parse currency == 'CHF'", (data.get("currency") or "").upper() == "CHF",
              f"got currency={data.get('currency')}")
        issuer = (data.get("issuer") or "").lower()
        check("/api/email/parse issuer mentions Swisscom", "swisscom" in issuer, f"got issuer={data.get('issuer')!r}")
except Exception as e:
    check("/api/email/parse request did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 6) POST /api/voice/parse — Migros — validates LiteLLM path
# ---------------------------------------------------------------------
section("TEST 6 — POST /api/voice/parse (LiteLLM path)")
try:
    payload = {"text": "25 francs chez Migros"}
    r = requests.post(f"{BASE}/voice/parse", json=payload, timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  CT={r.headers.get('content-type')}")
    is_json_ct, data, ct = is_json(r)
    print(f"  body={json.dumps(data, ensure_ascii=False)[:500] if data else r.text[:500]}")
    check("/api/voice/parse returns HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("/api/voice/parse Content-Type is application/json", is_json_ct, f"got {ct}")
    check("/api/voice/parse body is valid JSON", data is not None)
    if data:
        check("/api/voice/parse success == True", data.get("success") is True, f"got success={data.get('success')}")
        amt = data.get("amount")
        check("/api/voice/parse amount == 25", isinstance(amt, (int, float)) and abs(float(amt) - 25.0) < 0.01,
              f"got amount={amt}")
        merchant = (data.get("merchant") or "").lower()
        check("/api/voice/parse merchant mentions Migros", "migros" in merchant,
              f"got merchant={data.get('merchant')!r}")
except Exception as e:
    check("/api/voice/parse request did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 7) CORS preflight
# ---------------------------------------------------------------------
section("TEST 7a — CORS preflight from https://budgy.ch (allowed)")
try:
    headers = {
        "Origin": "https://budgy.ch",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
    }
    r = requests.options(f"{BASE}/health", headers=headers, timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  resp-headers={dict(r.headers)}")
    aco = r.headers.get("access-control-allow-origin") or r.headers.get("Access-Control-Allow-Origin")
    check("CORS preflight (budgy.ch) returns HTTP 200/204",
          r.status_code in (200, 204), f"got {r.status_code}")
    check("CORS preflight (budgy.ch) returns access-control-allow-origin: https://budgy.ch",
          aco == "https://budgy.ch", f"got ACAO={aco!r}")
except Exception as e:
    check("CORS preflight (budgy.ch) did not crash", False, f"exception: {e}")


section("TEST 7b — CORS preflight from https://evil.example.com (must be rejected)")
try:
    headers = {
        "Origin": "https://evil.example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
    }
    r = requests.options(f"{BASE}/health", headers=headers, timeout=TIMEOUT)
    print(f"  HTTP {r.status_code}  resp-headers={dict(r.headers)}")
    aco = r.headers.get("access-control-allow-origin") or r.headers.get("Access-Control-Allow-Origin")
    # Acceptable: either 400, or no ACAO echo (i.e., ACAO not equal to evil origin)
    rejected = (r.status_code == 400) or (aco != "https://evil.example.com")
    check("CORS preflight (evil.example.com) is rejected (HTTP 400 OR no ACAO echo)",
          rejected, f"status={r.status_code}, ACAO={aco!r}")
    check("CORS preflight (evil.example.com) does NOT echo evil origin in ACAO",
          aco != "https://evil.example.com", f"got ACAO={aco!r}")
except Exception as e:
    check("CORS preflight (evil) did not crash", False, f"exception: {e}")


# ---------------------------------------------------------------------
# 8) Sanity: confirm no endpoint returned HTML or 500 (already enforced per-test)
# ---------------------------------------------------------------------
section("TEST 8 — Global sanity")
# This is just an aggregate; per-test JSON CT checks above are the real signal.
non_json_or_500 = [n for (n, ok, info) in results if not ok and ("Content-Type" in n or "HTTP 200" in n or "did not crash" in n)]
check("No endpoint returned HTML or 500 (aggregated)", len(non_json_or_500) == 0,
      f"failures: {non_json_or_500[:5]}")


# ---------------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------------
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"{passed}/{total} assertions PASS")
failed = [(n, info) for (n, ok, info) in results if not ok]
if failed:
    print(f"\n{len(failed)} FAILURES:")
    for n, info in failed:
        print(f"  - {n}  ({info})")
sys.exit(0 if passed == total else 1)
