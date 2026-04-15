/**
 * GUARDIAN MONEY CHF - Swiss Financial Data 2025
 * Source: OFSP/BAG Priminfo, ESTV, cantonal tax authorities
 */

// 26 Swiss Cantons with tax rates and LAMal premiums
export const CANTONS = {
  AG: { code: 'AG', name: 'Argovie', nameFr: 'Argovie', nameDE: 'Aargau', region: 'DE', taxRate: 21.4, lamalPremium: 412, subsidyThreshold: 41400 },
  AI: { code: 'AI', name: 'Appenzell Rh.-I.', nameFr: 'Appenzell Rh.-I.', nameDE: 'Appenzell I.Rh.', region: 'DE', taxRate: 14.5, lamalPremium: 341, subsidyThreshold: 38200 },
  AR: { code: 'AR', name: 'Appenzell Rh.-E.', nameFr: 'Appenzell Rh.-E.', nameDE: 'Appenzell A.Rh.', region: 'DE', taxRate: 17.8, lamalPremium: 379, subsidyThreshold: 39800 },
  BE: { code: 'BE', name: 'Berne', nameFr: 'Berne', nameDE: 'Bern', region: 'DE', taxRate: 26.1, lamalPremium: 498, subsidyThreshold: 43200 },
  BL: { code: 'BL', name: 'Bâle-Campagne', nameFr: 'Bâle-Campagne', nameDE: 'Basel-Landschaft', region: 'DE', taxRate: 25.2, lamalPremium: 521, subsidyThreshold: 44100 },
  BS: { code: 'BS', name: 'Bâle-Ville', nameFr: 'Bâle-Ville', nameDE: 'Basel-Stadt', region: 'DE', taxRate: 29.0, lamalPremium: 554, subsidyThreshold: 45200 },
  FR: { code: 'FR', name: 'Fribourg', nameFr: 'Fribourg', nameDE: 'Freiburg', region: 'FR', taxRate: 26.3, lamalPremium: 462, subsidyThreshold: 41800 },
  GE: { code: 'GE', name: 'Genève', nameFr: 'Genève', nameDE: 'Genf', region: 'FR', taxRate: 28.5, lamalPremium: 623, subsidyThreshold: 47600 },
  GL: { code: 'GL', name: 'Glaris', nameFr: 'Glaris', nameDE: 'Glarus', region: 'DE', taxRate: 18.2, lamalPremium: 388, subsidyThreshold: 39200 },
  GR: { code: 'GR', name: 'Grisons', nameFr: 'Grisons', nameDE: 'Graubünden', region: 'DE', taxRate: 19.5, lamalPremium: 421, subsidyThreshold: 40500 },
  JU: { code: 'JU', name: 'Jura', nameFr: 'Jura', nameDE: 'Jura', region: 'FR', taxRate: 27.2, lamalPremium: 489, subsidyThreshold: 42800 },
  LU: { code: 'LU', name: 'Lucerne', nameFr: 'Lucerne', nameDE: 'Luzern', region: 'DE', taxRate: 22.5, lamalPremium: 419, subsidyThreshold: 40800 },
  NE: { code: 'NE', name: 'Neuchâtel', nameFr: 'Neuchâtel', nameDE: 'Neuenburg', region: 'FR', taxRate: 27.4, lamalPremium: 512, subsidyThreshold: 43900 },
  NW: { code: 'NW', name: 'Nidwald', nameFr: 'Nidwald', nameDE: 'Nidwalden', region: 'DE', taxRate: 13.8, lamalPremium: 362, subsidyThreshold: 38800 },
  OW: { code: 'OW', name: 'Obwald', nameFr: 'Obwald', nameDE: 'Obwalden', region: 'DE', taxRate: 14.2, lamalPremium: 354, subsidyThreshold: 38400 },
  SG: { code: 'SG', name: 'St-Gall', nameFr: 'St-Gall', nameDE: 'St. Gallen', region: 'DE', taxRate: 23.1, lamalPremium: 435, subsidyThreshold: 41200 },
  SH: { code: 'SH', name: 'Schaffhouse', nameFr: 'Schaffhouse', nameDE: 'Schaffhausen', region: 'DE', taxRate: 22.8, lamalPremium: 445, subsidyThreshold: 41500 },
  SO: { code: 'SO', name: 'Soleure', nameFr: 'Soleure', nameDE: 'Solothurn', region: 'DE', taxRate: 24.5, lamalPremium: 456, subsidyThreshold: 41700 },
  SZ: { code: 'SZ', name: 'Schwytz', nameFr: 'Schwytz', nameDE: 'Schwyz', region: 'DE', taxRate: 15.2, lamalPremium: 356, subsidyThreshold: 38600 },
  TG: { code: 'TG', name: 'Thurgovie', nameFr: 'Thurgovie', nameDE: 'Thurgau', region: 'DE', taxRate: 21.8, lamalPremium: 408, subsidyThreshold: 40200 },
  TI: { code: 'TI', name: 'Tessin', nameFr: 'Tessin', nameDE: 'Tessin', region: 'IT', taxRate: 20.4, lamalPremium: 478, subsidyThreshold: 42500 },
  UR: { code: 'UR', name: 'Uri', nameFr: 'Uri', nameDE: 'Uri', region: 'DE', taxRate: 16.5, lamalPremium: 358, subsidyThreshold: 38700 },
  VD: { code: 'VD', name: 'Vaud', nameFr: 'Vaud', nameDE: 'Waadt', region: 'FR', taxRate: 26.9, lamalPremium: 578, subsidyThreshold: 46100 },
  VS: { code: 'VS', name: 'Valais', nameFr: 'Valais', nameDE: 'Wallis', region: 'FR', taxRate: 24.8, lamalPremium: 448, subsidyThreshold: 41600 },
  ZG: { code: 'ZG', name: 'Zoug', nameFr: 'Zoug', nameDE: 'Zug', region: 'DE', taxRate: 12.2, lamalPremium: 378, subsidyThreshold: 39400 },
  ZH: { code: 'ZH', name: 'Zürich', nameFr: 'Zürich', nameDE: 'Zürich', region: 'DE', taxRate: 23.7, lamalPremium: 489, subsidyThreshold: 42800 },
} as const;

