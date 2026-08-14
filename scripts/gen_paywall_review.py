"""Generate a synthetic App Store 'Subscription Review' capture for Budgy Pro.

This is a review-only asset for Apple: it makes crystal-clear the plan names,
prices, billing period, auto-renew note, restore button, ToS and Privacy links.
"""

import os
from PIL import Image, ImageDraw, ImageFont

FONT_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

W, H = 1284, 2778

# Colors (Budgy dark theme)
BG = (14, 21, 48)
CARD = (22, 30, 64)
MINT = (52, 211, 153)
TEAL = (34, 211, 238)
WHITE = (247, 247, 251)
SOFT = (183, 192, 214)
MUTE = (107, 114, 128)
GREEN_SOFT = (110, 231, 183)

im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)

# Top gradient background band
for y in range(600):
    t = y / 600
    r = int(14 + (34 - 14) * t)
    g = int(21 + (58 - 21) * t)
    b = int(48 + (46 - 48) * t)
    d.line([(0, y), (W, y)], fill=(r, g, b))

# Status bar mock
f_small = ImageFont.truetype(FONT_B, 30)
d.text((80, 60), "9:41", fill=WHITE, font=f_small)
d.text((W - 200, 60), "•••• 5G  100%", fill=WHITE, font=f_small)

# Close button top-left (like modal)
d.rounded_rectangle([(60, 130), (140, 210)], radius=40, outline=(60, 78, 105), width=3)
d.text((85, 145), "✕", fill=WHITE, font=ImageFont.truetype(FONT_B, 48))

