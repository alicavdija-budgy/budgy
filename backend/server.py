"""
GUARDIAN MONEY CHF - Backend API
Coach IA, PDF Export, Family Mode, Notifications
"""

import os
import uuid
import random
import string
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import re
import base64
from emergentintegrations.llm.chat import ImageContent
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

app = FastAPI(title="Budgy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores (production would use MongoDB/Supabase)
chat_sessions: dict[str, LlmChat] = {}
family_groups: dict[str, dict] = {}  # code -> { owner, members, name }
alerts_store: dict[str, list] = {}   # user_id -> [alerts]


# ──────────────────────────────────────────────────
# Health Check
# ──────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "3.4", "app": "Budgy"}


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
async def coach_chat(req: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        # Get or create chat session
        if req.session_id not in chat_sessions:
            system_msg = SYSTEM_PROMPT
            if req.financial_context:
                system_msg += f"\n\nCONTEXTE FINANCIER DE L'UTILISATEUR:\n{req.financial_context}"

            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=req.session_id,
                system_message=system_msg,
            )
            chat.with_model("openai", "gpt-4o-mini")
            chat_sessions[req.session_id] = chat

        chat = chat_sessions[req.session_id]
        user_msg = UserMessage(text=req.message)
        response = await chat.send_message(user_msg)

        return ChatResponse(response=response, session_id=req.session_id)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


@app.post("/api/export/pdf")
async def export_pdf(req: PDFExportRequest):
    """Generate expense report HTML (can be converted to PDF on client)"""
    total_ht = sum(e.get("amount", 0) for e in req.expenses)
    tva_rate = 8.1
    total_tva = round(total_ht * tva_rate / 100, 2)
    total_ttc = round(total_ht + total_tva, 2)

    rows_html = ""
    for i, exp in enumerate(req.expenses, 1):
        tva_amount = round(exp.get("amount", 0) * tva_rate / 100, 2)
        rows_html += f"""
        <tr>
            <td>{i}</td>
            <td>{exp.get('date', '')}</td>
            <td>{exp.get('title', '')}</td>
            <td>{exp.get('category', '')}</td>
            <td>{exp.get('justification', '-')}</td>
            <td style="text-align:right">CHF {exp.get('amount', 0):.2f}</td>
            <td style="text-align:right">CHF {tva_amount:.2f}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page {{ size: A4; margin: 20mm; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; font-size: 11px; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #6366F1; padding-bottom: 12px; margin-bottom: 20px; }}
  .logo {{ font-size: 22px; font-weight: 900; color: #6366F1; letter-spacing: 2px; }}
  .logo-sub {{ font-size: 10px; color: #6B7280; }}
  .info {{ text-align: right; font-size: 10px; color: #4B5563; }}
  .title {{ font-size: 18px; font-weight: 700; color: #07070F; margin: 16px 0 8px; }}
  .meta {{ display: flex; gap: 40px; margin-bottom: 16px; font-size: 10px; color: #6B7280; }}
  .meta b {{ color: #1a1a2e; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
  th {{ background: #6366F1; color: white; padding: 8px; text-align: left; font-size: 10px; }}
  td {{ padding: 7px 8px; border-bottom: 1px solid #E5E7EB; font-size: 10px; }}
  tr:nth-child(even) {{ background: #F9FAFB; }}
  .totals {{ margin-top: 16px; text-align: right; }}
  .totals table {{ width: 250px; margin-left: auto; }}
  .totals td {{ border: none; padding: 4px 8px; }}
  .totals .grand {{ font-size: 14px; font-weight: 700; color: #6366F1; border-top: 2px solid #6366F1; }}
  .footer {{ margin-top: 40px; padding-top: 12px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; font-size: 9px; color: #9CA3AF; }}
  .signature {{ margin-top: 40px; }}
  .signature-line {{ border-bottom: 1px solid #1a1a2e; width: 200px; margin-top: 30px; }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">⚡ BUDGY</div>
      <div class="logo-sub">Note de frais professionnels</div>
    </div>
    <div class="info">
      Date: {datetime.now().strftime('%d.%m.%Y')}<br>
      Réf: GRD-{datetime.now().strftime('%Y%m%d')}-{random.randint(100,999)}
    </div>
  </div>

  <div class="title">Note de frais — {req.period or datetime.now().strftime('%B %Y')}</div>

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
    <div>Budgy v3.4 — Document généré automatiquement</div>
    <div>TVA {tva_rate}% · Taux suisse 2026</div>
  </div>
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
async def create_family(req: CreateFamilyRequest):
    """Create a family group with an 8-char invitation code"""
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    while code in family_groups:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

    family_groups[code] = {
        "code": code,
        "name": req.family_name,
        "owner_id": req.owner_id,
        "owner_name": req.owner_name,
        "members": [{"id": req.owner_id, "name": req.owner_name, "role": "admin", "joined": datetime.now(timezone.utc).isoformat()}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"code": code, "family": family_groups[code]}


@app.post("/api/family/join")
async def join_family(req: JoinFamilyRequest):
    """Join a family group with invitation code"""
    if req.code not in family_groups:
        raise HTTPException(status_code=404, detail="Code d'invitation invalide")

    family = family_groups[req.code]

    # Check if already a member
    if any(m["id"] == req.user_id for m in family["members"]):
        raise HTTPException(status_code=400, detail="Vous êtes déjà membre de cette famille")

    if len(family["members"]) >= 6:
        raise HTTPException(status_code=400, detail="Famille complète (max 6 membres)")

    family["members"].append({
        "id": req.user_id,
        "name": req.user_name,
        "role": "member",
        "joined": datetime.now(timezone.utc).isoformat(),
    })

    return {"family": family}


@app.get("/api/family/{code}")
async def get_family(code: str):
    """Get family group info"""
    if code not in family_groups:
        raise HTTPException(status_code=404, detail="Famille non trouvée")
    return {"family": family_groups[code]}


# ──────────────────────────────────────────────────
# BUDGET ALERTS & NOTIFICATIONS
# ──────────────────────────────────────────────────
class CheckBudgetRequest(BaseModel):
    user_id: str
    budgets: list[dict]    # [{category, limit}]
    expenses: list[dict]   # [{category, amount}]


@app.post("/api/alerts/check-budgets")
async def check_budgets(req: CheckBudgetRequest):
    """Check budgets and generate alerts"""
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

    # Store alerts
    alerts_store[req.user_id] = alerts

    return {"alerts": alerts, "count": len(alerts)}


@app.get("/api/alerts/{user_id}")
async def get_alerts(user_id: str):
    """Get stored alerts for a user"""
    return {"alerts": alerts_store.get(user_id, []), "count": len(alerts_store.get(user_id, []))}



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
    items: Optional[list] = None
    raw_text: Optional[str] = None
    confidence: Optional[float] = None
    error: Optional[str] = None


OCR_SYSTEM_PROMPT = """Tu es un assistant OCR expert pour les tickets de caisse et factures suisses.
Analyse l'image fournie et extrais les informations dans un JSON STRICT (rien d'autre).

