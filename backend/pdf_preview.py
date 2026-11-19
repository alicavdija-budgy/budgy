"""Deterministic, offline extraction of PDF invoice/contract PREVIEW fields.

Only a user-selected document that already reached /api/scanner/ocr is read.
No text is logged, sent to an external LLM, or stored by this function.
Amounts are hints that ALWAYS require explicit user review. No IBAN/reference
or payment instruction is extracted here: only verified SPC can supply those.
"""
from __future__ import annotations

import re
from typing import Optional

MONEY = r"([0-9]{1,3}(?:[ '\u2019\u00a0\u202f][0-9]{3})*(?:[.,][0-9]{2})|[0-9]{1,9}[.,][0-9]{2})"
AMOUNT_PATTERNS = [
    re.compile(r"(?:total\s+factur[ée]|total\s+[àa]\s+payer|montant\s+d[ûu]|"
               r"solde\s+d[ûu]|betrag\s+f[äa]llig|total\s+ttc|amount\s+due)"
               r"\s*(?:CHF|EUR)?\s*" + MONEY, re.IGNORECASE),
    re.compile(r"(?:CHF|EUR)\s*" + MONEY + r"\s*(?:total|due)", re.IGNORECASE),
]
INVOICE_WORDS = re.compile(r"\b(facture|rechnung|invoice|zahlungsfrist|solde\s+d[ûu]|"
                           r"total\s+factur[ée])\b", re.IGNORECASE)
CONTRACT_WORDS = re.compile(r"\b(contrat|vertrag|police\s+d['’]assurance|"
                            r"versicherungs\s*police|leasingvertrag|mietvertrag)\b", re.IGNORECASE)
PAYEE = re.compile(
    r"(?:Compte\s*/?\s*Payable\s+[àa]|payable\s+to|Kontoinhaber)"
    r"\s*\n?\s*([^\n]{3,90})", re.IGNORECASE
)


def parse_pdf_text_preview(text: str) -> dict:
    """Parse text without hallucinating a payee/total or allowing auto payment.

    Invoice and contract signals must be distinctive; ambiguous documents
    return 'unknown' so the user chooses the destination.
    """
    if not isinstance(text, str) or not text.strip():
        return {}
    text = text[:45000]
    invoice = bool(INVOICE_WORDS.search(text))
    contract = bool(CONTRACT_WORDS.search(text))
    if invoice == contract:
        return {}
    doc_type = "invoice" if invoice else "contract"

    amount: Optional[float] = None
    for pattern in AMOUNT_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        raw = re.sub(r"[ '\u2019\u00a0\u202f]", "", m.group(1)).replace(",", ".")
        try:
            value = float(raw)
            if 0 < value <= 999_999_999.99:
                amount = round(value, 2)
                break
        except ValueError:
            continue

    payee_match = PAYEE.search(text)
    merchant = payee_match.group(1).strip() if payee_match else None
    # Safe heuristic: printable, single line, no financial account identifier.
    if merchant and (len(merchant) > 70 or re.search(r"\b(?:CH|LI)[0-9]{19}\b", merchant)):
        merchant = None
    return {
        "document_type": doc_type,
        "merchant": merchant,
        "total_amount": amount,
        "currency": "CHF" if "CHF" in text else ("EUR" if "EUR" in text else None),
        "confidence": 0.55,
        "needs_user_confirmation": True,
    }


def extract_pdf_preview(pdf_bytes: bytes, *, max_pages: int = 3) -> dict:
    """Bounded PDF text layer read, never OCR of personal data by third party."""
    try:
        import pymupdf
        with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
            n = doc.page_count
            if n <= 0:
                return {}
            pages = list(range(min(max_pages, n)))
            if n > max_pages and max_pages > 1:
                pages[-1] = n - 1
            text = "\n".join(doc[p].get_text("text", sort=True) for p in pages)
            return parse_pdf_text_preview(text)
    except Exception:
        return {}
