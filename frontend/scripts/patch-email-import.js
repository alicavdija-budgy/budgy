/**
 * Quick patch: replace raw fetch+res.json() with safeFetchJson in email-import.tsx.
 * Only touches the 4 known patterns; idempotent.
 */
const fs = require('fs');
const path = '/app/frontend/app/more/email-import.tsx';
let src = fs.readFileSync(path, 'utf8');

// Ensure imports present
if (!src.includes("from '../../src/lib/network'")) {
  src = src.replace(
    /import \* as DocumentPicker.*;\n/,
    (m) =>
      m +
      "import { safeFetchJson } from '../../src/lib/network';\n" +
      "import { normalizeImageForUpload } from '../../src/lib/imageUpload';\n"
  );
}

// Pattern 1: email/parse text
src = src.replace(
  /const res = await fetch\(`\$\{BACKEND_URL\}\/api\/email\/parse`, \{[\s\S]*?\}\);\s*const data = await res\.json\(\);/,
  `const r = await safeFetchJson<any>(\`\${BACKEND_URL}/api/email/parse\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }, { timeoutMs: 20000, retries: 1, silent: true });
      const data = r.data || { success: false, error: r.error };`
);

// Pattern 2: parseImageFile OCR
src = src.replace(
  /const res = await fetch\(`\$\{BACKEND_URL\}\/api\/scanner\/ocr`, \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{ image_base64: `data:image\/jpeg;base64,\$\{base64\}` \}\),\s*\}\);\s*const data = await res\.json\(\);/,
  `const r = await safeFetchJson<any>(\`\${BACKEND_URL}/api/scanner/ocr\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: \`data:image/jpeg;base64,\${base64}\` }),
      }, { timeoutMs: 25000, retries: 1, silent: true });
      const data = r.data || { success: false, error: r.error };`
);

// Pattern 3 & 4: photo/camera picker OCR (same pattern, uses a.base64)
src = src.replace(
  /const apiRes = await fetch\(`\$\{BACKEND_URL\}\/api\/scanner\/ocr`, \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{ image_base64: `data:image\/jpeg;base64,\$\{a\.base64\}` \}\),\s*\}\);\s*const data = await apiRes\.json\(\);/g,
  `const r = await safeFetchJson<any>(\`\${BACKEND_URL}/api/scanner/ocr\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: \`data:image/jpeg;base64,\${a.base64}\` }),
          }, { timeoutMs: 25000, retries: 1, silent: true });
          const data = r.data || { success: false, error: r.error };`
);

fs.writeFileSync(path, src, 'utf8');
console.log('✅ email-import.tsx patched');
console.log('   Remaining raw fetch():', (src.match(/= await fetch\(/g) || []).length);
