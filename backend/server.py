"""
BUDGY — Backend API (self-hosted production)

Runs on Coolify behind an HTTPS reverse proxy at https://api.budgy.ch.
Uses LiteLLM (OpenAI / Anthropic / Gemini) directly — no Emergent-hosted
services. Persists IAP state in self-hosted Supabase at supabase.budgy.ch.

Endpoints prefixed with /api/* for backwards-compat with the mobile app.
A `/health` endpoint (no /api prefix) is also exposed for Coolify health
checks and uptime monitoring.
"""

import os
import uuid
import random
import string
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse as _AutoJSONResponse
from pydantic import BaseModel
from typing import Optional
import json
import re
import base64

# Load .env BEFORE importing modules that read os.getenv at import time
load_dotenv()

# Self-hosted LLM client (LiteLLM under the hood, no Emergent proxy)
from llm_client import ImageContent, LlmChat, UserMessage  # noqa: E402

# ─── v3.9.0 Security: JWT auth + rate limiting ──────────────────────────────
from auth import AuthenticatedUser, require_user, limiter  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402

# ─────────────────────────────────────────────────────────────
# Logging — structured, prod-friendly
# ─────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("budgy")

# ─────────────────────────────────────────────────────────────
# Env / Config
# ─────────────────────────────────────────────────────────────
APP_VERSION = os.getenv("APP_VERSION", "3.9.0")
APP_ENV = os.getenv("APP_ENV", "production")  # production | staging | dev

# LLM key kept for backwards-compat with code paths that still check it.
# `llm_client` resolves provider-specific keys (OPENAI_API_KEY etc.) directly.
EMERGENT_LLM_KEY = (
    os.getenv("OPENAI_API_KEY")
    or os.getenv("ANTHROPIC_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or os.getenv("EMERGENT_LLM_KEY")  # legacy dev fallback
    or ""
)

# Comma-separated list of allowed origins, e.g.
# "https://budgy.ch,https://www.budgy.ch,https://api.budgy.ch,budgy://,capacitor://localhost"
_DEFAULT_ORIGINS = (
    "https://budgy.ch,"
    "https://www.budgy.ch,"
    "https://api.budgy.ch,"
    "budgy://,"
    "capacitor://localhost,"
    "http://localhost:3000,"
    "http://localhost:8081"
)
_CORS_ENV = os.getenv("CORS_ALLOWED_ORIGINS", _DEFAULT_ORIGINS)
ALLOWED_ORIGINS = [o.strip() for o in _CORS_ENV.split(",") if o.strip()]

# Mobile schemes / arbitrary native bundle IDs can't be matched by a literal
# string. We allow them via regex so the WKWebView / native scheme works.
# v3.9.0 SECURITY: anchor the regex end-of-domain to avoid `budgy.ch.attacker.com`
_CORS_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^(https://([a-z0-9-]+\.)*budgy\.ch$|budgy://.*|capacitor://.*)$",
)

app = FastAPI(title="Budgy API", version=APP_VERSION)

# v3.9.0 SECURITY: rate limiting middleware
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request, exc):  # noqa: D401
    return _AutoJSONResponse(
        status_code=429,
        content={"error": "rate_limited", "detail": "Too many requests. Please slow down."},
    )


# v3.9.0 SECURITY: never leak internal errors / stack traces / secrets
@app.exception_handler(HTTPException)
async def _http_exception_handler(request, exc):  # noqa: D401
    return _AutoJSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(Exception)
