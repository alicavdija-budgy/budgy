"""Private, deterministic document preview regression tests.

No user document or real bank details are included in repository fixtures.
"""
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pdf_preview import parse_pdf_text_preview, extract_pdf_preview


class PdfDocumentPreviewTests(unittest.TestCase):
    def test_swiss_invoice_text_layer_multiline(self):
        text = (
            "Exemple Pneus SA\nFacture N° 999 / 345\n"
            "Désignation\nGardiennage pneus\n"
            "Total facturé CHF\n68.00\n"
            "Compte / Payable à\nExemple Pneus SA\n"
            "Paiement à 30 jours\n"
        )
        p = parse_pdf_text_preview(text)
        self.assertEqual(p["document_type"], "invoice")
        self.assertEqual(p["total_amount"], 68.00)
        self.assertEqual(p["merchant"], "Exemple Pneus SA")
        self.assertTrue(p["needs_user_confirmation"])
        self.assertLess(p["confidence"], 0.7)
        self.assertNotIn("iban", p)
        self.assertNotIn("reference", p)

    def test_contract_without_amount_is_still_recognized(self):
        p = parse_pdf_text_preview(
            "Contrat de location\nCe contrat est signé entre deux parties.\n"
            "Durée: 12 mois\n"
        )
        self.assertEqual(p["document_type"], "contract")
        self.assertIsNone(p["total_amount"])
        self.assertTrue(p["needs_user_confirmation"])

    def test_ambiguous_document_is_not_autoclassified(self):
        p = parse_pdf_text_preview("Facture finale annexée au contrat de bail")
        self.assertEqual(p, {})

    def test_no_invented_total_from_unrelated_numbers(self):
        p = parse_pdf_text_preview("Facture N° 12345\nTVA 8.1%\nRue 120")
        self.assertEqual(p["document_type"], "invoice")
        self.assertIsNone(p["total_amount"])

    def test_never_interpret_iban_as_vendor(self):
        p = parse_pdf_text_preview("Facture\nCompte / Payable à\nCH0000000000000000000\nTotal TTC 25.00")
        self.assertIsNone(p["merchant"])
        self.assertEqual(p["total_amount"], 25.00)

    def test_real_pdf_roundtrip_with_synthetic_data(self):
        try:
            import pymupdf
        except ImportError:
            self.skipTest("PyMuPDF is installed in the production Docker image")
        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text((45, 45), "FACTURE", fontsize=14)
        page.insert_text((45, 82), "Total facture CHF 68.00", fontsize=11)
        pdf = doc.tobytes()
        doc.close()
        p = extract_pdf_preview(pdf)
        self.assertEqual(p["document_type"], "invoice")
        self.assertEqual(p["total_amount"], 68.00)


if __name__ == "__main__":
    unittest.main()