# Logo circle
d.ellipse([(W//2 - 90, 180), (W//2 + 90, 360)], fill=(28, 36, 74))
d.text((W//2 - 40, 220), "B", fill=MINT, font=ImageFont.truetype(FONT_B, 110))

# Title
f_title = ImageFont.truetype(FONT_B, 68)
title = "Passez à Budgy Pro"
bbox = d.textbbox((0, 0), title, font=f_title)
d.text(((W - (bbox[2]-bbox[0])) // 2, 410), title, fill=WHITE, font=f_title)

# Subtitle
f_sub = ImageFont.truetype(FONT_R, 34)
sub = "Débloquez toutes les fonctionnalités premium"
bbox = d.textbbox((0, 0), sub, font=f_sub)
d.text(((W - (bbox[2]-bbox[0])) // 2, 500), sub, fill=SOFT, font=f_sub)

# ---------- Plan cards ----------
CARD_X = 80
CARD_W = W - 160

# Annual card (featured)
Y_ANNUAL = 600
d.rounded_rectangle([(CARD_X, Y_ANNUAL), (CARD_X + CARD_W, Y_ANNUAL + 340)],
                     radius=32, fill=CARD, outline=MINT, width=4)

# Best offer badge
badge_w = 380
d.rounded_rectangle([(CARD_X + 40, Y_ANNUAL - 30), (CARD_X + 40 + badge_w, Y_ANNUAL + 30)],
                     radius=30, fill=MINT)
d.text((CARD_X + 68, Y_ANNUAL - 20), "⭐ MEILLEURE OFFRE · -32%",
       fill=(14, 21, 48), font=ImageFont.truetype(FONT_B, 26))

f_plan_title = ImageFont.truetype(FONT_B, 52)
d.text((CARD_X + 40, Y_ANNUAL + 60), "Annuel", fill=WHITE, font=f_plan_title)

f_plan_price = ImageFont.truetype(FONT_B, 92)
d.text((CARD_X + 40, Y_ANNUAL + 130), "CHF 39.90", fill=MINT, font=f_plan_price)

f_plan_meta = ImageFont.truetype(FONT_R, 30)
d.text((CARD_X + 40, Y_ANNUAL + 240),
       "CHF 3.33/mois · facturé CHF 39.90/an",
       fill=SOFT, font=f_plan_meta)
d.text((CARD_X + 40, Y_ANNUAL + 285),
       "7 jours d'essai gratuit — sans engagement",
       fill=GREEN_SOFT, font=f_plan_meta)

# Monthly card
Y_MONTH = 1010
d.rounded_rectangle([(CARD_X, Y_MONTH), (CARD_X + CARD_W, Y_MONTH + 260)],
                     radius=32, fill=CARD, outline=(60, 78, 105), width=2)

d.text((CARD_X + 40, Y_MONTH + 40), "Mensuel", fill=WHITE, font=f_plan_title)
d.text((CARD_X + 40, Y_MONTH + 110), "CHF 4.90", fill=WHITE, font=f_plan_price)
d.text((CARD_X + 40, Y_MONTH + 215),
       "CHF 4.90/mois · renouvellement automatique",
       fill=SOFT, font=f_plan_meta)

# ---------- CTA button ----------
Y_CTA = 1360
d.rounded_rectangle([(CARD_X, Y_CTA), (CARD_X + CARD_W, Y_CTA + 130)],
                     radius=32, fill=MINT)
cta = "Commencer les 7 jours gratuits"
f_cta = ImageFont.truetype(FONT_B, 44)
bbox = d.textbbox((0, 0), cta, font=f_cta)
d.text(((W - (bbox[2]-bbox[0])) // 2, Y_CTA + 40), cta, fill=(14, 21, 48), font=f_cta)

# Restore button (secondary)
Y_RESTORE = 1530
d.rounded_rectangle([(CARD_X, Y_RESTORE), (CARD_X + CARD_W, Y_RESTORE + 110)],
                     radius=32, outline=(60, 78, 105), width=3)
restore = "Restaurer un achat"
f_restore = ImageFont.truetype(FONT_B, 40)
bbox = d.textbbox((0, 0), restore, font=f_restore)
d.text(((W - (bbox[2]-bbox[0])) // 2, Y_RESTORE + 35), restore, fill=WHITE, font=f_restore)

# ---------- Features summary ----------
Y_FEAT = 1720
d.text((CARD_X, Y_FEAT), "Inclus dans Budgy Pro :",
       fill=WHITE, font=ImageFont.truetype(FONT_B, 40))

f_feat = ImageFont.truetype(FONT_R, 32)
features = [
    "• IA illimitée (Coach, Économiseur, Predict)",
    "• Optimiseur d'impôts complet (IFD + ICC)",
    "• Import e-mail automatique de factures",
    "• Export PDF illimité",
    "• Synchronisation multi-appareils sécurisée",
    "• Support prioritaire",
]
yy = Y_FEAT + 70
for feat in features:
    d.text((CARD_X + 10, yy), feat, fill=SOFT, font=f_feat)
    yy += 55

# ---------- Legal footer (CRITICAL for Apple) ----------
Y_LEGAL = 2260
d.line([(60, Y_LEGAL - 30), (W - 60, Y_LEGAL - 30)], fill=(60, 78, 105), width=2)

f_legal = ImageFont.truetype(FONT_R, 26)
legal_lines = [
    "L'abonnement est facturé sur votre compte Apple à la confirmation.",
    "Il se renouvelle automatiquement à la fin de chaque période, sauf annulation",
    "au moins 24h avant la fin. Gérez / annulez dans Réglages iOS → Abonnements.",
    "L'essai gratuit est offert pour la première souscription uniquement.",
]
yy = Y_LEGAL
for line in legal_lines:
    bbox = d.textbbox((0, 0), line, font=f_legal)
    d.text(((W - (bbox[2]-bbox[0])) // 2, yy), line, fill=MUTE, font=f_legal)
    yy += 40

# Links row: Terms | Privacy | Restore
Y_LINKS = Y_LEGAL + 200
f_link = ImageFont.truetype(FONT_B, 32)

links = [
    ("Conditions d'utilisation", GREEN_SOFT),
    ("  ·  ", MUTE),
    ("Politique de confidentialité", GREEN_SOFT),
    ("  ·  ", MUTE),
    ("Restaurer", GREEN_SOFT),
]
# Measure total width first
total_w = 0
for text, _ in links:
    total_w += d.textbbox((0, 0), text, font=f_link)[2]

x = (W - total_w) // 2
for text, color in links:
    d.text((x, Y_LINKS), text, fill=color, font=f_link)
    x += d.textbbox((0, 0), text, font=f_link)[2]

# URLs beneath (small)
Y_URLS = Y_LINKS + 60
f_url = ImageFont.truetype(FONT_R, 22)
urls = "budgy.ch/terms   ·   budgy.ch/privacy"
bbox = d.textbbox((0, 0), urls, font=f_url)
d.text(((W - (bbox[2]-bbox[0])) // 2, Y_URLS), urls, fill=MUTE, font=f_url)

# ---------- Home indicator ----------
d.rounded_rectangle([(W//2 - 150, 2720), (W//2 + 150, 2730)], radius=6, fill=WHITE)

os.makedirs("/app/app-store-assets/subscription-review", exist_ok=True)
out = "/app/app-store-assets/subscription-review/budgy_paywall_review_fr.png"
im.save(out, "PNG", optimize=True)
print(f"Saved: {out}")
print(f"Dimensions: {im.size}")
