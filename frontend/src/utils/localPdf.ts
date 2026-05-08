/**
 * BUDGY — Local PDF HTML generator.
 *
 * Generates a complete HTML document for expo-print on the DEVICE,
 * without needing a backend roundtrip. This means PDF export works
 * fully offline (perfect for travel, planes, weak Wi-Fi).
 *
 * The look mirrors the backend template (logo Budgy ⚡, dark fintech tones
 * for the header, neutral white body for printing). It supports:
 *   - Header with logo, user name, period
 *   - Expense lines (date, title, category, amount)
 *   - Optional embedded receipts (base64 thumbnails)
 *   - Optional document attachments (multi-page scans)
 *   - Total + footer with generation date
 */

const TAG = '[localPdf]';

export interface LocalPdfExpense {
  date: string;
  title: string;
  category?: string;
  amount: number;
  justification?: string;
  receipt?: string; // base64 (data: prefix accepted)
}

export interface LocalPdfDocument {
  title: string;
  category?: string;
  imageBase64?: string;
  pages?: string[]; // base64 pages
}

export interface LocalPdfPayload {
  user_name: string;
  company?: string;
  period: string;
  canton?: string;
  mode?: 'employee' | 'self';
  expenses: LocalPdfExpense[];
  documents?: LocalPdfDocument[];
  include_receipts?: boolean;
  title_override?: string;
}

const formatCHF = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return `CHF ${v.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const escapeHtml = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function ensureDataUri(b64: string): string {
  if (!b64) return '';
  if (b64.startsWith('data:')) return b64;
  return `data:image/jpeg;base64,${b64}`;
}

export function buildPdfHtml(payload: LocalPdfPayload): string {
  console.log(`${TAG} building HTML for ${payload.expenses?.length || 0} expenses, ${payload.documents?.length || 0} documents`);

  const expenses = payload.expenses || [];
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const title = payload.title_override || `Note de frais — ${payload.period}`;
  const generatedAt = new Date().toLocaleString('fr-CH');
  const includeReceipts = !!payload.include_receipts;

  const expenseRows = expenses.length
    ? expenses
        .map(
          (e) => `
        <tr>
          <td>${escapeHtml(e.date)}</td>
          <td>
            <div class="t-title">${escapeHtml(e.title)}</div>
            ${e.justification ? `<div class="t-sub">${escapeHtml(e.justification)}</div>` : ''}
          </td>
          <td><span class="badge">${escapeHtml(e.category || '—')}</span></td>
          <td class="amount">${formatCHF(Number(e.amount) || 0)}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="4" class="empty">Aucune dépense pour cette période.</td></tr>`;

  const receiptsBlock =
    includeReceipts && expenses.some((e) => e.receipt)
      ? `
      <h2 class="section">Justificatifs</h2>
      <div class="receipts">
        ${expenses
          .filter((e) => !!e.receipt)
          .map(
            (e) => `
          <div class="receipt">
            <img src="${escapeHtml(ensureDataUri(e.receipt!))}" />
            <div class="receipt-meta">
              <strong>${escapeHtml(e.title)}</strong> · ${escapeHtml(e.date)} · ${formatCHF(Number(e.amount) || 0)}
            </div>
          </div>`
          )
          .join('')}
      </div>`
      : '';

  const documentsBlock =
    (payload.documents || []).length > 0
      ? `
      <h2 class="section">Documents annexés</h2>
      ${payload.documents!
        .map(
          (d) => `
        <div class="document">
          <h3>${escapeHtml(d.title)}${d.category ? ` <small>(${escapeHtml(d.category)})</small>` : ''}</h3>
          ${(d.pages && d.pages.length ? d.pages : d.imageBase64 ? [d.imageBase64] : [])
            .map(
              (p) =>
                `<img class="doc-page" src="${escapeHtml(ensureDataUri(p))}" />`
            )
            .join('')}
        </div>`
        )
        .join('')}`
      : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; margin: 0; }
  .header {
    background: linear-gradient(135deg, #0F1115 0%, #1a1f2e 100%);
    color: #fff;
    padding: 22px 24px;
    border-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .logo { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; }
  .logo .accent { color: #00D4B8; }
  .header .meta { text-align: right; font-size: 12px; opacity: 0.85; }
  h1.title { font-size: 22px; margin: 24px 0 6px; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 18px; }
  .meta-grid { display: flex; gap: 24px; margin-bottom: 20px; font-size: 12px; color: #444; }
  .meta-grid div b { color: #111; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
  thead th { text-align: left; background: #f3f4f6; padding: 10px 12px; color: #444; font-weight: 600; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #eaecef; vertical-align: top; }
  td.amount { text-align: right; font-weight: 700; white-space: nowrap; }
  .t-title { font-weight: 600; }
  .t-sub { color: #777; font-size: 11px; margin-top: 2px; }
  .badge { display: inline-block; background: #ECFDF5; color: #047857; border-radius: 999px; padding: 2px 10px; font-size: 11px; }
  .empty { text-align: center; color: #999; padding: 24px; }
  .total-row { font-size: 14px; }
  .total-row td { padding-top: 14px; border-top: 2px solid #111; font-weight: 800; }
  .section { font-size: 14px; margin: 28px 0 8px; color: #111; border-left: 3px solid #00D4B8; padding-left: 8px; }
  .receipts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .receipt img { width: 100%; max-height: 220px; object-fit: contain; border: 1px solid #eee; border-radius: 6px; }
  .receipt-meta { font-size: 10px; color: #555; margin-top: 4px; }
  .document h3 { margin: 12px 0 6px; font-size: 13px; }
  .doc-page { width: 100%; max-height: 800px; object-fit: contain; border: 1px solid #eee; border-radius: 6px; margin-bottom: 8px; }
  .footer {
    position: fixed; bottom: 6mm; left: 14mm; right: 14mm;
    font-size: 10px; color: #999; text-align: center;
    border-top: 1px solid #eee; padding-top: 6px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo"><span class="accent">⚡</span> BUDGY</div>
    <div class="meta">
      <div>${escapeHtml(payload.user_name)}</div>
      <div>${escapeHtml(payload.period)}</div>
    </div>
  </div>

  <h1 class="title">${escapeHtml(title)}</h1>
  <div class="subtitle">Document généré le ${escapeHtml(generatedAt)}</div>

  <div class="meta-grid">
    <div><b>Utilisateur :</b> ${escapeHtml(payload.user_name)}</div>
    ${payload.company ? `<div><b>Société :</b> ${escapeHtml(payload.company)}</div>` : ''}
    ${payload.canton ? `<div><b>Canton :</b> ${escapeHtml(payload.canton)}</div>` : ''}
    ${payload.mode ? `<div><b>Mode :</b> ${payload.mode === 'employee' ? 'Salarié' : 'Indépendant'}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 14%">Date</th>
        <th>Description</th>
        <th style="width: 20%">Catégorie</th>
        <th style="width: 18%; text-align: right;">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${expenseRows}
      <tr class="total-row">
        <td colspan="3" style="text-align: right;">Total</td>
        <td class="amount">${formatCHF(total)}</td>
      </tr>
    </tbody>
  </table>

  ${receiptsBlock}
  ${documentsBlock}

  <div class="footer">
    Budgy — Gestion de budget Suisse · budgy.ch · Généré sur ${escapeHtml(generatedAt)}
  </div>
</body>
</html>`;
}
