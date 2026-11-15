"""Offline source-derived FastAPI OpenAPI regression test.

Extracts the REAL OCRResponse Pydantic class and OCR endpoint decorator
from backend/server.py, then renders an OpenAPI schema with FastAPI.
It does NOT import the production server (avoids starting the entire stack).
Tests the actual source model, not a mock field list, without API keys.
"""
import ast
import sys
import unittest
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

BACKEND = Path(__file__).resolve().parents[1]


def source_ocr_model_and_route():
    source = (BACKEND / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    cls = next(
        (n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "OCRResponse"),
        None,
    )
    if cls is None:
        raise AssertionError("Missing real OCRResponse model in server.py")
    fn = next(
        (n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "scanner_ocr"),
        None,
    )
    if fn is None:
        raise AssertionError("Missing scanner_ocr handler")
    expected_decorator = False
    for d in fn.decorator_list:
        if not isinstance(d, ast.Call) or not isinstance(d.func, ast.Attribute):
            continue
        if not isinstance(d.func.value, ast.Name) or d.func.value.id != "app" or d.func.attr != "post":
            continue
        url = d.args[0].value if d.args and isinstance(d.args[0], ast.Constant) else ""
        response = next((kw.value for kw in d.keywords if kw.arg == "response_model"), None)
        if (url == "/api/scanner/ocr" and isinstance(response, ast.Name)
                and response.id == "OCRResponse"):
            expected_decorator = True
            break
    if not expected_decorator:
        raise AssertionError("/api/scanner/ocr must declare response_model=OCRResponse")

    # Compile the actual class AST, with just its type dependencies.
    # Avoid importing server.py and its HTTP/LLM/Supabase side effects.
    module = ast.Module(body=[cls], type_ignores=[])
    namespace = {"BaseModel": BaseModel, "Optional": Optional}
    exec(compile(module, str(BACKEND / "server.py"), "exec"), namespace)
    return namespace["OCRResponse"]


class OpenAPIContractTests(unittest.TestCase):
    def test_real_ocr_response_fields_appear_in_openapi(self):
        OCRResponse = source_ocr_model_and_route()
        isolated_app = FastAPI(title="Budgy OCR response contract check")

        @isolated_app.post("/api/scanner/ocr", response_model=OCRResponse)
        async def source_model_adapter():
            return OCRResponse(success=False)

        generated = isolated_app.openapi()
        self.assertIn("/api/scanner/ocr", generated["paths"])
        props = generated["components"]["schemas"]["OCRResponse"]["properties"]
        for name in (
            "success", "document_type", "swiss_qr_content",
            "needs_user_confirmation", "total_amount",
        ):
            with self.subTest(field=name):
                self.assertIn(name, props)
        self.assertEqual(props["swiss_qr_content"].get("default"), None)


if __name__ == "__main__":
    unittest.main()
