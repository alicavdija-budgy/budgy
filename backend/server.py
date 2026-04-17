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
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

app = FastAPI(title="Guardian Money CHF API")

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
    return {"status": "ok", "version": "3.4", "app": "Guardian Money CHF"}


# ──────────────────────────────────────────────────
# COACH IA - GPT-4o-mini powered financial advisor
# ──────────────────────────────────────────────────
SYSTEM_PROMPT = """Tu es le Coach IA de Guardian Money CHF, un conseiller financier suisse expert.

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
    company: Optional[str] = "Guardian Money CHF"
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
      <div class="logo">⚡ GUARDIAN MONEY</div>
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
    <div>Guardian Money CHF v3.4 — Document généré automatiquement</div>
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
