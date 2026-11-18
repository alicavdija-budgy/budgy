/**
 * Dossiers métier du classeur. Aucune migration : Contract.category est le
 * dossier canonique ; les documents autonomes utilisent le tag folder:<id>.
 * Les catégories historiques sont lues, jamais modifiées silencieusement.
 */
import type { DocumentCategory, PersonalDocument } from '../types';

export const CONTRACT_FOLDER_IDS = [
  'insurance', 'housing', 'subscriptions', 'transport', 'health',
  'energy', 'banking', 'employment', 'other',
] as const;

export type ContractFolder = typeof CONTRACT_FOLDER_IDS[number];
const isFolder = (s: string): s is ContractFolder =>
  (CONTRACT_FOLDER_IDS as readonly string[]).includes(s);

const normalize = (s: string) => (s || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s_-]+/g, ' ');

export function folderForContractCategory(category?: string | null): ContractFolder {
  const c = normalize(category || '');
  if (isFolder(c)) return c;
  if (/^(assurance|assurances|insurance|versicherungen)$/.test(c)) return 'insurance';
  if (/^(sante|gesundheit|salute|health|medical|medecine)$/.test(c)) return 'health';
  if (/^(logement|housing|habitation|immobilier|miete|wohnen|house)$/.test(c)) return 'housing';
  if (/^(abonnements|abonnement|subscription|subscriptions|telecom|telephone|telefonie|mobile|internet|streaming)$/.test(c)) return 'subscriptions';
  if (/^(transports|transport|auto|voiture|mobilite|mobility|verkehr)$/.test(c)) return 'transport';
  if (/^(energie|energy|strom|electricite|gaz|energieversorgung)$/.test(c)) return 'energy';
  if (/^(banque|banques|banking|banque et credit|credit|bank|banking and credit)$/.test(c)) return 'banking';
  if (/^(travail|emploi|employment|arbeit|lavoro|work)$/.test(c)) return 'employment';
  return 'other';
}

export function categoryForContractFolder(folder: ContractFolder): DocumentCategory {
  if (folder === 'insurance') return 'insurance';
  if (folder === 'health') return 'health';
  if (folder === 'banking') return 'banking';
  return 'contracts';
}

export function folderTag(folder: ContractFolder): string { return `folder:${folder}`; }

export function tagsWithContractFolder(tags: string[] | undefined, folder: ContractFolder): string[] {
  return [...(tags || []).filter((t) => !t.startsWith('folder:')), folderTag(folder)];
}

export function folderForContractDocument(doc: Pick<PersonalDocument, 'tags' | 'category'>): ContractFolder {
  const stored = (doc.tags || []).find((tag) => tag.startsWith('folder:'))?.slice(7) || '';
  if (isFolder(stored)) return stored;
  return folderForContractCategory(doc.category);
}
