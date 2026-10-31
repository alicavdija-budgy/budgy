/**
 * BUDGY — QR-facture suisse (Swiss QR bill, Swiss Payment Code).
 *
 * Implémentation conforme aux Swiss Implementation Guidelines QR-bill
 * (SIX, version 2.3 — compatible lecture avec la transition 2.4 : les
 * adresses structurées « S » ET combinées « K » restent acceptées en
 * LECTURE ; les adresses K sont normalisées).
 * Source : six-group.com → payment-standardization → qr-bill.
 *
 * Vérifications : en-tête SPC/0200/coding 1, IBAN CH/LI (mod 97),
 * QR-IBAN (IID 30000–31999) ⇒ référence QRR obligatoire (27 chiffres,
 * modulo 10 récursif), IBAN classique ⇒ SCOR (ISO 11649, mod 97) ou NON,
 * montant 0.01–999 999 999.99 ou vide (montant libre), devise CHF/EUR,
 * créancier obligatoire, débiteur facultatif, trailer EPD.
 *
 * Une QR-facture NE CONTIENT PAS d'échéance : aucune date n'est inventée.
 */

export type QrParty = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  country: string;
};

export type SwissQrBill = {
  fingerprint: string; // empreinte stable pour la détection de doublons
  iban: string;
  isQrIban: boolean;
  currency: 'CHF' | 'EUR';
  amount: number | null; // null = montant libre à saisir
  creditor: QrParty;
  debtor: QrParty | null;
  refType: 'QRR' | 'SCOR' | 'NON';
  reference: string;
  message: string;
  billingInfo: string;
};

export class QrBillError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

/** Modulo 10 récursif (référence QRR : 27 chiffres, le dernier est la clé). */
export function mod10Valid(num: string): boolean {
  if (!/^\d{2,}$/.test(num)) return false;
  let carry = 0;
  for (const ch of num.slice(0, -1)) carry = MOD10_TABLE[(carry + Number(ch)) % 10];
  return (10 - carry) % 10 === Number(num.slice(-1));
}

/** Modulo 97-10 (IBAN et référence créancier ISO 11649 « RF… »). */
export function mod97Valid(code: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(code)) return false;
  const moved = code.slice(4) + code.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** QR-IBAN : IID (positions 5-9) entre 30000 et 31999. */