CHAMPS À RETOURNER:
{
  "merchant": "nom du commerçant",
  "total_amount": montant TTC en nombre (sans devise),
  "currency": "CHF" | "EUR" | "USD",
  "date": "YYYY-MM-DD",
  "category": une de ["courses", "restaurant", "transport", "sante", "loisirs", "shopping", "abonnements", "telecoms", "autre"],
  "receipt_type": "ticket" si c'est un ticket de caisse classique (Migros, Coop, Denner, restaurant, station-service, pharmacie, etc.) OU "remboursement" si c'est une facture professionnelle, frais médicaux, hôtel, taxi-pro, formation, ou justificatif pour remboursement employeur/assurance,
  "items": ["item1", "item2", ...] (max 5),
  "confidence": 0.0 à 1.0
}

RÈGLES:
- Si tu ne peux pas lire un champ, mets null.
- total_amount doit être le TOTAL FINAL (pas un sous-total).
- Pour la catégorie: Migros/Coop/Denner = "courses", McDonald's/restaurant = "restaurant", CFF/SBB/Uber = "transport", pharmacie = "sante".
- Pour receipt_type: pharmacie/médecin/hôpital = "remboursement"; courses/restos perso = "ticket"; déplacement pro/hôtel/repas affaires = "remboursement".
- Réponds UNIQUEMENT avec le JSON, sans markdown, sans commentaire."""


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
async def scanner_ocr(req: OCRRequest):
    """Extract structured data from a receipt image using vision LLM."""
    if not EMERGENT_LLM_KEY:
        return OCRResponse(success=False, error="LLM key not configured")

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

        return OCRResponse(
            success=True,
            merchant=data.get("merchant"),
            total_amount=amt,
            currency=data.get("currency") or "CHF",
            date=data.get("date"),
            category=data.get("category") or "autre",
            receipt_type=data.get("receipt_type") or "ticket",
            items=data.get("items") or [],
            confidence=float(data.get("confidence", 0.7)) if data.get("confidence") is not None else 0.7,
            raw_text=response,
        )
    except Exception as e:
        return OCRResponse(success=False, error=str(e))


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
    error: Optional[str] = None


EMAIL_PARSE_PROMPT = """Tu es un assistant qui extrait les données d'une facture suisse à partir d'un email.

Réponds UNIQUEMENT avec un JSON STRICT:
{
  "title": "objet court de la facture",
  "issuer": "émetteur (entreprise)",
  "amount": montant TTC en CHF,
  "currency": "CHF" | "EUR",
  "due_date": "YYYY-MM-DD",
  "invoice_date": "YYYY-MM-DD",
  "iban": "IBAN si visible",
  "reference": "numéro de référence/BVR",
  "category": une de ["telecoms", "abonnements", "loyer", "assurance", "sante", "autre"]
}
Mets null pour les champs manquants. Pas de markdown, pas de commentaire."""


@app.post("/api/email/parse", response_model=EmailParseResponse)
async def email_parse(req: EmailParseRequest):
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
        )
    except Exception as e:
        return EmailParseResponse(success=False, error=str(e))


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
async def optimizer_analyze(req: OptimizerRequest):
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
