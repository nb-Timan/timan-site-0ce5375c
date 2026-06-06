/**
 * Central translation registry for new portal labels.
 *
 * - Add a new language: create an entry in `translations` keyed by its
 *   `PortalUiLanguage` code. Missing keys fall back to English, then Danish.
 * - Add a new label: add the key under `da`, `en`, and optionally other
 *   languages. The `t()` helper never throws.
 *
 * This module is the recommended place for NEW shared labels. Existing
 * page-level `Record<Language, string>` T objects continue to work — they are
 * resolved against the legacy `language` (sv/fr/pl/cs map to 'en') so they
 * never crash.
 */
import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Dict = Record<string, string>;

const da: Dict = {
  save: 'Gem',
  cancel: 'Annullér',
  edit: 'Redigér',
  delete: 'Slet',
  loading: 'Indlæser…',
  search: 'Søg',
  back: 'Tilbage',
  next: 'Næste',
  previous: 'Forrige',
  close: 'Luk',
  yes: 'Ja',
  no: 'Nej',
  // Navigation / modules
  navDashboard: 'Dashboard',
  navCrm: 'CRM',
  navConfigurator: 'Konfigurator',
  navService: 'Service',
  navBackend: 'Backend',
  navResources: 'Ressourcer',
  navPartnerMap: 'Partnerkort',
  navProfile: 'Profil',
  // Status labels
  statusActive: 'Aktiv',
  statusInactive: 'Inaktiv',
  statusPending: 'Afventer',
  // System messages
  errorGeneric: 'Noget gik galt. Prøv igen.',
  saved: 'Gemt',
  unsavedChanges: 'Ugemte ændringer',
};

const en: Dict = {
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  loading: 'Loading…',
  search: 'Search',
  back: 'Back',
  next: 'Next',
  previous: 'Previous',
  close: 'Close',
  yes: 'Yes',
  no: 'No',
  navDashboard: 'Dashboard',
  navCrm: 'CRM',
  navConfigurator: 'Configurator',
  navService: 'Service',
  navBackend: 'Backend',
  navResources: 'Resources',
  navPartnerMap: 'Partner map',
  navProfile: 'Profile',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  statusPending: 'Pending',
  errorGeneric: 'Something went wrong. Please try again.',
  saved: 'Saved',
  unsavedChanges: 'Unsaved changes',
};

const de: Dict = {
  ...en,
  save: 'Speichern', cancel: 'Abbrechen', edit: 'Bearbeiten', delete: 'Löschen',
  loading: 'Wird geladen…', search: 'Suchen', back: 'Zurück', next: 'Weiter',
  previous: 'Vorherige', close: 'Schließen', yes: 'Ja', no: 'Nein',
  navConfigurator: 'Konfigurator', navService: 'Service', navResources: 'Ressourcen',
  navPartnerMap: 'Partnerkarte', navProfile: 'Profil',
  statusActive: 'Aktiv', statusInactive: 'Inaktiv', statusPending: 'Ausstehend',
  errorGeneric: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.', saved: 'Gespeichert',
  unsavedChanges: 'Ungespeicherte Änderungen',
};

const it: Dict = {
  ...en,
  save: 'Salva', cancel: 'Annulla', edit: 'Modifica', delete: 'Elimina',
  loading: 'Caricamento…', search: 'Cerca', back: 'Indietro', next: 'Avanti',
  previous: 'Precedente', close: 'Chiudi', yes: 'Sì', no: 'No',
  navResources: 'Risorse', navPartnerMap: 'Mappa partner', navProfile: 'Profilo',
  statusActive: 'Attivo', statusInactive: 'Inattivo', statusPending: 'In attesa',
  errorGeneric: 'Qualcosa è andato storto. Riprova.', saved: 'Salvato',
  unsavedChanges: 'Modifiche non salvate',
};

