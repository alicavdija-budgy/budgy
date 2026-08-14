#!/usr/bin/env python3
"""Budgy — Inspecter UNIQUEMENT le header d'un JWT.

Sécurité: ne jamais afficher le token complet, ni le payload sensible.
Usage:
  python3 scripts/inspect-jwt-header.py <token>
  echo "<token>" | python3 scripts/inspect-jwt-header.py -
"""
from __future__ import annotations
import base64
import json
import sys


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def inspect(token: str) -> int:
    parts = token.strip().split(".")
    if len(parts) < 2:
        print("❌ Token invalide (pas un JWT)", file=sys.stderr)
        return 1
    try:
        header = json.loads(_b64url_decode(parts[0]))
    except Exception as e:
        print(f"❌ Header non décodable: {type(e).__name__}", file=sys.stderr)
        return 1

    # Header (safe)
    alg = header.get("alg", "?")
    kid = header.get("kid", "?")
    typ = header.get("typ", "?")
    print("── JWT header (safe fields only) ─────────")
    print(f"  alg = {alg}")
    print(f"  kid = {kid}")
    print(f"  typ = {typ}")

    # Payload — n'afficher que sub/aud/iss/exp/iat/role (rien de sensible)
    try:
        payload = json.loads(_b64url_decode(parts[1]))
    except Exception:
        payload = {}
    safe = {k: payload.get(k) for k in ("sub", "aud", "iss", "exp", "iat", "role") if k in payload}
    if safe:
        print("── JWT claims (non-sensitive) ────────────")
        for k, v in safe.items():
            print(f"  {k} = {v}")

    # Verdict
    print("── Verdict ────────────────────────────────")
    if alg == "ES256":
        print("✅ ES256 asymétrique (production-ready)")
        return 0
    if alg == "RS256":
        print("✅ RS256 asymétrique (production-ready)")
        return 0
    if alg == "HS256":
        print("⚠️  HS256 legacy — fallback temporaire, migration ES256 requise")
        return 0
    if alg == "none":
        print("🚨 alg=none — DANGEREUX, à refuser")
        return 2
    print(f"⚠️  Algorithme inattendu: {alg}")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: inspect-jwt-header.py <token> | -", file=sys.stderr)
        return 1
    arg = sys.argv[1]
    token = sys.stdin.read().strip() if arg == "-" else arg
    return inspect(token)


if __name__ == "__main__":
    sys.exit(main())
