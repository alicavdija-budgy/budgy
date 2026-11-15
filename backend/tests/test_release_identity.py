"""Offline tests: exact release identity, safe env presence, Docker contract.

No database, HTTP, credentials, migration, deployment or Docker build.
"""
import ast
import os
import re
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from config_readiness import ENV_REQUIREMENTS, readiness_report  # noqa: E402
from release_identity import APP_VERSION, deployed_git_sha  # noqa: E402


class ReleaseIdentityTests(unittest.TestCase):
    def test_version_never_uses_stale_coolify_app_version(self):
        with patch.dict(os.environ, {"APP_VERSION": "3.7.29"}):
            self.assertEqual(APP_VERSION, "4.0.0")

    def test_commit_sha_requires_full_40_hex_characters(self):
        with patch.dict(os.environ, {"BUDGY_GIT_SHA": "a" * 40}):
            self.assertEqual(deployed_git_sha(), "a" * 40)
        for invalid in ("", "HEAD", "unknown", "abc1234", "x" * 40):
            with patch.dict(os.environ, {"BUDGY_GIT_SHA": invalid}):
                self.assertEqual(deployed_git_sha(), "unknown")

    def test_no_secret_values_in_presence_diagnostics(self):
        marker = "fake-SECRET-do-not-print"
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": marker,
            "SUPABASE_URL": "https://supabase.budgy.ch",
            "SUPABASE_SERVICE_ROLE_KEY": marker,
            "APPLE_PRIVATE_KEY_P8": marker,
        }):
            report = readiness_report()
            self.assertEqual(report["required_by_feature"]["ai_ocr"]["OPENAI_API_KEY"], "defined")
            self.assertEqual(report["required_by_feature"]["subscription_storage"]["SUPABASE_SERVICE_ROLE_KEY"], "defined")
            self.assertEqual(report["required_by_feature"]["apple_iap"]["APPLE_PRIVATE_KEY_P8"], "defined")
            self.assertNotIn(marker, repr(report))
            self.assertNotIn("https://supabase.budgy.ch", repr(report))
        for group in report["required_by_feature"].values():
            for status in group.values():
                self.assertIn(status, ("defined", "missing"))
        for status in report["optional"].values():
            self.assertIn(status, ("defined", "missing"))

    def test_readiness_groups_cover_production_features(self):
        self.assertEqual(
            set(ENV_REQUIREMENTS),
            {"core", "ai_ocr", "subscription_storage", "apple_iap"},
        )
        self.assertIn("APPLE_ISSUER_ID", ENV_REQUIREMENTS["apple_iap"])
        self.assertIn("SUPABASE_URL", ENV_REQUIREMENTS["core"])

    def test_server_has_two_versioned_health_routes_and_protected_status(self):
        source = (BACKEND / "server.py").read_text()
        tree = ast.parse(source)
        endpoints = {n.name: n for n in tree.body if isinstance(n, ast.AsyncFunctionDef)}
        self.assertIn('health_root', endpoints)
        self.assertIn('health_check', endpoints)
        self.assertIn('config_readiness', endpoints)
        for name in ('health_root', 'health_check'):
            body = ast.get_source_segment(source, endpoints[name])
            self.assertIn('deployed_git_sha()', body)
            self.assertIn('APP_VERSION', body)
        readiness = endpoints['config_readiness']
        self.assertTrue(any(
            isinstance(d, ast.Call)
            and isinstance(d.func, ast.Name)
            and d.func.id == 'Depends'
            and any(isinstance(a, ast.Name) and a.id == 'require_user' for a in d.args)
            for d in readiness.args.defaults
        ), 'Readiness endpoint must require verified Supabase JWT')
        self.assertIn('from release_identity import APP_VERSION', source)
        self.assertNotIn('APP_VERSION = os.getenv(', source)

    def test_dockerfile_documented_8000_and_optional_build_arg(self):
        docker = (BACKEND / "Dockerfile").read_text()
        for piece in (
            'FROM python:3.11-slim AS runtime',
            'COPY --chown=budgy:budgy . /app',
            'ARG BUDGY_GIT_SHA=unknown',
            'ENV BUDGY_GIT_SHA=',
            'USER budgy',
            'EXPOSE 8000',
            'curl -fsS "http://127.0.0.1:${PORT}/health"',
            'uvicorn server:app',
        ):
            self.assertIn(piece, docker)
        self.assertIn('PORT=8000', docker)


if __name__ == '__main__':
    unittest.main()
