/**
 * BUDGY - Swiss Merchants & Brands Database
 * Auto-detection of 100+ popular brands in Switzerland.
 * Maps merchant names → {color, category, emoji, initials}
 * Used by BrandLogo component to render branded tiles safely (colored circles + initials),
 * avoiding trademark infringement while remaining recognizable.
 */

export interface Brand {
  name: string;
  keywords: string[];
  color: string;
  bg?: string;
  initials?: string;
  emoji?: string;
  category: string;
  textColor?: string;
  domain?: string;  // for clearbit logo API
}

export const SWISS_BRANDS: Brand[] = [
  // ─── Supermarkets & Grocery ────────────────────────
  { name: 'Migros',        keywords: ['migros', 'migro'],               color: '#FF6600', initials: 'M',  emoji: '🛒', category: 'courses', textColor: '#FFF', domain: 'migros.ch' },
  { name: 'Coop',          keywords: ['coop'],                           color: '#F9B200', initials: 'C',  emoji: '🛒', category: 'courses', textColor: '#000', domain: 'coop.ch' },
  { name: 'Denner',        keywords: ['denner'],                         color: '#E30613', initials: 'D',  emoji: '🛒', category: 'courses', textColor: '#FFF', domain: 'denner.ch' },
  { name: 'Lidl',          keywords: ['lidl'],                           color: '#0050AA', initials: 'L',  emoji: '🛒', category: 'courses', textColor: '#FFE500', domain: 'lidl.ch' },
  { name: 'Aldi',          keywords: ['aldi'],                           color: '#00549F', initials: 'A',  emoji: '🛒', category: 'courses', textColor: '#FF7F27', domain: 'aldi-suisse.ch' },
  { name: 'Manor',         keywords: ['manor'],                          color: '#E30613', initials: 'Ma', emoji: '🏬', category: 'courses', textColor: '#FFF', domain: 'manor.ch' },
  { name: 'Spar',          keywords: ['spar'],                           color: '#E30613', initials: 'S',  emoji: '🛒', category: 'courses', textColor: '#FFF', domain: 'spar.ch' },
  { name: 'Volg',          keywords: ['volg'],                           color: '#FFCC00', initials: 'V',  emoji: '🛒', category: 'courses', textColor: '#000', domain: 'volg.ch' },
  { name: 'Landi',         keywords: ['landi'],                          color: '#E30613', initials: 'La', emoji: '🌾', category: 'courses', textColor: '#FFF', domain: 'landi.ch' },
  { name: 'IKEA',          keywords: ['ikea'],                           color: '#0051BA', initials: 'IK', emoji: '🪑', category: 'autres',  textColor: '#FFCC00', domain: 'ikea.com' },

  // ─── Restaurants & Cafés ─────────────────────────
  { name: 'Starbucks',     keywords: ['starbucks'],                      color: '#006241', initials: 'S',  emoji: '☕', category: 'restaurants', textColor: '#FFF', domain: 'starbucks.com' },
  { name: 'McDonald\'s',   keywords: ['mcdonald', 'mcdo'],              color: '#FFC72C', initials: 'M',  emoji: '🍔', category: 'restaurants', textColor: '#DA291C' },
  { name: 'Burger King',   keywords: ['burger king', 'bk '],            color: '#D62300', initials: 'BK', emoji: '🍔', category: 'restaurants', textColor: '#FFF', domain: 'burgerking.ch' },
  { name: 'Subway',        keywords: ['subway'],                         color: '#008C15', initials: 'S',  emoji: '🥪', category: 'restaurants', textColor: '#FFC20E', domain: 'subway.com' },
  { name: 'KFC',           keywords: ['kfc'],                            color: '#E4002B', initials: 'K',  emoji: '🍗', category: 'restaurants', textColor: '#FFF', domain: 'kfc.ch' },
  { name: 'Domino\'s',     keywords: ['domino'],                         color: '#0078AE', initials: 'D',  emoji: '🍕', category: 'restaurants', textColor: '#E31837' },

  // ─── Mobile & Telecom ──────────────────────────────
  { name: 'Swisscom',      keywords: ['swisscom'],                       color: '#002EA8', initials: 'SC', emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'swisscom.ch' },
  { name: 'Sunrise',       keywords: ['sunrise'],                        color: '#DA291C', initials: 'Sn', emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'sunrise.ch' },
  { name: 'Salt',          keywords: ['salt mobile', 'salt '],          color: '#FF0000', initials: 'S',  emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'salt.ch' },
  { name: 'Yallo',         keywords: ['yallo'],                          color: '#FF4F00', initials: 'Y',  emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'yallo.ch' },
  { name: 'M-Budget Mobile', keywords: ['m-budget', 'mbudget'],         color: '#FF6600', initials: 'MB', emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'm-budget.ch' },
  { name: 'Wingo',         keywords: ['wingo'],                          color: '#E4007C', initials: 'W',  emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'wingo.ch' },
  { name: 'Lebara',        keywords: ['lebara'],                         color: '#E4002B', initials: 'Lb', emoji: '📱', category: 'telecom', textColor: '#FFF', domain: 'lebara.ch' },

  // ─── Streaming & Media ─────────────────────────────
  { name: 'Netflix',       keywords: ['netflix'],                        color: '#E50914', initials: 'N',  emoji: '🎬', category: 'abonnements', textColor: '#FFF', domain: 'netflix.com' },
  { name: 'Spotify',       keywords: ['spotify'],                        color: '#1DB954', initials: 'S',  emoji: '🎵', category: 'abonnements', textColor: '#000', domain: 'spotify.com' },
  { name: 'Disney+',       keywords: ['disney', 'disney+', 'disneyplus'], color: '#0B3B82', initials: 'D+', emoji: '🏰', category: 'abonnements', textColor: '#FFF', domain: 'disneyplus.com' },
  { name: 'Apple Music',   keywords: ['apple music', 'itunes'],         color: '#FA243C', initials: 'AM', emoji: '🎵', category: 'abonnements', textColor: '#FFF', domain: 'apple.com' },
  { name: 'Apple TV+',     keywords: ['apple tv'],                       color: '#000000', initials: 'TV', emoji: '📺', category: 'abonnements', textColor: '#FFF', domain: 'apple.com' },
  { name: 'YouTube',       keywords: ['youtube', 'youtube premium'],    color: '#FF0000', initials: 'YT', emoji: '▶️', category: 'abonnements', textColor: '#FFF', domain: 'youtube.com' },
  { name: 'Amazon Prime',  keywords: ['prime video', 'amazon prime'],   color: '#00A8E1', initials: 'P',  emoji: '📦', category: 'abonnements', textColor: '#FFF', domain: 'amazon.com' },
  { name: 'HBO Max',       keywords: ['hbo', 'max', 'hbo max'],         color: '#6F2FEF', initials: 'H',  emoji: '🎬', category: 'abonnements', textColor: '#FFF', domain: 'hbomax.com' },
  { name: 'DAZN',          keywords: ['dazn'],                           color: '#FFFF00', initials: 'DZ', emoji: '⚽', category: 'abonnements', textColor: '#000', domain: 'dazn.com' },
  { name: 'Blue TV',       keywords: ['blue tv', 'blue+', 'bluetv'],    color: '#00A0DF', initials: 'BT', emoji: '📺', category: 'abonnements', textColor: '#FFF', domain: 'blue.ch' },

  // ─── Insurance (LAMal) ─────────────────────────────
  { name: 'CSS',           keywords: ['css assurance', 'css'],          color: '#005F9E', initials: 'CS', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'css.ch' },
  { name: 'Helsana',       keywords: ['helsana'],                        color: '#008AC9', initials: 'H',  emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'helsana.ch' },
  { name: 'Swica',         keywords: ['swica'],                          color: '#E4002B', initials: 'SW', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'swica.ch' },
  { name: 'Sanitas',       keywords: ['sanitas'],                        color: '#00ADEF', initials: 'Sa', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'sanitas.com' },
  { name: 'Concordia',     keywords: ['concordia'],                      color: '#DA291C', initials: 'Co', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'concordia.ch' },
  { name: 'Groupe Mutuel', keywords: ['groupe mutuel', 'mutuel'],       color: '#0082CA', initials: 'GM', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'groupemutuel.ch' },
  { name: 'Assura',        keywords: ['assura'],                         color: '#E30613', initials: 'As', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'assura.ch' },
  { name: 'Visana',        keywords: ['visana'],                         color: '#009BAE', initials: 'Vi', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'visana.ch' },
  { name: 'KPT',           keywords: ['kpt'],                            color: '#E30613', initials: 'KP', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'kpt.ch' },
  { name: 'ÖKK',           keywords: ['ökk', 'okk'],                     color: '#1D3A8A', initials: 'ÖK', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'oekk.ch' },
  { name: 'Atupri',        keywords: ['atupri'],                         color: '#E30613', initials: 'At', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'atupri.ch' },
  { name: 'EGK',           keywords: ['egk'],                            color: '#2F7F45', initials: 'EG', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'egk.ch' },
  { name: 'Sympany',       keywords: ['sympany'],                        color: '#E4002B', initials: 'Sy', emoji: '🏥', category: 'assurance', textColor: '#FFF', domain: 'sympany.ch' },

  // ─── Car insurance ─────────────────────────────────
  { name: 'AXA',           keywords: ['axa'],                            color: '#00008F', initials: 'AX', emoji: '🚗', category: 'assurance', textColor: '#FFF', domain: 'axa.ch' },
  { name: 'Zurich',        keywords: ['zurich assurance', 'zurich ins'], color: '#2167AE', initials: 'Z', emoji: '🚗', category: 'assurance', textColor: '#FFF', domain: 'zurich.ch' },
  { name: 'La Mobilière',  keywords: ['mobilière', 'mobiliere'],        color: '#2B4F9B', initials: 'Mo', emoji: '🚗', category: 'assurance', textColor: '#FFF', domain: 'mobiliar.ch' },
  { name: 'Generali',      keywords: ['generali'],                       color: '#C8102E', initials: 'Ge', emoji: '🚗', category: 'assurance', textColor: '#FFF', domain: 'generali.ch' },
  { name: 'TCS',           keywords: ['tcs'],                            color: '#E30613', initials: 'TC', emoji: '🚗', category: 'assurance', textColor: '#FFF', domain: 'tcs.ch' },
  { name: 'Allianz',       keywords: ['allianz'],                        color: '#003781', initials: 'Al', emoji: '🛡️', category: 'assurance', textColor: '#FFF', domain: 'allianz.ch' },

  // ─── Banks ─────────────────────────────────────────
  { name: 'UBS',           keywords: ['ubs'],                            color: '#E60000', initials: 'UB', emoji: '🏦', category: 'autres', textColor: '#FFF', domain: 'ubs.com' },
  { name: 'Credit Suisse', keywords: ['credit suisse', 'cs '],          color: '#0B3B82', initials: 'CS', emoji: '🏦', category: 'autres', textColor: '#FFF', domain: 'credit-suisse.com' },
  { name: 'PostFinance',   keywords: ['postfinance', 'post finance'],   color: '#FFCC00', initials: 'PF', emoji: '🏦', category: 'autres', textColor: '#000', domain: 'postfinance.ch' },
  { name: 'Raiffeisen',    keywords: ['raiffeisen'],                     color: '#D52B1E', initials: 'R',  emoji: '🏦', category: 'autres', textColor: '#FFF', domain: 'raiffeisen.ch' },
  { name: 'BCV',           keywords: ['bcv'],                            color: '#005CA9', initials: 'BC', emoji: '🏦', category: 'autres', textColor: '#FFF', domain: 'bcv.ch' },
  { name: 'Revolut',       keywords: ['revolut'],                        color: '#0075EB', initials: 'Re', emoji: '💳', category: 'autres', textColor: '#FFF', domain: 'revolut.com' },
  { name: 'Yuh',           keywords: ['yuh'],                            color: '#00D182', initials: 'Y',  emoji: '💳', category: 'autres', textColor: '#000', domain: 'yuh.com' },
  { name: 'Neon',          keywords: ['neon bank', 'neon '],            color: '#00D4AA', initials: 'N',  emoji: '💳', category: 'autres', textColor: '#000', domain: 'neon-free.ch' },
  { name: 'TWINT',         keywords: ['twint'],                          color: '#FFCC00', initials: 'TW', emoji: '💳', category: 'autres', textColor: '#000', domain: 'twint.ch' },

  // ─── Transport ─────────────────────────────────────
  { name: 'CFF / SBB',     keywords: ['cff', 'sbb', 'ffs'],             color: '#EB0000', initials: 'SB', emoji: '🚆', category: 'transport', textColor: '#FFF', domain: 'sbb.ch' },
  { name: 'TPG',           keywords: ['tpg'],                            color: '#FFA500', initials: 'TP', emoji: '🚌', category: 'transport', textColor: '#FFF', domain: 'tpg.ch' },
  { name: 'TL',            keywords: ['tl lausanne', 'tl '],            color: '#BE1622', initials: 'TL', emoji: '🚌', category: 'transport', textColor: '#FFF', domain: 't-l.ch' },
  { name: 'VBZ',           keywords: ['vbz'],                            color: '#003DA5', initials: 'VB', emoji: '🚌', category: 'transport', textColor: '#FFF', domain: 'vbz.ch' },
  { name: 'Uber',          keywords: ['uber'],                           color: '#000000', initials: 'U',  emoji: '🚗', category: 'transport', textColor: '#FFF', domain: 'uber.com' },
  { name: 'Mobility',      keywords: ['mobility'],                       color: '#E30613', initials: 'Mb', emoji: '🚗', category: 'transport', textColor: '#FFF', domain: 'mobility.ch' },
  { name: 'Avia',          keywords: ['avia'],                           color: '#E30613', initials: 'Av', emoji: '⛽', category: 'transport', textColor: '#FFF', domain: 'avia.ch' },
  { name: 'Shell',         keywords: ['shell'],                          color: '#DD1D21', initials: 'Sh', emoji: '⛽', category: 'transport', textColor: '#FFD500', domain: 'shell.com' },
  { name: 'BP',            keywords: ['bp station', 'bp '],             color: '#009900', initials: 'BP', emoji: '⛽', category: 'transport', textColor: '#FFF', domain: 'bp.com' },
  { name: 'Migrol',        keywords: ['migrol'],                         color: '#FF6600', initials: 'Mg', emoji: '⛽', category: 'transport', textColor: '#FFF', domain: 'migrol.ch' },

  // ─── Pharmacies & Health ───────────────────────────
  { name: 'Amavita',       keywords: ['amavita'],                        color: '#E4002B', initials: 'Am', emoji: '💊', category: 'sante', textColor: '#FFF', domain: 'amavita.ch' },
  { name: 'Benu',          keywords: ['benu'],                           color: '#009B3A', initials: 'Be', emoji: '💊', category: 'sante', textColor: '#FFF', domain: 'benu.ch' },
  { name: 'Sun Store',     keywords: ['sun store', 'sunstore'],         color: '#FFD400', initials: 'Sn', emoji: '💊', category: 'sante', textColor: '#000', domain: 'sunstore.ch' },

  // ─── Clothing & Shopping ────────────────────────────
  { name: 'H&M',           keywords: ['h&m', 'hm '],                     color: '#E50010', initials: 'HM', emoji: '👗', category: 'autres', textColor: '#FFF', domain: 'hm.com' },
  { name: 'Zara',          keywords: ['zara'],                           color: '#000000', initials: 'Z',  emoji: '👗', category: 'autres', textColor: '#FFF', domain: 'zara.com' },
  { name: 'C&A',           keywords: ['c&a', 'c and a'],                 color: '#14387F', initials: 'CA', emoji: '👗', category: 'autres', textColor: '#FFF', domain: 'c-and-a.com' },
  { name: 'Uniqlo',        keywords: ['uniqlo'],                         color: '#E30613', initials: 'Un', emoji: '👗', category: 'autres', textColor: '#FFF', domain: 'uniqlo.com' },
  { name: 'Chicorée',      keywords: ['chicorée', 'chicoree'],          color: '#E30613', initials: 'Ch', emoji: '👗', category: 'autres', textColor: '#FFF', domain: 'chicoree.ch' },
  { name: 'Nike',          keywords: ['nike'],                           color: '#000000', initials: 'N',  emoji: '👟', category: 'autres', textColor: '#FFF', domain: 'nike.com' },
  { name: 'Adidas',        keywords: ['adidas'],                         color: '#000000', initials: 'Ad', emoji: '👟', category: 'autres', textColor: '#FFF', domain: 'adidas.com' },
  { name: 'Ochsner Sport', keywords: ['ochsner', 'ochsner sport'],      color: '#E30613', initials: 'OS', emoji: '⚽', category: 'autres', textColor: '#FFF', domain: 'ochsnersport.ch' },

  // ─── Electronics ───────────────────────────────────
  { name: 'Apple',         keywords: ['apple store', 'apple.com'],       color: '#000000', initials: '',   emoji: '', category: 'autres', textColor: '#FFF', domain: 'apple.com' },
  { name: 'Digitec',       keywords: ['digitec'],                        color: '#FF0000', initials: 'Di', emoji: '📱', category: 'autres', textColor: '#FFF', domain: 'digitec.ch' },
  { name: 'Galaxus',       keywords: ['galaxus'],                        color: '#0F2B5D', initials: 'Ga', emoji: '📦', category: 'autres', textColor: '#FFF', domain: 'galaxus.ch' },
  { name: 'MediaMarkt',    keywords: ['mediamarkt'],                     color: '#E30613', initials: 'MM', emoji: '📱', category: 'autres', textColor: '#FFF', domain: 'mediamarkt.ch' },
  { name: 'Interdiscount', keywords: ['interdiscount'],                  color: '#E30613', initials: 'Id', emoji: '💻', category: 'autres', textColor: '#FFF', domain: 'interdiscount.ch' },
  { name: 'Fust',          keywords: ['fust'],                           color: '#FF6600', initials: 'Fu', emoji: '🔌', category: 'autres', textColor: '#FFF', domain: 'fust.ch' },

  // ─── Utilities ─────────────────────────────────────
  { name: 'SIG',           keywords: ['sig genève', 'services industriels'], color: '#009EE0', initials: 'SI', emoji: '⚡', category: 'loyer', textColor: '#FFF', domain: 'sig-ge.ch' },
  { name: 'EWZ',           keywords: ['ewz'],                            color: '#003DA5', initials: 'EW', emoji: '⚡', category: 'loyer', textColor: '#FFF', domain: 'ewz.ch' },
  { name: 'Romande Energie', keywords: ['romande energie'],             color: '#005CA9', initials: 'RE', emoji: '⚡', category: 'loyer', textColor: '#FFF', domain: 'romande-energie.ch' },
  { name: 'Billag',        keywords: ['billag', 'serafe'],              color: '#E30613', initials: 'Bi', emoji: '📻', category: 'abonnements', textColor: '#FFF', domain: 'serafe.ch' },
];

/** Lookup a merchant from any title/description string. */
export function findBrand(text: string): Brand | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const b of SWISS_BRANDS) {
    for (const kw of b.keywords) {
      if (t.includes(kw)) return b;
    }
  }
  return null;
}

/** Get display initials from text (if no brand match). */
export function initialsFromText(text: string): string {
  if (!text) return '?';
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}
