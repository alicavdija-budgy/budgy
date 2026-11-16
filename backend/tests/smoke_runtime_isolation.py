"""Real HTTP integration checks against an ISOLATED local Docker container.

NO external Supabase or OpenAI; tests use synthetic HS256 JWTs and only
the container's in-memory legacy family/alert endpoints.

Run exclusively in CI with:
  APP_ENV=staging SUPABASE_URL=http://127.0.0.1:9999
  SUPABASE_JWT_ALLOW_HS256_FALLBACK=1
  SUPABASE_JWT_SECRET=<fixed synthetic test value>
No real token, account, database or document is used.
"""
import os
import time
import unittest

import jwt
import requests


BASE = "http://127.0.0.1:8000"
SECRET = "budgy-offline-only-synthetic-jwt-never-production-2026"
USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"
USER_C = "33333333-3333-4333-8333-333333333333"


def token_for(sub, *, operator=False, user_metadata_operator=False):
    claims = {
        "sub": sub,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "app_metadata": {"budgy_operator": operator},
        "user_metadata": {"budgy_operator": user_metadata_operator},
    }
    return jwt.encode(claims, SECRET, algorithm="HS256")


class LocalRuntimeSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = requests.Session()
        cls.http.trust_env = False

    @classmethod
    def tearDownClass(cls):
        cls.http.close()

    def get(self, path, *, token=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return self.http.get(BASE + path, headers=headers, timeout=5)

    def post(self, path, *, token=None, body=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return self.http.post(BASE + path, headers=headers, json=body or {}, timeout=5)

    def test_public_health_has_real_identity_but_never_secrets(self):
        for path in ("/health", "/api/health"):
            r = self.get(path)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["version"], "4.0.0")
            self.assertEqual(len(r.json()["commit_sha"]), 40)
            self.assertNotIn(SECRET, r.text)

    def test_legacy_and_new_diagnostics_require_operator(self):
        normal = token_for(USER_A)
        signed_user_metadata_only = token_for(USER_A, user_metadata_operator=True)
        operator = token_for(USER_A, operator=True)
        for path in ("/api/config/readiness", "/api/config/status"):
            with self.subTest(path=path):
                self.assertEqual(self.get(path).status_code, 401)
                self.assertEqual(self.get(path, token=normal).status_code, 403)
                self.assertEqual(self.get(path, token=signed_user_metadata_only).status_code, 403)
                allowed = self.get(path, token=operator)
                self.assertEqual(allowed.status_code, 200, allowed.text[:100])
                self.assertNotIn(SECRET, allowed.text)
                self.assertNotIn("http://127.0.0.1:9999", allowed.text)
                if path.endswith("/readiness"):
                    result = allowed.json()
                    for values in result["required_by_feature"].values():
                        for state in values.values():
                            self.assertIn(state, ("defined", "missing"))

    def test_ocr_does_not_allow_unauthenticated_scan(self):
        body = {"image_base64": "%%%%", "mime_type": "image/jpeg"}
        r = self.post("/api/scanner/ocr", body=body)
        self.assertEqual(r.status_code, 401)
        # Authenticated but invalid image: rejected without any AI request.
        ok = self.post("/api/scanner/ocr", token=token_for(USER_A), body=body)
        self.assertEqual(ok.status_code, 200, ok.text[:100])
        self.assertFalse(ok.json()["success"])

    def test_family_access_follows_signed_jwt_not_body_user_id(self):
        a = token_for(USER_A)
        b = token_for(USER_B)
        c = token_for(USER_C)
        created = self.post("/api/family/create", token=a, body={
            "owner_id": USER_B,
            "owner_name": "Synthetic A",
            "family_name": "Synthetic Family",
        })
        self.assertEqual(created.status_code, 200, created.text[:100])
        family = created.json()["family"]
        self.assertEqual(family["owner_id"], USER_A)
        code = family["code"]
        self.assertEqual(self.get("/api/family/" + code, token=b).status_code, 403)
        joined = self.post("/api/family/join", token=c, body={
            "user_id": USER_B,
            "user_name": "Synthetic C",
            "code": code,
        })
        self.assertEqual(joined.status_code, 200, joined.text[:100])
        self.assertEqual(joined.json()["family"]["members"][-1]["id"], USER_C)
        self.assertEqual(self.get("/api/family/" + code, token=c).status_code, 200)

    def test_alerts_do_not_cross_account_boundaries(self):
        a = token_for(USER_A)
        b = token_for(USER_B)
        checked = self.post("/api/alerts/check-budgets", token=a, body={
            "user_id": USER_B,
            "budgets": [{"category": "test", "limit": 100}],
            "expenses": [{"category": "test", "amount": 125}],
        })
        self.assertEqual(checked.status_code, 200, checked.text[:100])
        self.assertGreaterEqual(checked.json()["count"], 1)
        self.assertEqual(self.get("/api/alerts/" + USER_A, token=b).status_code, 403)
        self.assertEqual(self.get("/api/alerts/" + USER_A, token=a).status_code, 200)
        self.assertEqual(self.get("/api/alerts/" + USER_B, token=b).json()["count"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
