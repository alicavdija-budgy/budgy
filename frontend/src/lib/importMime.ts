/**
 * Normalisation du format d'une pièce importée.
 * Sur iOS, UIDocumentPicker peut annoncer application/octet-stream même pour
 * un PDF (notamment iCloud Drive et les partages). Le nom d'origine prime
 * alors sur un MIME parfois erroné. Aucune conversion implicite de PDF en JPEG.
 */
export function resolveImportMime(
  declaredMime?: string | null,
  originalName?: string | null,
  uri?: string | null,
): string {
  const declared = (declaredMime || '').split(';')[0].trim().toLowerCase();
  const fileNames = [originalName, uri].filter((v): v is string => !!v);
  if (fileNames.some((n) => /\.pdf(?:$|[?#])/i.test(n))) return 'application/pdf';
  if (declared === 'application/pdf') return declared;
  if (declared.startsWith('image/')) return declared;
  if (fileNames.some((n) => /\.png(?:$|[?#])/i.test(n))) return 'image/png';
  if (fileNames.some((n) => /\.(jpe?g)(?:$|[?#])/i.test(n))) return 'image/jpeg';
  if (fileNames.some((n) => /\.(heic|heif)(?:$|[?#])/i.test(n))) return 'image/heic';
  return 'image/jpeg'; // repli image historique, jamais utilisé pour un .pdf explicite
}
