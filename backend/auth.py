"""Budgy — Supabase JWT verification with JWKS (production-grade) + HS256
legacy fallback (v3.9.0 Security Release).

DESIGN
======
The JWT is verified in this order:

1) **JWKS (preferred)** — fetch `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
   pick the key matching the token's `kid`, and verify with ES256/RS256/EdDSA.
   Keys are cached in memory with a TTL and refreshed on `kid` miss.

2) **HS256 legacy fallback** — ONLY if
   `SUPABASE_JWT_ALLOW_HS256_FALLBACK=1` is set in the env AND
   `SUPABASE_JWT_SECRET` is configured. This is meant as a transitional
   mechanism while a self-hosted Supabase instance has not yet enabled
   asymmetric signing keys. Explicit opt-in, fail-closed by default.

SECURITY
========
- Rejects `alg=none` (explicit allow-list of algorithms).
- Rejects unknown `kid`.
- Rejects tokens without `exp` or `sub`.
- Validates `aud` (default: `authenticated`) and optionally `iss`.
- Constant-time comparisons handled by PyJWT internally.
- Never logs the token, secret, or JWKS bytes.
"""

from __future__ import annotations

import os
import time
import json
import logging
import threading
from typing import Any, Dict, List, Optional, Tuple

import httpx
import jwt  # PyJWT
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

log = logging.getLogger("budgy.auth")

# ─── Config ─────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/") or "https://supabase.budgy.ch"
SUPABASE_JWT_AUD = os.getenv("SUPABASE_JWT_AUD", "authenticated") or None
SUPABASE_JWT_ISS = os.getenv("SUPABASE_JWT_ISS", "").strip() or None
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()
SUPABASE_JWT_ALLOW_HS256_FALLBACK = os.getenv("SUPABASE_JWT_ALLOW_HS256_FALLBACK", "0").strip() in (
    "1", "true", "yes", "on"
)

# Algorithms we accept for asymmetric JWKS verification.
_ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"]

_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_JWKS_CACHE_TTL = 300  # seconds
_JWKS_CACHE: Dict[str, Any] = {"fetched_at": 0.0, "keys": [], "raw": {}}
_JWKS_LOCK = threading.Lock()


class AuthenticatedUser:
    __slots__ = ("user_id", "email", "role", "raw_claims")

    def __init__(self, user_id: str, email: Optional[str], role: Optional[str], raw_claims: dict):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.raw_claims = raw_claims


# ─── JWKS handling ──────────────────────────────────────────────────────────
def _refresh_jwks_locked() -> None:
    """Fetch and cache the JWKS document. Called under _JWKS_LOCK."""
    try:
        with httpx.Client(timeout=5.0) as c:
            resp = c.get(_JWKS_URL, headers={"Accept": "application/json"})
        if resp.status_code == 200:
            raw = resp.json()
            keys = raw.get("keys") or []
            _JWKS_CACHE["fetched_at"] = time.time()
            _JWKS_CACHE["keys"] = keys
            _JWKS_CACHE["raw"] = raw
            log.info("[auth] JWKS refreshed (%d key%s)", len(keys), "s" if len(keys) != 1 else "")
        else:
            log.warning("[auth] JWKS HTTP %s at %s", resp.status_code, _JWKS_URL)
    except Exception as e:
        log.warning("[auth] JWKS fetch failed: %s", type(e).__name__)