export function isQrIban(iban: string): boolean {
  const iid = Number(iban.slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Le contenu scanné ressemble-t-il à une QR-facture suisse ? */
export function isSwissQrBill(payload: string): boolean {
  return typeof payload === 'string' && payload.trimStart().startsWith('SPC');
}

function parseParty(L: string[], base: number, required: boolean): QrParty | null {
  const adrTp = L[base] || '';
  const name = L[base + 1] || '';
  if (!name) {
    if (required) throw new QrBillError('creditor', 'Créancier manquant dans la QR-facture.');
    return null;
  }
  if (adrTp !== 'S' && adrTp !== 'K') {
    if (required) throw new QrBillError('addressType', 'Type d\'adresse invalide dans la QR-facture.');
    return null;
  }
  if (adrTp === 'S') {
    // Adresse structurée : rue / n° / NPA / localité
    const street = [L[base + 2], L[base + 3]].filter(Boolean).join(' ');
    const town = [L[base + 4], L[base + 5]].filter(Boolean).join(' ');
    return { name, addressLine1: street, addressLine2: town, country: L[base + 6] || '' };
  }
  // Adresse combinée (K) — encore lisible durant la transition 2.3 → 2.4
  return { name, addressLine1: L[base + 2] || '', addressLine2: L[base + 3] || '', country: L[base + 6] || '' };
}

export function parseSwissQrBill(payload: string): SwissQrBill {
  const L = payload.split(/\r?\n/).map((s) => s.trim());

  if (L[0] !== 'SPC') throw new QrBillError('spc', 'Ce QR code n\'est pas une facture QR suisse.');
  if (!/^02\d\d$/.test(L[1] || '')) throw new QrBillError('version', 'Version de QR-facture non supportée.');
  if ((L[2] || '') !== '1') throw new QrBillError('coding', 'Encodage de QR-facture non supporté.');
  if (L.length < 32) throw new QrBillError('length', 'QR-facture incomplète.');

  // IBAN
  const iban = (L[3] || '').replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{19}$/.test(iban)) {
    throw new QrBillError('iban', 'IBAN invalide : seul un IBAN suisse ou liechtensteinois est admis.');
  }
  if (!mod97Valid(iban)) throw new QrBillError('iban', 'IBAN invalide (contrôle modulo 97).');
  const qrIban = isQrIban(iban);

  // Créancier (obligatoire) — éléments 4..10
  const creditor = parseParty(L, 4, true) as QrParty;

  // Montant / devise — éléments 18, 19
  const amtRaw = L[18] || '';
  let amount: number | null = null;
  if (amtRaw !== '') {
    if (!/^\d{1,9}\.\d{2}$/.test(amtRaw)) {
      throw new QrBillError('amount', 'Montant invalide dans la QR-facture.');
    }
    amount = Number(amtRaw);
    if (!(amount >= 0.01 && amount <= 999999999.99)) {
      throw new QrBillError('amount', 'Montant hors limites (0.01 à 999 999 999.99).');
    }
  }
  const currency = L[19] as 'CHF' | 'EUR';
  if (currency !== 'CHF' && currency !== 'EUR') {
    throw new QrBillError('currency', 'Devise non admise : seuls CHF et EUR sont autorisés.');
  }

  // Débiteur (facultatif) — éléments 20..26
  const debtor = parseParty(L, 20, false);

  // Référence — éléments 27, 28
  const refType = (L[27] || '') as 'QRR' | 'SCOR' | 'NON';
  const reference = (L[28] || '').replace(/\s+/g, '').toUpperCase();
  if (refType === 'QRR') {
    if (!/^\d{27}$/.test(reference) || !mod10Valid(reference)) {
      throw new QrBillError('reference', 'Référence QR (QRR) invalide.');
    }
    if (!qrIban) throw new QrBillError('reference', 'Une référence QRR exige un QR-IBAN.');
  } else if (refType === 'SCOR') {
    if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(reference) || !mod97Valid(reference)) {
      throw new QrBillError('reference', 'Référence créancier (SCOR / ISO 11649) invalide.');
    }
    if (qrIban) throw new QrBillError('reference', 'Un QR-IBAN exige une référence QRR.');
  } else if (refType === 'NON') {
    if (reference !== '') throw new QrBillError('reference', 'La référence doit être vide avec le type NON.');
    if (qrIban) throw new QrBillError('reference', 'Un QR-IBAN exige une référence QRR.');
  } else {
    throw new QrBillError('reference', 'Type de référence inconnu.');
  }

  // Message / trailer / informations de facture
  const message = L[29] || '';
  if ((L[30] || '') !== 'EPD') throw new QrBillError('trailer', 'QR-facture incomplète (EPD manquant).');
  const billingInfo = L[31] || '';

  return {
    fingerprint: fnv([iban, refType, reference, amtRaw, currency, creditor.name].join('|')),
    iban,
    isQrIban: qrIban,
    currency,
    amount,
    creditor,
    debtor,
    refType,
    reference,
    message,
    billingInfo,
  };
}

/**
 * Détection de doublon par compte : plusieurs champs comparés (IBAN +
 * référence + montant + statut non payé). Les vraies factures récurrentes
 * (même créancier, autre référence ou autre montant) ne sont PAS bloquées —
 * on signale seulement, l'utilisateur décide.
 */
export function findDuplicateInvoice(
  bill: SwissQrBill,
  invoices: { iban?: string; reference?: string; amount: number; status: string; title: string }[],
): { title: string } | null {
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    const sameIban = (inv.iban || '').replace(/\s+/g, '').toUpperCase() === bill.iban;
    const sameRef = (inv.reference || '').replace(/\s+/g, '').toUpperCase() === bill.reference;
    const sameAmount = bill.amount !== null && Math.abs(inv.amount - bill.amount) < 0.005;
    if (sameIban && ((bill.reference && sameRef) || (!bill.reference && sameAmount))) {
      if (bill.reference ? sameRef : sameAmount) return { title: inv.title };
    }
  }
  return null;
}
