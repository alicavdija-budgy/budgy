"""
BUDGY — Supabase server-side helper.

Used to persist subscription state in the user profile after Apple validates
a purchase. We use the **service_role** key, which bypasses RLS — therefore
this client lives ONLY in the backend and is never exposed to the frontend.

Table expected (see /app/backend/supabase_iap_migration.sql):
    public.user_subscriptions(
        user_id uuid primary key references auth.users(id),
        is_pro boolean default false,
        subscription_state text default 'FREE',
        pro_until timestamptz,
        apple_original_transaction_id text,
        apple_product_id text,
        environment text,
        last_receipt_validation timestamptz,
        updated_at timestamptz default now()
    )
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

log = logging.getLogger("iap")


def _env(k: str) -> str:
    return (os.getenv(k) or "").strip()


def is_configured() -> bool:
    return bool(_env("SUPABASE_URL") and _env("SUPABASE_SERVICE_ROLE_KEY"))


def _headers() -> Dict[str, str]:
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates",
    }


async def upsert_subscription(user_id: str, state: Dict[str, Any]) -> bool:
    """Idempotent UPSERT into public.user_subscriptions."""
    if not is_configured():
        log.warning("[iap] Supabase not configured — skipping persistence (user_id=%s)", user_id[:8] + "…")
        return False
    url = f"{_env('SUPABASE_URL')}/rest/v1/user_subscriptions"
    payload = {
        "user_id": user_id,
        "is_pro": bool(state.get("is_pro")),
        "subscription_state": state.get("state", "FREE"),
        "pro_until": state.get("pro_until"),
        "apple_original_transaction_id": state.get("original_transaction_id"),
        "apple_product_id": state.get("product_id"),
        "environment": state.get("environment"),
        "last_receipt_validation": datetime.now(timezone.utc).isoformat(),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                url,
                headers={**_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
                json=payload,
            )
        except httpx.HTTPError as e:
            log.error("[iap] Supabase upsert HTTP error: %s", e)
            return False
    if resp.status_code >= 400:
        log.error("[iap] Supabase upsert %s: %s", resp.status_code, resp.text[:200])
        return False
    return True


async def upsert_by_original_transaction(orig_tx_id: str, state: Dict[str, Any]) -> bool:
    """Webhook path — find user via originalTransactionId then update."""
    if not is_configured():
        return False
    base = _env("SUPABASE_URL")
    # Lookup
    sel = f"{base}/rest/v1/user_subscriptions?apple_original_transaction_id=eq.{orig_tx_id}&select=user_id"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(sel, headers=_headers())
            if r.status_code != 200:
                log.warning("[iap-webhook] lookup orig=%s → %s", orig_tx_id[:6] + "…", r.status_code)
                return False
            rows = r.json()
        except httpx.HTTPError as e:
            log.error("[iap-webhook] supabase HTTP: %s", e)
            return False
    if not rows:
        log.info("[iap-webhook] no user found for orig_tx_id — skipping (will be picked up next /restore)")
        return False
    user_id = rows[0]["user_id"]
    return await upsert_subscription(user_id, state)


async def fetch_subscription(user_id: str) -> Optional[Dict[str, Any]]:
    """Read current subscription record (used by /api/iap/me)."""
    if not is_configured():
        return None
    url = f"{_env('SUPABASE_URL')}/rest/v1/user_subscriptions?user_id=eq.{user_id}&select=*"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(url, headers=_headers())
            if r.status_code != 200:
                return None
            rows = r.json()
        except httpx.HTTPError:
            return None
    return rows[0] if rows else None

async def fetch_by_original_transaction(orig_tx_id: str) -> Optional[Dict[str, Any]]:
    """v3.9.0 SECURITY: return the subscription record currently bound to an
    Apple originalTransactionId, if any. Used to enforce that the same Apple
    transaction cannot be claimed by two different Budgy users.
    """
    if not is_configured() or not orig_tx_id:
        return None
    url = f"{_env('SUPABASE_URL')}/rest/v1/user_subscriptions?original_transaction_id=eq.{orig_tx_id}&select=user_id,original_transaction_id,state"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(url, headers=_headers())
            if r.status_code != 200:
                return None
            rows = r.json()
        except httpx.HTTPError:
            return None
    return rows[0] if rows else None