def _get_jwks_key_for_kid(kid: str, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
    now = time.time()
    with _JWKS_LOCK:
        stale = (now - _JWKS_CACHE["fetched_at"]) > _JWKS_CACHE_TTL
        keys: List[Dict[str, Any]] = _JWKS_CACHE.get("keys") or []
        if force_refresh or stale or not keys:
            _refresh_jwks_locked()
            keys = _JWKS_CACHE.get("keys") or []
        for k in keys:
            if k.get("kid") == kid:
                return k
    return None


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _peek_jwt_header(token: str) -> Dict[str, Any]:
    """Peek the unverified header of a JWT to read `alg` and `kid`."""
    return jwt.get_unverified_header(token)


def _verify_asymmetric(token: str, header: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Try to verify using JWKS. Returns claims dict or None if kid unknown."""
    kid = header.get("kid")
    alg = header.get("alg")
    if not kid or alg not in _ASYMMETRIC_ALGS:
        return None
    jwk = _get_jwks_key_for_kid(kid)
    if jwk is None:
        # Retry once with force refresh in case of a fresh rotation
        jwk = _get_jwks_key_for_kid(kid, force_refresh=True)
    if jwk is None:
        return None
    try:
        key = jwt.algorithms.get_default_algorithms()[alg].from_jwk(json.dumps(jwk))
    except Exception:
        return None
    options = {"require": ["exp", "sub"]}
    return jwt.decode(
        token,
        key=key,
        algorithms=[alg],
        audience=SUPABASE_JWT_AUD if SUPABASE_JWT_AUD else None,
        issuer=SUPABASE_JWT_ISS if SUPABASE_JWT_ISS else None,
        options=options,
    )


def _verify_hs256_legacy(token: str) -> Dict[str, Any]:
    """Legacy HS256 fallback (opt-in via env)."""
    if not SUPABASE_JWT_ALLOW_HS256_FALLBACK:
        raise HTTPException(status_code=401, detail="unsupported_algorithm")
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=503, detail="auth_not_configured")
    options = {"require": ["exp", "sub"]}
    return jwt.decode(
        token,
        SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        audience=SUPABASE_JWT_AUD if SUPABASE_JWT_AUD else None,
        issuer=SUPABASE_JWT_ISS if SUPABASE_JWT_ISS else None,
        options=options,
    )


def _verify(token: str) -> Dict[str, Any]:
    """Verify a Supabase JWT. Raises HTTPException(401) on any failure."""
    try:
        header = _peek_jwt_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="malformed_token")

    alg = header.get("alg")
    if alg == "none" or not alg:
        raise HTTPException(status_code=401, detail="algorithm_not_allowed")

    try:
        if alg in _ASYMMETRIC_ALGS:
            # Try JWKS
            claims = _verify_asymmetric(token, header)
            if claims is not None:
                return claims
            # kid unknown OR JWKS empty — try HS256 legacy fallback IF opted-in
            if SUPABASE_JWT_ALLOW_HS256_FALLBACK and SUPABASE_JWT_SECRET:
                # Only allowed if the token actually claims HS256 in its header
                # (we do NOT accept an ES256 header with an HS256 secret).
                raise HTTPException(status_code=401, detail="unknown_kid")
            raise HTTPException(status_code=401, detail="unknown_kid")
        elif alg == "HS256":
            return _verify_hs256_legacy(token)
        else:
            raise HTTPException(status_code=401, detail="algorithm_not_allowed")
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token_expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="invalid_audience")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="invalid_issuer")
    except jwt.InvalidSignatureError:
        raise HTTPException(status_code=401, detail="invalid_signature")
    except jwt.InvalidTokenError as e:
        log.debug("[auth] invalid token: %s", type(e).__name__)
        raise HTTPException(status_code=401, detail="invalid_token")


def require_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="missing_token")
    claims = _verify(token)
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="missing_sub")
    user = AuthenticatedUser(
        user_id=sub,
        email=claims.get("email"),
        role=claims.get("role") or (claims.get("app_metadata") or {}).get("role"),
        raw_claims=claims,
    )
    request.state.user = user
    return user


def optional_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[AuthenticatedUser]:
    token = _extract_bearer_token(authorization)
    if not token:
        return None
    try:
        claims = _verify(token)
    except HTTPException:
        return None
    sub = claims.get("sub")
    if not sub:
        return None
    user = AuthenticatedUser(
        user_id=sub,
        email=claims.get("email"),
        role=claims.get("role"),
        raw_claims=claims,
    )
    request.state.user = user
    return user


# ─── Rate limiting ──────────────────────────────────────────────────────────
def rate_key(request: Request) -> str:
    user: Optional[AuthenticatedUser] = getattr(request.state, "user", None)
    if user is not None:
        return f"u:{user.user_id}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=rate_key,
    default_limits=["120/minute"],
    headers_enabled=False,
    swallow_errors=True,
)


__all__ = [
    "AuthenticatedUser",
    "require_user",
    "optional_user",
    "limiter",
    "rate_key",
]
