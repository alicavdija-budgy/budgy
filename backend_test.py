"""
Smoke test — Budgy backend post-modifications (Factures vs Contrats separation).

Targets:
  A) Regression: /api/health, /api/iap/health, /api/iap/me, /api/config/status
  B) /api/email/parse — new fields document_type / needs_user_confirmation / confidence
     (both invoice and contract content)
  C) /api/scanner/ocr — same new fields in structure
  D) Strict: never 500, always application/json, new fields ALWAYS present even on LLM failure.
"""

import json
import sys
import requests

BASE = "https://chf-guardian-wallet.preview.emergentagent.com/api"
TIMEOUT = 60

results = []  # (name, passed, details)


def record(name: str, passed: bool, details: str = ""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} — {details}")
    results.append((name, passed, details))


def is_json_response(resp) -> bool:
    ctype = resp.headers.get("content-type", "")
    return "application/json" in ctype.lower()


# ──────────────────────────────────────────────────
# A) NON-REGRESSION
# ──────────────────────────────────────────────────
def test_health():
    name = "A1 GET /api/health"
    try:
        r = requests.get(f"{BASE}/health", timeout=TIMEOUT)
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json_response(r):
            return record(name, False, f"Content-Type not JSON: {r.headers.get('content-type')}")
        body = r.json()
        if body.get("status") != "ok":
            return record(name, False, f"status not ok: {body}")
        if body.get("app") != "Budgy":
            return record(name, False, f"app missing/wrong: {body}")
        if "version" not in body:
            return record(name, False, f"version missing: {body}")
        record(name, True, f"status=ok version={body.get('version')} app=Budgy keys={list(body.keys())}")
    except Exception as e:
        record(name, False, f"exception: {e}")


