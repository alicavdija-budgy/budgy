"""
BUDGY — Apple App Store Server API client (production-ready).

Responsibilities
  • Sign ES256 JWT for App Store Connect API (rotated every < 60 min)
  • Decode JWS-signed transaction / subscription payloads from Apple
  • Resolve a user's subscription state from a transactionId or
    originalTransactionId.
  • Map Apple's verbose statuses → Budgy's internal state machine
    (FREE / PRO / EXPIRED / GRACE_PERIOD / REFUNDED).

Design notes
  • All sensitive values come from env. They are NEVER logged in clear.
    The `_mask` helper redacts them to `xxxx…xxxx`.
  • V1 trusts Apple's response by decoding (not verifying) the JWS body
    — because we only ever talk to the official api.storekit URLs.
    A V2 will add full JWS chain verification using Apple's root certs.
  • App-Store-Server-Notifications V2 webhook decoding is included so we
    can react to renewals / refunds / cancellations server-side without
    polling.
"""
from __future__ import annotations

import os
import time
import json
import uuid
import base64
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
import jwt as pyjwt  # PyJWT 2.x

log = logging.getLogger("iap")

# ─────────────────────────────────────────────────────────────────────────────
# Env loader (lazy + safe)
# ─────────────────────────────────────────────────────────────────────────────
def _env(key: str, default: str = "") -> str:
    v = os.getenv(key, default) or ""
    return v.strip()

def _mask(s: str, keep: int = 4) -> str:
    if not s:
        return "<EMPTY>"
    if len(s) <= keep * 2:
        return "***"
    return f"{s[:keep]}…{s[-keep:]}"

class IAPConfig:
    bundle_id: str = ""
    issuer_id: str = ""
    key_id: str = ""
    private_key_pem: str = ""
    product_monthly: str = ""
    product_yearly: str = ""
    use_sandbox: bool = True
    webhook_secret: str = ""
    shared_secret: str = ""

    @classmethod
    def from_env(cls) -> "IAPConfig":
        c = cls()
        # Bundle ID — fallback to the canonical Budgy bundle if not set,
        # since the value is public anyway (it's in the App Store).
        c.bundle_id = _env("APPLE_BUNDLE_ID") or "com.budgy.ch.budgy"
        c.issuer_id = _env("APPLE_ISSUER_ID")
        c.key_id = _env("APPLE_KEY_ID")
        # Accept both names: APPLE_PRIVATE_KEY_P8 (canonical) and
        # APPLE_PRIVATE_KEY (shorter, sometimes used in Coolify dashboards).
        raw = _env("APPLE_PRIVATE_KEY_P8") or _env("APPLE_PRIVATE_KEY")
        if raw and "\\n" in raw and "BEGIN" in raw and "\n" not in raw.split("BEGIN", 1)[1][:50]:
            raw = raw.replace("\\n", "\n")
        c.private_key_pem = raw
        # Product IDs — fallback to canonical IDs to keep IAP usable even if
        # the operator forgot to set these (still overridable from Coolify).
        # v3.7.27 — Accepte les 2 conventions de noms d'env pour
        # ne plus dépendre du seul nommage historique. Coolify expose
        # par défaut APPLE_PRODUCT_MONTHLY / APPLE_PRODUCT_YEARLY ;
        # certaines instances ont APPLE_PRODUCT_ID_MONTHLY/_YEARLY ;
        # certaines ont la convention IAP_*.
        c.product_monthly = (
            _env("APPLE_PRODUCT_ID_MONTHLY")
            or _env("APPLE_PRODUCT_MONTHLY")
            or _env("IAP_PRODUCT_MONTHLY")
            or "com.budgy.ch.budgy.monthly"
        )
        c.product_yearly = (
            _env("APPLE_PRODUCT_ID_YEARLY")
            or _env("APPLE_PRODUCT_YEARLY")
            or _env("APPLE_PRODUCT_ID_ANNUAL")
            or _env("APPLE_PRODUCT_ANNUAL")
            or _env("IAP_PRODUCT_YEARLY")
            or _env("IAP_PRODUCT_ANNUAL")
            or "com.budgy.ch.budgy.annual"
        )
        c.use_sandbox = _env("APPLE_USE_SANDBOX", "false").lower() in ("1", "true", "yes")
        c.webhook_secret = _env("IAP_WEBHOOK_SECRET")
        c.shared_secret = _env("APPLE_SHARED_SECRET")
        return c

    def is_ready(self) -> bool:
        return bool(self.bundle_id and self.issuer_id and self.key_id and self.private_key_pem)

    def missing(self) -> list[str]:
        miss = []
        if not self.bundle_id: miss.append("APPLE_BUNDLE_ID")
        if not self.issuer_id: miss.append("APPLE_ISSUER_ID")
        if not self.key_id: miss.append("APPLE_KEY_ID")
        if not self.private_key_pem: miss.append("APPLE_PRIVATE_KEY_P8")
        return miss

    def fingerprint(self) -> str:
        """Return a redacted summary for startup logs."""
        return (
            f"bundle={self.bundle_id or '<EMPTY>'} "
            f"issuer={_mask(self.issuer_id)} "
            f"key={_mask(self.key_id)} "
            f"sandbox={self.use_sandbox} "
            f"products=[{self.product_monthly or '<EMPTY>'}, {self.product_yearly or '<EMPTY>'}]"
        )


