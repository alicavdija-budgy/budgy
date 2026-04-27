"""
Backend test suite for Guardian Money CHF.
Tests endpoints via the public EXPO_PUBLIC_BACKEND_URL + /api prefix.
"""
import os
import io
import json
import base64
import time
import traceback
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

# ─── Config ──────────────────────────────────────────────────────────
FRONTEND_ENV = Path("/app/frontend/.env")
BASE_URL = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"')
        break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env"

API = f"{BASE_URL}/api"
print(f"\n🌐 Testing API at: {API}\n")

TIMEOUT = 90
results = []  # list of dicts: {name, ok, detail}


def record(name: str, ok: bool, detail: str = ""):
    symbol = "✅" if ok else "❌"
    print(f"{symbol} {name}")
    if detail:
        for line in detail.splitlines():
            print(f"   {line}")
    results.append({"name": name, "ok": ok, "detail": detail})


# ─── Build a realistic Swiss receipt JPEG with PIL ─────────────────
def build_receipt_jpeg() -> str:
    """Create a receipt-looking image (MIGROS) with real text/features, JPEG base64."""
    W, H = 600, 900
    img = Image.new("RGB", (W, H), (248, 248, 248))
    d = ImageDraw.Draw(img)

    try:
        font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 42)
        font_md = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        font_total = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
    except Exception:
        font_big = font_md = font_sm = font_total = ImageFont.load_default()

    # Header block (orange banner like Migros)
    d.rectangle([0, 0, W, 100], fill=(255, 102, 0))
    d.text((40, 25), "MIGROS", fill=(255, 255, 255), font=font_big)

    # Store info
    d.text((40, 120), "Migros Lausanne Flon", fill=(30, 30, 30), font=font_md)
    d.text((40, 155), "Rue du Flon 12, 1003 Lausanne", fill=(80, 80, 80), font=font_sm)
    d.text((40, 185), "Date: 12.04.2025  14:37", fill=(80, 80, 80), font=font_sm)
    d.text((40, 215), "Ticket N° 284/019345", fill=(80, 80, 80), font=font_sm)

    # Separator
    d.line([30, 260, W - 30, 260], fill=(150, 150, 150), width=2)

    # Items
    items = [
        ("Pain complet 500g", "3.20"),
        ("Lait UHT 1L x2", "2.40"),
        ("Pommes Gala 1kg", "4.95"),
        ("Fromage Gruyere 200g", "6.80"),
        ("Chocolat Frey", "3.50"),
        ("Eau minerale 1.5L", "1.25"),
        ("Yogourt nature x4", "2.40"),
    ]
    y = 280
    for name, price in items:
        d.text((40, y), name, fill=(20, 20, 20), font=font_sm)
        d.text((W - 120, y), f"CHF {price}", fill=(20, 20, 20), font=font_sm)
        y += 36

    d.line([30, y + 10, W - 30, y + 10], fill=(150, 150, 150), width=2)

    # Total
    d.text((40, y + 30), "Sous-total", fill=(30, 30, 30), font=font_md)
    d.text((W - 170, y + 30), "CHF 24.50", fill=(30, 30, 30), font=font_md)
    d.text((40, y + 65), "TVA 2.6%", fill=(80, 80, 80), font=font_sm)
    d.text((W - 170, y + 65), "CHF 0.62", fill=(80, 80, 80), font=font_sm)

    # Grand total highlight
    d.rectangle([30, y + 105, W - 30, y + 165], outline=(255, 102, 0), width=3)
    d.text((50, y + 115), "TOTAL CHF", fill=(255, 102, 0), font=font_total)
    d.text((W - 200, y + 115), "24.50", fill=(255, 102, 0), font=font_total)

    d.text((40, y + 185), "Merci de votre visite !", fill=(100, 100, 100), font=font_sm)
    d.text((40, y + 215), "Cumulus 4000123456789", fill=(100, 100, 100), font=font_sm)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ────────────────────────────────────────────────────────────────────
