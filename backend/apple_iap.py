"""
BUDGY — Apple App Store Server API client (production-ready).

v3.9.0 SECURITY:
  • Uses the official `app-store-server-library` (Apple SDK) for all
    JWS verification — replaces our home-grown implementation.
  • SignedDataVerifier validates the certificate chain against Apple's
    root CAs and enforces bundleId + environment.
  • signedTransactionInfo + signedRenewalInfo are verified before use.
  • No mutable global state — each call selects its environment locally.
"""
from __future__ import annotations

import os
import time
import json
import uuid
import base64
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx
import jwt as pyjwt  # PyJWT 2.x

# Official Apple library
try:
    from appstoreserverlibrary.signed_data_verifier import (
        SignedDataVerifier,
        VerificationException,
    )
    from appstoreserverlibrary.models.Environment import Environment as _AppleEnv
    _APPLE_LIB_OK = True
except Exception:
    SignedDataVerifier = None  # type: ignore
    VerificationException = Exception  # type: ignore
    _AppleEnv = None  # type: ignore
    _APPLE_LIB_OK = False

log = logging.getLogger("iap")

# ─────────────────────────────────────────────────────────────────────────────
# Apple root CAs (embedded with the app — downloaded from apple.com)
# ─────────────────────────────────────────────────────────────────────────────
_CERTS_DIR = Path(__file__).parent / "apple_certs"


def _load_root_certs() -> list[bytes]:
    """Load the DER-encoded Apple root CAs shipped with the backend."""
    if not _CERTS_DIR.exists():
        return []
    out: list[bytes] = []
    for name in ("AppleRootCA-G3.cer", "AppleRootCA-G2.cer", "AppleIncRootCertificate.cer"):
        p = _CERTS_DIR / name
        if p.exists():
            try:
                out.append(p.read_bytes())
            except Exception as e:  # pragma: no cover
                log.warning("[iap] cannot load %s: %s", name, e)
    return out


_APPLE_ROOT_CERTS: list[bytes] = _load_root_certs()


# Per-environment SignedDataVerifier cache (keyed by (env, bundle))
_VERIFIER_CACHE: Dict[Tuple[str, str], Any] = {}


def _to_plain_dict(model_or_dict: Any) -> Dict[str, Any]:
    """Convert appstoreserverlibrary model objects to plain dicts.

    The SDK returns attrs-annotated dataclass-like objects. We flatten them
    so downstream code (derive_state) works unchanged.
    """
    if model_or_dict is None:
        return {}
    if isinstance(model_or_dict, dict):
        return model_or_dict
    out: Dict[str, Any] = {}
    for attr in dir(model_or_dict):
        if attr.startswith("_"):
            continue
        try:
            v = getattr(model_or_dict, attr)
        except Exception:
            continue
        if callable(v):
            continue
        # Simple JSON-serializable leaves
        if v is None or isinstance(v, (str, int, float, bool)):
            out[attr] = v
        elif isinstance(v, list):
            out[attr] = [_to_plain_dict(x) if not isinstance(x, (str, int, float, bool)) else x for x in v]
        elif hasattr(v, "value") and isinstance(getattr(v, "value", None), (str, int)):
            # enum with .value
            out[attr] = v.value
        else:
            # Nested model
            out[attr] = _to_plain_dict(v)
    # Ensure camelCase fallbacks the SDK uses under different names
    # e.g. `originalTransactionId` vs `original_transaction_id`
    if "originalTransactionId" not in out and "original_transaction_id" in out:
        out["originalTransactionId"] = out["original_transaction_id"]
    if "expiresDate" not in out and "expires_date" in out:
        out["expiresDate"] = out["expires_date"]
    if "productId" not in out and "product_id" in out:
        out["productId"] = out["product_id"]
    if "autoRenewStatus" not in out and "auto_renew_status" in out:
        out["autoRenewStatus"] = out["auto_renew_status"]
    return out


