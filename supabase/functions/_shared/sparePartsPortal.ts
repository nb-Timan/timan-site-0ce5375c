export const SPARE_PARTS_PORTAL = Object.freeze({
  key: 'interactive_spares',
  source: 'canonical_interactive_spares',
  url: 'https://cloud.interactivespares.com/timan/categorie/0000+-+Front+page',
});

const LABELS: Record<string, string> = {
  da: 'Åbn Timan Reservedelsportal',
  en: 'Open Timan Spare Parts Portal',
  de: 'Timan Ersatzteilportal öffnen',
  it: 'Apri il portale ricambi Timan',
  hu: 'A Timan alkatrészportál megnyitása',
  sv: 'Öppna Timans reservdelsportal',
  fr: 'Ouvrir le portail de pièces détachées Timan',
  pl: 'Otwórz portal części zamiennych Timan',
  cs: 'Otevřít portál náhradních dílů Timan',
};

export function sparePartsPortalLabel(language: string): string {
  return LABELS[language] || LABELS.en;
}
