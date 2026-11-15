"""
TÂCHE 1 — Décodage fiable des QR-factures suisses depuis photo/PDF.

Chaîne : PDF → rendu PNG (PyMuPDF) → détection du VRAI Swiss QR (OpenCV).
L'OCR vision n'est qu'une solution COMPLÉMENTAIRE quand aucun QR n'est
lisible. Le payload SPC brut est renvoyé tel quel au client, qui le parse
avec le lecteur éprouvé (qrBill.ts : index fixes, lignes vides, \n/\r\n).
Aucun montant n'est jamais inventé (jamais de 0 CHF par défaut).
"""
import base64 as _b64


def pdf_first_pages_to_png_b64(pdf_bytes: bytes, max_pages: int = 2) -> list:
    """Rend les premières pages d'un PDF en PNG base64 (zoom 3x ≈ 220 dpi)."""
    import pymupdf  # PyMuPDF
    out = []
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
        for i in range(min(max_pages, doc.page_count)):
            pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(3, 3))
            out.append(_b64.b64encode(pix.tobytes("png")).decode("ascii"))
    return out


def decode_swiss_qr_from_image_b64(img_b64: str):
    """Décode un Swiss QR (payload commençant par SPC) dans une image base64.

    Essaie plusieurs prétraitements (gris, agrandissement, seuillage) car les
    photos de factures sont rarement parfaites. Retourne le payload brut ou
    None — JAMAIS de données inventées.
    """
    import cv2
    import numpy as np
    raw = _b64.b64decode(img_b64)
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    det = cv2.QRCodeDetector()
    candidates = [img]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    candidates.append(gray)
    h, w = gray.shape[:2]
    if max(h, w) < 1600:
        candidates.append(cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
    _, thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidates.append(thr)
    for cand in candidates:
        try:
            txt, pts, _ = det.detectAndDecode(cand)
        except Exception:
            continue
        if txt and txt.strip().startswith("SPC"):
            return txt
        # multi-QR (page A4 avec plusieurs codes)
        try:
            ok, txts, _, _ = det.detectAndDecodeMulti(cand)
            if ok:
                for t in txts:
                    if t and t.strip().startswith("SPC"):
                        return t
        except Exception:
            pass
    return None