async def _global_exception_handler(request, exc):  # noqa: D401
    # Preserve intentional HTTPException semantics (401, 429, etc.)
    if isinstance(exc, HTTPException):
        return _AutoJSONResponse(status_code=exc.status_code, content={"error": exc.detail})
    log.exception("[unhandled] %s at %s", type(exc).__name__, request.url.path)
    return _AutoJSONResponse(status_code=500, content={"error": "internal_server_error"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_CORS_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
    max_age=3600,
)

log.info("[startup] Budgy API v%s env=%s", APP_VERSION, APP_ENV)
log.info("[startup] CORS origins: %s", ALLOWED_ORIGINS)
log.info("[startup] CORS regex: %s", _CORS_REGEX)

# In-memory stores (chat history; family/alerts persist via Supabase when configured)
chat_sessions: dict[str, LlmChat] = {}
family_groups: dict[str, dict] = {}  # code -> { owner, members, name }
alerts_store: dict[str, list] = {}   # user_id -> [alerts]


# ──────────────────────────────────────────────────
# Health Checks
# ──────────────────────────────────────────────────
@app.get("/health")
async def health_root():
    """Coolify / uptime probe — kept under root path (no /api prefix)."""
    return {
        "status": "ok",
        "service": "budgy-api",
        "version": APP_VERSION,
        "env": APP_ENV,
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": APP_VERSION, "app": "Budgy", "env": APP_ENV}


@app.get("/api/config/status")
async def config_status():
    """
    Non-secret env diagnostic — confirms which optional integrations are
    configured WITHOUT ever exposing the actual values. Used by the operator
    to validate Coolify deployment without grepping logs.
    """
    def state(name: str, *aliases: str) -> str:
        for n in (name, *aliases):
            if os.getenv(n):
                return "configured"
        return "missing"

    return {
        "app_env": APP_ENV,
        "version": APP_VERSION,
        "openai": state("OPENAI_API_KEY"),
        "anthropic": state("ANTHROPIC_API_KEY"),
        "gemini": state("GEMINI_API_KEY", "GOOGLE_API_KEY"),
        "supabase_url": state("SUPABASE_URL"),
        "supabase_service_role": state("SUPABASE_SERVICE_ROLE_KEY"),
        "apple_bundle_id": state("APPLE_BUNDLE_ID"),
        "apple_issuer_id": state("APPLE_ISSUER_ID"),
        "apple_key_id": state("APPLE_KEY_ID"),
        "apple_private_key": state("APPLE_PRIVATE_KEY_P8", "APPLE_PRIVATE_KEY"),
        "apple_shared_secret": state("APPLE_SHARED_SECRET"),
        "apple_product_monthly": state(
            "APPLE_PRODUCT_ID_MONTHLY",
            "APPLE_PRODUCT_MONTHLY",
            "IAP_PRODUCT_MONTHLY",
        ),
        "apple_product_yearly": state(
            "APPLE_PRODUCT_ID_YEARLY",
            "APPLE_PRODUCT_YEARLY",
            "APPLE_PRODUCT_ID_ANNUAL",
            "APPLE_PRODUCT_ANNUAL",
            "IAP_PRODUCT_YEARLY",
            "IAP_PRODUCT_ANNUAL",
        ),
        "cors_origins_count": len(ALLOWED_ORIGINS),
    }


# ──────────────────────────────────────────────────
# COACH IA - GPT-4o-mini powered financial advisor
# ──────────────────────────────────────────────────
SYSTEM_PROMPT = """Tu es le Coach IA de Budgy, un conseiller financier suisse expert.

RÈGLES STRICTES:
- Réponds TOUJOURS en français
- Sois concis (max 3-4 phrases)
- Utilise des emojis pour rendre la conversation vivante
- Donne des conseils pratiques et actionnables basés sur les données financières de l'utilisateur
- Cite des chiffres spécifiques quand possible
- Connais le système suisse: AVS, LPP, 3ème pilier, LAMal, IFD, ICC
- Recommande priminfo.admin.ch pour les comparaisons LAMal
- Ne fais JAMAIS de publicité pour un assureur spécifique

EXPERTISE:
- Optimisation fiscale suisse (3ème pilier max CHF 7'258, rachats LPP)
- Budget 50/30/20 adapté au coût de vie suisse
- Épargne et investissement (ETF, pilier 3a, FIRE)
- Gestion des dettes et prêts
- Comparaison LAMal et optimisation franchise
- Prévoyance retraite et planification financière
"""


class ChatRequest(BaseModel):
    session_id: str
    message: str
    financial_context: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str


@app.post("/api/coach/chat", response_model=ChatResponse)
@limiter.limit("30/minute; 300/hour")
async def coach_chat(
    request: Request,
    req: ChatRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        # v3.9.0 SECURITY: namespace session id by user to prevent context leaks
        namespaced_session = f"{user.user_id}:{req.session_id}"
        if namespaced_session not in chat_sessions:
            system_msg = SYSTEM_PROMPT
            if req.financial_context:
                system_msg += f"\n\nCONTEXTE FINANCIER DE L'UTILISATEUR:\n{req.financial_context}"

            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=namespaced_session,
                system_message=system_msg,
            )
            chat.with_model("openai", "gpt-4o-mini")
            chat_sessions[namespaced_session] = chat

        chat = chat_sessions[namespaced_session]
        user_msg = UserMessage(text=req.message)
        response = await chat.send_message(user_msg)

        return ChatResponse(response=response, session_id=req.session_id)

    except HTTPException:
        raise
    except Exception as e:
        log.exception("[coach_chat] failed: %s", e)
        raise HTTPException(status_code=500, detail="coach_unavailable")


# ──────────────────────────────────────────────────
# PDF EXPORT - Note de frais A4
# ──────────────────────────────────────────────────
class PDFExportRequest(BaseModel):
    user_name: str
    company: Optional[str] = "Budgy"
    expenses: list[dict]
    mode: str = "employee"  # employee | independent
    canton: str = "VD"
    period: str = ""
    include_receipts: bool = False     # Joindre photos/scans en annexe
    documents: list[dict] = []          # Documents scannés (tickets) du classeur
    title_override: Optional[str] = None # Titre custom (Tickets, Note de frais...)


@app.post("/api/export/pdf")
async def export_pdf(req: PDFExportRequest):
    """Generate expense report HTML (Budgy green, with optional receipt/document appendix)"""
    total_ht = sum(e.get("amount", 0) for e in req.expenses)
    tva_rate = 8.1
    total_tva = round(total_ht * tva_rate / 100, 2)
    total_ttc = round(total_ht + total_tva, 2)

    rows_html = ""
    for i, exp in enumerate(req.expenses, 1):
        tva_amount = round(exp.get("amount", 0) * tva_rate / 100, 2)
        receipt_cell = ""
        if req.include_receipts and exp.get("receipt"):
            receipt_cell = f'<a href="#receipt-{i}" style="color:#10B981">📎 voir</a>'
        elif req.include_receipts:
            receipt_cell = '<span style="color:#9CA3AF">—</span>'
        rows_html += f"""
        <tr>
            <td>{i}</td>
            <td>{exp.get('date', '')}</td>
            <td>{exp.get('title', '')}</td>
            <td>{exp.get('category', '')}</td>
            <td>{exp.get('justification', '-')}</td>
            <td style="text-align:right">CHF {exp.get('amount', 0):.2f}</td>
            <td style="text-align:right">CHF {tva_amount:.2f}</td>
            {f'<td style="text-align:center">{receipt_cell}</td>' if req.include_receipts else ''}
        </tr>"""

    receipts_extra_th = '<th style="text-align:center">Reçu</th>' if req.include_receipts else ''

    # Build receipts appendix
    receipts_appendix = ""
    if req.include_receipts:
        attached = [(i, e) for i, e in enumerate(req.expenses, 1) if e.get("receipt")]
        if attached:
            blocks = []
            for i, exp in attached:
                src = exp.get("receipt", "")
                if src and not src.startswith("data:"):
                    src = f"data:image/jpeg;base64,{src}"
                blocks.append(f"""
                <div class="receipt-page">
                    <div class="receipt-header">
                        <span class="receipt-num">#{i}</span>
                        <span class="receipt-title">{exp.get('title', '')}</span>
                        <span class="receipt-amount">CHF {exp.get('amount', 0):.2f}</span>
                    </div>
                    <img id="receipt-{i}" class="receipt-img" src="{src}" />
                </div>""")
            receipts_appendix = f"""
            <div class="page-break"></div>
            <h2 class="appendix-title">📎 Annexe : Tickets et reçus</h2>
            {''.join(blocks)}"""

    # Build documents appendix (scanned PDFs from classeur)
    documents_appendix = ""
    if req.documents:
        doc_blocks = []
        for j, doc in enumerate(req.documents, 1):
            pages = doc.get("pages") or [doc.get("imageBase64", "")]
            page_imgs = "".join(f'<img class="receipt-img" src="{p}" />' for p in pages if p)
            doc_blocks.append(f"""
            <div class="receipt-page">
                <div class="receipt-header">
                    <span class="receipt-num">DOC-{j}</span>
                    <span class="receipt-title">{doc.get('title', '')}</span>
                    <span class="receipt-amount">{doc.get('category', '')}</span>
                </div>
                {page_imgs}
            </div>""")
        documents_appendix = f"""
        <div class="page-break"></div>
        <h2 class="appendix-title">📁 Annexe : Documents scannés</h2>
        {''.join(doc_blocks)}"""

    main_title = req.title_override or f"Note de frais — {req.period or datetime.now().strftime('%B %Y')}"

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page {{ size: A4; margin: 18mm; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; color: #0E1530; font-size: 11px; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #34D399; padding-bottom: 12px; margin-bottom: 20px; }}
  .logo {{ font-size: 22px; font-weight: 900; color: #10B981; letter-spacing: 2px; }}
  .logo-sub {{ font-size: 10px; color: #6B7280; }}
  .info {{ text-align: right; font-size: 10px; color: #4B5563; }}
  .title {{ font-size: 18px; font-weight: 700; color: #0E1530; margin: 16px 0 8px; }}
  .meta {{ display: flex; gap: 32px; margin-bottom: 16px; font-size: 10px; color: #6B7280; flex-wrap: wrap; }}
  .meta b {{ color: #0E1530; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
  th {{ background: linear-gradient(90deg, #34D399, #22D3EE); color: white; padding: 8px; text-align: left; font-size: 10px; }}
  td {{ padding: 7px 8px; border-bottom: 1px solid #E5E7EB; font-size: 10px; }}
  tr:nth-child(even) {{ background: #F0FDF4; }}
  .totals {{ margin-top: 16px; text-align: right; }}
  .totals table {{ width: 280px; margin-left: auto; }}
  .totals td {{ border: none; padding: 4px 8px; }}
  .totals .grand {{ font-size: 14px; font-weight: 700; color: #10B981; border-top: 2px solid #34D399; }}
  .footer {{ margin-top: 30px; padding-top: 12px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; font-size: 9px; color: #9CA3AF; }}
  .signature {{ margin-top: 30px; }}
  .signature-line {{ border-bottom: 1px solid #0E1530; width: 200px; margin-top: 30px; }}
  .page-break {{ page-break-before: always; }}
  .appendix-title {{ font-size: 16px; font-weight: 700; color: #10B981; border-bottom: 2px solid #34D399; padding-bottom: 6px; margin-bottom: 16px; }}
  .receipt-page {{ page-break-inside: avoid; margin-bottom: 24px; padding: 12px; background: #F0FDF4; border-radius: 8px; border: 1px solid #D1FAE5; }}
  .receipt-header {{ display: flex; justify-content: space-between; gap: 8px; padding: 6px 0 10px; font-size: 11px; border-bottom: 1px solid #D1FAE5; margin-bottom: 10px; }}
  .receipt-num {{ font-weight: 800; color: #10B981; min-width: 40px; }}
  .receipt-title {{ flex: 1; color: #0E1530; }}
  .receipt-amount {{ font-weight: 700; color: #DC2626; }}
  .receipt-img {{ max-width: 100%; max-height: 700px; display: block; margin: 6px auto; border-radius: 6px; }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">⚡ BUDGY</div>
      <div class="logo-sub">{req.title_override or 'Note de frais professionnels'}</div>
    </div>
    <div class="info">
      Date: {datetime.now().strftime('%d.%m.%Y')}<br>
      Réf: BDG-{datetime.now().strftime('%Y%m%d')}-{random.randint(100,999)}
    </div>
  </div>

  <div class="title">{main_title}</div>

  <div class="meta">
    <div><b>Collaborateur:</b> {req.user_name}</div>
    <div><b>Entreprise:</b> {req.company}</div>
    <div><b>Canton:</b> {req.canton}</div>
    <div><b>Mode:</b> {'Employé' if req.mode == 'employee' else 'Indépendant'}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>Description</th>
        <th>Catégorie</th>
        <th>Justification</th>
        <th style="text-align:right">Montant HT</th>
        <th style="text-align:right">TVA {tva_rate}%</th>
        {receipts_extra_th}
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Total HT</td><td style="text-align:right">CHF {total_ht:.2f}</td></tr>
      <tr><td>TVA {tva_rate}%</td><td style="text-align:right">CHF {total_tva:.2f}</td></tr>
      <tr class="grand"><td>Total TTC</td><td style="text-align:right">CHF {total_ttc:.2f}</td></tr>
    </table>
  </div>

  <div class="signature">
    <div><b>Signature du collaborateur:</b></div>
    <div class="signature-line"></div>
    <div style="font-size:9px; color:#9CA3AF; margin-top:4px">{req.user_name} — {datetime.now().strftime('%d.%m.%Y')}</div>
  </div>

  <div class="footer">
    <div>Budgy — Document généré automatiquement 🇨🇭</div>
    <div>TVA {tva_rate}% · Taux suisse 2026</div>
  </div>

  {receipts_appendix}
  {documents_appendix}
</body>
</html>"""

    return {
        "html": html,
        "total_ht": total_ht,
        "total_tva": total_tva,
        "total_ttc": total_ttc,
        "count": len(req.expenses),
    }


# ──────────────────────────────────────────────────
# FAMILY MODE - Code invitation 8 caractères
# ──────────────────────────────────────────────────
class CreateFamilyRequest(BaseModel):
    owner_id: str
    owner_name: str
    family_name: str


class JoinFamilyRequest(BaseModel):
    user_id: str
    user_name: str
    code: str


@app.post("/api/family/create")
async def create_family(
    req: CreateFamilyRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Create a family group with an 8-char invitation code (legacy in-memory).
    v3.9.0: requires authentication; owner_id derived from JWT."""
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    while code in family_groups:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

    family_groups[code] = {
        "code": code,
        "name": req.family_name,
        "owner_id": user.user_id,
        "owner_name": req.owner_name,
        "members": [{"id": user.user_id, "name": req.owner_name, "role": "admin", "joined": datetime.now(timezone.utc).isoformat()}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"code": code, "family": family_groups[code]}


@app.post("/api/family/join")
async def join_family(
    req: JoinFamilyRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Join a family group with invitation code (legacy in-memory).
    v3.9.0: requires authentication; user_id derived from JWT."""
    if req.code not in family_groups:
        raise HTTPException(status_code=404, detail="invite_not_found")

    family = family_groups[req.code]

    if any(m["id"] == user.user_id for m in family["members"]):
        raise HTTPException(status_code=400, detail="already_member")

    if len(family["members"]) >= 6:
        raise HTTPException(status_code=400, detail="family_full")

    family["members"].append({
        "id": user.user_id,
        "name": req.user_name,
        "role": "member",
        "joined": datetime.now(timezone.utc).isoformat(),
    })

    return {"family": family}


@app.get("/api/family/{code}")
async def get_family(
    code: str,
    user: AuthenticatedUser = Depends(require_user),
):
    """Get family group info (legacy in-memory).
    v3.9.0: requires authentication; caller must be a member of the family."""
    if code not in family_groups:
        raise HTTPException(status_code=404, detail="family_not_found")
    family = family_groups[code]
    if not any(m.get("id") == user.user_id for m in family.get("members", [])):
        raise HTTPException(status_code=403, detail="not_a_member")
    return {"family": family}


# ──────────────────────────────────────────────────
# BUDGET ALERTS & NOTIFICATIONS
# ──────────────────────────────────────────────────
class CheckBudgetRequest(BaseModel):
    user_id: str
    budgets: list[dict]    # [{category, limit}]
    expenses: list[dict]   # [{category, amount}]


@app.post("/api/alerts/check-budgets")
async def check_budgets(
    req: CheckBudgetRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Check budgets and generate alerts. v3.9.0: user_id from JWT."""
    alerts = []
    day_of_month = datetime.now().day
    progress = day_of_month / 30

    for budget in req.budgets:
        category = budget.get("category", "")
        limit_val = budget.get("limit", 0)
        if limit_val <= 0:
            continue

        spent = sum(e.get("amount", 0) for e in req.expenses if e.get("category") == category)
        pct = (spent / limit_val) * 100

        if pct >= 100:
            alerts.append({
                "id": f"alert_{category}_{datetime.now().strftime('%Y%m')}",
                "type": "budget_exceeded",
                "severity": "high",
                "title": f"Budget {category} dépassé!",
                "message": f"Vous avez dépensé CHF {spent:.0f} sur un budget de CHF {limit_val:.0f} ({pct:.0f}%)",
                "category": category,
                "spent": spent,
                "limit": limit_val,
                "percentage": pct,
            })
        elif pct >= 80:
            alerts.append({
                "id": f"alert_{category}_{datetime.now().strftime('%Y%m')}",
                "type": "budget_warning",
                "severity": "medium",
                "title": f"Budget {category} bientôt atteint",
                "message": f"Vous avez utilisé {pct:.0f}% de votre budget {category}",
                "category": category,
                "spent": spent,
                "limit": limit_val,
                "percentage": pct,
            })
        elif pct > progress * 100 * 1.2:
            alerts.append({
                "id": f"alert_{category}_{datetime.now().strftime('%Y%m')}",
                "type": "spending_pace",
                "severity": "low",
                "title": f"Rythme élevé: {category}",
                "message": f"À ce rythme, vous dépasserez votre budget {category} de CHF {(spent / progress - limit_val):.0f}",
                "category": category,
                "spent": spent,
                "limit": limit_val,
                "percentage": pct,
            })

    # Store alerts (v3.9.0: use JWT-derived user_id, never body)
    alerts_store[user.user_id] = alerts

    return {"alerts": alerts, "count": len(alerts)}


@app.get("/api/alerts/{user_id}")
async def get_alerts(
    user_id: str,
    user: AuthenticatedUser = Depends(require_user),
):
    """Get stored alerts. v3.9.0 SECURITY: caller can only fetch their own."""
    if user_id != user.user_id:
        raise HTTPException(status_code=403, detail="forbidden")
    return {"alerts": alerts_store.get(user.user_id, []), "count": len(alerts_store.get(user.user_id, []))}



# ──────────────────────────────────────────────────
# RECEIPT OCR - Vision AI to extract data from receipt photo
# ──────────────────────────────────────────────────
class OCRRequest(BaseModel):
    image_base64: str  # raw base64, no data: prefix
    mime_type: str = "image/jpeg"


class OCRResponse(BaseModel):
    success: bool
    merchant: Optional[str] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = "CHF"
    date: Optional[str] = None
    category: Optional[str] = None
    receipt_type: Optional[str] = None  # "ticket" or "remboursement"
    # Classification stricte requise pour router dans la bonne section :
    #   "invoice"  → Factures (à payer / payée)
    #   "receipt"  → Ticket de caisse / dépense déjà réglée
    #   "contract" → Contrat (assurance, leasing, bail, abonnement signé) → Mon Classeur
    #   "unknown"  → Demander confirmation à l'utilisateur (ne rien créer auto)
    document_type: Optional[str] = "unknown"
    needs_user_confirmation: Optional[bool] = False
    items: Optional[list] = None
    raw_text: Optional[str] = None
    confidence: Optional[float] = None
    error: Optional[str] = None


OCR_SYSTEM_PROMPT = """Tu es un assistant OCR expert pour les documents financiers suisses
(tickets, factures, contrats). Analyse l'image et extrais en JSON STRICT (rien d'autre).

CHAMPS À RETOURNER (obligatoire) :
{
  "merchant": "nom du commerçant ou émetteur",
  "total_amount": montant TTC en nombre (sans devise) ou null,
  "currency": "CHF" | "EUR" | "USD",
  "date": "YYYY-MM-DD" ou null,
  "category": une de ["courses", "restaurant", "transport", "sante", "loisirs", "shopping", "abonnements", "telecoms", "assurance", "loyer", "autre"],
  "receipt_type": "ticket" si ticket de caisse classique, "remboursement" si facture pro/médicale/employeur (utilisé uniquement si document_type = "receipt" ou "invoice"),
  "document_type": "invoice" | "receipt" | "contract" | "unknown",
  "items": ["item1", "item2", ...] (max 5),
  "confidence": 0.0 à 1.0
}

RÈGLES STRICTES POUR document_type (DO OR DIE — NE JAMAIS SE TROMPER) :
- "receipt"  = ticket de caisse / reçu d'un achat ponctuel déjà payé
              (Migros, Coop, Denner, Aldi, Lidl, restaurant, station-service,
              pharmacie sans facture, café, Uber, Migrolino, kiosque…).
- "invoice"  = facture nominative à payer ou récemment payée
              (facture médecin, hôpital, dentiste, facture telecom mensuelle,
              électricité, eau, gaz, ChargeFlow, BVR/QR-bill, mention "à payer
              avant le …", "Rechnung", "Zahlungsfrist", "due date", "à régler").
- "contract" = DOCUMENT CONTRACTUEL signé, plurianneuel ou récurrent
              (police d'assurance LAMal / RC / ménage / vie, contrat de
              leasing voiture, contrat de bail / location appartement,
              contrat de travail, abonnement signé pluriannuel CFF AG/
              demi-tarif, contrat télécom Swisscom/Salt/Sunrise avec durée,
              mots-clés "police d'assurance", "Versicherungspolice", "contrat",
              "Vertrag", "Mietvertrag", "Leasingvertrag", "durée", "résiliable",
              "abonnement annuel", "renouvellement tacite").
- "unknown"  = doute réel entre 2 catégories. Mets aussi confidence < 0.6.

INTERDICTIONS :
- NE JAMAIS retourner "receipt" ou "invoice" pour un contrat clairement signé.
- NE JAMAIS retourner "contract" pour un simple ticket de caisse.
- En cas d'hésitation entre invoice et contract → "unknown".

RÈGLES MONTANT / CATÉGORIE :
- total_amount = TOTAL FINAL TTC (pas un sous-total).
- Pour un contrat : total_amount = prime / loyer / mensualité indiqué.
- Migros/Coop/Denner = "courses", restaurant = "restaurant",
  CFF/SBB/Uber = "transport", pharmacie/médecin = "sante",
  assurance = "assurance", loyer/bail = "loyer".

Réponds UNIQUEMENT avec le JSON, sans markdown, sans commentaire."""


def parse_json_loose(text: str) -> dict:
    """Try to extract JSON from a text response."""
    text = text.strip()
    # Remove markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # Find first { ... last }
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    try:
        return json.loads(text)
    except Exception:
        return {}


@app.post("/api/scanner/ocr", response_model=OCRResponse)
@limiter.limit("20/minute; 200/hour")
async def scanner_ocr(
    request: Request,
    req: OCRRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Extract structured data from a receipt image using vision LLM."""
    if not EMERGENT_LLM_KEY:
        return OCRResponse(success=False, error="LLM key not configured")

    # v3.9.0 SECURITY: enforce max image size (~ 8 MB base64)
    if len(req.image_base64 or "") > 12_000_000:
        raise HTTPException(status_code=413, detail="image_too_large")

    # Strip any data:image/...;base64, prefix if present
    img_b64 = req.image_base64
    if img_b64.startswith("data:"):
        idx = img_b64.find(",")
        if idx > 0:
            img_b64 = img_b64[idx + 1:]

    # Validate image briefly
    try:
        raw = base64.b64decode(img_b64[:200] + "=" * (-len(img_b64[:200]) % 4))
        if len(raw) < 50:
            return OCRResponse(success=False, error="Image trop petite")
    except Exception:
        return OCRResponse(success=False, error="Base64 invalide")

    try:
        session_id = f"ocr_{uuid.uuid4().hex[:12]}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=OCR_SYSTEM_PROMPT,
        )
        chat.with_model("openai", "gpt-4o-mini")

        image_content = ImageContent(image_base64=img_b64)
        user_msg = UserMessage(
            text="Voici un ticket/facture. Extrais les données au format JSON strict.",
            file_contents=[image_content],
        )
        response = await chat.send_message(user_msg)

        data = parse_json_loose(response)
        if not data:
            return OCRResponse(success=False, raw_text=response, error="JSON invalide retourné par le modèle")

        # Coerce values
        amt_raw = data.get("total_amount")
        try:
            amt = float(amt_raw) if amt_raw is not None else None
        except Exception:
            amt = None

        # Strict routing classification
        doc_type = (data.get("document_type") or "unknown").lower().strip()
        if doc_type not in ("invoice", "receipt", "contract", "unknown"):
            doc_type = "unknown"
        conf = float(data.get("confidence", 0.7)) if data.get("confidence") is not None else 0.7
        needs_conf = (doc_type == "unknown") or (conf < 0.6)

        return OCRResponse(
            success=True,
            merchant=data.get("merchant"),
            total_amount=amt,
            currency=data.get("currency") or "CHF",
            date=data.get("date"),
            category=data.get("category") or "autre",
            receipt_type=data.get("receipt_type") or "ticket",
            document_type=doc_type,
            needs_user_confirmation=needs_conf,
            items=data.get("items") or [],
            confidence=conf,
            raw_text=response,
        )
    except Exception as e:
        log.exception("[ocr] failed: %s", e)
        return OCRResponse(success=False, error="ocr_failed")


# ──────────────────────────────────────────────────
# EMAIL INVOICE PARSING - Parse forwarded email / pasted content
# ──────────────────────────────────────────────────
class EmailParseRequest(BaseModel):
    content: str             # raw email text/html or pasted invoice
    subject: Optional[str] = ""
    from_addr: Optional[str] = ""


class EmailParseResponse(BaseModel):
    success: bool
    title: Optional[str] = None
    issuer: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "CHF"
    due_date: Optional[str] = None
    invoice_date: Optional[str] = None
    iban: Optional[str] = None
    reference: Optional[str] = None
    qr_reference: Optional[str] = None
    category: Optional[str] = None
    # Classification stricte requise pour router dans la bonne section :
    #   "invoice"  → Factures (à payer / payée)
    #   "contract" → Contrat (assurance, leasing, bail, abonnement signé) → Mon Classeur
    #   "unknown"  → Demander confirmation à l'utilisateur (ne rien créer auto)
    document_type: Optional[str] = "unknown"
    needs_user_confirmation: Optional[bool] = False
    confidence: Optional[float] = None
    error: Optional[str] = None


EMAIL_PARSE_PROMPT = """Tu es un assistant qui analyse un email ou un PDF de
document financier suisse. Tu dois IMPÉRATIVEMENT distinguer trois cas :

1. FACTURE (invoice)  → document avec un montant TTC à régler ou déjà payé
   à une date précise. Mots-clés : "facture", "Rechnung", "à payer avant",
   "Zahlungsfrist", "due date", "BVR", "QR-bill", "IBAN", "montant à
   payer", numéro de référence à 27 chiffres, montant unique.

2. CONTRAT (contract) → document contractuel signé, plurianneuel,
   à renouvellement tacite ou avec durée explicite. Mots-clés :
   "police d'assurance", "contrat", "Vertrag", "Versicherungspolice",
   "leasing", "Leasingvertrag", "bail", "Mietvertrag", "abonnement
   annuel CFF AG", "demi-tarif", "contrat de travail", "résiliable
   au …", "renouvellement tacite", "durée du contrat". Une police
   LAMal, RC, ménage, vie ou complémentaire est TOUJOURS un contrat
   (PAS une facture), même si elle indique une prime mensuelle.

3. UNKNOWN → doute réel entre invoice et contract.

Réponds UNIQUEMENT avec un JSON STRICT :
{
  "document_type": "invoice" | "contract" | "unknown",
  "title": "objet court du document",
  "issuer": "émetteur (entreprise)",
  "amount": montant TTC en nombre,
  "currency": "CHF" | "EUR",
  "due_date": "YYYY-MM-DD" ou null (seulement si invoice),
  "invoice_date": "YYYY-MM-DD" ou null,
  "iban": "IBAN si visible" ou null,
  "reference": "numéro de référence/BVR" ou null,
  "category": une de ["telecoms", "abonnements", "loyer", "assurance", "sante", "leasing", "energie", "autre"],
  "confidence": 0.0 à 1.0
}

INTERDICTIONS STRICTES :
- NE JAMAIS retourner "invoice" pour une police d'assurance, un contrat
  de bail, un contrat de leasing ou un contrat télécom signé.
- NE JAMAIS retourner "contract" pour une facture mensuelle isolée
  (ex: facture Swisscom d'un mois) — seulement pour le contrat signé.
- Si tu hésites, retourne "unknown" et baisse confidence < 0.6.

Mets null pour les champs manquants. Pas de markdown, pas de commentaire."""


@app.post("/api/email/parse", response_model=EmailParseResponse)
@limiter.limit("30/minute; 300/hour")
async def email_parse(
    request: Request,
    req: EmailParseRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Parse an email/invoice text into a structured invoice."""
    if not EMERGENT_LLM_KEY:
        return EmailParseResponse(success=False, error="LLM key not configured")

    try:
        session_id = f"email_{uuid.uuid4().hex[:12]}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=EMAIL_PARSE_PROMPT,
        )
        chat.with_model("openai", "gpt-4o-mini")

        body = (
            f"Sujet: {req.subject or '-'}\n"
            f"De: {req.from_addr or '-'}\n"
            f"Contenu:\n{req.content[:8000]}"
        )
        response = await chat.send_message(UserMessage(text=body))
        data = parse_json_loose(response)
        if not data:
            return EmailParseResponse(success=False, error="JSON invalide")

        try:
            amt = float(data.get("amount")) if data.get("amount") is not None else None
        except Exception:
            amt = None

        # Strict routing classification (DO OR DIE — Factures ≠ Contrats)
        doc_type = (data.get("document_type") or "unknown").lower().strip()
        if doc_type not in ("invoice", "contract", "unknown"):
            doc_type = "unknown"
        try:
            conf = float(data.get("confidence")) if data.get("confidence") is not None else 0.7
        except Exception:
            conf = 0.7
        needs_conf = (doc_type == "unknown") or (conf < 0.6)

        return EmailParseResponse(
            success=True,
            title=data.get("title"),
            issuer=data.get("issuer"),
            amount=amt,
            currency=data.get("currency") or "CHF",
            due_date=data.get("due_date"),
            invoice_date=data.get("invoice_date"),
            iban=data.get("iban"),
            reference=data.get("reference"),
            category=data.get("category") or "autre",
            document_type=doc_type,
            needs_user_confirmation=needs_conf,
            confidence=conf,
        )
    except Exception as e:
        log.exception("[email_parse] failed: %s", e)
        return EmailParseResponse(success=False, error="email_parse_failed")


# ──────────────────────────────────────────────────
# LAMAL SUBSIDIES - Calculate subsidy eligibility per canton/income
# ──────────────────────────────────────────────────
# Approximate 2025 subsidy thresholds per canton (CHF/year, single household)
# Source: simplified from cantonal published rules.
LAMAL_SUBSIDY_DATA = {
    # canton: (single_threshold, family_threshold, max_subsidy_single_chf_month)
    "AG": (50000, 90000, 250),
    "AI": (45000, 80000, 200),
    "AR": (47000, 85000, 220),
    "BE": (54000, 95000, 280),
    "BL": (53000, 95000, 290),
    "BS": (60000, 105000, 320),
    "FR": (52000, 92000, 260),
    "GE": (60000, 110000, 350),
    "GL": (47000, 84000, 220),
    "GR": (50000, 90000, 250),
    "JU": (52000, 92000, 270),
    "LU": (50000, 90000, 250),
    "NE": (55000, 98000, 290),
    "NW": (45000, 80000, 200),
    "OW": (45000, 80000, 200),
    "SG": (51000, 91000, 250),
    "SH": (50000, 90000, 250),
    "SO": (52000, 92000, 260),
    "SZ": (47000, 85000, 220),
    "TG": (51000, 91000, 250),
    "TI": (54000, 96000, 280),
    "UR": (47000, 84000, 210),
    "VD": (58000, 102000, 320),
    "VS": (53000, 95000, 270),
    "ZG": (50000, 90000, 250),
    "ZH": (54000, 96000, 290),
}


class SubsidyRequest(BaseModel):
    canton: str
    yearly_income: float
    household: str = "single"  # single | couple | family | single_parent
    children: int = 0
    monthly_premium: float = 0


class SubsidyResponse(BaseModel):
    eligible: bool
    estimated_monthly_subsidy: float
    estimated_yearly_subsidy: float
    threshold: float
    income_used: float
    explanation: str
    final_premium: float


@app.post("/api/lamal/subsidy", response_model=SubsidyResponse)
async def lamal_subsidy(req: SubsidyRequest):
    """Estimate LAMal subsidy eligibility based on income, canton, household."""
    canton_data = LAMAL_SUBSIDY_DATA.get(req.canton.upper())
    if not canton_data:
        canton_data = (50000, 90000, 250)
    single_thr, family_thr, max_sub = canton_data

    # Pick threshold based on household
    if req.household in ("couple", "family"):
        threshold = family_thr + req.children * 7000
    elif req.household == "single_parent":
        threshold = single_thr + req.children * 7000 + 5000
    else:
        threshold = single_thr

    income = max(0, req.yearly_income)
    eligible = income <= threshold

    if not eligible:
        return SubsidyResponse(
            eligible=False,
            estimated_monthly_subsidy=0,
            estimated_yearly_subsidy=0,
            threshold=threshold,
            income_used=income,
            final_premium=req.monthly_premium,
            explanation=(
                f"Avec un revenu annuel de CHF {income:,.0f} vous êtes au-dessus du seuil "
                f"cantonal {req.canton.upper()} ({threshold:,.0f} CHF). Aucun subside attendu."
            ).replace(",", "'"),
        )

    # Linear scale: full max_sub at income=0, 0 at income=threshold
    ratio = 1 - (income / threshold) if threshold > 0 else 0
    monthly_sub = round(max_sub * ratio)
    # Cap by actual premium
    if req.monthly_premium > 0:
        monthly_sub = min(monthly_sub, int(req.monthly_premium * 0.9))

    final_premium = max(0, req.monthly_premium - monthly_sub) if req.monthly_premium > 0 else 0

    return SubsidyResponse(
        eligible=True,
        estimated_monthly_subsidy=float(monthly_sub),
        estimated_yearly_subsidy=float(monthly_sub * 12),
        threshold=float(threshold),
        income_used=income,
        final_premium=float(final_premium),
        explanation=(
            f"Vous êtes éligible aux subsides LAMal {req.canton.upper()}. "
            f"Estimation: CHF {monthly_sub}/mois (~CHF {monthly_sub*12}/an). "
            f"Demande à faire auprès de l'Office cantonal d'assurance-maladie."
        ),
    )


# ──────────────────────────────────────────────────
# TAX SIMULATOR - Swiss tax with family situation
# ──────────────────────────────────────────────────

LAMAL_PREMIUMS_CH = {
    "GE": {300: 480, 500: 460, 1000: 430, 1500: 410, 2000: 395, 2500: 375},
    "VD": {300: 435, 500: 415, 1000: 385, 1500: 365, 2000: 350, 2500: 330},
    "ZH": {300: 420, 500: 400, 1000: 370, 1500: 350, 2000: 335, 2500: 315},
    "BE": {300: 395, 500: 375, 1000: 345, 1500: 325, 2000: 310, 2500: 290},
    "FR": {300: 395, 500: 375, 1000: 345, 1500: 325, 2000: 310, 2500: 290},
    "NE": {300: 440, 500: 420, 1000: 390, 1500: 370, 2000: 355, 2500: 335},
    "VS": {300: 390, 500: 370, 1000: 340, 1500: 320, 2000: 305, 2500: 285},
    "JU": {300: 415, 500: 395, 1000: 365, 1500: 345, 2000: 330, 2500: 310},
    "TI": {300: 395, 500: 375, 1000: 345, 1500: 325, 2000: 310, 2500: 290},
    "BS": {300: 440, 500: 420, 1000: 390, 1500: 370, 2000: 355, 2500: 335},
}
LAMAL_CHILD = {300: 130, 500: 115, 1000: 100, 1500: 90, 2000: 85, 2500: 80}
ICC_MULTIPLIERS = {
    "GE": 1.055, "VD": 1.545, "ZH": 1.11, "BE": 1.54, "FR": 1.37, "NE": 1.35,
    "VS": 1.30, "JU": 1.69, "TI": 1.00, "BS": 1.00, "LU": 1.585, "SG": 1.15,
    "AG": 1.12, "SO": 1.17, "GR": 0.98, "SH": 1.00, "ZG": 0.59, "SZ": 1.26,
}


class TaxSimulatorRequest(BaseModel):
    gross_salary: float
    canton: str = "VD"
    civil_status: str = "single"
    spouse_income: Optional[float] = 0
    num_children: int = 0
    age: int = 35
    lamal_franchise: int = 300
    pillar_3a: float = 0
    transport_costs: float = 0
    other_deductions: float = 0


class TaxDeduction(BaseModel):
    label: str
    amount: float
    source: str


class TaxSimulatorResponse(BaseModel):
    success: bool
    gross_salary: float
    lamal_annual: float
    lamal_monthly: float
    deductions: list[TaxDeduction]
    total_deductions: float
    taxable_income: float
    ifd: float
    icc: float
    total_tax: float
    net_income: float
    effective_rate: float
    savings_tips: list[str]


def _compute_ifd(taxable: float, married: bool) -> float:
    t = max(0, taxable)
    if married:
        if t <= 30800: return 0
        if t <= 50900: return (t - 30800) * 0.01
        if t <= 58400: return 201 + (t - 50900) * 0.02
        if t <= 75300: return 351 + (t - 58400) * 0.03
        if t <= 90300: return 858 + (t - 75300) * 0.04
        if t <= 103400: return 1458 + (t - 90300) * 0.05
        if t <= 114700: return 2113 + (t - 103400) * 0.06
        if t <= 124200: return 2791 + (t - 114700) * 0.07
        if t <= 131700: return 3456 + (t - 124200) * 0.08
        if t <= 137300: return 4056 + (t - 131700) * 0.09
        if t <= 141200: return 4560 + (t - 137300) * 0.10
        return 4950 + (t - 141200) * 0.11
    if t <= 15900: return 0
    if t <= 34600: return (t - 15900) * 0.0077
    if t <= 45300: return 144 + (t - 34600) * 0.0088
    if t <= 60400: return 238 + (t - 45300) * 0.0264
    if t <= 79300: return 637 + (t - 60400) * 0.0288
    if t <= 85400: return 1181 + (t - 79300) * 0.0468
    if t <= 113200: return 1467 + (t - 85400) * 0.0572
    if t <= 148000: return 3057 + (t - 113200) * 0.0660
    if t <= 193500: return 5354 + (t - 148000) * 0.0880
    return 9359 + (t - 193500) * 0.1100


def _compute_icc_base(taxable: float, married: bool) -> float:
    t = max(0, taxable)
    if married:
        if t <= 30000: return 0
        if t <= 60000: return (t - 30000) * 0.03
        if t <= 120000: return 900 + (t - 60000) * 0.065
        if t <= 200000: return 4800 + (t - 120000) * 0.095
        return 12400 + (t - 200000) * 0.115
    if t <= 17800: return 0
    if t <= 35000: return (t - 17800) * 0.03
    if t <= 80000: return 516 + (t - 35000) * 0.07
    if t <= 140000: return 3666 + (t - 80000) * 0.10
    return 9666 + (t - 140000) * 0.125


@app.post("/api/tax/simulate", response_model=TaxSimulatorResponse)
async def tax_simulate(req: TaxSimulatorRequest):
    canton = req.canton.upper()
    married = req.civil_status in ("married", "partnership")
    spouse_income = req.spouse_income if married else 0
    total_income = req.gross_salary + (spouse_income or 0)

    canton_premiums = LAMAL_PREMIUMS_CH.get(canton, LAMAL_PREMIUMS_CH["VD"])
    franchise = req.lamal_franchise if req.lamal_franchise in canton_premiums else 300
    lamal_adult = canton_premiums[franchise]
    lamal_month = lamal_adult * (2 if married else 1) + LAMAL_CHILD[franchise] * req.num_children
    lamal_annual = lamal_month * 12

    deductions: list[TaxDeduction] = []
    pro = min(4000, max(2000, req.gross_salary * 0.03))
    deductions.append(TaxDeduction(label="Frais professionnels (3%, 2'000-4'000)", amount=round(pro, 2), source="AFC"))

    social = req.gross_salary * 0.064
    deductions.append(TaxDeduction(label="Cotisations sociales (AVS/AI/APG/AC 6.4%)", amount=round(social, 2), source="AVS"))

    lpp = req.gross_salary * 0.07
    deductions.append(TaxDeduction(label="Cotisations LPP (~7%)", amount=round(lpp, 2), source="LPP"))

    max_3a = 7258
    pillar_3a = min(req.pillar_3a, max_3a)
    if pillar_3a > 0:
        deductions.append(TaxDeduction(label="3ᵉ pilier lié (3a)", amount=pillar_3a, source="AFC"))

    ins_cap = (3600 if married else 1800) + 700 * req.num_children
    insurance_ded = min(lamal_annual, ins_cap)
    deductions.append(TaxDeduction(label="Primes d'assurance-maladie (plafonnées)", amount=round(insurance_ded, 2), source="LIFD art.33"))

    if req.num_children > 0:
        child_ded = 6700 * req.num_children
        deductions.append(TaxDeduction(label=f"Déduction pour {req.num_children} enfant(s) × 6'700", amount=child_ded, source="AFC"))

    if married:
        deductions.append(TaxDeduction(label="Déduction couple marié", amount=2800, source="AFC"))

    transport = min(3200, req.transport_costs)
    if transport > 0:
        deductions.append(TaxDeduction(label="Frais de transport (max 3'200)", amount=transport, source="AFC"))

    if req.other_deductions > 0:
        deductions.append(TaxDeduction(label="Autres déductions", amount=req.other_deductions, source="Perso"))

    total_ded = sum(d.amount for d in deductions)
    taxable = max(0, total_income - total_ded)

    ifd = round(_compute_ifd(taxable, married), 2)
    icc_base = _compute_icc_base(taxable, married)
    icc = round(icc_base * ICC_MULTIPLIERS.get(canton, 1.3), 2)
    total_tax = ifd + icc
    net_income = total_income - total_tax - lamal_annual
    effective_rate = (total_tax / total_income * 100) if total_income > 0 else 0

    tips = []
    if pillar_3a < max_3a:
        gap = max_3a - pillar_3a
        save = int(gap * 0.25)
        tips.append(f"💡 Cotisez CHF {gap:,} de plus au 3ᵉ pilier → économie fiscale ~CHF {save:,}/an".replace(',', "'"))
    if franchise < 2500 and total_income > 100000:
        diff = (canton_premiums[franchise] - canton_premiums[2500]) * 12
        tips.append(f"💡 Franchise LAMal à 2'500 économise ~CHF {int(diff):,}/an (si peu de soins)".replace(',', "'"))
    if req.num_children > 0:
        tips.append("💡 Pensez aux frais de garde déductibles (jusqu'à 25'000 CHF/enfant en IFD)")
    tips.append("💡 Frais de formation continue déductibles jusqu'à CHF 12'000/an")

    return TaxSimulatorResponse(
        success=True,
        gross_salary=req.gross_salary,
        lamal_annual=round(lamal_annual, 2),
        lamal_monthly=round(lamal_month, 2),
        deductions=deductions,
        total_deductions=round(total_ded, 2),
        taxable_income=round(taxable, 2),
        ifd=ifd, icc=icc,
        total_tax=round(total_tax, 2),
        net_income=round(net_income, 2),
        effective_rate=round(effective_rate, 2),
        savings_tips=tips,
    )


# ──────────────────────────────────────────────────
# AI OPTIMIZER - Smart savings recommendations
# ──────────────────────────────────────────────────
class OptimizerRequest(BaseModel):
    monthly_income: float
    yearly_income: float | None = None
    canton: str = "VD"
    transactions: list[dict] = []        # [{title, amount, category, date}]
    recurring_expenses: list[dict] = []  # [{title, amount, category, frequency}]
    contracts: list[dict] = []           # [{name, type, monthlyCost}]
    debts: list[dict] = []               # [{name, balance, rate, monthlyPayment}]
    goals: list[dict] = []               # [{title, target, saved, deadline}]
    currency: str = "CHF"


class SavingProposal(BaseModel):
    title: str
    category: str                # 'subscription' | 'insurance' | 'food' | 'energy' | 'telco' | 'bank' | 'other'
    current_monthly: float
    potential_saving_monthly: float
    potential_saving_yearly: float
    effort: str                  # 'easy' | 'medium' | 'hard'
    action: str                  # concrete actionable step
    explanation: str


class OptimizerResponse(BaseModel):
    success: bool
    summary: str
    monthly_potential: float
    yearly_potential: float
    proposals: list[SavingProposal] = []
    tips: list[str] = []
    error: Optional[str] = None


def _fallback_optimizer(req: OptimizerRequest) -> OptimizerResponse:
    """Heuristic optimizer used if LLM fails."""
    proposals: list[SavingProposal] = []
    # Detect subscriptions
    for r in req.recurring_expenses or []:
        title = str(r.get("title", "")).lower()
        amount = float(r.get("amount") or 0)
        if amount <= 0:
            continue
        if any(k in title for k in ["netflix", "spotify", "disney", "youtube", "hbo", "prime", "apple tv"]):
            proposals.append(SavingProposal(
                title=f"Revoir abonnement {r.get('title')}",
                category="subscription",
                current_monthly=amount,
                potential_saving_monthly=round(amount * 0.5, 2),
                potential_saving_yearly=round(amount * 6, 2),
                effort="easy",
                action=f"Partagez {r.get('title')} en famille ou alternez un mois sur deux.",
                explanation="Le streaming partagé divise le coût jusqu'à 2x."
            ))
    # Insurance check (LAMal)
    lamal = [r for r in req.recurring_expenses or [] if "assur" in str(r.get("title", "")).lower() or "lamal" in str(r.get("title", "")).lower()]
    if lamal:
        total = sum(float(r.get("amount") or 0) for r in lamal)
        if total > 350:
            proposals.append(SavingProposal(
                title="Comparer votre LAMal",
                category="insurance",
                current_monthly=total,
                potential_saving_monthly=round(total * 0.2, 2),
                potential_saving_yearly=round(total * 2.4, 2),
                effort="medium",
                action="Utilisez le comparateur LAMal (26 cantons, 15 assureurs Priminfo 2026).",
                explanation="Changer d'assureur peut économiser 15-25% à prestations identiques."
            ))
    # High frequency small purchases
    small_bills = [t for t in req.transactions or [] if 0 < float(t.get("amount") or 0) < 15]
    if len(small_bills) > 20:
        total = sum(float(t.get("amount") or 0) for t in small_bills)
        proposals.append(SavingProposal(
            title="Micro-dépenses fréquentes",
            category="food",
            current_monthly=round(total, 2),
            potential_saving_monthly=round(total * 0.3, 2),
            potential_saving_yearly=round(total * 3.6, 2),
            effort="easy",
            action="Préparez vos cafés & repas à la maison 2 jours/semaine.",
            explanation=f"{len(small_bills)} micro-transactions détectées — réduire de 30% équivaut à CHF {round(total*0.3)} économisés."
        ))

    monthly_total = sum(p.potential_saving_monthly for p in proposals)
    return OptimizerResponse(
        success=True,
        summary=f"Analyse heuristique (fallback) : {len(proposals)} pistes d'économie détectées.",
        monthly_potential=round(monthly_total, 2),
        yearly_potential=round(monthly_total * 12, 2),
        proposals=proposals,
        tips=[
            "Renégociez vos assurances chaque automne (délai résiliation : 30 novembre).",
            "Mettez en place un virement automatique de 10% de votre salaire vers l'épargne.",
            "Utilisez le 3ᵉ pilier (CHF 7'258/an en 2025) pour réduire vos impôts.",
        ],
    )


@app.post("/api/optimizer/analyze", response_model=OptimizerResponse)
@limiter.limit("20/minute; 200/hour")
async def optimizer_analyze(
    request: Request,
    req: OptimizerRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Analyze user's financial snapshot and propose concrete savings via AI."""
    if not EMERGENT_LLM_KEY:
        return _fallback_optimizer(req)

    # Build compact snapshot for the LLM
    yearly = req.yearly_income or (req.monthly_income * 12)

    # Aggregate transactions by category
    cat_totals: dict[str, float] = {}
    for t in req.transactions or []:
        c = str(t.get("category") or "autre")
        cat_totals[c] = cat_totals.get(c, 0) + abs(float(t.get("amount") or 0))

    rec_summary = "\n".join(
        f"- {r.get('title')}: {r.get('amount')} {req.currency}/{r.get('frequency','monthly')}"
        for r in (req.recurring_expenses or [])[:15]
    ) or "(aucun abonnement listé)"

    cat_summary = "\n".join(
        f"- {c}: {v:.0f} {req.currency}" for c, v in sorted(cat_totals.items(), key=lambda x: -x[1])[:10]
    ) or "(aucune transaction)"

    contracts_summary = "\n".join(
        f"- {c.get('name')} ({c.get('type', '?')}): {c.get('monthlyCost', 0)} {req.currency}/mois"
        for c in (req.contracts or [])[:10]
    ) or "(aucun contrat)"

    debts_summary = "\n".join(
        f"- {d.get('name')}: solde {d.get('balance', 0)} {req.currency} à {d.get('rate', 0)}% ({d.get('monthlyPayment', 0)}/mois)"
        for d in (req.debts or [])[:10]
    ) or "(aucune dette)"

    prompt = f"""Tu es un conseiller financier suisse expert. Analyse cette situation et propose 3 à 6 ÉCONOMIES concrètes.

REVENU MENSUEL NET : {req.monthly_income:.0f} {req.currency}
REVENU ANNUEL : {yearly:.0f} {req.currency}
CANTON : {req.canton}

DÉPENSES PAR CATÉGORIE (mois courant) :
{cat_summary}

ABONNEMENTS / CHARGES RÉCURRENTES :
{rec_summary}

CONTRATS :
{contracts_summary}

DETTES :
{debts_summary}

Rends UNIQUEMENT un JSON strict (sans texte avant/après) avec cette forme :
{{
  "summary": "Résumé en 1-2 phrases en français.",
  "proposals": [
    {{
      "title": "Titre court de l'économie",
      "category": "subscription|insurance|food|energy|telco|bank|tax|other",
      "current_monthly": 0,
      "potential_saving_monthly": 0,
      "potential_saving_yearly": 0,
      "effort": "easy|medium|hard",
      "action": "Action concrète et actionnable en 1 phrase.",
      "explanation": "Pourquoi cette économie est réaliste."
    }}
  ],
  "tips": ["Conseil général 1", "Conseil général 2", "Conseil général 3"]
}}

RÈGLES :
- Propose des économies RÉALISTES basées sur les données réelles.
- Cite des montants précis en {req.currency}.
- Si LAMal > 300 CHF/mois, suggère comparateur LAMal.
- Mentionne le 3ᵉ pilier si pertinent (CHF 7'258/an en 2025).
- Si dette à taux > 8%, propose consolidation.
- Effort 'easy' = faisable en 10 min, 'medium' = 1h, 'hard' = démarche longue.
"""

    try:
        session_id = f"optimizer_{uuid.uuid4().hex[:8]}"
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message="Tu es un conseiller financier suisse qui ne répond qu'en JSON strict.") \
            .with_model("openai", "gpt-4o-mini")
        response = await chat.send_message(UserMessage(text=prompt))

        # Extract JSON loosely
        raw = response if isinstance(response, str) else str(response)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return _fallback_optimizer(req)
        data = json.loads(match.group(0))

        proposals: list[SavingProposal] = []
        for p in data.get("proposals", [])[:8]:
            try:
                proposals.append(SavingProposal(
                    title=str(p.get("title", "Économie"))[:80],
                    category=str(p.get("category", "other")),
                    current_monthly=float(p.get("current_monthly") or 0),
                    potential_saving_monthly=float(p.get("potential_saving_monthly") or 0),
                    potential_saving_yearly=float(p.get("potential_saving_yearly") or (float(p.get("potential_saving_monthly") or 0) * 12)),
                    effort=str(p.get("effort", "medium")),
                    action=str(p.get("action", ""))[:240],
                    explanation=str(p.get("explanation", ""))[:240],
                ))
            except Exception:
                continue

        monthly_total = sum(p.potential_saving_monthly for p in proposals)
        return OptimizerResponse(
            success=True,
            summary=str(data.get("summary", "Analyse complétée."))[:200],
            monthly_potential=round(monthly_total, 2),
            yearly_potential=round(monthly_total * 12, 2),
            proposals=proposals,
            tips=[str(t)[:160] for t in (data.get("tips", []) or [])[:5]],
        )
    except Exception as e:
        print(f"[optimizer] LLM failed, using fallback: {e}")
        return _fallback_optimizer(req)


# ═══════════════════════════════════════════════════════════════════════════
# IN-APP PURCHASE — moved into the unified IAP block at the bottom of file.
# (legacy verifyReceipt removed in favor of App Store Server API).
# ═══════════════════════════════════════════════════════════════════════════
ALLOWED_PRODUCT_IDS = {"com.budgy.ch.budgy.monthly", "com.budgy.ch.budgy.annual"}


# ═══════════════════════════════════════════════════════════════════════════
# VOICE — Parse natural language into a Budgy transaction
# ═══════════════════════════════════════════════════════════════════════════
import re as _re

class VoiceParseRequest(BaseModel):
    text: str
    locale: Optional[str] = "fr-CH"


class VoiceParseResponse(BaseModel):
    success: bool
    type: Optional[str] = None       # "expense" | "income" | "subscription"
    amount: Optional[float] = None
    currency: Optional[str] = "CHF"
    merchant: Optional[str] = None
    category: Optional[str] = None
    recurring: Optional[bool] = False
    date: Optional[str] = None
    confidence: Optional[float] = 0.0
    error: Optional[str] = None


def _parse_voice_local(text: str) -> dict:
    """Lightweight regex-based parser as fallback or when LLM unavailable."""
    t = (text or "").lower().strip()
    if not t:
        return {"success": False, "error": "Texte vide"}

    # Type
    income_kw = ["salaire", "reçu", "revenu", "j'ai reçu", "remboursement"]
    sub_kw = ["abonnement", "netflix", "spotify", "icloud", "youtube", "prime", "disney",
              "chaque mois", "tous les mois", "mensuel", "par mois",
              "contrat", "police d'assurance", "police assurance", "leasing"]
    is_income = any(k in t for k in income_kw)
    is_sub = any(k in t for k in sub_kw)
    typ = "income" if is_income else ("subscription" if is_sub else "expense")

    # Amount: number followed by francs/chf/€
    amount = None
    m = _re.search(r"(\d+[\.,]?\d*)\s*(francs?|chf|fr\.?|€)", t)
    if not m:
        m = _re.search(r"(\d+[\.,]?\d*)", t)
    if m:
        try:
            amount = float(m.group(1).replace(",", "."))
        except Exception:
            amount = None

    # Merchant: capture word after "chez", "à", "de" (last) or known brand
    merchant = None
    mm = _re.search(r"chez ([a-zàâäéèêëïîôöùûüÿç&'\- 0-9]+)", t)
    if mm:
        merchant = mm.group(1).strip().split(" ")[0].title()
    else:
        for brand in ["migros", "coop", "denner", "aldi", "lidl", "manor", "ikea",
                      "swisscom", "salt", "sunrise", "css", "helsana",
                      "netflix", "spotify", "icloud", "youtube", "disney"]:
            if brand in t:
                merchant = brand.title()
                break

    # Category guess
    cat_map = {
        "alimentation": ["migros", "coop", "denner", "aldi", "lidl", "course"],
        "essence": ["essence", "carburant", "shell", "bp", "tamoil", "agrola", "coop pronto", "migrol"],
        "transport": ["cff", "ffs", "tpf", "tl", "tpg", "transport"],
        "abonnement": sub_kw,
        "telephone": ["swisscom", "salt", "sunrise"],
        "assurance": ["css", "helsana", "concordia", "groupe mutuel", "visana", "swica"],
        "loyer": ["loyer", "rent", "régie"],
        "salaire": ["salaire"],
    }
    category = None
    for cat, words in cat_map.items():
        if any(w in t for w in words):
            category = cat
            break

    return {
        "success": amount is not None,
        "type": typ,
        "amount": amount,
        "currency": "CHF",
        "merchant": merchant,
        "category": category,
        "recurring": is_sub,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "confidence": 0.6 if amount is not None else 0.2,
        "error": None if amount is not None else "Aucun montant détecté",
    }


@app.post("/api/voice/parse", response_model=VoiceParseResponse)
@limiter.limit("60/minute; 600/hour")
async def voice_parse(
    request: Request,
    req: VoiceParseRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Parse a natural language sentence into a structured transaction."""
    text = (req.text or "").strip()
    # v3.9.0 SECURITY: max sentence length
    if len(text) > 1000:
        raise HTTPException(status_code=413, detail="text_too_long")
    if not text:
        return VoiceParseResponse(success=False, error="Texte vide")

    # Try LLM if available, fallback to regex
    try:
        if EMERGENT_LLM_KEY:
            today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            # Locale → user-language hint for the LLM
            locale = (getattr(req, "locale", None) or "fr-CH").lower()
            lang_hint = "French (Swiss French)"
            if locale.startswith("en"): lang_hint = "English"
            elif locale.startswith("de"): lang_hint = "German (Swiss German welcome)"
            elif locale.startswith("it"): lang_hint = "Italian"
            elif locale.startswith("es"): lang_hint = "Spanish"
            elif locale.startswith("pt"): lang_hint = "Portuguese"
            elif locale.startswith("sq"): lang_hint = "Albanian"
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"voice-{uuid.uuid4()}",
                system_message=(
                    f"You are a Swiss financial parser. Today is {today_iso}. "
                    f"The user speaks {lang_hint}. Understand the sentence in that language, "
                    "but ALWAYS reply in STRICT JSON with these EXACT English keys (do not translate keys): "
                    "{type:'expense'|'income'|'subscription', amount: number, "
                    "currency:'CHF', merchant: string|null, category: string|null, "
                    f"recurring: bool, date: 'YYYY-MM-DD' (default to {today_iso} unless explicitly stated)"
                    "}. The merchant and category VALUES may stay in the user language. No other text outside JSON."
                ),
            ).with_model("openai", "gpt-4o-mini")
            r = await chat.send_message(UserMessage(text=f"Phrase: {text}"))
            content = r if isinstance(r, str) else getattr(r, "content", "")
            # Extract JSON
            jm = _re.search(r"\{.*\}", content, _re.DOTALL)
            if jm:
                import json as _json
                parsed = _json.loads(jm.group(0))
                parsed["success"] = bool(parsed.get("amount"))
                parsed["confidence"] = 0.9 if parsed["success"] else 0.4
                print(f"[voice] LLM parsed: {parsed}")
                return VoiceParseResponse(**parsed)
    except Exception as e:
        print(f"[voice] LLM failed, falling back to regex: {e}")

    return VoiceParseResponse(**_parse_voice_local(text))


# ─────────────────────────────────────────────────────────────────────────────
# IAP v2 — App Store Server API (production-ready)
# Endpoints:
#   POST /api/iap/validate2        Validate a transactionId after a purchase
#   POST /api/iap/restore          Restore: pass any known originalTransactionId
#   POST /api/iap/webhook/apple    App Store Server Notifications V2 webhook
#   GET  /api/iap/me               Current subscription record from Supabase
# ─────────────────────────────────────────────────────────────────────────────
import logging as _logging
from typing import Any as _Any, Dict
from fastapi import Request as _Request, Header as _Header, Query as _Query
from fastapi.responses import JSONResponse
from apple_iap import (
    IAPConfig as _IAPConfig,
    validate_purchase as _validate_purchase,
    restore_for as _restore_for,
    parse_webhook_payload as _parse_webhook,
    verify_and_decode_notification as _verify_and_decode_notification,
)
import supabase_admin as _supabase_admin

_iap_log = _logging.getLogger("iap")
_iap_log.setLevel(_logging.INFO)
if not _iap_log.handlers:
    _h = _logging.StreamHandler()
    _h.setFormatter(_logging.Formatter("%(asctime)s [%(name)s] %(levelname)s %(message)s"))
    _iap_log.addHandler(_h)

_iap_cfg = _IAPConfig.from_env()
print(f"[iap] startup config → {_iap_cfg.fingerprint()}")
if not _iap_cfg.is_ready():
    print(f"[iap] WARNING — missing env vars: {_iap_cfg.missing()} (endpoints will return 503)")
if not _supabase_admin.is_configured():
    print("[iap] WARNING — Supabase not configured (state will not persist server-side)")


class IapValidateRequest(BaseModel):
    """Frontend → Backend after a successful StoreKit purchase.

    Required: at least one of `transaction_id` (preferred) or `receipt_data`.
    The transaction_id path uses the App Store Server API (production-ready,
    StoreKit 2). When `user_id` is provided, the resulting state is persisted
    to Supabase (`user_subscriptions` table) for cross-device sync.
    """
    platform: str = "ios"                 # "ios" | "android" (android NYI)
    product_id: Optional[str] = None      # informational
    transaction_id: Optional[str] = None  # preferred (StoreKit 2)
    receipt_data: Optional[str] = None    # legacy iOS verifyReceipt fallback
    user_id: Optional[str] = None         # supabase user uuid (for sync)


class IapRestoreRequest(BaseModel):
    original_transaction_id: Optional[str] = None
    transaction_id: Optional[str] = None  # accepted as fallback
    user_id: Optional[str] = None


def _state_to_response(state: dict) -> dict:
    """Normalize Apple state → frontend-friendly JSON."""
    expires_ms = None
    iso = state.get("pro_until")
    if iso:
        try:
            from datetime import datetime as _dt
            expires_ms = int(_dt.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            expires_ms = None
    return {
        "valid": bool(state.get("is_pro")),
        "ok": bool(state.get("ok")),
        "subscription_state": state.get("state", "FREE"),
        "product_id": state.get("product_id"),
        "expires_at": expires_ms,
        "pro_until": iso,
        "original_transaction_id": state.get("original_transaction_id"),
        "environment": state.get("environment"),
        "auto_renew": state.get("auto_renew"),
        "error": state.get("error"),
    }


@app.post("/api/iap/validate")
@limiter.limit("30/minute")
async def iap_validate(
    request: Request,
    req: IapValidateRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Validate an Apple StoreKit purchase via App Store Server API.

    v3.9.0 SECURITY: user_id is ALWAYS derived from the JWT — client-supplied
    value in the body is IGNORED.
    """
    if req.platform != "ios":
        return {"valid": False, "error": "android_not_supported_yet"}
    if req.product_id and req.product_id not in ALLOWED_PRODUCT_IDS:
        return {"valid": False, "error": f"unknown_product:{req.product_id}"}
    if not _iap_cfg.is_ready():
        return JSONResponse(
            status_code=503,
            content={
                "valid": False,
                "ok": False,
                "error": "iap_not_configured",
                "missing": _iap_cfg.missing(),
            },
        )
    if not req.transaction_id:
        return {"valid": False, "error": "missing_transaction_id"}

    try:
        state = await _validate_purchase(_iap_cfg, req.transaction_id)
    except Exception as e:
        _iap_log.exception("[iap-validation] unexpected: %s", e)
        return {"valid": False, "error": "validation_error"}

    if state.get("ok"):
        try:
            # SECURITY: use authenticated user_id, never req.user_id
            await _supabase_admin.upsert_subscription(user.user_id, state)
        except Exception as e:
            _iap_log.warning("[iap-validation] supabase upsert failed: %s", e)
    return _state_to_response(state)


@app.post("/api/iap/restore")
@limiter.limit("30/minute")
async def iap_restore(
    request: Request,
    req: IapRestoreRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    """Re-derive subscription state from a known originalTransactionId.

    v3.9.0 SECURITY: user_id is derived from JWT.
    """
    if not _iap_cfg.is_ready():
        return JSONResponse(
            status_code=503,
            content={"valid": False, "ok": False, "error": "iap_not_configured"},
        )
    orig = req.original_transaction_id or req.transaction_id
    if not orig:
        return {"valid": False, "error": "missing_original_transaction_id"}
    try:
        state = await _restore_for(_iap_cfg, orig)
    except Exception as e:
        _iap_log.exception("[iap-restore] unexpected: %s", e)
        return {"valid": False, "error": "restore_error"}
    if state.get("ok"):
        try:
            await _supabase_admin.upsert_subscription(user.user_id, state)
        except Exception as e:
            _iap_log.warning("[iap-restore] supabase upsert failed: %s", e)
    return _state_to_response(state)


@app.post("/api/iap/webhook/apple")
@limiter.limit("240/minute")
async def iap_webhook_apple(
    request: Request,
    secret: Optional[str] = _Query(None),
    x_iap_secret: Optional[str] = _Header(None, alias="X-IAP-Secret"),
):
    """App Store Server Notifications V2 webhook.

    v3.9.0 SECURITY:
    - The IAP_WEBHOOK_SECRET is now REQUIRED (fail closed).
    - Prefer the X-IAP-Secret header over the ?secret= query param
      (query strings can be logged by proxies).
    - Comparison uses hmac.compare_digest (constant time) to prevent timing.
    - The JWS signedPayload is verified using Apple's certificate chain
      (see apple_iap.verify_and_decode_notification).
    - Bundle ID + environment are enforced.
    """
    import hmac as _hmac
    # 1) Require the shared secret (defense-in-depth in addition to JWS check)
    if not _iap_cfg.webhook_secret:
        _iap_log.error("[iap-webhook] IAP_WEBHOOK_SECRET is not configured — rejecting")
        raise HTTPException(status_code=503, detail="webhook_not_configured")
    provided = (x_iap_secret or secret or "").strip()
    if not provided or not _hmac.compare_digest(provided, _iap_cfg.webhook_secret):
        _iap_log.warning("[iap-webhook] rejected: bad/missing secret")
        raise HTTPException(status_code=401, detail="bad_secret")

    try:
        body = await request.json()
    except Exception:
        body = {}
    signed_payload = (body or {}).get("signedPayload", "")
    if not signed_payload:
        _iap_log.warning("[iap-webhook] empty signedPayload")
        raise HTTPException(status_code=400, detail="empty_payload")

    # 2) Verify JWS signature + certificate chain
    try:
        decoded = _verify_and_decode_notification(signed_payload, _iap_cfg)
    except Exception as e:
        _iap_log.warning("[iap-webhook] JWS verification failed: %s", type(e).__name__)
        raise HTTPException(status_code=401, detail="invalid_signature")

    n_type = decoded.get("notificationType")
    txn = decoded.get("transactionInfo") or {}
    orig = txn.get("originalTransactionId")

    # 3) Enforce bundle-id + environment match
    if txn.get("bundleId") and txn["bundleId"] != _iap_cfg.bundle_id:
        _iap_log.warning("[iap-webhook] bundle_id mismatch: %s", txn["bundleId"])
        raise HTTPException(status_code=401, detail="bundle_id_mismatch")

    _iap_log.info(
        "[iap-webhook] type=%s subtype=%s orig=%s",
        n_type,
        decoded.get("subtype"),
        (orig or "?")[:6] + "…",
    )

    # 4) Re-derive state by calling Apple again — single source of truth.
    if orig:
        try:
            state = await _restore_for(_iap_cfg, orig)
            if state.get("ok"):
                await _supabase_admin.upsert_by_original_transaction(orig, state)
        except Exception as e:
            _iap_log.exception("[iap-webhook] re-derive failed: %s", e)

    return {"ok": True, "notificationType": n_type}


@app.get("/api/iap/me")
async def iap_me(
    request: Request,
    user: AuthenticatedUser = Depends(require_user),
):
    """v3.9.0 SECURITY: user_id derived from JWT — no more query param spoofing."""
    rec = await _supabase_admin.fetch_subscription(user.user_id)
    if not rec:
        return {"is_pro": False, "subscription_state": "FREE"}
    return rec


@app.get("/api/iap/health")
async def iap_health():
    """Quick diagnostic — never returns secrets."""
    return {
        "iap_ready": _iap_cfg.is_ready(),
        "supabase_ready": _supabase_admin.is_configured(),
        "missing": _iap_cfg.missing(),
        "sandbox": _iap_cfg.use_sandbox,
        "products": [_iap_cfg.product_monthly or None, _iap_cfg.product_yearly or None],
    }