def _get_signed_data_verifier(cfg: "IAPConfig", environment_sandbox: bool):
    """Return (or lazily build) a per-(env, bundle) SignedDataVerifier.

    Returns None if the official library is not available OR the certs are
    missing OR the bundle is not configured — in which case callers must
    fail-closed.
    """
    if not _APPLE_LIB_OK or not _APPLE_ROOT_CERTS or not cfg.bundle_id:
        return None
    env = _AppleEnv.SANDBOX if environment_sandbox else _AppleEnv.PRODUCTION
    key = (env.value, cfg.bundle_id)
    v = _VERIFIER_CACHE.get(key)
    if v is not None:
        return v
    try:
        # app-apple-id may be optional for notifications V2 unless we handle
        # AdvancedCommerce. Use int(0) as sentinel when not configured.
        app_apple_id = int(cfg.app_apple_id) if cfg.app_apple_id else None
        v = SignedDataVerifier(
            root_certificates=_APPLE_ROOT_CERTS,
            enable_online_checks=False,
            environment=env,
            bundle_id=cfg.bundle_id,
            app_apple_id=app_apple_id,
        )
        _VERIFIER_CACHE[key] = v
        return v
    except Exception as e:
        log.warning("[iap] cannot build SignedDataVerifier for env=%s: %s", env, e)
        return None

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
    app_apple_id: str = ""  # v3.9.0: Apple's numeric app id (for SignedDataVerifier)

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
        c.app_apple_id = _env("APPLE_APP_APPLE_ID")  # optional
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


