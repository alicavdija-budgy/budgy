"""
TÂCHE 1 — Décodage fiable des QR-factures suisses depuis photo/PDF.

Chaîne : PDF → rendu PNG (PyMuPDF) → détection du VRAI Swiss QR (OpenCV).
L'OCR vision n'est qu'une solution COMPLÉMENTAIRE quand aucun QR n'est
lisible. Le payload SPC brut est renvoyé tel quel au client, qui le parse
avec le lecteur éprouvé (qrBill.ts : index fixes, lignes vides, \n/\r\n).
Aucun montant n'est jamais inventé (jamais de 0 CHF par défaut).
"""
import base64 as _b64


def detect_image_mime(header: bytes, hint: str = "image/jpeg", *, rendered_pdf: bool = False) -> str:
    """MIME for vision APIs derived from REAL file signatures.

    The iPhone may supply HEIC/photo picker metadata, but the image is
    normalized before upload. PDFs are rendered as PNG, not JPEG.
    Never send a fake JPEG type for PNG bytes to a multimodal provider.
    """
    if rendered_pdf or header.startswith(b"\\x89PNG\\r\\n\\x1a\\n"):
        return "image/png"
    if header.startswith(b"\\xff\\xd8"):
        return "image/jpeg"
    if header.startswith(b"RIFF") and b"WEBP" in header[:16]:
        return "image/webp"
    normalized = (hint or "").lower().split(";")[0].strip()
    return normalized if normalized in ("image/png", "image/jpeg", "image/webp") else "image/jpeg"


def select_pdf_page_indices(page_count: int, max_pages: int = 3) -> list[int]:
    """Priorité au début + à la dernière page (QR-facture souvent en annexe).

    Limite le nombre de rendus pour éviter des coûts mémoire excessifs.
    Pour un document de plus de 3 pages : [première, deuxième, dernière].
    """
    if page_count <= 0 or max_pages <= 0:
        return []
    indices = list(range(min(page_count, max_pages)))
    if page_count > max_pages and max_pages > 1:
        indices[-1] = page_count - 1
    return indices


def pdf_first_pages_to_png_b64(pdf_bytes: bytes, max_pages: int = 3) -> list:
    """Rend quelques pages utiles d'un PDF en PNG base64 (zoom 3x)."""
    import pymupdf  # PyMuPDF
    out = []
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
        for i in select_pdf_page_indices(doc.page_count, max_pages):
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
    # Décodeur PRINCIPAL : zxing-cpp (roue pip autonome, fiable sur les QR
    # DENSES des vraies QR-factures ~700 caractères). OpenCV reste en repli.
    try:
        import zxingcpp
        gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        for cand0 in (img, gray0, cv2.resize(gray0, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)):
            for r in zxingcpp.read_barcodes(cand0):
                if r.text and r.text.strip().startswith("SPC"):
                    return r.text
    except ImportError:
        pass
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