export type CantonCode = keyof typeof CANTONS;

// LAMal Insurance companies with price indices
export const INSURERS = [
  { id: 'css', name: 'CSS', color: '#009fe3', logo: 'C', rating: 4.2, cantons: 'all',
    models: ['std', 'hmo', 'div'], desc: 'N°1 suisse · service client reconnu · app mobile complète',
    strengths: ['Meilleur réseau médecins', 'App CSS très complète', 'Gestion sinistres rapide'],
    priceIndex: { std: 1.02, hmo: 0.98, div: 1.00 } },
  { id: 'helsana', name: 'Helsana', color: '#E2001A', logo: 'H', rating: 4.1, cantons: 'all',
    models: ['std', 'hmo', 'div'], desc: 'Primes compétitives · bonus fidélité · Picasso app',
    strengths: ['Bonus longue durée', 'Picasso wellness app', 'Remboursement rapide'],
    priceIndex: { std: 0.98, hmo: 0.96, div: 0.97 } },
  { id: 'swica', name: 'SWICA', color: '#007B5E', logo: 'S', rating: 4.4, cantons: 'all',
    models: ['std', 'hmo', 'div'], desc: 'Meilleure satisfaction client · wellness inclus',
    strengths: ['Top satisfaction 2024', 'BENEVITA wellness gratuit', 'Médecine complémentaire'],
    priceIndex: { std: 1.05, hmo: 1.01, div: 1.03 } },
  { id: 'concordia', name: 'Concordia', color: '#003A70', logo: 'Co', rating: 3.9, cantons: 'all',
    models: ['std', 'hmo'], desc: 'Coopérative · valeurs suisses · prix stables',
    strengths: ['Stabilité des primes', 'Modèle coopératif', 'Bonne couverture Europe'],
    priceIndex: { std: 0.96, hmo: 0.94, div: 0.95 } },
  { id: 'visana', name: 'Visana', color: '#0066CC', logo: 'V', rating: 3.8, cantons: 'BE|FR|SO|AG',
    models: ['std', 'hmo', 'div'], desc: 'Fort en Suisse romande et Berne · prix attractifs',
    strengths: ['Primes parmi moins chères', 'Bonne couverture dentaire LCA', 'Réseau médecins Berne'],
    priceIndex: { std: 0.94, hmo: 0.92, div: 0.93 } },
  { id: 'sanitas', name: 'Sanitas', color: '#1E3A5F', logo: 'Sa', rating: 4.0, cantons: 'all',
    models: ['std', 'hmo', 'div'], desc: 'Numérique-first · app primée · téléconsultation',
    strengths: ['Meilleure app mobile', 'Téléconsultation incluse', 'Parcours digital complet'],
    priceIndex: { std: 1.01, hmo: 0.97, div: 0.99 } },
  { id: 'assura', name: 'Assura', color: '#FF6600', logo: 'A', rating: 3.5, cantons: 'VD|GE|FR|VS|NE|JU|BE',
    models: ['std', 'hmo'], desc: 'Primes les moins chères de Suisse romande',
    strengths: ['Prix imbattables', 'Simple et efficace', 'Idéal budget serré'],
    priceIndex: { std: 0.87, hmo: 0.85, div: 0.86 } },
  { id: 'agrisano', name: 'Agrisano', color: '#006400', logo: 'Ag', rating: 3.7, cantons: 'all',
    models: ['std'], desc: 'Spécialisée agriculture · très compétitive ruralement',
    strengths: ['Excellente pour zones rurales', 'Primes basses', 'Partenariat Fenaco'],
    priceIndex: { std: 0.91, hmo: 0.89, div: 0.90 } },
] as const;

