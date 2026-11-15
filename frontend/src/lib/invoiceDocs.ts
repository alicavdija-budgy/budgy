// ─────────────────────────────────────────────────────────────
// TÂCHE 5 — Détection de doublons de factures (pur, testé via Node).
// Signaux FIABLES uniquement :
//  • référence structurée (QRR/SCOR) identique → doublon probable ;
//  • sinon IBAN + créancier identiques + montant identique → probable ;
//  • JAMAIS deux factures « identiques » sur la seule base du montant.
// Les factures payées ne bloquent pas un nouvel import.
// ─────────────────────────────────────────────────────────────
type InvoiceLike = {
  id?: string;
  title?: string;
  issuer?: string;
  amount?: number;
  iban?: string;
  reference?: string;
  status?: string;
};

const norm = (v?: string) => (v || '').replace(/\s+/g, '').toUpperCase();
const normName = (v?: string) => (v || '').trim().toLowerCase();

export function findInvoiceDuplicate(
  existing: InvoiceLike[],
  cand: { reference?: string; iban?: string; issuer?: string; amount?: number | null },
): InvoiceLike | null {
  const cRef = norm(cand.reference);
  const cIban = norm(cand.iban);
  const cIssuer = normName(cand.issuer);
  const cAmount = typeof cand.amount === 'number' && isFinite(cand.amount) ? cand.amount : null;
  for (const inv of existing || []) {
    if (inv.status === 'paid') continue;
    if (cRef && norm(inv.reference) === cRef) return inv; // référence structurée = signal fort
    const sameIban = !!cIban && norm(inv.iban) === cIban;
    const sameIssuer = !!cIssuer && normName(inv.issuer) === cIssuer;
    const sameAmount = cAmount !== null && Math.abs((Number(inv.amount) || 0) - cAmount) < 0.005;
    if (sameIban && sameIssuer && sameAmount) return inv;
  }
  return null; // le montant seul n'est JAMAIS suffisant
}
