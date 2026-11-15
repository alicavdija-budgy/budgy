#!/usr/bin/env python3
"""TÂCHE 1 — Tests d'EXÉCUTION réelle du décodage Swiss QR (pas de simple
présence de code). Fixture conforme SIX : IBAN CH valide, référence QRR,
payloads LF et CRLF, PNG, PDF mono/multi-pages, QR sans montant, QR invalide.
Usage : python3 tests/test_qr_decode.py
"""
import base64
import io
import sys

sys.path.insert(0, '..')
sys.path.insert(0, '.')
import qr_decode  # noqa: E402
import qrcode  # noqa: E402
import pymupdf  # noqa: E402

PASSED = 0
FAILED = 0

def ok(name, cond):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  \u2705 {name}")
    else:
        FAILED += 1
        print(f"  \u274c {name}")

def qr_png_b64(payload: str) -> str:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

def pdf_with_qr_b64(payload: str, qr_page: int = 0, pages: int = 1) -> bytes:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    doc = pymupdf.open()
    for i in range(pages):
        page = doc.new_page(width=595, height=842)
        if i == qr_page:
            page.insert_image(pymupdf.Rect(60, 420, 300, 660), stream=buf.getvalue())
    return doc.tobytes()

FIELDS = ['SPC', '0200', '1', 'CH5800791123000889012', 'S', 'Robert Schneider AG',
          'Rue du Lac', '1268', '2501', 'Biel', 'CH', '', '', '', '', '', '', '',
          '123.45', 'CHF', 'S', 'Pia-Maria Rutschmann-Schnyder', 'Grosse Marktgasse',
          '28', '9400', 'Rorschach', 'CH', 'QRR', '210000000003139471430009017',
          'Instruction 123', 'EPD']
CRLF = '\r\n'.join(FIELDS) + '\r\n'
LF = '\n'.join(FIELDS) + '\n'
NO_AMOUNT = list(FIELDS); NO_AMOUNT[18] = ''
NO_AMOUNT_P = '\r\n'.join(NO_AMOUNT) + '\r\n'

print('— Décodage Swiss QR : EXÉCUTION réelle —')
out = qr_decode.decode_swiss_qr_from_image_b64(qr_png_b64(CRLF))
ok('PNG CRLF : payload SPC décodé IDENTIQUE (\\r\\n et lignes vides intacts)', out == CRLF)
ok('PNG CRLF : montant 123.45 à l\'index 18', out is not None and out.split('\r\n')[18] == '123.45')
out_lf = qr_decode.decode_swiss_qr_from_image_b64(qr_png_b64(LF))
ok('PNG LF : payload décodé identique (séparateur \\n préservé)', out_lf == LF)
out_na = qr_decode.decode_swiss_qr_from_image_b64(qr_png_b64(NO_AMOUNT_P))
ok('QR sans montant : champ 18 VIDE restitué tel quel (jamais 0 inventé)', out_na is not None and out_na.split('\r\n')[18] == '')

pdf1 = pdf_with_qr_b64(CRLF)
pages = qr_decode.pdf_first_pages_to_png_b64(pdf1)
ok('PDF 1 page rendu en PNG', len(pages) == 1)
ok('PDF → PNG → QR : même payload que la photo', qr_decode.decode_swiss_qr_from_image_b64(pages[0]) == CRLF)

pdf2 = pdf_with_qr_b64(CRLF, qr_page=1, pages=3)
pages2 = qr_decode.pdf_first_pages_to_png_b64(pdf2, max_pages=2)
found = None
for p in pages2:
    found = found or qr_decode.decode_swiss_qr_from_image_b64(p)
ok('PDF multi-pages (QR en page 2) : décodé via la boucle de pages', found == CRLF)

ok('QR non suisse (payload quelconque) : None, jamais un faux succès',
   qr_decode.decode_swiss_qr_from_image_b64(qr_png_b64('https://example.com')) is None)
ok('image corrompue : None (pas d\'exception)',
   qr_decode.decode_swiss_qr_from_image_b64(base64.b64encode(b'notanimage' * 20).decode()) is None)
try:
    qr_decode.pdf_first_pages_to_png_b64(b'%PDF-broken')
    ok('PDF corrompu : erreur explicite', False)
except Exception:
    ok('PDF corrompu : erreur explicite (géré en PDF_RENDER_FAILED côté API)', True)

print(f"\nRésultat : {PASSED} réussis, {FAILED} échoués")
sys.exit(1 if FAILED else 0)