const hu: Dict = {
  ...en,
  save: 'Mentés', cancel: 'Mégse', edit: 'Szerkesztés', delete: 'Törlés',
  loading: 'Betöltés…', search: 'Keresés', back: 'Vissza', next: 'Tovább',
  previous: 'Előző', close: 'Bezárás', yes: 'Igen', no: 'Nem',
  navResources: 'Erőforrások', navPartnerMap: 'Partnertérkép', navProfile: 'Profil',
  statusActive: 'Aktív', statusInactive: 'Inaktív', statusPending: 'Függőben',
  errorGeneric: 'Hiba történt. Próbáld újra.', saved: 'Mentve',
  unsavedChanges: 'Mentetlen módosítások',
};

const sv: Dict = {
  ...en,
  save: 'Spara', cancel: 'Avbryt', edit: 'Redigera', delete: 'Ta bort',
  loading: 'Laddar…', search: 'Sök', back: 'Tillbaka', next: 'Nästa',
  previous: 'Föregående', close: 'Stäng', yes: 'Ja', no: 'Nej',
  navResources: 'Resurser', navPartnerMap: 'Partnerkarta', navProfile: 'Profil',
  statusActive: 'Aktiv', statusInactive: 'Inaktiv', statusPending: 'Väntar',
  errorGeneric: 'Något gick fel. Försök igen.', saved: 'Sparat',
  unsavedChanges: 'Osparade ändringar',
};

const fr: Dict = {
  ...en,
  save: 'Enregistrer', cancel: 'Annuler', edit: 'Modifier', delete: 'Supprimer',
  loading: 'Chargement…', search: 'Rechercher', back: 'Retour', next: 'Suivant',
  previous: 'Précédent', close: 'Fermer', yes: 'Oui', no: 'Non',
  navConfigurator: 'Configurateur', navResources: 'Ressources',
  navPartnerMap: 'Carte des partenaires', navProfile: 'Profil',
  statusActive: 'Actif', statusInactive: 'Inactif', statusPending: 'En attente',
  errorGeneric: 'Une erreur est survenue. Veuillez réessayer.', saved: 'Enregistré',
  unsavedChanges: 'Modifications non enregistrées',
};

const pl: Dict = {
  ...en,
  save: 'Zapisz', cancel: 'Anuluj', edit: 'Edytuj', delete: 'Usuń',
  loading: 'Ładowanie…', search: 'Szukaj', back: 'Wstecz', next: 'Dalej',
  previous: 'Poprzedni', close: 'Zamknij', yes: 'Tak', no: 'Nie',
  navConfigurator: 'Konfigurator', navResources: 'Zasoby',
  navPartnerMap: 'Mapa partnerów', navProfile: 'Profil',
  statusActive: 'Aktywny', statusInactive: 'Nieaktywny', statusPending: 'Oczekuje',
  errorGeneric: 'Coś poszło nie tak. Spróbuj ponownie.', saved: 'Zapisano',
  unsavedChanges: 'Niezapisane zmiany',
};

const cs: Dict = {
  ...en,
  save: 'Uložit', cancel: 'Zrušit', edit: 'Upravit', delete: 'Smazat',
  loading: 'Načítání…', search: 'Hledat', back: 'Zpět', next: 'Další',
  previous: 'Předchozí', close: 'Zavřít', yes: 'Ano', no: 'Ne',
  navConfigurator: 'Konfigurátor', navResources: 'Zdroje',
  navPartnerMap: 'Mapa partnerů', navProfile: 'Profil',
  statusActive: 'Aktivní', statusInactive: 'Neaktivní', statusPending: 'Čeká',
  errorGeneric: 'Něco se pokazilo. Zkuste to znovu.', saved: 'Uloženo',
  unsavedChanges: 'Neuložené změny',
};

export const translations: Record<PortalUiLanguage, Dict> = {
  da, en, de, it, hu, sv, fr, pl, cs,
};

/**
 * Translate a key with safe fallback: requested language → English → Danish → key.
 * Never throws.
 */
export function t(key: string, lang: PortalUiLanguage | string | null | undefined): string {
  const dicts: Dict[] = [];
  if (lang && (translations as Record<string, Dict>)[lang as string]) {
    dicts.push((translations as Record<string, Dict>)[lang as string]);
  }
  dicts.push(translations.en, translations.da);
  for (const d of dicts) {
    const v = d[key];
    if (typeof v === 'string') return v;
  }
  return key;
}
