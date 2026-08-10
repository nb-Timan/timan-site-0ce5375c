import type { NewsFieldDefinition, LocalizedNewsContent } from '@/features/news-cms/templates/types';
import { NEWS_CONTENT_LANGUAGES, missingTranslationFields } from '@/features/news-cms/lib/newsContent';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

type TranslationMemory = Partial<Record<PortalUiLanguage, Record<string, string>>>;

const SOURCE_TEXT_ALIASES: Record<string, string> = {
  'MÃ¸d Timan 2620': 'Mød Timan 2620',
  'Timan 2620 er vores nye kompakte redskabsbÃ¦rer, udviklet til professionelle, der har brug for hÃ¸j fleksibilitet pÃ¥ begrÃ¦nset plads. Med fokus pÃ¥ komfort, enkel betjening og et bredt udvalg af redskaber er Timan 2620 skabt til at lÃ¸se mange forskellige opgaver Ã¥ret rundt.':
    'Timan 2620 er vores nye kompakte redskabsbærer, udviklet til professionelle, der har brug for høj fleksibilitet på begrænset plads. Med fokus på komfort, enkel betjening og et bredt udvalg af redskaber er Timan 2620 skabt til at løse mange forskellige opgaver året rundt.',
  'Klar Ã¥ret rundt': 'Klar året rundt',
  'Skift mellem forskellige redskaber og opgaver gennem hele Ã¥ret.': 'Skift mellem forskellige redskaber og opgaver gennem hele året.',
  'SkivehÃ¸ster til Timan RC-1000s': 'Skivehøster til Timan RC-1000s',
  'Effektiv hÃ¸st med et rent og jÃ¦vnt skÃ¦r': 'Effektiv høst med et rent og jævnt skær',
  'SkÃ¥nsom hÃ¸st': 'Skånsom høst',
  'Den hydrauliske skivehÃ¸ster til Timan RC-1000s er udviklet til professionel slÃ¥ning af lÃ¦ngere og kraftigere grÃ¦s. To roterende skiver med otte knive giver et rent, jÃ¦vnt skÃ¦r og effektiv hÃ¸st med fokus pÃ¥ god foderkvalitet.':
    'Den hydrauliske skivehøster til Timan RC-1000s er udviklet til professionel slåning af længere og kraftigere græs. To roterende skiver med otte knive giver et rent, jævnt skær og effektiv høst med fokus på god foderkvalitet.',
  'Den roterende skivekonstruktion giver et rent og jÃ¦vnt skÃ¦r og hjÃ¦lper med at bevare kvaliteten af det hÃ¸stede materiale.':
    'Den roterende skivekonstruktion giver et rent og jævnt skær og hjælper med at bevare kvaliteten af det høstede materiale.',
  'VÃ¦gt': 'Vægt',
  'HÃ¸jde â€“ midte': 'Højde - midte',
  'HÃ¸jde – midte': 'Højde - midte',
  'HÃ¸jde â€“ sider': 'Højde - sider',
  'HÃ¸jde – sider': 'Højde - sider',
  'JÃ¦vnt skÃ¦r': 'Jævnt skær',
  'Effektiv hÃ¸st og god foderkvalitet': 'Effektiv høst og god foderkvalitet',
};

