import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type DemoLinkingTextKey =
  | 'title'
  | 'linkExisting'
  | 'createNew'
  | 'selectExisting'
  | 'selectPlaceholder'
  | 'searchLead'
  | 'noLeads'
  | 'leadUnavailable'
  | 'loadingLeads';

const DEMO_LINKING_TEXT: Record<DemoLinkingTextKey, Record<PortalUiLanguage, string>> = {
  title: {
    da: 'Demoens lead', en: 'Demo lead', de: 'Zugehöriger Demo-Lead', it: 'Lead della demo',
    hu: 'A demó leadje', sv: 'Demons lead', fr: 'Lead associé à la démonstration',
    pl: 'Lead demonstracji', cs: 'Lead ukázky',
  },
  linkExisting: {
    da: 'Knyt til eksisterende lead', en: 'Link to existing lead', de: 'Mit bestehendem Lead verknüpfen',
    it: 'Collega a un lead esistente', hu: 'Kapcsolás meglévő leadhez', sv: 'Koppla till befintligt lead',
    fr: 'Associer à un lead existant', pl: 'Połącz z istniejącym leadem', cs: 'Propojit se stávajícím leadem',
  },
  createNew: {
    da: 'Opret nyt lead', en: 'Create new lead', de: 'Neuen Lead erstellen', it: 'Crea un nuovo lead',
    hu: 'Új lead létrehozása', sv: 'Skapa nytt lead', fr: 'Créer un nouveau lead',
    pl: 'Utwórz nowy lead', cs: 'Vytvořit nový lead',
  },
  selectExisting: {
    da: 'Vælg eksisterende lead', en: 'Select existing lead', de: 'Bestehenden Lead auswählen',
    it: 'Seleziona un lead esistente', hu: 'Meglévő lead kiválasztása', sv: 'Välj befintligt lead',
    fr: 'Sélectionner un lead existant', pl: 'Wybierz istniejący lead', cs: 'Vybrat existující lead',
  },
  selectPlaceholder: {
    da: 'Vælg lead…', en: 'Select lead…', de: 'Lead auswählen…', it: 'Seleziona lead…',
    hu: 'Lead kiválasztása…', sv: 'Välj lead…', fr: 'Sélectionner un lead…',
    pl: 'Wybierz lead…', cs: 'Vybrat lead…',
  },
  searchLead: {
    da: 'Søg lead…', en: 'Search leads…', de: 'Lead suchen…', it: 'Cerca lead…',
    hu: 'Lead keresése…', sv: 'Sök lead…', fr: 'Rechercher un lead…',
    pl: 'Szukaj leadu…', cs: 'Hledat lead…',
  },
  noLeads: {
    da: 'Ingen leads fundet', en: 'No leads found', de: 'Keine Leads gefunden', it: 'Nessun lead trovato',
    hu: 'Nem található lead', sv: 'Inga leads hittades', fr: 'Aucun lead trouvé',
    pl: 'Nie znaleziono leadów', cs: 'Nebyly nalezeny žádné leady',
  },
  leadUnavailable: {
    da: 'Leadet findes ikke i din adgang', en: 'This lead is not available in your scope',
    de: 'Dieser Lead gehört nicht zu Ihrem Zugriffsbereich', it: 'Questo lead non rientra nel tuo ambito di accesso',
    hu: 'Ez a lead nem érhető el az Ön jogosultsági körében', sv: 'Leadet ingår inte i din behörighet',
    fr: 'Ce lead ne fait pas partie de votre périmètre d’accès', pl: 'Ten lead nie należy do Twojego zakresu dostępu',
    cs: 'Tento lead není ve vašem rozsahu přístupu',
  },
  loadingLeads: {
    da: 'Henter leads…', en: 'Loading leads…', de: 'Leads werden geladen…', it: 'Caricamento lead…',
    hu: 'Leadek betöltése…', sv: 'Hämtar leads…', fr: 'Chargement des leads…',
    pl: 'Ładowanie leadów…', cs: 'Načítání leadů…',
  },
};

export function demoLinkingText(key: DemoLinkingTextKey, language: PortalUiLanguage): string {
  return DEMO_LINKING_TEXT[key][language] || DEMO_LINKING_TEXT[key].en;
}
