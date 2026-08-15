#!/usr/bin/env bash
# Budgy — Script de vérification JWKS PUBLIC post-migration ES256
# Usage: ./scripts/verify-jwks.sh [https://supabase.budgy.ch]
#
# CONTRÔLE DE SÉCURITÉ STRICT :
# Le JWKS PUBLIC (/auth/v1/.well-known/jwks.json) ne doit JAMAIS exposer :
#   - Une clé symétrique (kty=oct, champ k) → leak du secret HS256
#   - Une clé privée asymétrique (champs d, p, q, dp, dq, qi)
#
# Codes de sortie :
#   0 = OK (au moins une clé publique asymétrique, aucun secret exposé)
#   1 = Endpoint injoignable / réponse HTTP non-200
#   2 = JWKS vide (migration ES256 non effectuée) — NOT READY
#   3 = 🚨 CRITICAL: matériel privé/symétrique exposé publiquement
#   4 = Aucune clé ES256 asymétrique détectée (public JWKS incomplet)

set -uo pipefail

SUPABASE_URL="${1:-https://supabase.budgy.ch}"
JWKS_URL="${SUPABASE_URL}/auth/v1/.well-known/jwks.json"

echo "🔍 Vérification JWKS PUBLIC : ${JWKS_URL}"
echo "─────────────────────────────────────────────────"

RESPONSE=$(curl -sS -w "\n%{http_code}" "${JWKS_URL}" 2>/dev/null || echo -e "\n000")
BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "❌ HTTP ${HTTP_CODE} — endpoint injoignable"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  jq non installé — installation requise: apt-get install -y jq"
  exit 1
fi

# Valider JSON
if ! echo "$BODY" | jq empty >/dev/null 2>&1; then
  echo "❌ Réponse non-JSON"
  echo "$BODY" | head -5
  exit 1
fi

KEYS_COUNT=$(echo "$BODY" | jq '.keys | length // 0')

if [[ "$KEYS_COUNT" == "0" ]]; then
  echo "❌ JWKS vide — Supabase n'a PAS encore migré vers ES256"
  echo "   Suivez /app/docs/SUPABASE_ES256_MIGRATION_PLAYBOOK.md"
  echo ""
  echo "── Résumé ────────────────────────────────────────"
  echo "MIGRATION ES256 READINESS: NOT READY (JWKS vide)"
  exit 2
fi

echo "ℹ️  ${KEYS_COUNT} clé(s) trouvée(s) dans le JWKS public :"
echo "$BODY" | jq -r '.keys[] | "  - kty=\(.kty // "?"), alg=\(.alg // "?"), kid=\(.kid // "?"), crv=\(.crv // "n/a")"'
echo ""

# ═══════════════════════════════════════════════════════════════
# CONTRÔLE CRITIQUE 1 — Clé symétrique exposée (kty=oct)
# ═══════════════════════════════════════════════════════════════
SYM_COUNT=$(echo "$BODY" | jq '[.keys[] | select(.kty == "oct")] | length')
if [[ "$SYM_COUNT" -gt "0" ]]; then
  echo "🚨🚨🚨 CRITICAL: symmetric/private key material exposed in public JWKS"
  echo "   ${SYM_COUNT} clé(s) symétrique(s) (kty=oct) détectée(s) sur l'endpoint PUBLIC."
  echo "   → Le secret HS256 est exposé sur Internet."
  echo "   → ACTION IMMÉDIATE : rollback + reconfigurer GoTrue pour filtrer kty=oct."
  echo ""
  echo "── Résumé ────────────────────────────────────────"
  echo "PUBLIC JWKS SECRET LEAK CHECK: FAIL"
  echo "MIGRATION ES256 READINESS: NOT READY (fuite critique)"
  exit 3
fi