// Franchise options
export const FRANCHISES = [
  { value: 300, label: 'CHF 300 (ordinaire)', maxCopay: 700 },
  { value: 500, label: 'CHF 500', maxCopay: 700 },
  { value: 1000, label: "CHF 1'000", maxCopay: 700 },
  { value: 1500, label: "CHF 1'500", maxCopay: 700 },
  { value: 2000, label: "CHF 2'000", maxCopay: 700 },
  { value: 2500, label: 'CHF 2500 (max)', maxCopay: 700 },
] as const;

// Insurance model options
export const INSURANCE_MODELS = [
  { value: 'std', label: 'Standard (libre choix)', discount: 0 },
  { value: 'hmo', label: 'HMO / Médecin de famille', discount: 0.10 },
  { value: 'div', label: 'Telmed / Diverto', discount: 0.08 },
] as const;

// Expense categories
export const EXPENSE_CATEGORIES = [
  { id: 'courses', name: 'Courses', icon: 'cart', color: '#10B981' },
  { id: 'loisirs', name: 'Loisirs', icon: 'game-controller', color: '#8B5CF6' },
  { id: 'sante', name: 'Santé', icon: 'medkit', color: '#EF4444' },
  { id: 'restaurant', name: 'Restaurant', icon: 'restaurant', color: '#F97316' },
  { id: 'transport', name: 'Transport', icon: 'bus', color: '#3B82F6' },
  { id: 'shopping', name: 'Shopping', icon: 'bag', color: '#EC4899' },
  { id: 'abonnements', name: 'Abonnements', icon: 'refresh', color: '#6B7280' },
  { id: 'maison', name: 'Maison', icon: 'home', color: '#14B8A6' },
  { id: 'education', name: 'Éducation', icon: 'school', color: '#0EA5E9' },
  { id: 'sport', name: 'Sport', icon: 'fitness', color: '#22C55E' },
  { id: 'autre', name: 'Autre', icon: 'ellipsis-horizontal', color: '#6B7280' },
  { id: 'transport_pro', name: 'Transport Pro', icon: 'train', color: '#6366F1' },
  { id: 'repas_affaires', name: 'Repas affaires', icon: 'wine', color: '#F59E0B' },
  { id: 'hebergement', name: 'Hébergement', icon: 'bed', color: '#10B981' },
  { id: 'telecoms', name: 'Télécoms', icon: 'call', color: '#0EA5E9' },
] as const;

