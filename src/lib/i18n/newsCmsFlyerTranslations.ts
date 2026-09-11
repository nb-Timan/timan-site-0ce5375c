import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Dict = Record<string, string>;

/** Template 06 – flyer pages (1-3 pages per news item). */
const da: Dict = {
  newsCmsFieldPageCount: 'Antal sider',
  newsCmsFieldPageCountHelp: 'Maks. 3 sider pr. nyhed. Alle sider hører til den samme nyhed.',
  newsCmsPageUnitOne: 'side',
  newsCmsPageUnitMany: 'sider',
  newsCmsFlyerPageTitle: 'Side',
  newsCmsFlyerPagesHelp: 'Tekst gemmes pr. sprog. Billeder deles på tværs af alle sprog.',
  newsCmsFlyerImage: 'Billede',
  newsCmsPreviewPrevPage: 'Forrige side',
  newsCmsPreviewNextPage: 'Næste side',
};

const en: Dict = {
  newsCmsFieldPageCount: 'Number of pages',
  newsCmsFieldPageCountHelp: 'Max 3 pages per news item. All pages belong to the same news item.',
  newsCmsPageUnitOne: 'page',
  newsCmsPageUnitMany: 'pages',
  newsCmsFlyerPageTitle: 'Page',
  newsCmsFlyerPagesHelp: 'Text is stored per language. Images are shared across all languages.',
  newsCmsFlyerImage: 'Image',
  newsCmsPreviewPrevPage: 'Previous page',
  newsCmsPreviewNextPage: 'Next page',
};

const de: Dict = {
  newsCmsFieldPageCount: 'Anzahl Seiten',
  newsCmsFieldPageCountHelp: 'Max. 3 Seiten pro Nachricht. Alle Seiten gehören zur selben Nachricht.',
  newsCmsPageUnitOne: 'Seite',
  newsCmsPageUnitMany: 'Seiten',
  newsCmsFlyerPageTitle: 'Seite',
  newsCmsFlyerPagesHelp: 'Text wird pro Sprache gespeichert. Bilder gelten für alle Sprachen.',
  newsCmsFlyerImage: 'Bild',
  newsCmsPreviewPrevPage: 'Vorherige Seite',
  newsCmsPreviewNextPage: 'Nächste Seite',
};

const it: Dict = {
  newsCmsFieldPageCount: 'Numero di pagine',
  newsCmsFieldPageCountHelp: 'Massimo 3 pagine per notizia. Tutte le pagine appartengono alla stessa notizia.',
  newsCmsPageUnitOne: 'pagina',
  newsCmsPageUnitMany: 'pagine',
  newsCmsFlyerPageTitle: 'Pagina',
  newsCmsFlyerPagesHelp: 'Il testo è salvato per lingua. Le immagini sono condivise tra tutte le lingue.',
  newsCmsFlyerImage: 'Immagine',
  newsCmsPreviewPrevPage: 'Pagina precedente',
  newsCmsPreviewNextPage: 'Pagina successiva',
};

const hu: Dict = {
  newsCmsFieldPageCount: 'Oldalak száma',
  newsCmsFieldPageCountHelp: 'Legfeljebb 3 oldal hírenként. Minden oldal ugyanahhoz a hírhez tartozik.',
  newsCmsPageUnitOne: 'oldal',
  newsCmsPageUnitMany: 'oldal',
  newsCmsFlyerPageTitle: 'Oldal',
  newsCmsFlyerPagesHelp: 'A szöveg nyelvenként tárolódik. A képek minden nyelven közösek.',
  newsCmsFlyerImage: 'Kép',
  newsCmsPreviewPrevPage: 'Előző oldal',
  newsCmsPreviewNextPage: 'Következő oldal',
};

const sv: Dict = {
  newsCmsFieldPageCount: 'Antal sidor',
  newsCmsFieldPageCountHelp: 'Max 3 sidor per nyhet. Alla sidor tillhör samma nyhet.',
  newsCmsPageUnitOne: 'sida',
  newsCmsPageUnitMany: 'sidor',
  newsCmsFlyerPageTitle: 'Sida',
  newsCmsFlyerPagesHelp: 'Text sparas per språk. Bilder delas mellan alla språk.',
  newsCmsFlyerImage: 'Bild',
  newsCmsPreviewPrevPage: 'Föregående sida',
  newsCmsPreviewNextPage: 'Nästa sida',
};

const fr: Dict = {
  newsCmsFieldPageCount: 'Nombre de pages',
  newsCmsFieldPageCountHelp: 'Maximum 3 pages par actualité. Toutes les pages appartiennent à la même actualité.',
  newsCmsPageUnitOne: 'page',
  newsCmsPageUnitMany: 'pages',
  newsCmsFlyerPageTitle: 'Page',
  newsCmsFlyerPagesHelp: 'Le texte est enregistré par langue. Les images sont partagées entre toutes les langues.',
  newsCmsFlyerImage: 'Image',
  newsCmsPreviewPrevPage: 'Page précédente',
  newsCmsPreviewNextPage: 'Page suivante',
};

const pl: Dict = {
  newsCmsFieldPageCount: 'Liczba stron',
  newsCmsFieldPageCountHelp: 'Maksymalnie 3 strony na aktualność. Wszystkie strony należą do tej samej aktualności.',
  newsCmsPageUnitOne: 'strona',
  newsCmsPageUnitMany: 'strony',
  newsCmsFlyerPageTitle: 'Strona',
  newsCmsFlyerPagesHelp: 'Tekst zapisywany jest osobno dla każdego języka. Obrazy są wspólne.',
  newsCmsFlyerImage: 'Obraz',
  newsCmsPreviewPrevPage: 'Poprzednia strona',
  newsCmsPreviewNextPage: 'Następna strona',
};

const cs: Dict = {
  newsCmsFieldPageCount: 'Počet stránek',
  newsCmsFieldPageCountHelp: 'Maximálně 3 stránky na novinku. Všechny stránky patří ke stejné novince.',
  newsCmsPageUnitOne: 'stránka',
  newsCmsPageUnitMany: 'stránky',
  newsCmsFlyerPageTitle: 'Stránka',
  newsCmsFlyerPagesHelp: 'Text se ukládá pro každý jazyk. Obrázky jsou sdílené pro všechny jazyky.',
  newsCmsFlyerImage: 'Obrázek',
  newsCmsPreviewPrevPage: 'Předchozí stránka',
  newsCmsPreviewNextPage: 'Další stránka',
};

export const NEWS_CMS_FLYER_TRANSLATIONS: Record<PortalUiLanguage, Dict> = { da, en, de, it, hu, sv, fr, pl, cs };
