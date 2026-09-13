#!/usr/bin/env node
/**
 * BUDGY — Générateur statique des pages SEO du site web (frontend/public/).
 * N'affecte PAS l'application mobile : il ne fait qu'écrire des fichiers HTML
 * statiques dans frontend/public/ (servis par budgy.ch).
 *
 * Usage : node scripts/gen-website.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, '..', 'public');
const APPSTORE = 'https://apps.apple.com/ch/app/budgy/id6767026949';
const LASTMOD = '2026-09-13';

const APPLE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>`;

const storeBtn = (label = 'Télécharger sur') =>
  `<div class="badges"><a class="badge-store" href="${APPSTORE}" target="_blank" rel="noopener noreferrer">${APPLE_SVG}<span><small>${label}</small>App Store</span></a></div>`;

const NAV = `<nav class="nav"><div class="nav-inner">
  <a class="brand" href="/"><img src="/icons/apple-touch-icon.png" alt="Budgy" width="34" height="34"><span class="brand-name">Budgy</span></a>
  <div class="nav-links">
    <a href="/#features">Fonctionnalités</a>
    <a href="/fr/guides">Guides</a>
    <a href="/support">Support</a>
    <a class="nav-cta" href="${APPSTORE}" target="_blank" rel="noopener noreferrer">Télécharger</a>
  </div>
</div></nav>`;

const FOOTER = `<footer>
  <div class="footer-grid">
    <div>
      <a class="brand" href="/"><img src="/icons/apple-touch-icon.png" alt="Budgy" width="34" height="34"><span class="brand-name">Budgy</span></a>
      <p class="desc">Budgy est une application suisse de gestion de budget et de finances personnelles : dépenses, factures, épargne et objectifs, en CHF.</p>
    </div>
    <div><h4>Budget &amp; finances</h4><ul>
      <li><a href="/fr/application-budget">Application budget</a></li>
      <li><a href="/fr/gestion-budget">Gestion du budget</a></li>
      <li><a href="/fr/suivi-depenses">Suivi des dépenses</a></li>
      <li><a href="/fr/budget-mensuel">Budget mensuel</a></li>
      <li><a href="/fr/epargne-objectifs">Épargne &amp; objectifs</a></li>
      <li><a href="/fr/budget-suisse">Budget en Suisse</a></li>
    </ul></div>
    <div><h4>Ressources</h4><ul>
      <li><a href="/">Accueil</a></li>
      <li><a href="/#features">Fonctionnalités</a></li>
      <li><a href="/fr/guides">Guides &amp; conseils</a></li>
      <li><a href="${APPSTORE}" target="_blank" rel="noopener noreferrer">Télécharger Budgy</a></li>
    </ul></div>
    <div><h4>Légal &amp; contact</h4><ul>
      <li><a href="/privacy">Confidentialité</a></li>
      <li><a href="/terms">Conditions d'utilisation</a></li>
      <li><a href="/support">Support</a></li>
      <li><a href="/delete-account">Suppression du compte</a></li>
    </ul></div>
  </div>
  <div class="legal">© 2026 Budgy — Édité en Suisse 🇨🇭 · <a href="/">FR</a> · <a href="/de">DE</a> · <a href="/en">EN</a> · <a href="/it">IT</a></div>
</footer>`;

const ctaBox = (title, line) => `<div class="cta-box">
    <p class="cta-title">${title}</p>
    <p>${line}</p>
    ${storeBtn()}
  </div>`;

function renderPage(p) {
  const url = `https://budgy.ch${p.path}`;
  const crumbs = p.crumbs
    .map((c, i) => (c.href ? `<a href="${c.href}">${c.name}</a>` : c.name))
    .join('<span>›</span>');
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: p.crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `https://budgy.ch${c.href || p.path}`,
    })),
  };
  const lds = [breadcrumbLd];
  if (p.article) {
    lds.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: p.h1Plain,
      description: p.desc,
      inLanguage: 'fr-CH',
      datePublished: LASTMOD,
      dateModified: LASTMOD,
      mainEntityOfPage: url,
      image: 'https://budgy.ch/assets/budgy-og-image.png',
      author: { '@type': 'Organization', name: 'Budgy', url: 'https://budgy.ch/' },
      publisher: { '@type': 'Organization', name: 'Budgy', url: 'https://budgy.ch/' },
    });
  }
  const ldTags = lds
    .map((l) => `<script type="application/ld+json">\n${JSON.stringify(l)}\n</script>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.title}</title>
<meta name="description" content="${p.desc}">
<link rel="canonical" href="${url}">
<meta name="apple-itunes-app" content="app-id=6767026949">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
<meta property="og:type" content="${p.article ? 'article' : 'website'}">
<meta property="og:site_name" content="Budgy">
<meta property="og:title" content="${p.ogTitle || p.title}">
<meta property="og:description" content="${p.desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://budgy.ch/assets/budgy-og-image.png">
<meta property="og:locale" content="fr_CH">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/site-v1.css">
${ldTags}
</head>
<body>
${NAV}
<div class="crumbs">${crumbs}</div>
<header class="page-hero">
  <span class="pill">${p.pill}</span>
  <h1>${p.h1}</h1>
  <p class="lead">${p.lead}</p>
  ${p.heroCta === false ? '' : storeBtn()}
</header>
<main class="prose">
${p.article ? `<p class="updated">Guide Budgy · Mis à jour le 13 septembre 2026</p>` : ''}
${p.body}
</main>
${FOOTER}
</body>
</html>
`;
}

// ─────────────────────────────────────────────────────────────────────────
// Contenu des pages
// ─────────────────────────────────────────────────────────────────────────
const pages = [];

// /fr/gestion-budget
pages.push({
  path: '/fr/gestion-budget',
  file: 'fr/gestion-budget.html',
  title: 'Gestion de budget : la méthode simple qui tient — Budgy',
  desc: "Les bases d'une gestion de budget efficace : connaître ses charges fixes, suivre ses dépenses variables, épargner en premier. Méthode concrète, adaptée à la Suisse.",
  pill: '🧭 Gestion du budget',
  h1: 'Gérer son budget, <span>sans se compliquer la vie</span>',
  h1Plain: 'Gérer son budget, sans se compliquer la vie',
  lead: "La gestion de budget n'a pas besoin d'être un pensum comptable. Trois habitudes suffisent pour garder le contrôle de ses finances personnelles, mois après mois.",
  crumbs: [{ name: 'Accueil', href: '/' }, { name: 'Gestion du budget' }],
  body: `
  <h2>Gérez votre budget en trois habitudes</h2>
  <h3>1. Connaître ses charges fixes au franc près</h3>
  <p>Loyer, assurance maladie, transports, téléphone, abonnements : listez tout ce qui sort automatiquement chaque mois. En Suisse, ces charges représentent souvent 50 à 65&nbsp;% du revenu. Tant que ce montant est flou, aucun budget ne peut fonctionner. Dans Budgy, les <strong>dépenses récurrentes</strong> sont gérées séparément et se reportent automatiquement chaque mois.</p>
  <h3>2. Suivre les dépenses variables au fil de l'eau</h3>
  <p>Courses, restaurants, loisirs, achats en ligne : c'est ici que les budgets dérapent. La règle d'or&nbsp;: noter la dépense au moment où elle a lieu, pas en fin de mois. Avec un bon outil de <a href="/fr/suivi-depenses">suivi des dépenses</a>, cela prend cinq secondes et devient un réflexe.</p>
  <h3>3. Épargner en premier, pas avec « ce qu'il reste »</h3>
  <p>Décidez d'un montant d'épargne dès la réception du salaire, même modeste, et mettez-le de côté avant de dépenser. Un <a href="/fr/epargne-objectifs">objectif d'épargne</a> concret (réserve d'urgence, vacances, gros achat) rend l'effort motivant.</p>

  <h2>La règle 50/30/20, adaptée à la réalité suisse</h2>
  <p>La règle classique propose 50&nbsp;% du revenu pour les besoins, 30&nbsp;% pour les envies et 20&nbsp;% pour l'épargne. En Suisse, où loyers et primes LAMal pèsent lourd, une répartition 60/20/20 est souvent plus réaliste. L'important n'est pas le pourcentage exact, mais d'avoir une cible et de la mesurer : c'est exactement ce que montrent les statistiques mensuelles de Budgy.</p>

  <h2>Les erreurs qui font échouer un budget</h2>
  <ul>
    <li><strong>Vouloir tout catégoriser au centime</strong> — une dizaine de catégories claires suffit.</li>
    <li><strong>Oublier les dépenses annuelles</strong> — impôts, plaques, cadeaux de fin d'année : provisionnez-les chaque mois.</li>
    <li><strong>Abandonner après un mauvais mois</strong> — un dépassement n'est pas un échec, c'est une information pour ajuster le mois suivant.</li>
    <li><strong>Utiliser un outil trop lourd</strong> — si la saisie est pénible, elle s'arrête. La simplicité prime.</li>
  </ul>

  ${ctaBox('Mettez la méthode en pratique', 'Budgy réunit charges récurrentes, suivi des dépenses, objectifs d\'épargne et statistiques dans une application suisse gratuite au téléchargement.')}

  <h2>Questions fréquentes</h2>
  <div class="faq-list">
    <details><summary>À quelle fréquence faut-il vérifier son budget ?</summary><p>Une saisie quotidienne de quelques secondes et un point de dix minutes en fin de mois suffisent. L'essentiel est la régularité, pas la durée.</p></details>
    <details><summary>Faut-il un budget par catégorie ?</summary><p>C'est utile pour deux ou trois postes qui dérapent (courses, sorties, shopping). Inutile de plafonner chaque catégorie : concentrez-vous sur celles qui font la différence.</p></details>
    <details><summary>Comment gérer un revenu irrégulier ?</summary><p>Basez votre budget sur le mois le plus bas des douze derniers mois, et versez l'excédent des bons mois dans votre réserve. Les statistiques sur 12 mois de Budgy aident à trouver cette base.</p></details>
  </div>

  <h2>Pour aller plus loin</h2>
  <ul>
    <li><a href="/fr/budget-mensuel">Construire un budget mensuel pas à pas</a></li>
    <li><a href="/fr/application-budget">Choisir une application de gestion de budget</a></li>
    <li><a href="/fr/guides/comment-faire-un-budget-mensuel">Guide : comment faire un budget mensuel ?</a></li>
  </ul>`,
});

// /fr/suivi-depenses
pages.push({
  path: '/fr/suivi-depenses',
  file: 'fr/suivi-depenses.html',
  title: 'Suivi des dépenses : savoir enfin où part votre argent — Budgy',
  desc: "Comment suivre ses dépenses sans y passer des heures : méthode de saisie rapide, catégories utiles, lecture des statistiques. Avec Budgy, application suisse de suivi des dépenses.",
  pill: '💸 Suivi des dépenses',
  h1: 'Suivez vos dépenses, <span>comprenez votre argent</span>',
  h1Plain: 'Suivez vos dépenses, comprenez votre argent',
  lead: "Le suivi des dépenses est la fondation de toutes les finances personnelles : impossible d'économiser ou de planifier sans savoir où part l'argent. Voici comment le rendre facile.",
  crumbs: [{ name: 'Accueil', href: '/' }, { name: 'Suivi des dépenses' }],
  body: `
  <h2>Pourquoi le suivi change tout</h2>
  <p>Des dizaines de paiements par carte ou par téléphone chaque mois, quelques achats en ligne, deux ou trois abonnements oubliés : sans suivi, personne ne peut dire précisément combien il dépense. Or les études sur le comportement financier convergent : le simple fait de noter ses dépenses les réduit, car chaque achat redevient une décision consciente.</p>

  <h2>La méthode : 5 secondes par dépense</h2>
  <ol>
    <li><strong>Notez immédiatement</strong> — en sortant du magasin, pas le soir. Dans Budgy, ajouter une transaction prend quelques secondes.</li>
    <li><strong>Choisissez une catégorie simple</strong> — courses, restaurants, transports, santé, loisirs, shopping… Une dizaine suffit.</li>
    <li><strong>Séparez le récurrent du variable</strong> — loyer et abonnements se gèrent une fois pour toutes comme dépenses récurrentes ; le suivi quotidien se concentre sur le variable.</li>
    <li><strong>Regardez le tableau de bord une fois par semaine</strong> — deux minutes pour vérifier la tendance du mois et corriger avant qu'il soit trop tard.</li>
  </ol>

  <h2>Lire ses statistiques comme un pro</h2>
  <p>Après un mois de suivi, trois lectures valent la peine&nbsp;:</p>
  <ul>
    <li><strong>La répartition par catégorie</strong> — révèle presque toujours une surprise (souvent les livraisons et les petites sorties).</li>
    <li><strong>L'évolution sur 12 mois</strong> — distingue un mois exceptionnel d'une vraie tendance.</li>
    <li><strong>Le total des récurrents</strong> — la liste des abonnements à résilier se trouve ici.</li>
  </ul>
  <p>Budgy affiche ces trois vues nativement, en CHF, avec des graphiques mensuels et la répartition par catégorie. Le Coach IA peut ensuite analyser vos données et pointer des économies concrètes.</p>

  ${ctaBox('Commencez à suivre vos dépenses aujourd\'hui', 'Téléchargez Budgy gratuitement : saisie en quelques secondes, statistiques claires, fonctionne aussi hors-ligne.')}

  <h2>Questions fréquentes</h2>
  <div class="faq-list">
    <details><summary>Suivre ses dépenses à la main ou automatiquement ?</summary><p>La saisie manuelle rapide a un avantage prouvé : elle vous garde conscient de chaque achat. C'est le choix de Budgy, qui évite au passage de partager vos identifiants bancaires avec un tiers.</p></details>
    <details><summary>Que faire des dépenses partagées en couple ou colocation ?</summary><p>Notez votre part réelle. L'important est que votre suivi reflète votre situation personnelle, pas la facture totale.</p></details>
    <details><summary>Combien de temps avant de voir des résultats ?</summary><p>Un mois complet suffit pour obtenir une photographie fiable, et deux à trois mois pour mesurer l'effet des ajustements.</p></details>
  </div>

  <h2>Pour aller plus loin</h2>
  <ul>
    <li><a href="/fr/guides/comment-suivre-ses-depenses">Guide détaillé : mieux suivre ses dépenses</a></li>
    <li><a href="/fr/gestion-budget">La méthode complète de gestion de budget</a></li>
    <li><a href="/fr/guides/depenses-recurrentes">Maîtriser ses dépenses récurrentes</a></li>
  </ul>`,
});

// /fr/budget-mensuel
pages.push({
  path: '/fr/budget-mensuel',
  file: 'fr/budget-mensuel.html',
  title: 'Budget mensuel : le construire en 4 étapes — Budgy',
  desc: "Construire un budget mensuel réaliste en 4 étapes : revenus, charges fixes, dépenses variables, épargne. Exemple chiffré en CHF et outil suisse pour le tenir.",
  pill: '🗓️ Budget mensuel',
  h1: 'Un budget mensuel <span>qui tient vraiment</span>',
  h1Plain: 'Un budget mensuel qui tient vraiment',
  lead: 'Le mois est la bonne unité pour piloter ses finances : salaires, loyers et factures suivent ce rythme. Voici comment construire un budget mensuel réaliste en quatre étapes.',
  crumbs: [{ name: 'Accueil', href: '/' }, { name: 'Budget mensuel' }],
  body: `
  <h2>Étape 1 — Partez du revenu net réellement disponible</h2>
  <p>Prenez le montant qui arrive effectivement sur votre compte, après déductions sociales. Si vous touchez un 13e salaire ou des primes, lissez-les : ne construisez pas votre mois type sur un revenu exceptionnel.</p>
  <h2>Étape 2 — Listez les charges fixes</h2>
  <p>Loyer, prime LAMal, assurances, transports, téléphone, internet, abonnements. Ajoutez un douzième des dépenses annuelles connues (impôts, plaques, cadeaux). Ce bloc ne se rediscute pas chaque mois — mais il se renégocie une fois par an, notamment la prime maladie.</p>
  <h2>Étape 3 — Fixez l'épargne avant les envies</h2>
  <p>Réservez votre épargne dès le début du mois : c'est la seule façon de la rendre systématique. Même 5 à 10&nbsp;% du revenu font une vraie différence sur une année. Reliez-la à un <a href="/fr/epargne-objectifs">objectif concret</a> pour rester motivé.</p>
  <h2>Étape 4 — Le reste devient votre enveloppe variable</h2>
  <p>Revenu − charges fixes − épargne = budget variable (courses, sorties, shopping). C'est le seul chiffre à surveiller au quotidien, ce qui rend le <a href="/fr/suivi-depenses">suivi des dépenses</a> très simple.</p>

  <h2>Exemple chiffré (revenu net de 5\u2009500 CHF)</h2>
  <ul>
    <li>Charges fixes : 3\u2009100 CHF (loyer 1\u2009700, LAMal 380, transports 220, télécom 90, assurances 110, provisions impôts 600)</li>
    <li>Épargne : 550 CHF (10&nbsp;%)</li>
    <li>Enveloppe variable : 1\u2009850 CHF, soit environ 430 CHF par semaine</li>
  </ul>
  <p>Chaque situation diffère — l'exemple sert uniquement à illustrer la mécanique. Dans Budgy, les dépenses récurrentes constituent le bloc fixe, et le tableau de bord montre en permanence où en est votre enveloppe variable.</p>

  ${ctaBox('Construisez votre budget mensuel dans Budgy', 'Charges récurrentes, enveloppe variable et épargne : Budgy structure votre mois automatiquement, en CHF.')}

  <h2>Questions fréquentes</h2>
  <div class="faq-list">
    <details><summary>Mon budget explose chaque fin de mois, que faire ?</summary><p>Découpez l'enveloppe variable en semaines. Un repère hebdomadaire se corrige facilement ; un dérapage découvert le 28 du mois, non.</p></details>
    <details><summary>Comment intégrer les impôts dans un budget mensuel suisse ?</summary><p>Provisionnez un douzième de votre facture fiscale annuelle estimée comme une charge fixe. Le simulateur d'impôts de Budgy (IFD/ICC par canton) aide à estimer ce montant.</p></details>
  </div>

  <h2>Pour aller plus loin</h2>
  <ul>
    <li><a href="/fr/guides/comment-faire-un-budget-mensuel">Guide pas à pas : faire un budget mensuel</a></li>
    <li><a href="/fr/guides/budget-familial">Adapter la méthode au budget familial</a></li>
    <li><a href="/fr/budget-suisse">Les particularités du budget en Suisse</a></li>
  </ul>`,
});

// /fr/epargne-objectifs
pages.push({
  path: '/fr/epargne-objectifs',
  file: 'fr/epargne-objectifs.html',
  title: "Épargne et objectifs : mettre de l'argent de côté sans effort — Budgy",
  desc: "Réserve d'urgence, vacances, gros achats : comment définir des objectifs d'épargne motivants et les atteindre. Méthode concrète et suivi visuel avec Budgy.",
  pill: '🎯 Épargne & objectifs',
  h1: 'Épargnez avec <span>des objectifs concrets</span>',
  h1Plain: 'Épargnez avec des objectifs concrets',
  lead: "« Épargner plus » n'est pas un objectif — « 3\u2009000 CHF de réserve d'ici juin » en est un. La différence entre les deux, c'est un plan et un suivi visuel.",
  crumbs: [{ name: 'Accueil', href: '/' }, { name: 'Épargne & objectifs' }],
  body: `
  <h2>Commencez par la réserve d'urgence</h2>
  <p>Avant tout autre objectif, constituez un matelas de sécurité : l'équivalent de trois mois de charges fixes est une bonne première cible. Cette réserve évite qu'une facture de dentiste ou une réparation de voiture ne détruise votre budget — et elle enlève une vraie charge mentale.</p>

  <h2>La méthode des objectifs qui aboutissent</h2>
  <ol>
    <li><strong>Un montant et une date</strong> — « 2\u2009400 CHF pour les vacances au 1er juillet » se traduit en 300 CHF par mois : concret, mesurable.</li>
    <li><strong>Épargner en début de mois</strong> — mettez le montant de côté dès le salaire reçu, avant les dépenses variables. C'est le principe « payez-vous d'abord ».</li>
    <li><strong>Un objectif visible</strong> — une barre de progression que l'on voit chaque semaine entretient la motivation bien mieux qu'une ligne sur un relevé bancaire. C'est exactement ce que proposent les objectifs d'épargne de Budgy.</li>
    <li><strong>Un seul gros objectif à la fois</strong> — au-delà de deux ou trois objectifs simultanés, l'effort se dilue.</li>
  </ol>

  <h2>Où trouver les francs à épargner ?</h2>
  <ul>
    <li><strong>Les abonnements dormants</strong> — passez en revue vos <a href="/fr/guides/depenses-recurrentes">dépenses récurrentes</a> : deux résiliations financent souvent un objectif entier.</li>
    <li><strong>La prime LAMal</strong> — comparer les modèles et les franchises fait souvent économiser plusieurs centaines de francs par an ; Budgy intègre un comparateur basé sur les données officielles.</li>
    <li><strong>Les catégories qui dérapent</strong> — un mois de <a href="/fr/suivi-depenses">suivi des dépenses</a> montre immédiatement où couper sans douleur.</li>
  </ul>

  ${ctaBox('Créez votre premier objectif dans Budgy', "Définissez un montant, une échéance, et suivez votre progression — gratuitement, dans l'application suisse Budgy.")}

  <h2>Questions fréquentes</h2>
  <div class="faq-list">
    <details><summary>Quel pourcentage de mon revenu épargner ?</summary><p>10&nbsp;% est une excellente base en Suisse ; 5&nbsp;% valent mieux que rien, 20&nbsp;% accélèrent tout. L'important est la régularité : un montant fixe chaque mois bat un gros versement occasionnel.</p></details>
    <details><summary>Épargner ou rembourser ses dettes d'abord ?</summary><p>Constituez d'abord une petite réserve (environ un mois de charges), puis priorisez le remboursement des dettes coûteuses avant d'épargner davantage. Budgy permet aussi de suivre vos dettes et engagements.</p></details>
    <details><summary>Et le 3e pilier ?</summary><p>Le pilier 3a est un outil d'épargne fiscalement avantageux en Suisse. Il complète — mais ne remplace pas — la réserve d'urgence, qui doit rester disponible immédiatement.</p></details>
  </div>

  <h2>Pour aller plus loin</h2>
  <ul>
    <li><a href="/fr/guides/objectif-epargne">Guide : se fixer un objectif d'épargne réaliste</a></li>
    <li><a href="/fr/guides/economiser-de-largent-chaque-mois">10 pistes pour économiser chaque mois</a></li>
    <li><a href="/fr/budget-mensuel">Intégrer l'épargne dans son budget mensuel</a></li>
  </ul>`,
});

// /fr/budget-suisse
pages.push({
  path: '/fr/budget-suisse',
  file: 'fr/budget-suisse.html',
  title: 'Gérer son budget en Suisse : primes, impôts, CHF — Budgy',
  desc: "Prime LAMal, impôts cantonaux, factures QR, coût de la vie : ce qui rend le budget suisse particulier, et comment une application pensée pour la Suisse simplifie tout.",
  pill: '🇨🇭 Budget en Suisse',
  h1: 'Gérer son budget <span>en Suisse</span>',
  h1Plain: 'Gérer son budget en Suisse',
  lead: "Primes maladie, impôts payés en différé, factures QR, loyers élevés : le budget suisse a ses règles propres. Les comprendre — et utiliser un outil qui les connaît — change tout.",
  crumbs: [{ name: 'Accueil', href: '/' }, { name: 'Budget en Suisse' }],
  body: `
  <h2>Ce qui rend le budget suisse particulier</h2>
  <h3>La prime LAMal, deuxième poste après le loyer</h3>
  <p>L'assurance maladie obligatoire pèse plusieurs centaines de francs par mois et par personne. Bonne nouvelle : c'est aussi le poste le plus facile à optimiser, en comparant chaque automne les assureurs, les modèles (médecin de famille, telmed, HMO) et la franchise. Budgy intègre un comparateur de primes basé sur les données officielles de l'OFSP.</p>
  <h3>Des impôts à provisionner soi-même</h3>
  <p>Contrairement à beaucoup de pays, l'impôt n'est pas prélevé à la source pour la plupart des résidents : la facture arrive plus tard. Sans provision mensuelle, c'est le piège budgétaire numéro un. Réservez chaque mois un douzième de votre impôt annuel estimé — le simulateur IFD/ICC de Budgy, par canton et situation familiale, aide à calculer ce montant.</p>
  <h3>Les factures QR</h3>
  <p>La facture QR est le standard suisse. Une application locale doit savoir la scanner, en extraire le montant et l'échéance, et vous rappeler de payer à temps pour éviter les frais de rappel — c'est ce que fait Budgy nativement.</p>
  <h3>Un coût de la vie élevé… et des marges réelles</h3>
  <p>Loyers, courses et sorties coûtent cher, mais les écarts entre enseignes, abonnements et assurances sont importants : en Suisse, bien comparer rapporte souvent plus de cent francs par mois.</p>

  <h2>Un mois type, à la suisse</h2>
  <ul>
    <li><strong>Début de mois</strong> — salaire reçu : épargne mise de côté, provisions impôts et factures QR planifiées.</li>
    <li><strong>Au quotidien</strong> — dépenses variables saisies en quelques secondes, en CHF.</li>
    <li><strong>Fin de mois</strong> — statistiques : répartition par catégorie, comparaison avec les mois précédents, ajustements.</li>
    <li><strong>Chaque automne</strong> — comparaison des primes LAMal et résiliation si un modèle plus avantageux existe.</li>
  </ul>

  ${ctaBox('Une application pensée pour la Suisse', 'CHF, factures QR, impôts par canton, comparateur LAMal : Budgy est conçu en Suisse, pour les finances suisses.')}

  <h2>Questions fréquentes</h2>
  <div class="faq-list">
    <details><summary>Pourquoi ne pas utiliser une application de budget internationale ?</summary><p>Elles fonctionnent, mais ignorent l'essentiel du contexte suisse : pas de factures QR, pas de logique de primes LAMal, pas d'impôts cantonaux à provisionner. Vous passez votre temps à contourner l'outil.</p></details>
    <details><summary>Budgy gère-t-il les francs suisses par défaut ?</summary><p>Oui. Budgy est une application suisse : montants en CHF, TVA suisse, marques locales reconnues et modules fiscaux par canton.</p></details>
    <details><summary>Mes données restent-elles protégées ?</summary><p>Vos données sont stockées localement sur votre iPhone et, si vous activez la synchronisation, chiffrées et hébergées en Europe. Budgy n'affiche aucune publicité et ne revend pas vos données.</p></details>
  </div>

  <h2>Pour aller plus loin</h2>
  <ul>
    <li><a href="/fr/guides/organiser-son-budget-en-suisse">Guide : organiser son budget en Suisse</a></li>
    <li><a href="/fr/budget-mensuel">Construire son budget mensuel</a></li>
    <li><a href="/fr/application-budget">Bien choisir son application de budget</a></li>
  </ul>`,
});

// ─── Guides ───────────────────────────────────────────────────────────────
const guides = [
  {
    slug: 'comment-faire-un-budget-mensuel',
    title: 'Comment faire un budget mensuel ? Méthode en 5 étapes — Budgy',
    desc: 'Faire un budget mensuel qui tient : revenus nets, charges fixes, épargne automatique, enveloppe variable et bilan de fin de mois. Méthode complète avec exemple en CHF.',
    pill: '📚 Guide budget',
    h1: 'Comment faire un <span>budget mensuel</span> ?',
    h1Plain: 'Comment faire un budget mensuel ?',
    lead: 'Un budget mensuel se construit en une heure et se tient en cinq minutes par semaine. Voici la méthode complète, étape par étape.',
    body: `
  <h2>Étape 1 — Rassemblez trois mois de dépenses</h2>
  <p>Relevés bancaires et de carte des trois derniers mois : notez les totaux par grande famille (logement, assurances, courses, sorties, transports, abonnements). Cette photographie honnête est la base de tout — un budget construit sur des estimations optimistes échoue toujours.</p>
  <h2>Étape 2 — Calculez votre revenu mensuel réel</h2>
  <p>Salaire net, en lissant 13e salaire et primes sur douze mois. Revenu irrégulier ? Prenez le mois le plus bas de l'année comme base prudente.</p>
  <h2>Étape 3 — Bloquez les charges fixes et l'épargne</h2>
  <p>Additionnez loyer, prime maladie, assurances, transports, télécom, abonnements et un douzième des factures annuelles (impôts surtout — en Suisse, ils se provisionnent soi-même). Puis fixez votre épargne comme une charge : virée en début de mois, pas « s'il reste quelque chose ».</p>
  <h2>Étape 4 — Définissez l'enveloppe variable</h2>
  <p>Revenu − fixes − épargne = votre enveloppe pour les courses, sorties et achats plaisir. Divisez-la par 4,3 pour obtenir un repère hebdomadaire facile à surveiller.</p>
  <h2>Étape 5 — Faites un bilan de 10 minutes chaque fin de mois</h2>
  <p>Comparez le réel au prévu, catégorie par catégorie. Un poste dépasse deux mois de suite ? Le budget était irréaliste : ajustez-le plutôt que de culpabiliser. Le budget est un outil vivant, pas un examen.</p>
  <h2>Les outils</h2>
  <p>Papier et tableur fonctionnent, mais demandent de la discipline. Une <a href="/fr/application-budget">application de budget</a> comme Budgy automatise les charges récurrentes, la saisie rapide et les statistiques mensuelles — le bilan de fin de mois est prêt sans effort.</p>
  ${ctaBox('Faites votre premier budget avec Budgy', 'Structure automatique, dépenses récurrentes, statistiques : votre budget mensuel prêt en quelques minutes.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/budget-mensuel">La page de référence sur le budget mensuel</a></li>
    <li><a href="/fr/guides/comment-suivre-ses-depenses">Comment mieux suivre ses dépenses ?</a></li>
  </ul>`,
  },
  {
    slug: 'comment-suivre-ses-depenses',
    title: 'Comment mieux suivre ses dépenses ? 7 conseils concrets — Budgy',
    desc: "Sept conseils concrets pour suivre ses dépenses sans se décourager : saisie immédiate, bonnes catégories, gestion du récurrent, bilan hebdomadaire. Guide pratique Budgy.",
    pill: '📚 Guide dépenses',
    h1: 'Comment mieux <span>suivre ses dépenses</span> ?',
    h1Plain: 'Comment mieux suivre ses dépenses ?',
    lead: "La plupart des gens abandonnent le suivi de leurs dépenses au bout de deux semaines. Ces sept conseils rendent l'habitude durable.",
    body: `
  <h2>1. Notez dans les 10 secondes</h2>
  <p>La règle qui change tout : la dépense se note au moment du paiement, téléphone en main. Reportée au soir, elle est oubliée une fois sur trois.</p>
  <h2>2. Limitez-vous à une dizaine de catégories</h2>
  <p>Courses, restaurants, transports, logement, santé, loisirs, shopping, abonnements, divers. Trop de catégories = hésitation à chaque saisie = abandon.</p>
  <h2>3. Sortez le récurrent du quotidien</h2>
  <p>Loyer, assurances et abonnements se configurent une seule fois comme <a href="/fr/guides/depenses-recurrentes">dépenses récurrentes</a>. Votre suivi quotidien ne concerne plus que le variable — deux à trois saisies par jour en moyenne.</p>
  <h2>4. Donnez-vous un repère hebdomadaire</h2>
  <p>Un budget variable mensuel divisé par semaine se pilote facilement : « il me reste 120 CHF jusqu'à dimanche » parle plus que « 480 CHF jusqu'au 31 ».</p>
  <h2>5. Regardez les statistiques, pas les lignes</h2>
  <p>Une fois par semaine, deux minutes sur la répartition par catégorie suffisent. C'est là que se trouvent les décisions : « les livraisons ont doublé ce mois-ci ».</p>
  <h2>6. Ne visez pas la perfection</h2>
  <p>Une dépense oubliée ne ruine pas le système. Un suivi fiable à 90&nbsp;% donne déjà toutes les informations utiles.</p>
  <h2>7. Choisissez un outil qui va vite</h2>
  <p>Le meilleur outil est celui que vous utilisez encore dans six mois. Budgy est conçu pour une saisie en quelques secondes, en CHF, avec les statistiques prêtes automatiquement — même hors-ligne.</p>
  ${ctaBox('Essayez le suivi nouvelle génération', 'Saisie ultra-rapide, catégories claires, graphiques mensuels : téléchargez Budgy gratuitement.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/suivi-depenses">La page de référence sur le suivi des dépenses</a></li>
    <li><a href="/fr/guides/ou-part-mon-argent">Savoir où part son argent chaque mois</a></li>
  </ul>`,
  },
  {
    slug: 'organiser-son-budget-en-suisse',
    title: 'Comment organiser son budget en Suisse ? — Budgy',
    desc: "Organiser son budget en Suisse : provisionner les impôts, optimiser la prime LAMal, gérer les factures QR et les dépenses annuelles. Guide pratique en CHF.",
    pill: '📚 Guide Suisse',
    h1: 'Organiser son budget <span>en Suisse</span>',
    h1Plain: 'Organiser son budget en Suisse',
    lead: "Impôts à provisionner, primes maladie, factures QR : le budget suisse se gagne sur quelques habitudes spécifiques. Les voici, dans l'ordre d'importance.",
    body: `
  <h2>1. Provisionnez vos impôts chaque mois</h2>
  <p>C'est LA règle suisse. L'impôt n'étant pas prélevé à la source pour la plupart des résidents, la facture arrive des mois plus tard. Estimez votre impôt annuel (IFD + cantonal + communal), divisez par douze, et traitez ce montant comme un loyer : intouchable. Le simulateur d'impôts de Budgy donne une estimation par canton et situation familiale.</p>
  <h2>2. Optimisez votre prime LAMal chaque automne</h2>
  <p>Entre assureurs, modèles alternatifs et choix de franchise, l'écart atteint souvent plusieurs centaines de francs par an à couverture égale. Mettez un rappel fin septembre : les nouvelles primes sont publiées, et la résiliation doit partir avant fin novembre. Le comparateur intégré de Budgy s'appuie sur les données officielles de l'OFSP.</p>
  <h2>3. Domptez les factures QR</h2>
  <p>Centralisez-les dès réception, notez l'échéance et payez avant la date pour éviter les frais de rappel. Dans Budgy, scannez la facture QR : montant et échéance sont extraits, et un rappel est programmé.</p>
  <h2>4. Lissez les dépenses annuelles</h2>
  <p>Plaques, serafe, cotisations, cadeaux de fin d'année : additionnez-les et mettez un douzième de côté chaque mois. Un « mois horrible » de janvier bien anticipé devient un mois normal.</p>
  <h2>5. Suivez le reste comme partout ailleurs</h2>
  <p>Une fois ces spécificités traitées, le budget suisse redevient classique : charges fixes, épargne en premier, <a href="/fr/suivi-depenses">suivi des dépenses variables</a> et bilan mensuel.</p>
  ${ctaBox('Budgy, conçu pour le budget suisse', 'CHF, impôts par canton, comparateur LAMal, factures QR : tout est intégré nativement.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/budget-suisse">La page de référence sur le budget en Suisse</a></li>
    <li><a href="/fr/guides/comment-faire-un-budget-mensuel">Faire un budget mensuel en 5 étapes</a></li>
  </ul>`,
  },
  {
    slug: 'economiser-de-largent-chaque-mois',
    title: "Comment économiser de l'argent chaque mois ? 10 pistes — Budgy",
    desc: "Dix pistes concrètes pour économiser chaque mois en Suisse : abonnements, prime LAMal, courses, télécom, habitudes d'achat. Sans se priver de l'essentiel.",
    pill: '📚 Guide économies',
    h1: "Économiser de l'argent <span>chaque mois</span>",
    h1Plain: "Économiser de l'argent chaque mois",
    lead: "Économiser durablement ne passe pas par la privation, mais par quelques décisions à fort impact et de meilleures habitudes. Dix pistes classées par effort.",
    body: `
  <h2>Les décisions « une fois pour toutes »</h2>
  <ul>
    <li><strong>1. Résiliez les abonnements dormants</strong> — streaming en double, salle de sport délaissée, applications oubliées : la revue de vos <a href="/fr/guides/depenses-recurrentes">dépenses récurrentes</a> économise souvent 50 à 150 CHF/mois.</li>
    <li><strong>2. Comparez votre prime LAMal</strong> — modèle alternatif + franchise adaptée = souvent plusieurs centaines de francs par an, à couverture identique.</li>
    <li><strong>3. Renégociez télécom et assurances</strong> — un appel ou un changement d'offre tous les deux ans suffit.</li>
    <li><strong>4. Payez vos factures à temps</strong> — les frais de rappel sont de l'argent jeté ; des rappels d'échéance les éliminent.</li>
  </ul>
  <h2>Les habitudes hebdomadaires</h2>
  <ul>
    <li><strong>5. Faites une liste de courses</strong> — et un budget courses hebdomadaire : le poste alimentaire est le plus élastique.</li>
    <li><strong>6. Instaurez 48&nbsp;h de délai</strong> — pour tout achat plaisir au-dessus d'un seuil (p. ex. 100 CHF). La moitié des envies ne survivent pas au délai.</li>
    <li><strong>7. Plafonnez les livraisons</strong> — cuisiner deux soirs de plus par semaine économise facilement 100 CHF/mois.</li>
  </ul>
  <h2>Le système qui fait durer</h2>
  <ul>
    <li><strong>8. Suivez vos dépenses</strong> — noter ses achats les réduit mécaniquement ; c'est l'effet le plus documenté des finances personnelles.</li>
    <li><strong>9. Épargnez en début de mois</strong> — l'argent mis de côté avant les dépenses ne peut pas être dépensé.</li>
    <li><strong>10. Donnez un objectif à vos économies</strong> — « 3\u2009000 CHF de réserve en juin » motive plus que « dépenser moins ». Créez un <a href="/fr/guides/objectif-epargne">objectif d'épargne</a> visible.</li>
  </ul>
  <p>Le Coach IA de Budgy peut analyser vos dépenses et vous suggérer, parmi ces pistes, celles qui rapporteraient le plus dans votre situation.</p>
  ${ctaBox('Trouvez vos économies avec Budgy', 'Suivi des dépenses, revue des abonnements, comparateur LAMal et Coach IA : tout pour économiser chaque mois.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/epargne-objectifs">Épargne &amp; objectifs : la méthode complète</a></li>
    <li><a href="/fr/guides/reprendre-le-controle-de-ses-finances">Reprendre le contrôle de ses finances</a></li>
  </ul>`,
  },
  {
    slug: 'budget-familial',
    title: 'Comment créer un budget familial ? — Budgy',
    desc: "Créer un budget familial clair : dépenses communes et personnelles, coûts des enfants, provisions annuelles et rituel mensuel à deux. Guide pratique en CHF.",
    pill: '📚 Guide famille',
    h1: 'Créer un <span>budget familial</span>',
    h1Plain: 'Créer un budget familial',
    lead: "À deux ou avec des enfants, le budget change de dimension : plus de postes, plus d'imprévus — et la nécessité d'être d'accord. Voici une organisation qui fonctionne.",
    body: `
  <h2>1. Séparez commun et personnel</h2>
  <p>La source numéro un de tensions financières en couple est le flou. Définissez ce qui est commun (logement, courses, enfants, assurances familiales) et ce qui reste personnel (loisirs individuels, shopping). Une répartition au prorata des revenus est souvent perçue comme la plus juste.</p>
  <h2>2. Budgétez les enfants par poste, pas au forfait</h2>
  <p>Garde, activités, habits, santé : les coûts des enfants sont réguliers mais évoluent vite. Des catégories dédiées montrent leur poids réel et évitent les mauvaises surprises à chaque rentrée.</p>
  <h2>3. Provisionnez les grosses échéances familiales</h2>
  <p>Vacances, camps, dentiste, équipements de sport, fêtes : listez les dépenses annuelles prévisibles et mettez un douzième de côté chaque mois. C'est la différence entre une famille qui « subit » ses gros mois et une famille qui les a anticipés.</p>
  <h2>4. Instaurez le rendez-vous budget mensuel</h2>
  <p>Quinze minutes à deux, une fois par mois : où en est-on, qu'est-ce qui a dérapé, qu'ajuste-t-on ? Avec des statistiques claires sous les yeux, la conversation reste factuelle — pas de reproches, des chiffres.</p>
  <h2>5. Gardez chacun un espace de liberté</h2>
  <p>Un montant personnel « sans justification » pour chaque adulte évite la sensation de contrôle permanent et rend le budget commun beaucoup plus durable.</p>
  <p>Dans Budgy, les catégories, les dépenses récurrentes et les statistiques mensuelles donnent au foyer une vue commune et objective de la situation.</p>
  ${ctaBox('Un budget familial clair avec Budgy', "Catégories dédiées, récurrents automatiques et bilan mensuel : la base saine d'un budget à plusieurs.")}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/guides/comment-faire-un-budget-mensuel">La méthode du budget mensuel</a></li>
    <li><a href="/fr/guides/objectif-epargne">Fixer un objectif d'épargne familial</a></li>
  </ul>`,
  },
  {
    slug: 'depenses-recurrentes',
    title: 'Prévoir et maîtriser ses dépenses récurrentes — Budgy',
    desc: "Abonnements, assurances, loyer : comment inventorier ses dépenses récurrentes, repérer celles à résilier et les intégrer proprement dans son budget mensuel.",
    pill: '📚 Guide récurrents',
    h1: 'Maîtriser ses <span>dépenses récurrentes</span>',
    h1Plain: 'Maîtriser ses dépenses récurrentes',
    lead: "Plus de la moitié d'un budget part en dépenses qui se répètent chaque mois — souvent sans qu'on les regarde. Les inventorier une bonne fois change durablement vos finances.",
    body: `
  <h2>Pourquoi les récurrents sont le levier n°1</h2>
  <p>Une économie sur une dépense récurrente se répète automatiquement chaque mois : résilier un abonnement de 25 CHF rapporte 300 CHF par an, sans aucun effort supplémentaire. À l'inverse, un abonnement oublié coûte, lui aussi, tous les mois.</p>
  <h2>Étape 1 — L'inventaire complet</h2>
  <p>Parcourez trois mois de relevés et listez tout ce qui se répète : loyer, LAMal et assurances, transports, télécom, streaming, musique, cloud, applications, salle de sport, dons, serafe… Le total surprend presque toujours.</p>
  <h2>Étape 2 — Le tri en trois piles</h2>
  <ul>
    <li><strong>Indispensable</strong> — logement, assurances obligatoires, transports.</li>
    <li><strong>Utile mais négociable</strong> — télécom, modèles d'assurance, électricité : à comparer une fois par an.</li>
    <li><strong>Dormant</strong> — ce que vous n'avez pas utilisé depuis deux mois : résiliez, vous pourrez toujours vous réabonner.</li>
  </ul>
  <h2>Étape 3 — L'intégration au budget</h2>
  <p>Configurez chaque récurrent une seule fois dans votre outil de budget, avec son jour de prélèvement. Votre <a href="/fr/budget-mensuel">budget mensuel</a> affiche alors automatiquement le bloc fixe, et votre suivi quotidien ne concerne plus que les dépenses variables. C'est exactement le fonctionnement des dépenses récurrentes dans Budgy, qui se reportent chaque mois toutes seules.</p>
  <h2>Étape 4 — La revue semestrielle</h2>
  <p>Deux fois par an, dix minutes : la liste a-t-elle grossi ? Un nouvel abonnement d'essai est-il devenu payant ? La prime maladie peut-elle baisser ? Ce petit rituel maintient le bloc fixe sous contrôle.</p>
  ${ctaBox('Vos récurrents sous contrôle avec Budgy', 'Configurez vos charges fixes une fois : Budgy les reporte chaque mois et vous montre leur poids réel.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/guides/economiser-de-largent-chaque-mois">Économiser chaque mois : 10 pistes</a></li>
    <li><a href="/fr/gestion-budget">La méthode complète de gestion de budget</a></li>
  </ul>`,
  },
  {
    slug: 'objectif-epargne',
    title: "Comment se fixer un objectif d'épargne réaliste ? — Budgy",
    desc: "Définir un objectif d'épargne qui aboutit : montant, échéance, versement automatique en début de mois et suivi visuel. Méthode concrète avec exemples en CHF.",
    pill: "📚 Guide épargne",
    h1: "Se fixer un <span>objectif d'épargne</span>",
    h1Plain: "Se fixer un objectif d'épargne",
    lead: "Un objectif d'épargne réussi tient en trois chiffres : un montant, une date, un versement mensuel. Voici comment les choisir pour aller au bout.",
    body: `
  <h2>1. Choisissez un objectif qui vous parle</h2>
  <p>Réserve d'urgence, vacances, permis, meubles, apport : l'objectif doit être concret et désirable. « Épargner pour épargner » ne motive personne au-delà de quelques semaines.</p>
  <h2>2. Faites le calcul à l'envers</h2>
  <p>Montant ÷ nombre de mois restants = versement mensuel. Exemple : 2\u2009400 CHF de vacances dans 8 mois = 300 CHF par mois. Si le versement dépasse ce que votre <a href="/fr/budget-mensuel">budget mensuel</a> permet, allongez l'échéance ou réduisez le montant — un objectif tenable vaut mieux qu'un objectif héroïque abandonné en mars.</p>
  <h2>3. Versez en début de mois, automatiquement</h2>
  <p>Le principe « payez-vous d'abord » : l'épargne part dès le salaire reçu. Ce qui reste sur le compte devient votre vrai budget de dépenses — et l'objectif avance sans volonté ni discipline.</p>
  <h2>4. Rendez la progression visible</h2>
  <p>Une barre de progression consultée chaque semaine entretient la motivation : à 60&nbsp;%, plus personne n'abandonne. Dans Budgy, chaque objectif d'épargne affiche sa progression et le montant restant.</p>
  <h2>5. Sécurisez d'abord la réserve d'urgence</h2>
  <p>Avant les projets plaisir, visez l'équivalent de trois mois de charges fixes en réserve. C'est elle qui empêche un imprévu — dentiste, voiture, caution — de casser tous vos autres objectifs.</p>
  <h2>Trois exemples de plans</h2>
  <ul>
    <li><strong>Réserve d'urgence</strong> : 9\u2009000 CHF en 18 mois → 500 CHF/mois.</li>
    <li><strong>Vacances d'été</strong> : 2\u2009400 CHF en 8 mois → 300 CHF/mois.</li>
    <li><strong>Nouveau matelas + meubles</strong> : 1\u2009500 CHF en 6 mois → 250 CHF/mois.</li>
  </ul>
  ${ctaBox('Créez votre objectif dans Budgy', 'Montant, échéance, progression visuelle : vos objectifs d\'épargne prennent vie dans Budgy, gratuitement.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/epargne-objectifs">La page de référence épargne &amp; objectifs</a></li>
    <li><a href="/fr/guides/economiser-de-largent-chaque-mois">Où trouver les francs à épargner</a></li>
  </ul>`,
  },
  {
    slug: 'reprendre-le-controle-de-ses-finances',
    title: 'Reprendre le contrôle de ses finances en 30 jours — Budgy',
    desc: "Un plan simple sur 30 jours pour reprendre le contrôle de ses finances : état des lieux, inventaire des récurrents, budget réaliste et premières économies.",
    pill: '📚 Guide finances',
    h1: 'Reprendre le contrôle <span>de ses finances</span>',
    h1Plain: 'Reprendre le contrôle de ses finances',
    lead: "Découvert récurrent, sensation de flou, fins de mois tendues : la reprise en main se joue en 30 jours, une étape par semaine. Voici le plan.",
    body: `
  <h2>Semaine 1 — L'état des lieux, sans jugement</h2>
  <p>Rassemblez trois mois de relevés et posez trois chiffres : revenu net mensuel, total des charges fixes, total des dépenses variables. Pas d'objectif cette semaine, juste la vérité des chiffres. C'est l'étape que tout le monde saute — et la raison pour laquelle tout le monde échoue.</p>
  <h2>Semaine 2 — La chasse aux récurrents</h2>
  <p>Inventoriez tous les prélèvements qui se répètent et triez : indispensable, négociable, dormant. Résiliez les dormants, notez les négociables pour la prochaine échéance (prime LAMal en automne, télécom à la fin d'engagement). Guide détaillé : <a href="/fr/guides/depenses-recurrentes">maîtriser ses dépenses récurrentes</a>.</p>
  <h2>Semaine 3 — Le budget réaliste</h2>
  <p>Construisez votre <a href="/fr/guides/comment-faire-un-budget-mensuel">budget mensuel</a> : charges fixes bloquées, épargne modeste mais automatique (même 100 CHF), enveloppe variable hebdomadaire. Réaliste signifie : basé sur vos chiffres de la semaine 1, pas sur la personne que vous aimeriez être.</p>
  <h2>Semaine 4 — Le système de croisière</h2>
  <p>Prenez l'habitude des 5 secondes : chaque dépense variable est notée immédiatement. Programmez un bilan mensuel de dix minutes. Fixez votre premier <a href="/fr/guides/objectif-epargne">objectif d'épargne</a> visible — la réserve d'urgence d'abord.</p>
  <h2>Et après ?</h2>
  <p>Au deuxième mois, les chiffres commencent à parler : catégories qui dérapent, économies possibles, progression de la réserve. C'est là qu'un outil fait la différence — Budgy automatise le suivi, les récurrents, les objectifs et les statistiques, et son Coach IA suggère des améliorations adaptées à votre situation.</p>
  ${ctaBox('Commencez votre mois de reprise en main', "Téléchargez Budgy gratuitement et faites l'état des lieux dès aujourd'hui — 30 jours pour changer la donne.")}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/gestion-budget">Les trois habitudes de la gestion de budget</a></li>
    <li><a href="/fr/guides/ou-part-mon-argent">Savoir où part son argent chaque mois</a></li>
  </ul>`,
  },
  {
    slug: 'ou-part-mon-argent',
    title: 'Où part mon argent chaque mois ? La méthode pour le savoir — Budgy',
    desc: "Fin de mois difficile sans savoir pourquoi ? La méthode en 3 temps pour découvrir où part votre argent : photographie, catégories révélatrices et fuites courantes.",
    pill: '📚 Guide analyse',
    h1: 'Où part mon argent <span>chaque mois</span> ?',
    h1Plain: 'Où part mon argent chaque mois ?',
    lead: "« Je gagne correctement ma vie, mais il ne reste rien à la fin du mois. » Cette phrase a toujours une explication chiffrée — voici comment la trouver en un mois.",
    body: `
  <h2>Temps 1 — La photographie d'un mois complet</h2>
  <p>Pendant 30 jours, notez chaque dépense au moment où elle a lieu, avec une catégorie simple. Ne changez rien à vos habitudes : l'objectif est de mesurer, pas encore de corriger. Avec une saisie de cinq secondes dans une application comme Budgy, l'exercice est indolore.</p>
  <h2>Temps 2 — Les trois questions révélatrices</h2>
  <ul>
    <li><strong>Quel est le poids de mes récurrents ?</strong> Additionnez tout ce qui se répète. Au-delà de 60&nbsp;% du revenu, c'est le bloc fixe qu'il faut attaquer (prime LAMal, télécom, abonnements) plutôt que les cafés.</li>
    <li><strong>Quelles sont mes trois plus grosses catégories variables ?</strong> Elles concentrent en général 70&nbsp;% du potentiel d'économie. Inutile d'optimiser le reste.</li>
    <li><strong>Combien coûtent mes « petits riens » ?</strong> Livraisons, snacks, applications, taxis : individuellement anodins, ils forment souvent une catégorie fantôme de 200 à 400 CHF par mois.</li>
  </ul>
  <h2>Temps 3 — Les fuites les plus courantes</h2>
  <ol>
    <li>Abonnements oubliés ou en double ;</li>
    <li>frais de rappel sur factures payées en retard ;</li>
    <li>courses sans liste (10 à 20&nbsp;% de plus à chaque passage) ;</li>
    <li>livraisons de repas devenues quotidiennes ;</li>
    <li>achats impulsifs en ligne le soir.</li>
  </ol>
  <p>Une fois la fuite identifiée, la correction est simple parce qu'elle est ciblée : on ne « fait pas des économies », on résilie un abonnement précis ou on plafonne une catégorie précise. Les statistiques par catégorie de Budgy montrent tout cela automatiquement, et son Coach IA met en évidence les postes anormalement élevés.</p>
  ${ctaBox('Découvrez où part votre argent', 'Un mois de suivi avec Budgy suffit pour obtenir votre photographie financière complète — gratuitement.')}
  <h2>Lire ensuite</h2>
  <ul>
    <li><a href="/fr/guides/comment-suivre-ses-depenses">Bien suivre ses dépenses : 7 conseils</a></li>
    <li><a href="/fr/guides/economiser-de-largent-chaque-mois">Transformer les fuites en économies</a></li>
  </ul>`,
  },
];

for (const g of guides) {
  pages.push({
    path: `/fr/guides/${g.slug}`,
    file: `fr/guides/${g.slug}.html`,
    title: g.title,
    desc: g.desc,
    pill: g.pill,
    h1: g.h1,
    h1Plain: g.h1Plain,
    lead: g.lead,
    body: g.body,
    article: true,
    crumbs: [
      { name: 'Accueil', href: '/' },
      { name: 'Guides', href: '/fr/guides' },
      { name: g.h1Plain },
    ],
  });
}

// Index des guides
pages.push({
  path: '/fr/guides',
  file: 'fr/guides/index.html',
  title: 'Guides budget & finances personnelles — Budgy',
  desc: "Guides pratiques Budgy : faire un budget mensuel, suivre ses dépenses, économiser chaque mois, budget familial, objectifs d'épargne et finances en Suisse.",
  pill: '📚 Guides & conseils',
  h1: 'Guides <span>budget & finances</span>',
  h1Plain: 'Guides budget & finances personnelles',
  lead: "Des guides concrets, sans jargon, pour mieux gérer votre argent au quotidien — rédigés par l'équipe Budgy et régulièrement mis à jour.",
  heroCta: false,
  crumbs: [{ name: 'Accueil', href: '/' }, { name: 'Guides' }],
  body: `
  <div class="cards">
    ${guides
      .map(
        (g) => `<a class="card" href="/fr/guides/${g.slug}"><span class="emoji">${g.pill.split(' ')[0]}</span><span class="card-title">${g.h1Plain}</span><p>${g.lead.slice(0, 110)}…</p></a>`
      )
      .join('\n    ')}
  </div>
  <h2>Les pages de référence</h2>
  <ul>
    <li><a href="/fr/application-budget">Choisir une application de budget</a></li>
    <li><a href="/fr/gestion-budget">La méthode de gestion de budget</a></li>
    <li><a href="/fr/suivi-depenses">Le suivi des dépenses</a></li>
    <li><a href="/fr/budget-mensuel">Le budget mensuel</a></li>
    <li><a href="/fr/epargne-objectifs">Épargne &amp; objectifs</a></li>
    <li><a href="/fr/budget-suisse">Gérer son budget en Suisse</a></li>
  </ul>
  ${ctaBox('Mettez les conseils en pratique', 'Budgy est gratuit au téléchargement sur iPhone : suivi des dépenses, budget, factures et épargne, pensés pour la Suisse.')}`,
});

// ─── Écriture ────────────────────────────────────────────────────────────
let count = 0;
for (const p of pages) {
  const out = path.join(PUB, p.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderPage(p));
  count += 1;
  console.log('✓', p.file);
}
console.log(`\n${count} pages générées dans frontend/public/`);