// Income categories
export const INCOME_CATEGORIES = [
  { id: 'salaire', name: 'Salaire', icon: 'briefcase', color: '#10B981' },
  { id: 'freelance', name: 'Freelance', icon: 'color-palette', color: '#F59E0B' },
  { id: 'dividendes', name: 'Dividendes', icon: 'trending-up', color: '#6366F1' },
  { id: 'loyer', name: 'Loyer reçu', icon: 'business', color: '#6366F1' },
  { id: 'bonus', name: 'Bonus', icon: 'gift', color: '#EC4899' },
  { id: 'autre', name: 'Autre', icon: 'cash', color: '#6B7280' },
] as const;

// Savings templates
export const SAVINGS_TEMPLATES = [
  { emoji: '🏠', title: 'Achat immobilier', target: 80000, cat: 'Immobilier', color: '#6366F1' },
  { emoji: '🚗', title: 'Voiture neuve', target: 25000, cat: 'Véhicule', color: '#10B981' },
  { emoji: '✈️', title: 'Voyage de rêve', target: 5000, cat: 'Voyage', color: '#EC4899' },
  { emoji: '🛡️', title: "Fonds d'urgence", target: 15000, cat: 'Sécurité', color: '#EF4444' },
  { emoji: '💻', title: 'MacBook Pro', target: 3200, cat: 'Tech', color: '#8B5CF6' },
  { emoji: '🎮', title: 'Console gaming', target: 700, cat: 'Tech', color: '#8B5CF6' },
  { emoji: '🎓', title: 'Formation CAS', target: 8000, cat: 'Éducation', color: '#0EA5E9' },
  { emoji: '💍', title: 'Mariage', target: 20000, cat: 'Vie', color: '#F43F5E' },
  { emoji: '👶', title: 'Arrivée bébé', target: 12000, cat: 'Famille', color: '#FB923C' },
  { emoji: '⚡', title: 'Tesla Model 3', target: 18000, cat: 'Véhicule', color: '#10B981' },
  { emoji: '🔥', title: 'Retraite FIRE', target: 500000, cat: 'Retraite', color: '#F97316' },
  { emoji: '📈', title: 'Portefeuille ETF', target: 50000, cat: 'Investissement', color: '#22C55E' },
] as const;

// Supported currencies
export const CURRENCIES = [
  { code: 'CHF', symbol: 'CHF', name: 'Franc suisse', flag: '🇨🇭' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'USD', symbol: '$', name: 'Dollar US', flag: '🇺🇸' },
  { code: 'GBP', symbol: '£', name: 'Livre sterling', flag: '🇬🇧' },
  { code: 'RUB', symbol: '₽', name: 'Rouble russe', flag: '🇷🇺' },
  { code: 'BAM', symbol: 'KM', name: 'Mark convertible', flag: '🇧🇦' },
  { code: 'BRL', symbol: 'R$', name: 'Real brésilien', flag: '🇧🇷' },
] as const;

// Supported languages
export const LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'bs', name: 'Bosanski', flag: '🇧🇦' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
] as const;

// 3rd pillar limits 2025
export const PILLAR_3A_LIMITS = {
  employee: 7258,
  selfEmployed: 36288,
} as const;

// Swiss TVA rate
export const TVA_RATE = 8.1;
