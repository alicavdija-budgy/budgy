"""Budgy — Authentication + Rate Limiting middleware (v3.9.0 Security Release).

Verifies Supabase JWTs and enforces per-user + IP rate limits on paid endpoints.

Design:
- We verify the JWT signature using the Supabase JWT secret (HS256) shared
  with the Supabase project. This is the standard Supabase Auth flow.
- The user_id is ALWAYS derived from the verified JWT `sub` claim, never
  from a client-supplied query/body parameter.
- We tolerate a "no-auth" mode in dev when SUPABASE_JWT_SECRET is unset,
  which returns 401 for endpoints that require auth (fail closed).
"""

from __future__ import annotations

import os
import logging
from typing import Optional

import jwt  # PyJWT
from fastapi import Depends, Header, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

log = logging.getLogger("budgy.auth")

# ─── Config ─────────────────────────────────────────────────────────────────
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()
SUPABASE_JWT_ISS = os.getenv("SUPABASE_JWT_ISS", "").strip() or None  # optional issuer
SUPABASE_JWT_AUD = os.getenv("SUPABASE_JWT_AUD", "authenticated")     # default audience


class AuthenticatedUser:
    """Immutable representation of the authenticated user (from verified JWT)."""

    __slots__ = ("user_id", "email", "role", "raw_claims")

    def __init__(self, user_id: str, email: Optional[str], role: Optional[str], raw_claims: dict):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.raw_claims = raw_claims

    def __repr__(self):  # pragma: no cover
        return f"<AuthenticatedUser id={self.user_id[:8]}… role={self.role}>"


# ─── JWT verification ───────────────────────────────────────────────────────
def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _verify_supabase_jwt(token: str) -> dict:
    """Verify a Supabase JWT (HS256) and return its claims.

    Raises HTTPException(401) on any failure.
    """
    if not SUPABASE_JWT_SECRET:
        log.error("[auth] SUPABASE_JWT_SECRET is not configured — refusing to authenticate")
        raise HTTPException(status_code=503, detail="auth_not_configured")
    try:
        options = {"require": ["exp", "sub"], "verify_aud": bool(SUPABASE_JWT_AUD)}
        claims = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=SUPABASE_JWT_AUD if SUPABASE_JWT_AUD else None,
            issuer=SUPABASE_JWT_ISS if SUPABASE_JWT_ISS else None,
            options=options,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token_expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="invalid_audience")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="invalid_issuer")
    except jwt.InvalidTokenError as e:
        log.warning("[auth] invalid token: %s", type(e).__name__)
        raise HTTPException(status_code=401, detail="invalid_token")
    return claims


# ─── FastAPI dependencies ───────────────────────────────────────────────────
def require_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
    """Dependency : require a valid Supabase JWT, return the authenticated user.

    Usage:
        @app.get("/api/thing")
        async def thing(user: AuthenticatedUser = Depends(require_user)):
            return {"user_id": user.user_id}
    """
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="missing_token")
    claims = _verify_supabase_jwt(token)
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="missing_sub")
    user = AuthenticatedUser(
        user_id=sub,
        email=claims.get("email"),
        role=claims.get("role") or claims.get("app_metadata", {}).get("role"),
        raw_claims=claims,
    )
    # Stash on request.state for downstream logging / rate-limit keying.
    request.state.user = user
    return user


def optional_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[AuthenticatedUser]:
    """Same as require_user but returns None instead of 401 if no token."""
    token = _extract_bearer_token(authorization)
    if not token:
        return None
    try:
        claims = _verify_supabase_jwt(token)
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
    """Rate-limit key : authenticated user_id if present, else remote IP."""
    user: Optional[AuthenticatedUser] = getattr(request.state, "user", None)
    if user is not None:
        return f"u:{user.user_id}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=rate_key,
    default_limits=["120/minute"],  # generous fallback
    headers_enabled=False,  # v3.9.0: disabled — endpoints return Pydantic models, not Response
    swallow_errors=True,  # don't crash if Redis missing — in-memory fallback
)


__all__ = [
    "AuthenticatedUser",
    "require_user",
    "optional_user",
    "limiter",
    "rate_key",
]
