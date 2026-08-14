"""Generate iPhone 6.9" screenshots (1320x2868) for Budgy from the existing 6.5" (1284x2778).

The aspect ratio is very close (0.4622 vs 0.4602 = 0.4% diff) so we can safely
scale up the source PNGs with LANCZOS resampling. No visible distortion.
"""

import os
from PIL import Image

SRC_ROOT = "/app/app-store-assets/ios"
LANGS = ("fr", "de", "en", "it")

count = 0
for lang in LANGS:
    src_dir = os.path.join(SRC_ROOT, lang, "iphone-6.5")
    dst_dir = os.path.join(SRC_ROOT, lang, "iphone-6.9")
    os.makedirs(dst_dir, exist_ok=True)
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith(".png"):
            continue
        src = os.path.join(src_dir, f)
        dst_name = f.replace("_iphone_6.5", "_iphone_6.9")
        dst = os.path.join(dst_dir, dst_name)
        im = Image.open(src).convert("RGB")
        # Resize to 1320x2868 (LANCZOS is a high-quality resampling filter)
        resized = im.resize((1320, 2868), Image.LANCZOS)
        resized.save(dst, "PNG", optimize=True)
        count += 1
        print(f"  ✓ {lang}/{dst_name}")

print(f"\n[DONE] {count} iPhone 6.9\" screenshots generated at 1320x2868.")
