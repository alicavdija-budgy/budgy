"""Offline regression tests for OCR media detection. No API calls or user data."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from qr_decode import detect_image_mime, select_pdf_page_indices


class OCRMediaTests(unittest.TestCase):
    def test_pdf_first_two_and_last_page_for_qr_annex(self):
        self.assertEqual(select_pdf_page_indices(7, max_pages=3), [0, 1, 6])
        self.assertEqual(select_pdf_page_indices(3, max_pages=3), [0, 1, 2])
        self.assertEqual(select_pdf_page_indices(1, max_pages=3), [0])
        self.assertEqual(select_pdf_page_indices(0, max_pages=3), [])
        self.assertEqual(select_pdf_page_indices(5, max_pages=1), [0])

    def test_pdf_renders_to_png_even_when_upload_says_pdf(self):
        self.assertEqual(detect_image_mime(b"%PDF-1.7", "application/pdf", rendered_pdf=True), "image/png")

    def test_png_magic_bytes_overrides_misleading_jpeg(self):
        self.assertEqual(detect_image_mime(b"\\x89PNG\\r\\n\\x1a\\nabcdef", "image/jpeg"), "image/png")

    def test_jpeg_magic_bytes_overrides_png_hint(self):
        self.assertEqual(detect_image_mime(b"\\xff\\xd8\\xff\\xe0abcdef", "image/png"), "image/jpeg")

    def test_webp_magic_bytes(self):
        self.assertEqual(detect_image_mime(b"RIFF1234WEBPVP8 ", "image/jpeg"), "image/webp")

    def test_unknown_and_unsupported_hint_fail_to_safe_mime(self):
        self.assertEqual(detect_image_mime(b"invalid", "application/pdf"), "image/jpeg")
        self.assertEqual(detect_image_mime(b"invalid", "text/plain"), "image/jpeg")

    def test_supported_hint_as_fallback(self):
        self.assertEqual(detect_image_mime(b"invalid", "image/png"), "image/png")


if __name__ == "__main__":
    unittest.main()
