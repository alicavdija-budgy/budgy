#!/usr/bin/env bash
# Budgy — Tests unitaires du script verify-jwks.sh
# Un seul mock server persistant sert différents JWKS payloads via des routes /test/<name>/
# → aucun problème de collision de port entre tests.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERIFY="${SCRIPT_DIR}/verify-jwks.sh"

PASS=0
FAIL=0
MOCK_PORT=18900
MOCK_PID=""

cleanup() {
  local prev=$?
  set +eo pipefail 2>/dev/null || true
  if [[ -n "$MOCK_PID" ]]; then
    kill -9 "$MOCK_PID" 2>/dev/null || true
    MOCK_PID=""
  fi
  # Belt & suspenders: kill any leftover on our port
  local pids
  pids=$(ss -tlnp 2>/dev/null | grep ":${MOCK_PORT} " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u) || true
  for p in $pids; do kill -9 "$p" 2>/dev/null || true; done
  return $prev
}
trap cleanup EXIT

# Payloads registry (name → JSON body). All keys use base64url encoding for test values.
declare -A PAYLOADS=(
  [es256_only]='{"keys":[{"kty":"EC","crv":"P-256","alg":"ES256","kid":"abc-123","x":"MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4","y":"4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM"}]}'
  [kty_oct_exposed]='{"keys":[{"kty":"EC","crv":"P-256","alg":"ES256","kid":"abc-123","x":"MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4","y":"4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM"},{"kty":"oct","alg":"HS256","kid":"legacy","k":"c3VwZXJfc2VjcmV0X2tleQ"}]}'
  [k_field_only]='{"keys":[{"kty":"EC","crv":"P-256","alg":"ES256","kid":"abc-123","x":"MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4","y":"4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM","k":"c3VwZXJfc2VjcmV0X2tleQ"}]}'
  [ec_private_d]='{"keys":[{"kty":"EC","crv":"P-256","alg":"ES256","kid":"abc-123","x":"MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4","y":"4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM","d":"870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE"}]}'
  [rsa_private_pq]='{"keys":[{"kty":"RSA","alg":"RS256","kid":"rsa-1","n":"0vx7","e":"AQAB","p":"fake_p","q":"fake_q"}]}'
  [empty_keys]='{"keys":[]}'
  [only_oct]='{"keys":[{"kty":"oct","alg":"HS256","kid":"legacy","k":"c3VwZXJfc2VjcmV0X2tleQ"}]}'
  [rs256_public]='{"keys":[{"kty":"RSA","alg":"RS256","kid":"rsa-pub-1","n":"0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc","e":"AQAB"}]}'
)

# Serialize registry into JSON for python mock server
build_registry_json() {
  local out="{"; local first=1
  for name in "${!PAYLOADS[@]}"; do
    [[ $first -eq 0 ]] && out+=","
    out+="\"$name\":${PAYLOADS[$name]}"
    first=0
  done
  out+="}"
  echo "$out"
}
REGISTRY_JSON=$(build_registry_json)

# Start ONE persistent mock server that routes on URL: /<name>/auth/v1/.well-known/jwks.json
python3 -u -c "
import http.server, socketserver, sys, json
REG = json.loads(sys.argv[1])
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        # Match /<name>/auth/v1/.well-known/jwks.json
        parts = self.path.strip('/').split('/', 1)
        if len(parts) == 2 and parts[1] == 'auth/v1/.well-known/jwks.json':
            name = parts[0]
            if name in REG:
                body = json.dumps(REG[name]).encode()
                self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(body); return
        self.send_response(404); self.end_headers()
    def log_message(self, *a, **kw): pass
class Srv(socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True
Srv(('127.0.0.1', ${MOCK_PORT}), H).serve_forever()
" "$REGISTRY_JSON" >/dev/null 2>&1 &
MOCK_PID=$!
disown "$MOCK_PID" 2>/dev/null || true

# Wait for port
for i in $(seq 1 100); do
  if python3 -c "import socket,sys; s=socket.socket(); s.settimeout(0.2); r=s.connect_ex(('127.0.0.1',${MOCK_PORT})); sys.exit(0 if r==0 else 1)" 2>/dev/null; then
    break
  fi
  sleep 0.05
done

# Sanity check
if ! curl -sSf "http://127.0.0.1:${MOCK_PORT}/es256_only/auth/v1/.well-known/jwks.json" >/dev/null 2>&1; then
  echo "❌ Mock server didn't come up"
  exit 1
fi

run_test() {
  local name="$1"; local key="$2"; local expected_exit="$3"
  echo ""
  echo "── TEST: ${name}"
  set +e
  bash "$VERIFY" "http://127.0.0.1:${MOCK_PORT}/${key}" >/tmp/verify_out 2>&1
  ACTUAL=$?
  set -e

  if [[ "$ACTUAL" == "$expected_exit" ]]; then
    echo "  ✅ PASS (exit=${ACTUAL})"
    PASS=$((PASS+1))
  else
    echo "  ❌ FAIL (expected=${expected_exit}, got=${ACTUAL})"
    echo "  ── verify-jwks.sh output ─────"
    sed 's/^/    /' /tmp/verify_out
    echo "  ──────────────────────────────"
    FAIL=$((FAIL+1))
  fi
}

# ═════════════════════════════════════════════════════════════════
# Tests demandés par l'utilisateur
# ═════════════════════════════════════════════════════════════════
run_test "ES256 only (nominal)"                    es256_only        0
run_test "kty=oct exposed (HS256 leak)"            kty_oct_exposed   3
run_test "k field on asymmetric key"               k_field_only      3
run_test "EC private key exposed (d)"              ec_private_d      3
run_test "RSA private components (p,q)"            rsa_private_pq    3
run_test "empty keys array (pre-migration)"        empty_keys        2
run_test "only kty=oct (no ES256, full leak)"      only_oct          3
run_test "RS256 public key (asymmetric alt.)"      rs256_public      0

echo ""
echo "═══════════════════════════════════════════════════"
echo "Résultats : ${PASS} passed, ${FAIL} failed"
echo "═══════════════════════════════════════════════════"
[[ "$FAIL" == "0" ]] && exit 0 || exit 1
