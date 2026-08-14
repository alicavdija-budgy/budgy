# v3.9.0 Security — Test Credentials (dev environment only)

## Backend JWT (local dev testing)
- `SUPABASE_JWT_SECRET` (dev-only): `dev-only-test-secret-do-not-use-in-production-please-rotate`
- Audience: `authenticated`
- Algorithm: HS256

## Pre-signed test JWTs (2h validity from generation time, dev secret above)

### User A (owner role in tests)
- `sub`: `11111111-1111-1111-1111-111111111111`
- `email`: usera@budgy.ch
- JWT: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg2NzUzNDgwLCJlbWFpbCI6InVzZXJhQGJ1ZGd5LmNoIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.OIP1Y6Xekbzis8pXgiUGEz_rcZ_KWuL2vFEfHF77nrU`

### User B (member role)
- `sub`: `22222222-2222-2222-2222-222222222222`
- `email`: userb@budgy.ch
- JWT: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg2NzUzNDgwLCJlbWFpbCI6InVzZXJiQGJ1ZGd5LmNoIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.VL9-jA9xo-kuaDi1tc1nUOHcyqp0rhcgicGMj9Fs0MQ`

### User C (non-member, adversary)
- `sub`: `33333333-3333-3333-3333-333333333333`
- `email`: userc@budgy.ch
- JWT: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg2NzUzNDgwLCJlbWFpbCI6InVzZXJjQGJ1ZGd5LmNoIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.N15Yl-tZgO1jmVHKIcNxBGys19M4GycDjWYQ1G4rba8`

## Generate a fresh JWT
```bash
python3 -c "
import jwt, time
tok = jwt.encode({'sub':'11111111-1111-1111-1111-111111111111','aud':'authenticated','exp':int(time.time())+7200,'email':'usera@budgy.ch','role':'authenticated'}, 'dev-only-test-secret-do-not-use-in-production-please-rotate', algorithm='HS256')
print(tok)"
```

## Backend URL
- Local: `http://localhost:8001`
- Public preview: `https://chf-guardian-wallet.preview.emergentagent.com/api`
