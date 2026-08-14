#!/usr/bin/env bash
# Budgy — Script de vérification JWKS post-migration ES256
# Usage: ./scripts/verify-jwks.sh [https://supabase.budgy.ch]
# Ne révèle JAMAIS de clé privée. Affiche uniquement kty/alg/kid.

set -euo pipefail

SUPABASE_URL="${1:-https://supabase.budgy.ch}"
JWKS_URL="${SUPABASE_URL}/auth/v1/.well-known/jwks.json"

echo "🔍 Vérification JWKS: ${JWKS_URL}"
echo "---"

RESPONSE=$(curl -sS -w "\n%{http_code}" "${JWKS_URL}" || true)
BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "❌ HTTP ${HTTP_CODE} — endpoint injoignable"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  jq non installé — sortie brute:"
  echo "$BODY"
  exit 0
fi

KEYS_COUNT=$(echo "$BODY" | jq '.keys | length')

if [[ "$KEYS_COUNT" == "0" ]]; then
  echo "❌ JWKS vide — Supabase n'a PAS encore migré vers ES256"
  echo "   Suivez /app/docs/SUPABASE_ES256_MIGRATION_PLAYBOOK.md"
  exit 2
fi

echo "✅ ${KEYS_COUNT} clé(s) trouvée(s):"
echo "$BODY" | jq -r '.keys[] | "  - kty=\(.kty // "?"), alg=\(.alg // "?"), kid=\(.kid // "?"), crv=\(.crv // "n/a")"'

# Vérifier présence ES256
HAS_ES256=$(echo "$BODY" | jq '[.keys[] | select(.alg == "ES256")] | length')
if [[ "$HAS_ES256" -gt "0" ]]; then
  echo "✅ Clé ES256 asymétrique détectée"
else
  echo "⚠️  Aucune clé ES256 — vérifier JWT_KEYS côté GoTrue"
fi

# Vérifier présence HS256 legacy
HAS_HS256=$(echo "$BODY" | jq '[.keys[] | select(.alg == "HS256")] | length')
if [[ "$HAS_HS256" -gt "0" ]]; then
  echo "✅ Legacy HS256 présent (transition en cours)"
else
  echo "ℹ️  Pas de HS256 legacy dans le JWKS (transition complète)"
fi

# Sanity: aucune clé privée exposée
LEAKS=$(echo "$BODY" | jq '[.keys[] | select(.d != null or .p != null or .q != null or .dp != null or .dq != null or .qi != null)] | length')
if [[ "$LEAKS" -gt "0" ]]; then
  echo "🚨🚨🚨 SÉCURITÉ CRITIQUE: clé privée exposée dans le JWKS public !!!"
  exit 3
fi
echo "✅ Aucune clé privée exposée dans le JWKS"

echo "---"
echo "✅ Vérification JWKS OK"