# ═══════════════════════════════════════════════════════════════
# CONTRÔLE CRITIQUE 2 — Champ 'k' (secret symétrique en clair)
# ═══════════════════════════════════════════════════════════════
K_COUNT=$(echo "$BODY" | jq '[.keys[] | select(.k != null)] | length')
if [[ "$K_COUNT" -gt "0" ]]; then
  echo "🚨🚨🚨 CRITICAL: symmetric/private key material exposed in public JWKS"
  echo "   ${K_COUNT} clé(s) contient le champ 'k' (secret HS256 en clair)."
  echo "   → N'importe qui peut forger des JWT signés HS256."
  echo "   → ACTION IMMÉDIATE : rollback + reconfigurer GoTrue."
  echo ""
  echo "── Résumé ────────────────────────────────────────"
  echo "PUBLIC JWKS SECRET LEAK CHECK: FAIL"
  echo "MIGRATION ES256 READINESS: NOT READY (fuite critique)"
  exit 3
fi

# ═══════════════════════════════════════════════════════════════
# CONTRÔLE CRITIQUE 3 — Composantes privées EC/RSA (d, p, q, dp, dq, qi)
# ═══════════════════════════════════════════════════════════════
PRIV_COUNT=$(echo "$BODY" | jq '[.keys[] | select(.d != null or .p != null or .q != null or .dp != null or .dq != null or .qi != null)] | length')
if [[ "$PRIV_COUNT" -gt "0" ]]; then
  echo "🚨🚨🚨 CRITICAL: symmetric/private key material exposed in public JWKS"
  echo "   ${PRIV_COUNT} clé(s) contient une composante privée (d/p/q/dp/dq/qi)."
  echo "   → Clé privée asymétrique complète exposée sur Internet."
  echo "   → ACTION IMMÉDIATE : révocation + rotation immédiate + rollback."
  echo ""
  echo "── Résumé ────────────────────────────────────────"
  echo "PUBLIC JWKS SECRET LEAK CHECK: FAIL"
  echo "MIGRATION ES256 READINESS: NOT READY (fuite critique)"
  exit 3
fi

echo "✅ No symmetric/private key material exposed"

# ═══════════════════════════════════════════════════════════════
# CONTRÔLE POSITIF — Présence ES256 asymétrique
# ═══════════════════════════════════════════════════════════════
ES256_COUNT=$(echo "$BODY" | jq '[.keys[] | select(.alg == "ES256" and .kty == "EC")] | length')
if [[ "$ES256_COUNT" -gt "0" ]]; then
  echo "✅ ES256 public key detected (${ES256_COUNT})"
else
  # Alternatives asymétriques acceptables
  ASYM_COUNT=$(echo "$BODY" | jq '[.keys[] | select(.alg == "RS256" or .alg == "EdDSA" or (.kty == "EC" and .alg == "ES384"))] | length')
  if [[ "$ASYM_COUNT" -gt "0" ]]; then
    echo "⚠️  Pas de ES256 mais ${ASYM_COUNT} clé asymétrique alternative (RS256/EdDSA/ES384)"
  else
    echo "❌ Aucune clé ES256 asymétrique détectée — vérifier JWT_KEYS côté GoTrue"
    echo ""
    echo "── Résumé ────────────────────────────────────────"
    echo "PUBLIC JWKS SECRET LEAK CHECK: PASS"
    echo "ES256 DETECTION: FAIL"
    echo "MIGRATION ES256 READINESS: NOT READY (aucune clé ES256)"
    exit 4
  fi
fi

echo ""
echo "── Résumé ────────────────────────────────────────"
echo "PUBLIC JWKS SECRET LEAK CHECK: PASS"
echo "ES256 DETECTION: PASS"
echo "MIGRATION ES256 READINESS: READY (côté JWKS public)"
echo ""
echo "ℹ️  Rappel : le legacy HS256 reste supporté via SUPABASE_JWT_ALLOW_HS256_FALLBACK=1"
echo "    côté backend Budgy (sans exposition publique du secret)."
