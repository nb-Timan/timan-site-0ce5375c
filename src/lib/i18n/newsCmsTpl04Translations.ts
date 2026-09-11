import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Dict = Record<string, string>;

/**
 * Template 04 – secondary (overlapping) image block.
 * Labels only; the editor content itself is stored per language in news_posts.
 */
const da: Dict = {
  newsCmsFieldSecondaryHeading: 'Billedoverskrift',
  newsCmsFieldSecondaryText: 'Billedtekst',
  newsCmsWireSecondaryHeading: 'Om produktet',
  newsCmsWireSecondaryText: 'Kort supplerende tekst til billedet.',
};

const en: Dict = {
  newsCmsFieldSecondaryHeading: 'Image heading',
  newsCmsFieldSecondaryText: 'Image text',
  newsCmsWireSecondaryHeading: 'About the product',
  newsCmsWireSecondaryText: 'Short supporting text connected to this image.',
};

const de: Dict = {
  newsCmsFieldSecondaryHeading: 'Bildüberschrift',
  newsCmsFieldSecondaryText: 'Bildtext',
  newsCmsWireSecondaryHeading: 'Über das Produkt',
  newsCmsWireSecondaryText: 'Kurzer ergänzender Text zu diesem Bild.',
};

const it: Dict = {
  newsCmsFieldSecondaryHeading: 'Titolo immagine',
  newsCmsFieldSecondaryText: 'Testo immagine',
  newsCmsWireSecondaryHeading: 'Sul prodotto',
  newsCmsWireSecondaryText: 'Breve testo di supporto collegato a questa immagine.',
};

const hu: Dict = {
  newsCmsFieldSecondaryHeading: 'Képcím',
  newsCmsFieldSecondaryText: 'Képszöveg',
  newsCmsWireSecondaryHeading: 'A termékről',
  newsCmsWireSecondaryText: 'Rövid kiegészítő szöveg ehhez a képhez.',
};

const sv: Dict = {
  newsCmsFieldSecondaryHeading: 'Bildrubrik',
  newsCmsFieldSecondaryText: 'Bildtext',
  newsCmsWireSecondaryHeading: 'Om produkten',
  newsCmsWireSecondaryText: 'Kort kompletterande text till bilden.',
};

const fr: Dict = {
  newsCmsFieldSecondaryHeading: "Titre de l'image",
  newsCmsFieldSecondaryText: 'Texte de l’image',
  newsCmsWireSecondaryHeading: 'À propos du produit',
  newsCmsWireSecondaryText: 'Court texte complémentaire lié à cette image.',
};

const pl: Dict = {
  newsCmsFieldSecondaryHeading: 'Nagłówek zdjęcia',
  newsCmsFieldSecondaryText: 'Tekst zdjęcia',
  newsCmsWireSecondaryHeading: 'O produkcie',
  newsCmsWireSecondaryText: 'Krótki tekst uzupełniający do tego zdjęcia.',
};

const cs: Dict = {
  newsCmsFieldSecondaryHeading: 'Nadpis obrázku',
  newsCmsFieldSecondaryText: 'Text obrázku',
  newsCmsWireSecondaryHeading: 'O produktu',
  newsCmsWireSecondaryText: 'Krátký doplňkový text k tomuto obrázku.',
};

export const NEWS_CMS_TPL04_TRANSLATIONS: Record<PortalUiLanguage, Dict> = {
  da,
  en,
  de,
  it,
  hu,
  sv,
  fr,
  pl,
  cs,
};
