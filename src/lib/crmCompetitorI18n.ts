import type { PortalUiLanguage } from '@/lib/portalLanguages';

const languages: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
const labels = {
  competitors: ['Konkurrenter', 'Competitors', 'Wettbewerber', 'Concorrenti', 'Versenytársak', 'Konkurrenter', 'Concurrents', 'Konkurenci', 'Konkurenti'],
  competitor: ['Konkurrent', 'Competitor', 'Wettbewerber', 'Concorrente', 'Versenytárs', 'Konkurrent', 'Concurrent', 'Konkurent', 'Konkurent'],
  choose: ['Vælg konkurrent…', 'Select competitor…', 'Wettbewerber wählen…', 'Seleziona concorrente…', 'Válasszon versenytársat…', 'Välj konkurrent…', 'Choisir un concurrent…', 'Wybierz konkurenta…', 'Vyberte konkurenta…'],
  relevant: ['Relevante konkurrenter', 'Relevant competitors', 'Relevante Wettbewerber', 'Concorrenti pertinenti', 'Releváns versenytársak', 'Relevanta konkurrenter', 'Concurrents pertinents', 'Odpowiedni konkurenci', 'Relevantní konkurenti'],
  all: ['Alle konkurrenter', 'All competitors', 'Alle Wettbewerber', 'Tutti i concorrenti', 'Minden versenytárs', 'Alla konkurrenter', 'Tous les concurrents', 'Wszyscy konkurenci', 'Všichni konkurenti'],
  new: ['Ny konkurrent', 'New competitor', 'Neuer Wettbewerber', 'Nuovo concorrente', 'Új versenytárs', 'Ny konkurrent', 'Nouveau concurrent', 'Nowy konkurent', 'Nový konkurent'],
  country: ['Land', 'Country', 'Land', 'Paese', 'Ország', 'Land', 'Pays', 'Kraj', 'Země'],
  website: ['Hjemmeside', 'Website', 'Website', 'Sito web', 'Webhely', 'Webbplats', 'Site web', 'Strona internetowa', 'Web'],
  machines: ['Konkurrerer med', 'Competes with', 'Im Wettbewerb mit', 'Compete con', 'Ezekkel versenyez', 'Konkurrerar med', 'En concurrence avec', 'Konkuruje z', 'Soutěží s'],
  active: ['Aktiv', 'Active', 'Aktiv', 'Attivo', 'Aktív', 'Aktiv', 'Actif', 'Aktywny', 'Aktivní'],
  inactive: ['Inaktiv', 'Inactive', 'Inaktiv', 'Inattivo', 'Inaktív', 'Inaktiv', 'Inactif', 'Nieaktywny', 'Neaktivní'],
  deactivate: ['Deaktivér', 'Deactivate', 'Deaktivieren', 'Disattiva', 'Deaktiválás', 'Inaktivera', 'Désactiver', 'Dezaktywuj', 'Deaktivovat'],
  activate: ['Aktivér', 'Activate', 'Aktivieren', 'Attiva', 'Aktiválás', 'Aktivera', 'Activer', 'Aktywuj', 'Aktivovat'],
  other: ['Andre', 'Other', 'Andere', 'Altro', 'Egyéb', 'Andra', 'Autres', 'Inne', 'Ostatní'],
  otherName: ['Anden konkurrent', 'Other competitor', 'Anderer Wettbewerber', 'Altro concorrente', 'Más versenytárs', 'Annan konkurrent', 'Autre concurrent', 'Inny konkurent', 'Jiný konkurent'],
  save: ['Gem', 'Save', 'Speichern', 'Salva', 'Mentés', 'Spara', 'Enregistrer', 'Zapisz', 'Uložit'],
  cancel: ['Annuller', 'Cancel', 'Abbrechen', 'Annulla', 'Mégse', 'Avbryt', 'Annuler', 'Anuluj', 'Zrušit'],
  edit: ['Redigér', 'Edit', 'Bearbeiten', 'Modifica', 'Szerkesztés', 'Redigera', 'Modifier', 'Edytuj', 'Upravit'],
  name: ['Navn', 'Name', 'Name', 'Nome', 'Név', 'Namn', 'Nom', 'Nazwa', 'Název'],
  status: ['Status', 'Status', 'Status', 'Stato', 'Állapot', 'Status', 'Statut', 'Status', 'Stav'],
  duplicate: ['Mulig dublet: ', 'Possible duplicate: ', 'Mögliches Duplikat: ', 'Possibile duplicato: ', 'Lehetséges duplikátum: ', 'Möjlig dubblett: ', 'Doublon possible : ', 'Możliwy duplikat: ', 'Možná duplicita: '],
  confirmDuplicate: ['Jeg har kontrolleret navnet', 'I have checked the name', 'Ich habe den Namen geprüft', 'Ho verificato il nome', 'Ellenőriztem a nevet', 'Jag har kontrollerat namnet', 'J’ai vérifié le nom', 'Sprawdzono nazwę', 'Název byl ověřen'],
  error: ['Kunne ikke gemme konkurrenten.', 'Could not save competitor.', 'Wettbewerber konnte nicht gespeichert werden.', 'Impossibile salvare il concorrente.', 'A versenytárs nem menthető.', 'Kunde inte spara konkurrenten.', 'Impossible d’enregistrer le concurrent.', 'Nie udało się zapisać konkurenta.', 'Konkurenta nelze uložit.'],
} as const;

export type CrmCompetitorTextKey = keyof typeof labels;
export function crmCompetitorText(key: CrmCompetitorTextKey, language: PortalUiLanguage): string {
  return labels[key][languages.indexOf(language)] ?? labels[key][1];
}
