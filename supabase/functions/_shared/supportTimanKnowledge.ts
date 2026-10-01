export const TIMAN_KNOWLEDGE_LANGUAGES = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

const LANGUAGE_BY_PATH_PREFIX: Record<string, typeof TIMAN_KNOWLEDGE_LANGUAGES[number]> = {
  en: 'en',
  de: 'de',
  it: 'it',
  hu: 'hu',
  sv: 'sv',
  se: 'sv',
  fr: 'fr',
  pl: 'pl',
  cs: 'cs',
  cz: 'cs',
};
const STRUCTURED_AUTHORITY_TERMS = [
  'price', 'cost', 'koster', 'pris', 'preis', 'prezzo', 'ár', 'pris', 'prix', 'cena', 'cena',
  'discount', 'rabat', 'rabatt', 'sconto', 'kedvezmény', 'rabatt', 'remise', 'rabat', 'sleva',
  'campaign', 'kampagne', 'kampagne', 'campagna', 'kampány', 'kampanj', 'campagne', 'kampania', 'kampaň',
  'quote', 'tilbud', 'angebot', 'preventivo', 'ajánlat', 'offert', 'devis', 'oferta', 'nabídka',
  'order', 'ordre', 'bestellung', 'ordine', 'rendelés', 'beställning', 'commande', 'zamówienie', 'objednávka',
  'compatib', 'kompatib', 'kompatibel', 'compatibile', 'kompatibilis', 'compatible', 'kompatybil',
  'customer', 'kunde', 'cliente', 'ügyfél', 'kund', 'client', 'klient', 'zákazník',
  'permission', 'adgang', 'berechtigung', 'permesso', 'jogosultság', 'behörighet', 'autorisation', 'uprawnienie', 'oprávnění',
  'warranty', 'garanti', 'garantie', 'garanzia', 'garancia', 'gwarancja', 'záruka',
  'crm', 'partnerdata', 'maskinregister', 'machine registry',
];

export function canonicalTimanUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['timan.dk', 'www.timan.dk'].includes(url.hostname.toLowerCase())) return null;
    url.hostname = 'timan.dk';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch {
    return null;
  }
}

export function timanLanguageFromUrl(value: string): string {
  const canonical = canonicalTimanUrl(value);
  if (!canonical) return 'da';
  const first = new URL(canonical).pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  return first ? LANGUAGE_BY_PATH_PREFIX[first] || 'da' : 'da';
}

export function timanPageCategory(value: string): string {
  const path = new URL(canonicalTimanUrl(value) || 'https://timan.dk/').pathname.toLowerCase();
  if (['/redskaber/', '/tools/', '/anbaugeraete/'].some((part) => path.includes(part))) return 'Products / Attachments';
  if (['/maskiner/', '/machines/', '/maschinen/'].some((part) => path.includes(part))) return 'Products / Machines';
  if (['/vejledning/', '/guidance/', '/anleitung/'].some((part) => path.includes(part))) return 'Guides';
  if (['/forhandlere/', '/dealers/', '/haendler/'].some((part) => path.includes(part))) return 'Dealers';
  if (['/nyheder/', '/news/', '/neuigkeiten/'].some((part) => path.includes(part))) return 'News';
  if (['/kontakt/', '/contact/', '/contatti/'].some((part) => path.includes(part))) return 'Company / Contact';
  if (['/om-timan/', '/about-timan/', '/ueber-timan/'].some((part) => path.includes(part))) return 'Company';
  return 'Timan.dk';
}

export function timanProductRelations(value: string): string[] {
  const normalized = `${value}`.toLowerCase();
  const relations = [
    ['RC-751', /rc[- ]?751/],
    ['RC-1000s', /rc[- ]?1000s?/],
    ['Timan 3330', /(?:timan[- ]?)?3330/],
    ['Timan 2620', /(?:timan[- ]?)?2620/],
  ] as const;
  return relations.filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name);
}

export function isStructuredAuthorityQuestion(message: string): boolean {
  const normalized = message.toLocaleLowerCase().replace(/\s+/g, ' ');
  return STRUCTURED_AUTHORITY_TERMS.some((term) => normalized.includes(term));
}