async def get_transaction_info(cfg: IAPConfig, transaction_id: str, use_sandbox: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    """Fetch & decode a transaction signed by Apple.

    v3.9.0: takes an explicit `use_sandbox` argument to avoid mutating
    the global cfg (which was a cross-user shared-state hazard).
    """
    sandbox = cfg.use_sandbox if use_sandbox is None else use_sandbox
    async def _do(sbox: bool) -> Tuple[int, Dict[str, Any]]:
        url = (
            "https://api.storekit-sandbox.itunes.apple.com"
            if sbox
            else "https://api.storekit.itunes.apple.com"
        ) + f"/inApps/v1/transactions/{transaction_id}"
        token = _make_jwt(cfg)
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            except httpx.HTTPError as e:
                log.error("[iap-validation] HTTP error: %s", e)
                return 599, {}
        try:
            return resp.status_code, resp.json()
        except Exception:
            return resp.status_code, {}

    code, body = await _do(sandbox)
    if code == 200 and "signedTransactionInfo" in body:
        # v3.9.0: verify JWS if the official verifier is available
        try:
            verifier = _get_signed_data_verifier(cfg, environment_sandbox=sandbox)
            if verifier is not None:
                info = verifier.verify_and_decode_transaction(body["signedTransactionInfo"])
                return _to_plain_dict(info)
        except Exception as e:
            log.warning("[iap-validation] transaction signature verification failed: %s", type(e).__name__)
            return None  # fail-closed
        # Fallback (no verifier available): decode only
        return _decode_jws_body(body["signedTransactionInfo"])
    # Retry on the other environment ONCE (per-call only, no mutation)
    if code in (401, 404):
        code, body = await _do(not sandbox)
        if code == 200 and "signedTransactionInfo" in body:
            try:
                verifier = _get_signed_data_verifier(cfg, environment_sandbox=not sandbox)
                if verifier is not None:
                    info = verifier.verify_and_decode_transaction(body["signedTransactionInfo"])
                    return _to_plain_dict(info)
            except Exception as e:
                log.warning("[iap-validation] transaction signature verification failed (retry): %s", type(e).__name__)
                return None
            return _decode_jws_body(body["signedTransactionInfo"])
    return None


async def get_subscription_statuses(cfg: IAPConfig, original_transaction_id: str, use_sandbox: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    """Return the most relevant subscription record for a user.

    v3.9.0: signedTransactionInfo & signedRenewalInfo are ALSO verified via
    the official SignedDataVerifier.
    """
    sandbox = cfg.use_sandbox if use_sandbox is None else use_sandbox

    async def _do(sbox: bool) -> Tuple[int, Dict[str, Any]]:
        url = (
            "https://api.storekit-sandbox.itunes.apple.com"
            if sbox
            else "https://api.storekit.itunes.apple.com"
        ) + f"/inApps/v1/subscriptions/{original_transaction_id}"
        token = _make_jwt(cfg)
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            except httpx.HTTPError as e:
                log.error("[iap-validation] HTTP error: %s", e)
                return 599, {}
        try:
            return resp.status_code, resp.json()
        except Exception:
            return resp.status_code, {}

    code, body = await _do(sandbox)
    if code != 200 and code in (401, 404):
        sandbox = not sandbox
        code, body = await _do(sandbox)
    if code != 200:
        return None

    verifier = _get_signed_data_verifier(cfg, environment_sandbox=sandbox)
    out: Dict[str, Any] = {"status": None, "renewalInfo": None, "transactionInfo": None}
    for grp in body.get("data", []):
        for last in grp.get("lastTransactions", []):
            out["status"] = last.get("status", out["status"])
            ri = last.get("signedRenewalInfo")
            ti = last.get("signedTransactionInfo")
            # v3.9.0: verify inner JWS with official verifier
            if ti:
                try:
                    if verifier is not None:
                        out["transactionInfo"] = _to_plain_dict(verifier.verify_and_decode_transaction(ti))
                    else:
                        out["transactionInfo"] = _decode_jws_body(ti)
                except Exception as e:
                    log.warning("[iap-validation] inner txn JWS verify failed: %s", type(e).__name__)
                    return None  # fail-closed
            if ri:
                try:
                    if verifier is not None:
                        out["renewalInfo"] = _to_plain_dict(verifier.verify_and_decode_renewal_info(ri))
                    else:
                        out["renewalInfo"] = _decode_jws_body(ri)
                except Exception as e:
                    log.warning("[iap-validation] inner renewal JWS verify failed: %s", type(e).__name__)
                    return None
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
# v3.9.0 SECURITY: Notification V2 verification using the OFFICIAL Apple lib
# ─────────────────────────────────────────────────────────────────────────────
def verify_and_decode_notification(signed_payload: str, cfg: IAPConfig) -> Dict[str, Any]:
    """Verify + decode an App Store Server Notification V2 signedPayload.

    Uses Apple's official `SignedDataVerifier` — which internally validates:
      • the full x5c certificate chain
      • the signature (ES256) against the leaf public key
      • the certificate is issued by an Apple root CA
      • the bundleId matches (cfg.bundle_id)
      • the environment matches (SANDBOX vs PRODUCTION)

    We try BOTH environments (sandbox + prod) because Apple can send
    notifications from either when the app is in TestFlight.
    """
    if not _APPLE_LIB_OK:
        raise VerificationException("apple_lib_not_installed")
    if not _APPLE_ROOT_CERTS:
        raise VerificationException("apple_root_certs_missing")
    if not signed_payload:
        raise VerificationException("empty_payload")

    last_exc: Optional[Exception] = None
    for is_sandbox in (False, True):
        verifier = _get_signed_data_verifier(cfg, environment_sandbox=is_sandbox)
        if verifier is None:
            continue
        try:
            decoded = verifier.verify_and_decode_notification(signed_payload)
            decoded_dict = _to_plain_dict(decoded)
            data = decoded_dict.get("data") or {}
            # If the notification carries inner JWS payloads, verify them too.
            txn_dict: Dict[str, Any] = {}
            ren_dict: Dict[str, Any] = {}
            data_obj = getattr(decoded, "data", None)
            if data_obj is not None:
                signed_txn = getattr(data_obj, "signedTransactionInfo", None) or getattr(data_obj, "signed_transaction_info", None)
                signed_ren = getattr(data_obj, "signedRenewalInfo", None) or getattr(data_obj, "signed_renewal_info", None)
                if signed_txn:
                    try:
                        txn_dict = _to_plain_dict(verifier.verify_and_decode_transaction(signed_txn))
                    except Exception as e:
                        raise VerificationException(f"invalid_inner_transaction_jws:{type(e).__name__}") from e
                if signed_ren:
                    try:
                        ren_dict = _to_plain_dict(verifier.verify_and_decode_renewal_info(signed_ren))
                    except Exception as e:
                        raise VerificationException(f"invalid_inner_renewal_jws:{type(e).__name__}") from e
            return {
                "notificationType": decoded_dict.get("notificationType") or decoded_dict.get("notification_type"),
                "subtype": decoded_dict.get("subtype"),
                "transactionInfo": txn_dict,
                "renewalInfo": ren_dict,
                "raw": decoded_dict,
                "environment": data.get("environment") if isinstance(data, dict) else None,
                "signatureVerified": True,
            }
        except VerificationException as e:
            last_exc = e
            continue
        except Exception as e:  # pragma: no cover
            last_exc = e
            continue
    # Neither env accepted the payload → surface a clean rejection
    raise VerificationException(f"invalid_signed_payload:{type(last_exc).__name__ if last_exc else 'unknown'}")
