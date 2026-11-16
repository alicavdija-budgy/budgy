"""Operator authorization for non-secret production readiness metadata.

A normal Supabase JWT proves user identity, not operational authority.
Only an operator flag in the SIGNED, server-controlled app_metadata is
trusted. user_metadata and top-level role are intentionally ignored.

Set `app_metadata.budgy_operator = true` through the existing Supabase Auth
admin interface for the individual operator account, AFTER verifying identity.
This does not require a SQL migration or a new service.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from auth import AuthenticatedUser, require_user


def require_operator(user: AuthenticatedUser = Depends(require_user)) -> AuthenticatedUser:
    claims = user.raw_claims if isinstance(user.raw_claims, dict) else {}
    metadata = claims.get("app_metadata")
    if not isinstance(metadata, dict) or metadata.get("budgy_operator") is not True:
        raise HTTPException(status_code=403, detail="operator_access_required")
    return user