const TRANSLATION_MEMORY: TranslationMemory = {
  en: {
    'Nyhed': 'News',
    'Produktnyhed': 'Product news',
    'Mød Timan 2620': 'Meet the Timan 2620',
    'Kommer til det danske marked i 2026': 'Coming to the Danish market in 2026',
    'Den lille maskine med de store muligheder': 'The small machine with big possibilities',
    'Timan 2620 er vores nye kompakte redskabsbærer, udviklet til professionelle, der har brug for høj fleksibilitet på begrænset plads. Med fokus på komfort, enkel betjening og et bredt udvalg af redskaber er Timan 2620 skabt til at løse mange forskellige opgaver året rundt.':
      'Timan 2620 is our new compact tool carrier, developed for professionals who need high flexibility in limited spaces. With focus on comfort, simple operation and a wide range of attachments, Timan 2620 is built to handle many different tasks all year round.',
    'Kompakt og fleksibel': 'Compact and flexible',
    'Designet til arbejde, hvor pladsen er trang.': 'Designed for work where space is limited.',
    'Komfort i fokus': 'Comfort in focus',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Simple operation and a comfortable workplace.',
    'Klar året rundt': 'Ready all year round',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Switch between different attachments and tasks throughout the year.',
    'Skivehøster til Timan RC-1000s': 'Disc mower for Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Efficient harvesting with a clean and even cut',
    'Skånsom høst': 'Gentle harvesting',
    'Den hydrauliske skivehøster til Timan RC-1000s er udviklet til professionel slåning af længere og kraftigere græs. To roterende skiver med otte knive giver et rent, jævnt skær og effektiv høst med fokus på god foderkvalitet.':
      'The hydraulic disc mower for Timan RC-1000s is developed for professional mowing of longer and stronger grass. Two rotating discs with eight knives provide a clean, even cut and efficient harvesting with focus on good forage quality.',
    'Den roterende skivekonstruktion giver et rent og jævnt skær og hjælper med at bevare kvaliteten af det høstede materiale.':
      'The rotating disc construction provides a clean and even cut and helps preserve the quality of the harvested material.',
    'Klippebredde': 'Cutting width',
    'Skiver / knive': 'Discs / knives',
    'Vægt': 'Weight',
    'Total bredde': 'Total width',
    'Højde - midte': 'Height - centre',
    'Højde - sider': 'Height - sides',
    '8 knive': '8 knives',
    '2 skiver med 4 knive hver': '2 discs with 4 knives each',
    'Robust og kompakt konstruktion': 'Robust and compact construction',
    'Jævnt skær': 'Even cut',
    'Effektiv høst og god foderkvalitet': 'Efficient harvesting and good forage quality',
  },
  de: {
    'Nyhed': 'Neuheit',
    'Produktnyhed': 'Produktneuheit',
    'Mød Timan 2620': 'Lernen Sie den neuen Timan 2620 kennen',
    'Kommer til det danske marked i 2026': 'Kommt 2026 auf den dänischen Markt',
    'Den lille maskine med de store muligheder': 'Die kleine Maschine mit den großen Möglichkeiten',
    'Kompakt og fleksibel': 'Kompakt und flexibel',
    'Designet til arbejde, hvor pladsen er trang.': 'Entwickelt für Arbeiten auf engem Raum.',
    'Komfort i fokus': 'Komfort im Fokus',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Einfache Bedienung und ein komfortabler Arbeitsplatz.',
    'Klar året rundt': 'Ganzjährig einsatzbereit',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Wechseln Sie das ganze Jahr über zwischen verschiedenen Anbaugeräten und Aufgaben.',
    'Skivehøster til Timan RC-1000s': 'Scheibenmähwerk für Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Effiziente Ernte mit sauberem und gleichmäßigem Schnitt',
    'Skånsom høst': 'Schonende Ernte',
    'Klippebredde': 'Schnittbreite',
    'Skiver / knive': 'Scheiben / Messer',
    'Vægt': 'Gewicht',
    'Total bredde': 'Gesamtbreite',
    'Højde - midte': 'Höhe - Mitte',
    'Højde - sider': 'Höhe - Seiten',
    '8 knive': '8 Messer',
    '2 skiver med 4 knive hver': '2 Scheiben mit je 4 Messern',
    'Robust og kompakt konstruktion': 'Robuste und kompakte Konstruktion',
    'Jævnt skær': 'Gleichmäßiger Schnitt',
    'Effektiv høst og god foderkvalitet': 'Effiziente Ernte und gute Futterqualität',
  },
  it: {
    'Nyhed': 'Novità',
    'Produktnyhed': 'Novità di prodotto',
    'Mød Timan 2620': 'Scopri il nuovo Timan 2620',
    'Kommer til det danske marked i 2026': 'In arrivo sul mercato danese nel 2026',
    'Den lille maskine med de store muligheder': 'La piccola macchina dalle grandi possibilità',
    'Kompakt og fleksibel': 'Compatta e flessibile',
    'Designet til arbejde, hvor pladsen er trang.': 'Progettata per lavorare dove lo spazio è limitato.',
    'Komfort i fokus': 'Comfort in primo piano',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Comandi semplici e un posto di lavoro confortevole.',
    'Klar året rundt': 'Pronta tutto l’anno',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Passa tra diversi accessori e attività durante tutto l’anno.',
    'Skivehøster til Timan RC-1000s': 'Falciatrice a dischi per Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Raccolta efficiente con taglio pulito e uniforme',
    'Skånsom høst': 'Raccolta delicata',
    'Klippebredde': 'Larghezza di taglio',
    'Skiver / knive': 'Dischi / coltelli',
    'Vægt': 'Peso',
    'Total bredde': 'Larghezza totale',
    'Højde - midte': 'Altezza - centro',
    'Højde - sider': 'Altezza - lati',
    '8 knive': '8 coltelli',
    '2 skiver med 4 knive hver': '2 dischi con 4 coltelli ciascuno',
    'Robust og kompakt konstruktion': 'Costruzione robusta e compatta',
    'Jævnt skær': 'Taglio uniforme',
    'Effektiv høst og god foderkvalitet': 'Raccolta efficiente e buona qualità del foraggio',
  },
  hu: {
    'Nyhed': 'Hír',
    'Produktnyhed': 'Újdonság',
    'Mød Timan 2620': 'Ismerje meg az új Timan 2620-at',
    'Kommer til det danske marked i 2026': '2026-ban érkezik a dán piacra',
    'Den lille maskine med de store muligheder': 'A kis gép nagy lehetőségekkel',
    'Kompakt og fleksibel': 'Kompakt és rugalmas',
    'Designet til arbejde, hvor pladsen er trang.': 'Szűk helyeken végzett munkára tervezve.',
    'Komfort i fokus': 'Kényelem a középpontban',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Egyszerű kezelés és kényelmes munkahely.',
    'Klar året rundt': 'Egész évben készen áll',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Egész évben váltson a különböző eszközök és feladatok között.',
    'Skivehøster til Timan RC-1000s': 'Tárcsás kasza Timan RC-1000s-hez',
    'Effektiv høst med et rent og jævnt skær': 'Hatékony betakarítás tiszta és egyenletes vágással',
    'Skånsom høst': 'Kíméletes betakarítás',
    'Klippebredde': 'Vágási szélesség',
    'Skiver / knive': 'Tárcsák / kések',
    'Vægt': 'Tömeg',
    'Total bredde': 'Teljes szélesség',
    'Højde - midte': 'Magasság - közép',
    'Højde - sider': 'Magasság - oldalak',
    '8 knive': '8 kés',
    '2 skiver med 4 knive hver': '2 tárcsa, egyenként 4 késsel',
    'Robust og kompakt konstruktion': 'Robusztus és kompakt felépítés',
    'Jævnt skær': 'Egyenletes vágás',
    'Effektiv høst og god foderkvalitet': 'Hatékony betakarítás és jó takarmányminőség',
  },
  sv: {
    'Nyhed': 'Nyhet',
    'Produktnyhed': 'Produktnyhet',
    'Mød Timan 2620': 'Möt Timan 2620',
    'Kommer til det danske marked i 2026': 'Kommer till den danska marknaden 2026',
    'Den lille maskine med de store muligheder': 'Den lilla maskinen med stora möjligheter',
    'Kompakt og fleksibel': 'Kompakt och flexibel',
    'Designet til arbejde, hvor pladsen er trang.': 'Utformad för arbete där utrymmet är begränsat.',
    'Komfort i fokus': 'Komfort i fokus',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Enkel användning och en bekväm arbetsplats.',
    'Klar året rundt': 'Redo året runt',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Växla mellan olika redskap och uppgifter under hela året.',
    'Skivehøster til Timan RC-1000s': 'Slåtteraggregat för Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Effektiv skörd med rent och jämnt snitt',
    'Skånsom høst': 'Skonsam skörd',
    'Klippebredde': 'Klippbredd',
    'Skiver / knive': 'Skivor / knivar',
    'Vægt': 'Vikt',
    'Total bredde': 'Total bredd',
    'Højde - midte': 'Höjd - mitten',
    'Højde - sider': 'Höjd - sidor',
    '8 knive': '8 knivar',
    '2 skiver med 4 knive hver': '2 skivor med 4 knivar vardera',
    'Robust og kompakt konstruktion': 'Robust och kompakt konstruktion',
    'Jævnt skær': 'Jämnt snitt',
    'Effektiv høst og god foderkvalitet': 'Effektiv skörd och god foderkvalitet',
  },
  fr: {
    'Nyhed': 'Actualité',
    'Produktnyhed': 'Actualité produit',
    'Mød Timan 2620': 'Découvrez le nouveau Timan 2620',
    'Kommer til det danske marked i 2026': 'Arrive sur le marché danois en 2026',
    'Den lille maskine med de store muligheder': 'La petite machine aux grandes possibilités',
    'Kompakt og fleksibel': 'Compacte et flexible',
    'Designet til arbejde, hvor pladsen er trang.': 'Conçue pour travailler dans les espaces restreints.',
    'Komfort i fokus': 'Le confort au centre',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Commande simple et poste de travail confortable.',
    'Klar året rundt': 'Prête toute l’année',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Passez d’un outil à l’autre et d’une tâche à l’autre toute l’année.',
    'Skivehøster til Timan RC-1000s': 'Faucheuse à disques pour Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Récolte efficace avec une coupe nette et régulière',
    'Skånsom høst': 'Récolte délicate',
    'Klippebredde': 'Largeur de coupe',
    'Skiver / knive': 'Disques / couteaux',
    'Vægt': 'Poids',
    'Total bredde': 'Largeur totale',
    'Højde - midte': 'Hauteur - centre',
    'Højde - sider': 'Hauteur - côtés',
    '8 knive': '8 couteaux',
    '2 skiver med 4 knive hver': '2 disques avec 4 couteaux chacun',
    'Robust og kompakt konstruktion': 'Construction robuste et compacte',
    'Jævnt skær': 'Coupe régulière',
    'Effektiv høst og god foderkvalitet': 'Récolte efficace et bonne qualité du fourrage',
  },
  pl: {
    'Nyhed': 'Nowość',
    'Produktnyhed': 'Nowość produktowa',
    'Mød Timan 2620': 'Poznaj Timan 2620',
    'Kommer til det danske marked i 2026': 'Pojawi się na rynku duńskim w 2026 roku',
    'Den lille maskine med de store muligheder': 'Mała maszyna o dużych możliwościach',
    'Kompakt og fleksibel': 'Kompaktowa i elastyczna',
    'Designet til arbejde, hvor pladsen er trang.': 'Zaprojektowana do pracy tam, gdzie przestrzeń jest ograniczona.',
    'Komfort i fokus': 'Komfort w centrum uwagi',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Prosta obsługa i wygodne stanowisko pracy.',
    'Klar året rundt': 'Gotowa przez cały rok',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Zmieniaj osprzęt i zadania przez cały rok.',
    'Skivehøster til Timan RC-1000s': 'Kosiarka dyskowa do Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Efektywny zbiór z czystym i równym cięciem',
    'Skånsom høst': 'Delikatny zbiór',
    'Klippebredde': 'Szerokość koszenia',
    'Skiver / knive': 'Dyski / noże',
    'Vægt': 'Waga',
    'Total bredde': 'Szerokość całkowita',
    'Højde - midte': 'Wysokość - środek',
    'Højde - sider': 'Wysokość - boki',
    '8 knive': '8 noży',
    '2 skiver med 4 knive hver': '2 dyski po 4 noże każdy',
    'Robust og kompakt konstruktion': 'Solidna i kompaktowa konstrukcja',
    'Jævnt skær': 'Równe cięcie',
    'Effektiv høst og god foderkvalitet': 'Efektywny zbiór i dobra jakość paszy',
  },
  cs: {
    'Nyhed': 'Novinka',
    'Produktnyhed': 'Produktová novinka',
    'Mød Timan 2620': 'Seznamte se s Timan 2620',
    'Kommer til det danske marked i 2026': 'Na dánský trh přichází v roce 2026',
    'Den lille maskine med de store muligheder': 'Malý stroj s velkými možnostmi',
    'Kompakt og fleksibel': 'Kompaktní a flexibilní',
    'Designet til arbejde, hvor pladsen er trang.': 'Navrženo pro práci v omezeném prostoru.',
    'Komfort i fokus': 'Komfort v centru pozornosti',
    'Enkel betjening og en komfortabel arbejdsplads.': 'Jednoduché ovládání a pohodlné pracovní místo.',
    'Klar året rundt': 'Připraven po celý rok',
    'Skift mellem forskellige redskaber og opgaver gennem hele året.': 'Střídejte různé nářadí a úkoly po celý rok.',
    'Skivehøster til Timan RC-1000s': 'Disková sekačka pro Timan RC-1000s',
    'Effektiv høst med et rent og jævnt skær': 'Efektivní sklizeň s čistým a rovnoměrným řezem',
    'Skånsom høst': 'Šetrná sklizeň',
    'Klippebredde': 'Šířka záběru',
    'Skiver / knive': 'Disky / nože',
    'Vægt': 'Hmotnost',
    'Total bredde': 'Celková šířka',
    'Højde - midte': 'Výška - střed',
    'Højde - sider': 'Výška - strany',
    '8 knive': '8 nožů',
    '2 skiver med 4 knive hver': '2 disky se 4 noži na každém',
    'Robust og kompakt konstruktion': 'Robustní a kompaktní konstrukce',
    'Jævnt skær': 'Rovnoměrný řez',
    'Effektiv høst og god foderkvalitet': 'Efektivní sklizeň a dobrá kvalita krmiva',
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
}

function shouldShareKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return [
    'image',
    'url',
    'file',
    'path',
    'icon',
    'color',
    'colour',
    'crop',
    'transform',
    'scale',
    'offset',
    'x',
    'y',
    'id',
    'enabled',
    'type',
  ].some((part) => normalized === part || normalized.includes(part));
}

