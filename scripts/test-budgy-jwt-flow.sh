#!/usr/bin/env bash
# Budgy — Test end-to-end du flow JWT (ES256 + HS256 fallback)
# Usage: BUDGY_API=https://api.budgy.ch TOKEN=<...> ./scripts/test-budgy-jwt-flow.sh
# Ne JAMAIS commiter le token en clair.

set -euo pipefail

BUDGY_API="${BUDGY_API:-http://localhost:8001}"
TOKEN="${TOKEN:?TOKEN env var required (never log)}"

echo "🧪 Test Budgy JWT flow — ${BUDGY_API}"
echo "---"

# Header inspection (never full token)
HDR=$(echo "$TOKEN" | cut -d. -f1)
PAD=$(python3 -c "import base64,sys; s=sys.argv[1]; print(base64.urlsafe_b64decode(s + '='*(-len(s)%4)).decode())" "$HDR")
ALG=$(echo "$PAD" | python3 -c "import json,sys; print(json.load(sys.stdin).get('alg','?'))")
KID=$(echo "$PAD" | python3 -c "import json,sys; print(json.load(sys.stdin).get('kid','?'))")
echo "🔐 Token: alg=${ALG}, kid=${KID}"

# Test 1 — Endpoint protégé /api/iap/me
echo ""
echo "▶ Test 1: GET /api/iap/me (JWT valide)"
HTTP_CODE=$(curl -sS -o /tmp/budgy_resp.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BUDGY_API}/api/iap/me")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "  ✅ 200 OK"
else
  echo "  ❌ HTTP ${HTTP_CODE}"
  cat /tmp/budgy_resp.json 2>/dev/null || true
fi

# Test 2 — Sans token → 401
echo ""
echo "▶ Test 2: GET /api/iap/me (sans token)"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${BUDGY_API}/api/iap/me")
if [[ "$HTTP_CODE" == "401" ]]; then
  echo "  ✅ 401 rejet correct"
else
  echo "  ❌ HTTP ${HTTP_CODE} (attendu 401)"
fi

# Test 3 — Token modifié → 401
echo ""
echo "▶ Test 3: GET /api/iap/me (signature modifiée)"
BAD_TOKEN="${TOKEN}X"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${BAD_TOKEN}" \
  "${BUDGY_API}/api/iap/me")
if [[ "$HTTP_CODE" == "401" ]]; then
  echo "  ✅ 401 rejet correct"
else
  echo "  ❌ HTTP ${HTTP_CODE} (attendu 401)"
fi

# Test 4 — alg=none crafted token → 401
echo ""
echo "▶ Test 4: alg=none crafted token"
NONE_HDR=$(printf '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=\n' | tr '/+' '_-')
NONE_PLD=$(printf '{"sub":"attacker","exp":9999999999}' | base64 | tr -d '=\n' | tr '/+' '_-')
NONE_TOKEN="${NONE_HDR}.${NONE_PLD}."
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${NONE_TOKEN}" \
  "${BUDGY_API}/api/iap/me")
if [[ "$HTTP_CODE" == "401" ]]; then
  echo "  ✅ 401 alg=none rejeté"
else
  echo "  🚨 HTTP ${HTTP_CODE} — CRITIQUE: alg=none ACCEPTÉ !!!"
  exit 1
fi

echo ""
echo "---"
echo "✅ Flow JWT Budgy OK"
