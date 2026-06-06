"""
Smoke test rapide post v3.7.27 / build 67 — frontend-only + 3 docs MD.
Vérifie la non-régression backend sur 5 endpoints critiques.

Critères:
  - AUCUN HTTP 500
  - Tous les responses application/json
  - Structure correcte
"""

import sys
import requests

BASE = "https://chf-guardian-wallet.preview.emergentagent.com/api"
TIMEOUT = 90

results = []  # (name, passed, details)


def record(name: str, passed: bool, details: str = ""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} — {details}")
    results.append((name, passed, details))


def is_json(resp) -> bool:
    return "application/json" in resp.headers.get("content-type", "").lower()


# A) GET /api/health
def test_A_health():
    name = "A) GET /api/health"
    try:
        r = requests.get(f"{BASE}/health", timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 body={r.text[:300]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json(r):
            return record(name, False, f"not JSON ctype={r.headers.get('content-type')}")
        body = r.json()
        if body.get("status") != "ok":
            return record(name, False, f"status != ok: {body}")
        record(name, True, f"status=ok app={body.get('app')} version={body.get('version')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


# B) GET /api/iap/health
def test_B_iap_health():
    name = "B) GET /api/iap/health"
    try:
        r = requests.get(f"{BASE}/iap/health", timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 body={r.text[:300]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json(r):
            return record(name, False, "not JSON")
        body = r.json()
        required = {"iap_ready", "supabase_ready", "missing", "sandbox", "products"}
        miss = required - set(body.keys())
        if miss:
            return record(name, False, f"missing keys: {miss}; got {list(body.keys())}")
        record(name, True,
               f"keys={sorted(body.keys())} iap_ready={body.get('iap_ready')} "
               f"sandbox={body.get('sandbox')} products={body.get('products')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


# C) GET /api/iap/me?user_id=zero
def test_C_iap_me():
    name = "C) GET /api/iap/me (zero-uuid)"
    try:
        r = requests.get(f"{BASE}/iap/me",
                         params={"user_id": "00000000-0000-0000-0000-000000000000"},
                         timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 body={r.text[:300]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json(r):
            return record(name, False, "not JSON")
        body = r.json()
        if body.get("is_pro") is not False:
            return record(name, False, f"is_pro != False: {body}")
        record(name, True, f"is_pro=False subscription_state={body.get('subscription_state')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


# D) GET /api/config/status
def test_D_config_status():
    name = "D) GET /api/config/status"
    try:
        r = requests.get(f"{BASE}/config/status", timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 body={r.text[:300]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json(r):
            return record(name, False, "not JSON")
        body = r.json()
        record(name, True, f"keys={sorted(body.keys())} (count={len(body)})")
    except Exception as e:
        record(name, False, f"exception: {e}")


# E) POST /api/email/parse
def test_E_email_parse():
    name = "E) POST /api/email/parse"
    payload = {"content": "Facture Swisscom CHF 89.50"}
    required = {"document_type", "needs_user_confirmation", "confidence"}
    try:
        r = requests.post(f"{BASE}/email/parse", json=payload, timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 body={r.text[:300]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code} body={r.text[:300]}")
        if not is_json(r):
            return record(name, False, "not JSON")
        body = r.json()
        miss = required - set(body.keys())
        if miss:
            return record(name, False, f"missing required keys: {miss}; got {list(body.keys())}")
        if not isinstance(body.get("needs_user_confirmation"), bool):
            return record(name, False, f"needs_user_confirmation not bool: {body.get('needs_user_confirmation')!r}")
        dt = body.get("document_type")
        if dt is not None and dt not in ("invoice", "contract", "unknown"):
            return record(name, False, f"document_type invalid: {dt}")
        record(name, True,
               f"success={body.get('success')} document_type={dt} "
               f"needs_user_confirmation={body.get('needs_user_confirmation')} "
               f"confidence={body.get('confidence')} error={body.get('error')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


def main():
    print(f"\n=== Smoke v3.7.27/build 67 against {BASE} ===\n")
    test_A_health()
    test_B_iap_health()
    test_C_iap_me()
    test_D_config_status()
    test_E_email_parse()

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"\n=== RESULT: {passed}/{len(results)} passed, {failed} failed ===")
    if failed:
        print("\nFailures:")
        for n, ok, d in results:
            if not ok:
                print(f"  - {n}: {d}")
        print("\nGO/NO-GO: NO-GO for Build 67")
        sys.exit(1)
    print("\nGO/NO-GO: GO for Build 67")
    sys.exit(0)


if __name__ == "__main__":
    main()
