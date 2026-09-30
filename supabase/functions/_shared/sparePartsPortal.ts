export const SPARE_PARTS_PORTAL = Object.freeze({
  key: 'interactive_spares',
  source: 'canonical_interactive_spares',
  url: 'https://cloud.interactivespares.com/timan/categorie/0000+-+Front+page',
});

const LABELS: Record<string, string> = {
  da: 'Åbn reservedelsportalen',
  en: 'Open the spare-parts portal',
  de: 'Ersatzteilportal öffnen',
  it: 'Apri il portale ricambi',
  hu: 'Alkatrészportál megnyitása',
  sv: 'Öppna reservdelsportalen',
  fr: 'Ouvrir le portail des pièces détachées',
  pl: 'Otwórz portal części zamiennych',
  cs: 'Otevřít portál náhradních dílů',
};

export function sparePartsPortalLabel(language: string): string {
  return LABELS[language] || LABELS.en;
}
