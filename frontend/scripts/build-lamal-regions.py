#!/usr/bin/env python3
"""
BUDGY — Régions de primes officielles OFSP/Priminfo (commune → région).

Usage: python3 scripts/build-lamal-regions.py <praemienregionen-YYYY.xlsx> <année> [<sortie.json>]

Source officielle : https://www.priminfo.admin.ch/downloads/praemienregionen-<année>.xlsx
Feuille A_COM : BFS-Nr, Canton, Commune, Région, District, NPA, Localité.
La clé officielle de la région de prime est le n° OFS de la commune.

Validations strictes — tout import incomplet est refusé (exit 1), aucune
donnée partielle n'est publiée :
  - 26 cantons ;
  - ≥ 2000 communes ;
  - une commune = UNE seule région (sinon rejet : clé OFS ambiguë) ;
  - régions entre 0 et 5.
"""
import json
import sys
from datetime import date

try:
    import openpyxl
except ImportError:
    print("❌ openpyxl requis (pip install openpyxl)", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 3:
    print(__doc__, file=sys.stderr)
    sys.exit(1)

xlsx_path, year = sys.argv[1], int(sys.argv[2])
out_path = sys.argv[3] if len(sys.argv) > 3 else f"src/data/lamal-regions-{year}.json"

wb = openpyxl.load_workbook(xlsx_path, read_only=True)
if "A_COM" not in wb.sheetnames:
    print("❌ Feuille A_COM absente — structure officielle inattendue, import refusé.", file=sys.stderr)
    sys.exit(1)

# Release indiqué sur la feuille d'information (traçabilité)
release = ""
for row in wb[wb.sheetnames[0]].iter_rows(values_only=True):
    if row[0] and "release" in str(row[0]).lower():
        release = str(row[0]).strip()
        break

rows = list(wb["A_COM"].iter_rows(values_only=True))
hdr_i = next((i for i, r in enumerate(rows) if r[0] and "BFS" in str(r[0])), None)
if hdr_i is None:
    print("❌ En-tête BFS introuvable, import refusé.", file=sys.stderr)
    sys.exit(1)

by_bfs = {}
for r in rows[hdr_i + 1:]:
    if r[0] is None:
        continue
    bfs, canton, commune, region = r[0], str(r[1]).strip(), str(r[2]).strip(), int(r[3])
    if bfs in by_bfs:
        if by_bfs[bfs][2] != region:
            print(f"❌ Commune OFS {bfs} dans plusieurs régions — import refusé.", file=sys.stderr)
            sys.exit(1)
        continue
    by_bfs[bfs] = (canton, commune, region)

cantons = {}
for canton, commune, region in by_bfs.values():
    cantons.setdefault(canton, []).append([commune, region])
for c in cantons:
    cantons[c].sort(key=lambda x: x[0].lower())

if len(cantons) != 26:
    print(f"❌ {len(cantons)}/26 cantons — import refusé.", file=sys.stderr)
    sys.exit(1)
if len(by_bfs) < 2000:
    print(f"❌ {len(by_bfs)} communes seulement — import refusé.", file=sys.stderr)
    sys.exit(1)
if any(not (0 <= reg <= 5) for _, _, reg in by_bfs.values()):
    print("❌ Région hors plage 0–5 — import refusé.", file=sys.stderr)
    sys.exit(1)

out = {
    "year": year,
    "release": release,
    "generatedAt": date.today().isoformat(),
    "source": f"OFSP / Priminfo — praemienregionen-{year}.xlsx (régions de primes officielles par commune, feuille A_COM)",
    "cantons": cantons,
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"✅ {out_path} — {len(cantons)} cantons, {len(by_bfs)} communes ({release})")