function normalizeSourceText(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return SOURCE_TEXT_ALIASES[normalized] || normalized;
}

function translateText(value: string, lang: PortalUiLanguage): string {
  if (lang === 'da') return normalizeSourceText(value);
  const memory = TRANSLATION_MEMORY[lang] || {};
  const normalized = normalizeSourceText(value);
  return memory[normalized] || value;
}

function mergeTranslatedValue(
  sourceValue: unknown,
  targetValue: unknown,
  lang: PortalUiLanguage,
  key = '',
): unknown {
  if (Array.isArray(sourceValue)) {
    const targetArray = Array.isArray(targetValue) ? targetValue : [];
    return sourceValue.map((item, index) => mergeTranslatedValue(item, targetArray[index], lang, key));
  }

  if (isObject(sourceValue)) {
    const targetObject = isObject(targetValue) ? targetValue : {};
    return Object.entries(sourceValue).reduce<Record<string, unknown>>((acc, [childKey, childValue]) => {
      acc[childKey] = mergeTranslatedValue(childValue, targetObject[childKey], lang, childKey);
      return acc;
    }, { ...targetObject });
  }

  if (hasValue(targetValue)) return targetValue;

  if (typeof sourceValue === 'string') {
    return shouldShareKey(key) ? sourceValue : translateText(sourceValue, lang);
  }

  return sourceValue;
}

export function translateMissingNewsContent(
  content: LocalizedNewsContent,
  fields: Array<Pick<NewsFieldDefinition, 'key' | 'type' | 'labelKey' | 'required'>>,
  sourceLanguage: PortalUiLanguage = 'da',
): { localizedContent: LocalizedNewsContent; translatedLanguages: PortalUiLanguage[] } {
  const source = content[sourceLanguage] || {};
  const translatedLanguages: PortalUiLanguage[] = [];

  const localizedContent = NEWS_CONTENT_LANGUAGES.reduce<LocalizedNewsContent>((acc, lang) => {
    if (lang === sourceLanguage) {
      acc[lang] = content[lang] || {};
      return acc;
    }

    const beforeMissing = missingTranslationFields(content, lang, fields);
    if (beforeMissing.length === 0) {
      acc[lang] = content[lang] || {};
      return acc;
    }

    acc[lang] = Object.entries(source).reduce<Record<string, unknown>>((next, [key, value]) => {
      next[key] = mergeTranslatedValue(value, next[key], lang, key);
      return next;
    }, { ...(content[lang] || {}) });
    translatedLanguages.push(lang);
    return acc;
  }, { ...content });

  return { localizedContent, translatedLanguages };
}