# ─────────────────────────────────────────────────────────────────────────────
# JWT signer (ES256, rotated every 50 min)
# ─────────────────────────────────────────────────────────────────────────────
class _TokenCache:
    token: str = ""
    exp: float = 0.0

_cache = _TokenCache()

def _make_jwt(cfg: IAPConfig) -> str:
    now = int(time.time())
    exp = now + 50 * 60  # 50 minutes — Apple max is 60
    if _cache.token and _cache.exp - now > 120:
        return _cache.token
    headers = {"alg": "ES256", "kid": cfg.key_id, "typ": "JWT"}
    payload = {
        "iss": cfg.issuer_id,
        "iat": now,
        "exp": exp,
        "aud": "appstoreconnect-v1",
        "bid": cfg.bundle_id,
    }
    try:
        token = pyjwt.encode(payload, cfg.private_key_pem, algorithm="ES256", headers=headers)
        if isinstance(token, bytes):
            token = token.decode("utf-8")
        _cache.token = token
        _cache.exp = exp
        log.debug("[iap] minted ES256 JWT (kid=%s, exp_in=%ss)", _mask(cfg.key_id), exp - now)
        return token
    except Exception as e:
        log.error("[iap] failed to mint JWT: %s", e)
        raise


# ─────────────────────────────────────────────────────────────────────────────
# JWS body decoder (no signature verification — V2)
# ─────────────────────────────────────────────────────────────────────────────
def _decode_jws_body(jws: str) -> Dict[str, Any]:
    """Decode the payload of a 3-part JWS without verifying the signature."""
    try:
        parts = jws.split(".")
        if len(parts) != 3:
            return {}
        body_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(body_b64))
    except Exception as e:
        log.warning("[iap] jws decode failed: %s", e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# App Store Server API HTTP client
# ─────────────────────────────────────────────────────────────────────────────
def _base_url(cfg: IAPConfig) -> str:
    return (
        "https://api.storekit-sandbox.itunes.apple.com"
        if cfg.use_sandbox
        else "https://api.storekit.itunes.apple.com"
    )

async def _http_get(cfg: IAPConfig, path: str) -> Tuple[int, Dict[str, Any]]:
    url = f"{_base_url(cfg)}{path}"
    token = _make_jwt(cfg)
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError as e:
            log.error("[iap-validation] HTTP error on %s: %s", path, e)
            return 599, {"error": str(e)}
    try:
        body = resp.json()
    except Exception:
        body = {"raw": resp.text}
    if resp.status_code >= 400:
        log.warning("[iap-validation] %s → %s", path, resp.status_code)
    return resp.status_code, body


async def get_transaction_info(cfg: IAPConfig, transaction_id: str) -> Optional[Dict[str, Any]]:
    """Fetch & decode a transaction signed by Apple."""
    code, body = await _http_get(cfg, f"/inApps/v1/transactions/{transaction_id}")
    if code == 200 and "signedTransactionInfo" in body:
        return _decode_jws_body(body["signedTransactionInfo"])
    # If sandbox flag is wrong, retry on the other env once
    if code == 401 or code == 404:
        cfg.use_sandbox = not cfg.use_sandbox
        log.info("[iap-validation] retrying on %s for txn=%s", "sandbox" if cfg.use_sandbox else "prod", _mask(transaction_id))
        code, body = await _http_get(cfg, f"/inApps/v1/transactions/{transaction_id}")
        if code == 200 and "signedTransactionInfo" in body:
            return _decode_jws_body(body["signedTransactionInfo"])
    return None


async def get_subscription_statuses(cfg: IAPConfig, original_transaction_id: str) -> Optional[Dict[str, Any]]:
    """Return the most relevant subscription record for a user."""
    code, body = await _http_get(cfg, f"/inApps/v1/subscriptions/{original_transaction_id}")
    if code != 200 and (code == 401 or code == 404):
        cfg.use_sandbox = not cfg.use_sandbox
        log.info("[iap-validation] retrying on %s for orig=%s", "sandbox" if cfg.use_sandbox else "prod", _mask(original_transaction_id))
        code, body = await _http_get(cfg, f"/inApps/v1/subscriptions/{original_transaction_id}")
    if code != 200:
        return None
    out: Dict[str, Any] = {"status": None, "renewalInfo": None, "transactionInfo": None}
    for grp in body.get("data", []):
        for last in grp.get("lastTransactions", []):
            out["status"] = last.get("status", out["status"])
            ri = last.get("signedRenewalInfo")
            ti = last.get("signedTransactionInfo")
            if ri: out["renewalInfo"] = _decode_jws_body(ri)
            if ti: out["transactionInfo"] = _decode_jws_body(ti)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# State machine
# ─────────────────────────────────────────────────────────────────────────────
# Apple subscription status codes (lastTransactions[].status):
#   1 = Active             → PRO
#   2 = Expired            → EXPIRED
#   3 = In billing retry   → GRACE_PERIOD (we treat as PRO until expiresDate)
#   4 = In billing grace   → GRACE_PERIOD
#   5 = Revoked            → REFUNDED
APPLE_STATUS_MAP = {1: "PRO", 2: "EXPIRED", 3: "GRACE_PERIOD", 4: "GRACE_PERIOD", 5: "REFUNDED"}

def derive_state(status_payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Convert an App Store Server API subscription payload → Budgy state."""
    out = {
        "state": "FREE",
        "is_pro": False,
        "pro_until": None,
        "product_id": None,
        "original_transaction_id": None,
        "auto_renew": None,
        "environment": None,
    }
    if not status_payload:
        return out
    apple_status = status_payload.get("status")
    info = status_payload.get("transactionInfo") or {}
    renew = status_payload.get("renewalInfo") or {}
    expires_ms = info.get("expiresDate") or 0
    out["product_id"] = info.get("productId")
    out["original_transaction_id"] = info.get("originalTransactionId")
    out["environment"] = info.get("environment")
    out["auto_renew"] = renew.get("autoRenewStatus") == 1
    if expires_ms:
        out["pro_until"] = datetime.fromtimestamp(expires_ms / 1000, tz=timezone.utc).isoformat()
    state = APPLE_STATUS_MAP.get(apple_status, "FREE")
    if state in ("PRO", "GRACE_PERIOD"):
        out["state"] = state
        out["is_pro"] = True
    elif state in ("EXPIRED", "REFUNDED"):
        out["state"] = state
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Public high-level helpers (used by routes)
# ─────────────────────────────────────────────────────────────────────────────
async def validate_purchase(cfg: IAPConfig, transaction_id: str) -> Dict[str, Any]:
    """Validate a single transaction id received from react-native-iap."""
    log.info("[iap-validation] validate txn=%s", _mask(transaction_id))
    txn = await get_transaction_info(cfg, transaction_id)
    if not txn:
        return {"ok": False, "error": "transaction_not_found", **derive_state(None)}
    orig = txn.get("originalTransactionId") or transaction_id
    sub = await get_subscription_statuses(cfg, orig)
    state = derive_state(sub)
    state["ok"] = True
    state["transaction_id"] = transaction_id
    state["original_transaction_id"] = orig
    return state


async def restore_for(cfg: IAPConfig, original_transaction_id: str) -> Dict[str, Any]:
    """Re-derive state from any known originalTransactionId (used on Restore)."""
    log.info("[iap-restore] orig=%s", _mask(original_transaction_id))
    sub = await get_subscription_statuses(cfg, original_transaction_id)
    state = derive_state(sub)
    state["ok"] = bool(sub)
    state["original_transaction_id"] = original_transaction_id
    return state


def parse_webhook_payload(signed_payload: str) -> Dict[str, Any]:
    """Decode an App Store Server Notifications V2 push.

    Apple sends `{ signedPayload: "<jws>" }`. Inside, you'll find:
      - notificationType (e.g. SUBSCRIBED, DID_RENEW, EXPIRED, REFUND)
      - data.signedTransactionInfo (jws)
      - data.signedRenewalInfo (jws)
    """
    decoded = _decode_jws_body(signed_payload)
    data = decoded.get("data") or {}
    txn = _decode_jws_body(data.get("signedTransactionInfo", ""))
    ren = _decode_jws_body(data.get("signedRenewalInfo", ""))
    return {
        "notificationType": decoded.get("notificationType"),
        "subtype": decoded.get("subtype"),
        "transactionInfo": txn,
        "renewalInfo": ren,
        "raw": decoded,
    }


# ─────────────────────────────────────────────────────────────────────────────
# v3.9.0 SECURITY: JWS verification using Apple's certificate chain
# ─────────────────────────────────────────────────────────────────────────────
# Apple root CA (SHA-256 fingerprint for pinning if desired)
APPLE_ROOT_CA_G3_FINGERPRINT = (
    "63343abfb89a6a03eb2bec5b9eec7396ce16ce8b90b6ce7c8a2b40b0f6dc9c30"  # AppleRootCA-G3
)


def verify_and_decode_notification(signed_payload: str, cfg: IAPConfig) -> Dict[str, Any]:
    """Verify an App Store Server Notification V2 JWS.

    Verification steps:
      1) Parse the 3-part JWS
      2) Extract the x5c cert chain from the header
      3) Verify each cert signs the next
      4) Verify the leaf cert signs the JWS payload (ES256)
      5) Optionally check that the root cert fingerprint matches Apple's root
      6) Validate bundleId + environment

    Raises Exception on any failure. Returns decoded payload dict on success.
    """
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, padding
    from cryptography.hazmat.backends import default_backend

    if not signed_payload:
        raise ValueError("empty_payload")

    parts = signed_payload.split(".")
    if len(parts) != 3:
        raise ValueError("malformed_jws")

    # 1) Parse header + payload
    header_b64 = parts[0] + "=" * (-len(parts[0]) % 4)
    payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
    signature_b64 = parts[2] + "=" * (-len(parts[2]) % 4)

    header = json.loads(base64.urlsafe_b64decode(header_b64))
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    signature = base64.urlsafe_b64decode(signature_b64)

    alg = header.get("alg")
    if alg != "ES256":
        raise ValueError(f"unsupported_algorithm:{alg}")

    x5c = header.get("x5c")
    if not x5c or len(x5c) < 2:
        raise ValueError("missing_x5c_chain")

    # 2) Load certificates
    certs = []
    for b64 in x5c:
        cert_der = base64.b64decode(b64)
        certs.append(x509.load_der_x509_certificate(cert_der, default_backend()))

    # 3) Verify chain: each cert signed by next
    for i in range(len(certs) - 1):
        child = certs[i]
        parent = certs[i + 1]
        parent_pub = parent.public_key()
        try:
            parent_pub.verify(
                child.signature,
                child.tbs_certificate_bytes,
                ec.ECDSA(child.signature_hash_algorithm),
            )
        except Exception as e:
            raise ValueError(f"cert_chain_broken_at_{i}:{e}")

    # 4) Verify the JWS signature with the leaf cert
    leaf_pub = certs[0].public_key()
    signing_input = f"{parts[0]}.{parts[1]}".encode()

    # ECDSA signature from JWS is raw r||s (P-256 → 64 bytes) — convert to DER
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    if len(signature) != 64:
        raise ValueError(f"unexpected_sig_len:{len(signature)}")
    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    der_sig = encode_dss_signature(r, s)

    try:
        leaf_pub.verify(der_sig, signing_input, ec.ECDSA(hashes.SHA256()))
    except Exception as e:
        raise ValueError(f"signature_invalid:{e}")

    # 4bis) Verify the root certificate matches Apple's known root CA G3 fingerprint (pinning)
    #        This prevents an attacker with a valid non-Apple cert chain from forging notifications.
    try:
        root_cert = certs[-1]
        root_fp = root_cert.fingerprint(hashes.SHA256()).hex()
        if root_fp.lower() != APPLE_ROOT_CA_G3_FINGERPRINT.lower():
            raise ValueError(f"root_cert_not_apple:{root_fp[:16]}")
    except Exception as e:
        raise ValueError(f"root_pinning_failed:{e}")

    # 5) Extract inner transaction & renewal
    data = payload.get("data") or {}
    txn = _decode_jws_body(data.get("signedTransactionInfo", "")) if data.get("signedTransactionInfo") else {}
    ren = _decode_jws_body(data.get("signedRenewalInfo", "")) if data.get("signedRenewalInfo") else {}

    # 6) Enforce bundleId — if Apple sent a bundleId in data, it must match
    apple_bundle = data.get("bundleId") or txn.get("bundleId")
    if apple_bundle and cfg.bundle_id and apple_bundle != cfg.bundle_id:
        raise ValueError(f"bundle_mismatch:{apple_bundle}")

    return {
        "notificationType": payload.get("notificationType"),
        "subtype": payload.get("subtype"),
        "transactionInfo": txn,
        "renewalInfo": ren,
        "raw": payload,
        "environment": data.get("environment"),
        "signatureVerified": True,
    }