# 1. GET /api/health
# ────────────────────────────────────────────────────────────────────
def test_health():
    try:
        r = requests.get(f"{API}/health", timeout=15)
        ok = r.status_code == 200 and r.json().get("status") == "ok"
        record("GET /api/health", ok, f"status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        record("GET /api/health", False, f"EXCEPTION: {e}")


# ────────────────────────────────────────────────────────────────────
# 2. POST /api/scanner/ocr
# ────────────────────────────────────────────────────────────────────
def test_scanner_ocr():
    # 2a. Real receipt image
    try:
        b64 = build_receipt_jpeg()
        print(f"   [ocr] image base64 length = {len(b64)}")
        r = requests.post(
            f"{API}/scanner/ocr",
            json={"image_base64": b64, "mime_type": "image/jpeg"},
            timeout=TIMEOUT,
        )
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        success = bool(body.get("success"))
        has_data = bool(body.get("merchant") or body.get("total_amount"))
        ok = r.status_code == 200 and success and has_data
        detail = (
            f"status={r.status_code} success={success} merchant={body.get('merchant')} "
            f"total={body.get('total_amount')} currency={body.get('currency')} "
            f"date={body.get('date')} category={body.get('category')} "
            f"type={body.get('receipt_type')} confidence={body.get('confidence')} "
            f"items_count={len(body.get('items') or [])} error={body.get('error')}"
        )
        record("POST /api/scanner/ocr (real Migros receipt JPEG)", ok, detail)

        # Verify required keys in response
        required_keys = ["success", "merchant", "total_amount", "currency", "date",
                         "category", "receipt_type", "items", "confidence", "raw_text"]
        missing = [k for k in required_keys if k not in body]
        record(
            "OCR response schema (all expected keys present)",
            len(missing) == 0,
            f"missing={missing}",
        )
    except Exception as e:
        record("POST /api/scanner/ocr (real Migros receipt JPEG)", False,
               f"EXCEPTION: {e}\n{traceback.format_exc()}")

    # 2b. Invalid input — empty base64
    try:
        r = requests.post(
            f"{API}/scanner/ocr",
            json={"image_base64": "", "mime_type": "image/jpeg"},
            timeout=30,
        )
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        # Expected: success=false with error populated
        ok = r.status_code == 200 and body.get("success") is False and bool(body.get("error"))
        record(
            "POST /api/scanner/ocr (empty base64 → success=false)",
            ok,
            f"status={r.status_code} success={body.get('success')} error={body.get('error')}",
        )
    except Exception as e:
        record("POST /api/scanner/ocr (empty base64)", False, f"EXCEPTION: {e}")


# ────────────────────────────────────────────────────────────────────
# 3. POST /api/email/parse
# ────────────────────────────────────────────────────────────────────
def test_email_parse():
    payload = {
        "subject": "Facture Swisscom Avril 2025",
        "from_addr": "facture@swisscom.ch",
        "content": (
            "Cher client,\n\n"
            "Votre facture du 15.04.2025 d'un montant de CHF 89.50 "
            "est payable au 30.04.2025.\n"
            "IBAN CH9300762011623852957\n"
            "Référence 210000000003139471430009017\n\n"
            "Merci pour votre confiance.\n"
            "Swisscom (Suisse) SA"
        ),
    }
    try:
        r = requests.post(f"{API}/email/parse", json=payload, timeout=TIMEOUT)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        success = bool(body.get("success"))

        amt_ok = body.get("amount") is not None and abs(float(body.get("amount")) - 89.5) < 0.01
        cur_ok = body.get("currency") == "CHF"
        due_ok = body.get("due_date") == "2025-04-30"
        inv_ok = body.get("invoice_date") == "2025-04-15"
        iban_ok = bool(body.get("iban")) and "CH93" in (body.get("iban") or "").replace(" ", "")
        ref_ok = bool(body.get("reference")) and "2100000000" in (body.get("reference") or "").replace(" ", "")
        cat_ok = (body.get("category") or "").lower() == "telecoms"

        ok = r.status_code == 200 and success and amt_ok and cur_ok and due_ok and inv_ok and iban_ok and ref_ok and cat_ok
        detail = (
            f"status={r.status_code} success={success} title={body.get('title')!r} "
            f"issuer={body.get('issuer')!r} amount={body.get('amount')} currency={body.get('currency')} "
            f"due={body.get('due_date')} invoice={body.get('invoice_date')} "
            f"iban={body.get('iban')} ref={body.get('reference')} category={body.get('category')} | "
            f"amt_ok={amt_ok} cur_ok={cur_ok} due_ok={due_ok} inv_ok={inv_ok} "
            f"iban_ok={iban_ok} ref_ok={ref_ok} cat_ok={cat_ok}"
        )
        record("POST /api/email/parse (Swisscom invoice)", ok, detail)
    except Exception as e:
        record("POST /api/email/parse (Swisscom invoice)", False,
               f"EXCEPTION: {e}\n{traceback.format_exc()}")


# ────────────────────────────────────────────────────────────────────
# 4. POST /api/lamal/subsidy
# ────────────────────────────────────────────────────────────────────
def test_lamal_subsidy():
    # 4a. Eligible family
    try:
        payload = {
            "canton": "VD",
            "yearly_income": 55000,
            "household": "family",
            "children": 2,
            "monthly_premium": 450,
        }
        r = requests.post(f"{API}/lamal/subsidy", json=payload, timeout=30)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

        eligible = body.get("eligible") is True
        sub = body.get("estimated_monthly_subsidy", 0) or 0
        thr = body.get("threshold", 0) or 0
        final = body.get("final_premium")
        expected_final = 450 - sub

        ok = (
            r.status_code == 200
            and eligible
            and sub > 0
            and thr > 0
            and final is not None
            and abs(float(final) - expected_final) < 0.5
        )
        detail = (
            f"status={r.status_code} eligible={eligible} subsidy={sub} "
            f"threshold={thr} final={final} expected_final={expected_final}"
        )
        record("POST /api/lamal/subsidy (VD 55k family 2 kids eligible)", ok, detail)
    except Exception as e:
        record("POST /api/lamal/subsidy (VD family)", False, f"EXCEPTION: {e}")

    # 4b. High income → not eligible
    try:
        payload = {
            "canton": "VD",
            "yearly_income": 200000,
            "household": "family",
            "children": 2,
            "monthly_premium": 450,
        }
        r = requests.post(f"{API}/lamal/subsidy", json=payload, timeout=30)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        ok = (
            r.status_code == 200
            and body.get("eligible") is False
            and (body.get("estimated_monthly_subsidy") or 0) == 0
            and float(body.get("final_premium") or 0) == 450.0
        )
        record(
            "POST /api/lamal/subsidy (high income → not eligible)",
            ok,
            f"status={r.status_code} eligible={body.get('eligible')} "
            f"subsidy={body.get('estimated_monthly_subsidy')} final={body.get('final_premium')}",
        )
    except Exception as e:
        record("POST /api/lamal/subsidy (high income)", False, f"EXCEPTION: {e}")

    # 4c. All 26 cantons must not crash
    cantons = ["AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
               "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
               "TI", "UR", "VD", "VS", "ZG", "ZH"]
    failures = []
    for c in cantons:
        try:
            r = requests.post(
                f"{API}/lamal/subsidy",
                json={"canton": c, "yearly_income": 55000, "household": "family",
                      "children": 2, "monthly_premium": 450},
                timeout=15,
            )
            if r.status_code != 200:
                failures.append(f"{c}:http{r.status_code}")
                continue
            b = r.json()
            if "eligible" not in b or "threshold" not in b:
                failures.append(f"{c}:schema")
        except Exception as e:
            failures.append(f"{c}:{e}")
    record(
        f"POST /api/lamal/subsidy (all 26 cantons iteration)",
        len(failures) == 0,
        f"failures={failures}" if failures else f"All 26 cantons responded 200.",
    )


# ────────────────────────────────────────────────────────────────────
# 5. POST /api/coach/chat
# ────────────────────────────────────────────────────────────────────
def test_coach_chat():
    """The server schema uses session_id/message/financial_context."""
    try:
        payload = {
            "session_id": f"smoke_{int(time.time())}",
            "message": "Bonjour, donne-moi un conseil court pour économiser ce mois-ci.",
            "financial_context": "Revenus: CHF 6000/mois. Loyer: CHF 1800. Solde: CHF 2500.",
        }
        r = requests.post(f"{API}/coach/chat", json=payload, timeout=TIMEOUT)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        content = body.get("response") or ""
        ok = r.status_code == 200 and len(content.strip()) > 10
        record(
            "POST /api/coach/chat (smoke)",
            ok,
            f"status={r.status_code} resp_len={len(content)} preview={content[:120]!r}",
        )
    except Exception as e:
        record("POST /api/coach/chat (smoke)", False, f"EXCEPTION: {e}")


# ────────────────────────────────────────────────────────────────────
# 6. POST /api/export/pdf
# ────────────────────────────────────────────────────────────────────
def test_export_pdf():
    """Server schema: user_name, company, expenses[], mode, canton, period."""
    try:
        payload = {
            "user_name": "Marie Dupont",
            "company": "Guardian Money CHF",
            "expenses": [],
            "mode": "employee",
            "canton": "VD",
            "period": "Avril 2025",
        }
        r = requests.post(f"{API}/export/pdf", json=payload, timeout=30)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        ok = r.status_code == 200 and "html" in body and body.get("count") == 0
        record(
            "POST /api/export/pdf (empty expenses smoke)",
            ok,
            f"status={r.status_code} keys={list(body.keys())} total_ttc={body.get('total_ttc')}",
        )
    except Exception as e:
        record("POST /api/export/pdf (smoke)", False, f"EXCEPTION: {e}")


# ─── Run all ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_health()
    test_scanner_ocr()
    test_email_parse()
    test_lamal_subsidy()
    test_coach_chat()
    test_export_pdf()

    print("\n" + "=" * 70)
    passed = sum(1 for x in results if x["ok"])
    total = len(results)
    print(f"RESULTS: {passed}/{total} tests passed")
    print("=" * 70)
    for r in results:
        symbol = "✅" if r["ok"] else "❌"
        print(f"{symbol} {r['name']}")
        if not r["ok"] and r["detail"]:
            for line in r["detail"].splitlines():
                print(f"    {line}")

    # exit code
    exit(0 if passed == total else 1)