def test_iap_health():
    name = "A2 GET /api/iap/health"
    try:
        r = requests.get(f"{BASE}/iap/health", timeout=TIMEOUT)
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json_response(r):
            return record(name, False, "not JSON")
        body = r.json()
        required = {"iap_ready", "supabase_ready", "missing", "sandbox", "products"}
        missing_keys = required - set(body.keys())
        if missing_keys:
            return record(name, False, f"missing keys: {missing_keys}; got {list(body.keys())}")
        record(name, True, f"keys={list(body.keys())} iap_ready={body.get('iap_ready')} sandbox={body.get('sandbox')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


def test_iap_me():
    name = "A3 GET /api/iap/me?user_id=zero-uuid"
    try:
        r = requests.get(f"{BASE}/iap/me", params={"user_id": "00000000-0000-0000-0000-000000000000"}, timeout=TIMEOUT)
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json_response(r):
            return record(name, False, "not JSON")
        body = r.json()
        if body.get("is_pro") is not False:
            return record(name, False, f"is_pro not False: {body}")
        if body.get("subscription_state") != "FREE":
            return record(name, False, f"subscription_state != FREE: {body}")
        record(name, True, f"is_pro=False subscription_state=FREE keys={list(body.keys())}")
    except Exception as e:
        record(name, False, f"exception: {e}")


def test_config_status():
    name = "A4 GET /api/config/status"
    try:
        r = requests.get(f"{BASE}/config/status", timeout=TIMEOUT)
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json_response(r):
            return record(name, False, "not JSON")
        body = r.json()
        record(name, True, f"keys={list(body.keys())}")
    except Exception as e:
        record(name, False, f"exception: {e}")


# ──────────────────────────────────────────────────
# B) /api/email/parse — new fields presence
# ──────────────────────────────────────────────────
EMAIL_REQUIRED_KEYS = {
    "success", "document_type", "needs_user_confirmation", "confidence",
    "title", "issuer", "amount", "currency", "due_date",
    "invoice_date", "iban", "reference", "category",
}


def test_email_parse_invoice():
    name = "B1 POST /api/email/parse (INVOICE content)"
    payload = {"content": "Facture Swisscom CHF 89.50 due 30.04.2026 IBAN CH9300762011623852957"}
    try:
        r = requests.post(f"{BASE}/email/parse", json=payload, timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 (forbidden): body={r.text[:400]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code} body={r.text[:400]}")
        if not is_json_response(r):
            return record(name, False, f"Content-Type not JSON: {r.headers.get('content-type')}")
        body = r.json()
        missing_keys = EMAIL_REQUIRED_KEYS - set(body.keys())
        if missing_keys:
            return record(name, False, f"MISSING required keys: {missing_keys}; got keys={list(body.keys())}")
        # new-field shape sanity
        if not isinstance(body.get("needs_user_confirmation"), bool):
            return record(name, False, f"needs_user_confirmation not bool: {body.get('needs_user_confirmation')!r}")
        dt = body.get("document_type")
        if dt is not None and dt not in ("invoice", "contract", "unknown"):
            return record(name, False, f"document_type invalid: {dt}")
        record(name, True,
               f"keys={sorted(body.keys())} | success={body.get('success')} document_type={dt} "
               f"needs_user_confirmation={body.get('needs_user_confirmation')} "
               f"confidence={body.get('confidence')} error={body.get('error')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


def test_email_parse_contract():
    name = "B2 POST /api/email/parse (CONTRACT content)"
    payload = {
        "content": "Police d'assurance LAMal Helsana 2026 prime mensuelle CHF 380 contrat n°1234 renouvellement tacite"
    }
    try:
        r = requests.post(f"{BASE}/email/parse", json=payload, timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 (forbidden): body={r.text[:400]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code} body={r.text[:400]}")
        if not is_json_response(r):
            return record(name, False, "not JSON")
        body = r.json()
        missing_keys = EMAIL_REQUIRED_KEYS - set(body.keys())
        if missing_keys:
            return record(name, False, f"MISSING required keys: {missing_keys}; got keys={list(body.keys())}")
        if not isinstance(body.get("needs_user_confirmation"), bool):
            return record(name, False, f"needs_user_confirmation not bool: {body.get('needs_user_confirmation')!r}")
        dt = body.get("document_type")
        if dt is not None and dt not in ("invoice", "contract", "unknown"):
            return record(name, False, f"document_type invalid: {dt}")
        record(name, True,
               f"keys={sorted(body.keys())} | success={body.get('success')} document_type={dt} "
               f"needs_user_confirmation={body.get('needs_user_confirmation')} "
               f"confidence={body.get('confidence')} error={body.get('error')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


# ──────────────────────────────────────────────────
# C) /api/scanner/ocr — new fields presence
# ──────────────────────────────────────────────────
OCR_REQUIRED_KEYS = {
    "success", "document_type", "needs_user_confirmation", "confidence",
    "merchant", "total_amount", "currency", "date", "category",
    "receipt_type", "items", "raw_text",
}


def test_ocr_tiny_image():
    name = "C1 POST /api/scanner/ocr (tiny base64 — pre-existing guard)"
    payload = {"image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="}
    try:
        r = requests.post(f"{BASE}/scanner/ocr", json=payload, timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 (forbidden): body={r.text[:400]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json_response(r):
            return record(name, False, "not JSON")
        body = r.json()
        missing_keys = OCR_REQUIRED_KEYS - set(body.keys())
        if missing_keys:
            return record(name, False, f"MISSING required keys: {missing_keys}; got keys={list(body.keys())}")
        # The guard branch returns success=false with error 'Image trop petite'
        record(name, True,
               f"keys={sorted(body.keys())} | success={body.get('success')} "
               f"document_type={body.get('document_type')} "
               f"needs_user_confirmation={body.get('needs_user_confirmation')} "
               f"confidence={body.get('confidence')} error={body.get('error')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


def test_ocr_minimal_valid_jpeg():
    name = "C2 POST /api/scanner/ocr (minimal valid 1x1 JPEG)"
    # Real 1x1 px white JPEG, base64. ~125 bytes decoded, large enough to pass the guard.
    jpeg_b64 = (
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB"
        "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEB"
        "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgA"
        "AQABAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAJ/8QAFBABAAAAAAAAAAAAAAAA"
        "AAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwD"
        "AQACEQMRAD8AfwD/2Q=="
    )
    payload = {"image_base64": jpeg_b64}
    try:
        r = requests.post(f"{BASE}/scanner/ocr", json=payload, timeout=TIMEOUT)
        if r.status_code == 500:
            return record(name, False, f"HTTP 500 (forbidden): body={r.text[:400]}")
        if r.status_code != 200:
            return record(name, False, f"HTTP {r.status_code}")
        if not is_json_response(r):
            return record(name, False, "not JSON")
        body = r.json()
        missing_keys = OCR_REQUIRED_KEYS - set(body.keys())
        if missing_keys:
            return record(name, False, f"MISSING required keys: {missing_keys}; got keys={list(body.keys())}")
        # success may be False due to LLM auth failure, but the new fields MUST exist with Pydantic defaults
        dt = body.get("document_type")
        if dt is not None and dt not in ("invoice", "receipt", "contract", "unknown"):
            return record(name, False, f"document_type invalid value: {dt}")
        if not isinstance(body.get("needs_user_confirmation"), bool):
            return record(name, False, f"needs_user_confirmation not bool: {body.get('needs_user_confirmation')!r}")
        record(name, True,
               f"keys={sorted(body.keys())} | success={body.get('success')} document_type={dt} "
               f"needs_user_confirmation={body.get('needs_user_confirmation')} "
               f"confidence={body.get('confidence')} error={body.get('error')}")
    except Exception as e:
        record(name, False, f"exception: {e}")


# ──────────────────────────────────────────────────
# Run all
# ──────────────────────────────────────────────────
def main():
    print(f"\n=== Smoke test against {BASE} ===\n")
    test_health()
    test_iap_health()
    test_iap_me()
    test_config_status()
    test_email_parse_invoice()
    test_email_parse_contract()
    test_ocr_tiny_image()
    test_ocr_minimal_valid_jpeg()

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"\n=== RESULT: {passed}/{len(results)} passed, {failed} failed ===")
    if failed:
        print("\nFailures:")
        for n, ok, d in results:
            if not ok:
                print(f"  - {n}: {d}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
