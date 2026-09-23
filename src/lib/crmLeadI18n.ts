import type { PortalUiLanguage } from '@/lib/portalLanguages';

type LeadTextKey =
  | 'currentSalesStatus' | 'equipmentUnderMachines' | 'otherInterests'
  | 'linkedTitle' | 'linkedDescription' | 'order' | 'quote' | 'configuration'
  | 'syncing' | 'syncFrom' | 'open'
  | 'shareTitle' | 'shareDescription' | 'shareWithDealer' | 'shareWithTiman'
  | 'sharedUser' | 'notShared' | 'shareDialogDescription' | 'recipient'
  | 'noRecipient' | 'sendEmail' | 'sharing' | 'shareLead'
  | 'fileOpenError' | 'uploadOnSave'
  | 'addNote' | 'notePlaceholder' | 'addFollowupToCalendar' | 'cancel' | 'save'
  | 'previousNotes' | 'leadHistory' | 'notesCount' | 'loadingNotes' | 'noNotes'
  | 'unknownTime' | 'unknownUser' | 'pin' | 'priority' | 'remove'
  | 'showFullHistory' | 'demoEvents' | 'followupDateRequired'
  | 'historyLoadError' | 'noteSaved' | 'noteCalendarSaved' | 'noteSaveError'
  | 'priorityRemoved' | 'prioritySaveError' | 'nextFollowup' | 'nextActivity'
  | 'select' | 'note' | 'clear' | 'today' | 'oneDayAgo' | 'inOneDay' | 'oneWeek'
  | 'oneMonth' | 'threeMonths' | 'sixMonths' | 'other'
  | 'syncSuccess' | 'syncError' | 'shareNoDealerUsers' | 'shareNoSeller'
  | 'shareSuccess' | 'shareEmailSuccess' | 'quoteConversionError' | 'leadLoadError';
  

const text: Record<LeadTextKey, { da: string; en: string; de: string }> = {
  currentSalesStatus: { da: 'Aktuel salgsstatus', en: 'Current sales status', de: 'Aktueller Verkaufsstatus' },
  equipmentUnderMachines: { da: 'Redskaber under maskiner', en: 'Equipment by machine', de: 'Anbaugeräte nach Maschine' },
  otherInterests: { da: 'Andre valgte CRM-interesser', en: 'Other selected CRM interests', de: 'Weitere ausgewählte CRM-Interessen' },
  linkedTitle: { da: 'Linkede konfigurationer / tilbud', en: 'Linked configurations / quotes', de: 'Verknüpfte Konfigurationen / Angebote' },
  linkedDescription: { da: 'Konfigurationer, tilbud og ordrer fra konfiguratoren knyttet til dette lead.', en: 'Configurations, quotes and orders from the Configurator linked to this lead.', de: 'Mit diesem Lead verknüpfte Konfigurationen, Angebote und Aufträge aus dem Konfigurator.' },
  order: { da: 'Ordre', en: 'Order', de: 'Auftrag' }, quote: { da: 'Tilbud', en: 'Quote', de: 'Angebot' }, configuration: { da: 'Konfiguration', en: 'Configuration', de: 'Konfiguration' },
  syncing: { da: 'Synkroniserer...', en: 'Syncing...', de: 'Wird synchronisiert...' }, syncFrom: { da: 'Synkronisér fra', en: 'Sync from', de: 'Synchronisieren von' }, open: { da: 'Åbn', en: 'Open', de: 'Öffnen' },
  shareTitle: { da: 'Lead-deling', en: 'Lead sharing', de: 'Lead-Freigabe' }, shareDescription: { da: 'Del samme lead i portalen uden at oprette en kopi.', en: 'Share the same lead in the portal without creating a copy.', de: 'Diesen Lead im Portal freigeben, ohne eine Kopie zu erstellen.' },
  shareWithDealer: { da: 'Del med forhandler', en: 'Share with dealer', de: 'Mit Händler teilen' }, shareWithTiman: { da: 'Del med Timan', en: 'Share with Timan', de: 'Mit Timan teilen' }, sharedUser: { da: 'Delt bruger', en: 'Shared user', de: 'Freigegebener Benutzer' }, notShared: { da: 'Dette lead er ikke delt endnu.', en: 'This lead has not been shared yet.', de: 'Dieser Lead wurde noch nicht freigegeben.' },
  shareDialogDescription: { da: 'Leadet deles altid i portalen. Vælg mail, hvis modtageren også skal have besked.', en: 'The lead is always shared in the portal. Select email if the recipient should also be notified.', de: 'Der Lead wird immer im Portal freigegeben. Wählen Sie E-Mail, wenn der Empfänger zusätzlich benachrichtigt werden soll.' },
  recipient: { da: 'Modtager', en: 'Recipient', de: 'Empfänger' }, noRecipient: { da: 'Ingen modtager fundet', en: 'No recipient found', de: 'Kein Empfänger gefunden' }, sendEmail: { da: 'Send også som mail', en: 'Also send by email', de: 'Zusätzlich per E-Mail senden' }, sharing: { da: 'Deler...', en: 'Sharing...', de: 'Wird freigegeben...' }, shareLead: { da: 'Del lead', en: 'Share lead', de: 'Lead freigeben' },
  fileOpenError: { da: 'Kunne ikke åbne filen', en: 'Could not open the file', de: 'Datei konnte nicht geöffnet werden' }, uploadOnSave: { da: 'Uploades når leadet gemmes', en: 'Uploads when the lead is saved', de: 'Wird beim Speichern des Leads hochgeladen' },
  addNote: { da: 'Tilføj note', en: 'Add note', de: 'Notiz hinzufügen' }, notePlaceholder: { da: 'Skriv en kort opfølgning eller kommentar', en: 'Write a short follow-up or comment', de: 'Kurze Nachverfolgung oder einen Kommentar schreiben' }, addFollowupToCalendar: { da: 'Tilføj denne opfølgning til kalender', en: 'Add this follow-up to the calendar', de: 'Diese Nachverfolgung zum Kalender hinzufügen' },
  cancel: { da: 'Annuller', en: 'Cancel', de: 'Abbrechen' }, save: { da: 'Gem', en: 'Save', de: 'Speichern' }, previousNotes: { da: 'Tidligere noter', en: 'Previous notes', de: 'Frühere Notizen' }, leadHistory: { da: 'Leadhistorik', en: 'Lead history', de: 'Lead-Verlauf' }, notesCount: { da: 'noter', en: 'notes', de: 'Notizen' }, loadingNotes: { da: 'Indlæser noter', en: 'Loading notes', de: 'Notizen werden geladen' }, noNotes: { da: 'Ingen noter endnu.', en: 'No notes yet.', de: 'Noch keine Notizen.' },
  unknownTime: { da: 'Ukendt tidspunkt', en: 'Unknown time', de: 'Unbekannter Zeitpunkt' }, unknownUser: { da: 'Ukendt bruger', en: 'Unknown user', de: 'Unbekannter Benutzer' }, pin: { da: 'Fastgør', en: 'Pin', de: 'Anheften' }, priority: { da: 'Prioritet', en: 'Priority', de: 'Priorität' }, remove: { da: 'Fjern', en: 'Remove', de: 'Entfernen' }, showFullHistory: { da: 'Vis hele historikken', en: 'Show full history', de: 'Gesamten Verlauf anzeigen' }, demoEvents: { da: 'Demo-hændelser', en: 'Demo events', de: 'Demo-Ereignisse' },
  followupDateRequired: { da: 'Vælg en opfølgningsdato før kalenderen tilføjes', en: 'Choose a follow-up date before adding it to the calendar', de: 'Wählen Sie ein Nachfassdatum, bevor Sie den Kalendereintrag hinzufügen' }, historyLoadError: { da: 'Kunne ikke hente leadhistorik', en: 'Could not load lead history', de: 'Lead-Verlauf konnte nicht geladen werden' }, noteSaved: { da: 'Noten er gemt', en: 'The note has been saved', de: 'Die Notiz wurde gespeichert' }, noteCalendarSaved: { da: 'Note og kalenderopfølgning er gemt', en: 'The note and calendar follow-up have been saved', de: 'Notiz und Kalender-Nachverfolgung wurden gespeichert' }, noteSaveError: { da: 'Kunne ikke gemme noten', en: 'Could not save the note', de: 'Notiz konnte nicht gespeichert werden' }, priorityRemoved: { da: 'Prioritet fjernet', en: 'Priority removed', de: 'Priorität entfernt' }, prioritySaveError: { da: 'Kunne ikke ændre noteprioritet', en: 'Could not change note priority', de: 'Notizpriorität konnte nicht geändert werden' },
  nextFollowup: { da: 'Næste opfølgning', en: 'Next follow-up', de: 'Nächste Nachverfolgung' }, nextActivity: { da: 'Næste aktivitet', en: 'Next activity', de: 'Nächste Aktivität' }, select: { da: 'Vælg…', en: 'Select…', de: 'Auswählen…' }, note: { da: 'Note', en: 'Note', de: 'Notiz' },
  clear: { da: 'Ryd', en: 'Clear', de: 'Löschen' }, today: { da: 'I dag', en: 'Today', de: 'Heute' }, oneDayAgo: { da: '-1 dag', en: '-1 day', de: '-1 Tag' }, inOneDay: { da: '+1 dag', en: '+1 day', de: '+1 Tag' }, oneWeek: { da: '+1 uge', en: '+1 week', de: '+1 Woche' }, oneMonth: { da: '+1 måned', en: '+1 month', de: '+1 Monat' }, threeMonths: { da: '+3 måneder', en: '+3 months', de: '+3 Monate' }, sixMonths: { da: '+6 måneder', en: '+6 months', de: '+6 Monate' }, other: { da: 'Andet', en: 'Other', de: 'Andere' },
  syncSuccess: { da: 'Lead synkroniseret', en: 'Lead synchronized', de: 'Lead synchronisiert' }, syncError: { da: 'Kunne ikke synkronisere lead', en: 'Could not synchronize lead', de: 'Lead konnte nicht synchronisiert werden' }, shareNoDealerUsers: { da: 'Der er ingen aktive brugere på den valgte forhandler.', en: 'There are no active users for the selected dealer.', de: 'Für den ausgewählten Händler gibt es keine aktiven Benutzer.' }, shareNoSeller: { da: 'Der er ikke fundet en ansvarlig Timan-sælger på forhandleren.', en: 'No responsible Timan salesperson was found for the dealer.', de: 'Für den Händler wurde kein verantwortlicher Timan-Verkäufer gefunden.' }, shareSuccess: { da: 'Lead delt i portalen.', en: 'Lead shared in the portal.', de: 'Lead im Portal freigegeben.' }, shareEmailSuccess: { da: 'Lead delt. Mail åbnes nu.', en: 'Lead shared. Email opens now.', de: 'Lead freigegeben. Die E-Mail wird jetzt geöffnet.' },
  quoteConversionError: { da: 'Kunne ikke konvertere leadet til tilbud', en: 'Could not convert lead to quote', de: 'Lead konnte nicht in ein Angebot umgewandelt werden' }, leadLoadError: { da: 'Kunne ikke hente leads', en: 'Could not load leads', de: 'Leads konnten nicht geladen werden' },
};

export function crmLeadText(key: LeadTextKey, language: PortalUiLanguage): string { const copy = text[key]; return language === 'da' ? copy.da : language === 'de' ? copy.de : copy.en; }

const ACTIVITY_LABELS: Record<string, { da: string; en: string; de: string }> = {
  'New lead': { da: 'Nyt lead', en: 'New lead', de: 'Neuer Lead' }, 'Wants to be contacted': { da: 'Ønsker kontakt', en: 'Wants to be contacted', de: 'Kontakt gewünscht' }, 'Lead sent to the dealer': { da: 'Lead sendt til forhandler', en: 'Lead sent to dealer', de: 'Lead an Händler gesendet' }, 'Sales material sent to the customer': { da: 'Salgsmateriale sendt til kunden', en: 'Sales material sent to customer', de: 'Verkaufsmaterial an Kunden gesendet' }, 'Follow-up on leads': { da: 'Opfølgning på lead', en: 'Follow up on lead', de: 'Lead nachverfolgen' }, 'Offer sent to the customer': { da: 'Tilbud sendt til kunden', en: 'Offer sent to customer', de: 'Angebot an Kunden gesendet' }, 'Closed with order': { da: 'Lukket med ordre', en: 'Closed with order', de: 'Mit Auftrag abgeschlossen' }, 'Closed without order': { da: 'Lukket uden ordre', en: 'Closed without order', de: 'Ohne Auftrag abgeschlossen' }, 'Not relevant': { da: 'Ikke relevant', en: 'Not relevant', de: 'Nicht relevant' },
};
export function crmLeadActivityLabel(activity: string, language: PortalUiLanguage): string { const copy = ACTIVITY_LABELS[activity]; if (!copy) return activity; return language === 'da' ? copy.da : language === 'de' ? copy.de : copy.en; }

const CHOICE_LABELS_DE: Record<string, string> = {
  Phone: 'Telefon', Email: 'E-Mail', 'Trade fair': 'Messe', Dealer: 'Händler', SoMe: 'Soziale Medien',
  'Contact from Timan mails': 'Kontakt über Timan-E-Mails', 'Timan Project Direct sales': 'Timan-Projekt Direktvertrieb',
  'Contractor Landscape gardener': 'Landschaftsbauunternehmen', 'Housing association': 'Wohnungsbaugesellschaft', Municipality: 'Kommune',
  'Institution (School, Hospital, etc.)': 'Institution (Schule, Krankenhaus usw.)', Churches: 'Kirchen', Company: 'Unternehmen',
  'Private / End customer': 'Privat-/Endkunde', 'Rental company': 'Vermietungsunternehmen', 'Dealer/Demo machine': 'Händler-/Demomaschine',
  'Direct sale': 'Direktverkauf', 'Needs to be filled in': 'Angaben fehlen', Unknown: 'Unbekannt', Other: 'Andere',
  Price: 'Preis', 'Delivery time': 'Lieferzeit', 'Machine too small': 'Maschine zu klein', 'Machine too large': 'Maschine zu groß',
  'Customer found a used machine instead': 'Kunde hat stattdessen eine Gebrauchtmaschine gefunden',
  'Budget changed or project was cancelled': 'Budget geändert oder Projekt abgesagt',
};
export function crmLeadChoiceLabel(value: string, language: PortalUiLanguage): string {
  if (language === 'de') return CHOICE_LABELS_DE[value] ?? value;
  if (language === 'da' && value === 'Other') return 'Andet';
  return value;
}

const EQUIPMENT_GROUP_LABELS: Record<string, { en: string; de: string }> = {
  'Loader line / traktor-redskaber': { en: 'Loader line / tractor equipment', de: 'Loader Line / Traktoranbaugeräte' },
  'Feje/Sug Redskaber': { en: 'Sweeping / suction equipment', de: 'Kehr-/Saugausrüstung' },
  Ukrudtsbørste: { en: 'Weed brush', de: 'Unkrautbürste' },
  'Græs opgaver': { en: 'Grass maintenance', de: 'Grünpflege' },
  'Vinter redskaber': { en: 'Winter equipment', de: 'Winteranbaugeräte' },
  'Øvrige Redskaber': { en: 'Other equipment', de: 'Sonstige Anbaugeräte' },
  Tractor: { en: 'Tractor', de: 'Traktor' },
};
export function crmLeadEquipmentGroupLabel(value: string, language: PortalUiLanguage): string {
  const copy = EQUIPMENT_GROUP_LABELS[value];
  if (!copy || language === 'da') return value;
  return language === 'de' ? copy.de : copy.en;
}

const STATUS_LABELS: Record<string, { da: string; en: string; de: string }> = {
  Lead: { da: 'Lead', en: 'Lead', de: 'Lead' }, 'Ønsker demo': { da: 'Ønsker demo', en: 'Demo requested', de: 'Demo gewünscht' }, 'Demo aftalt': { da: 'Demo aftalt', en: 'Demo scheduled', de: 'Demo vereinbart' }, 'Demo afholdt': { da: 'Demo afholdt', en: 'Demo completed', de: 'Demo durchgeführt' }, 'Tilbud sendt': { da: 'Tilbud sendt', en: 'Offer sent', de: 'Angebot gesendet' }, 'Follow-up': { da: 'Opfølgning', en: 'Follow-up', de: 'Nachverfolgung' }, Vundet: { da: 'Vundet', en: 'Won', de: 'Gewonnen' }, Tabt: { da: 'Tabt', en: 'Lost', de: 'Verloren' },
};
export function crmLeadStatusLabel(status: string, language: PortalUiLanguage): string { const copy = STATUS_LABELS[status]; if (!copy) return status; return language === 'da' ? copy.da : language === 'de' ? copy.de : copy.en; }

const CONFIGURATOR_OFFER_EVENT = /^Tilbud afgivet via konfiguratoren(?:\s*[—-]\s*(.+))?$/i;
export function localizeLeadHistoryText(value: string, language: PortalUiLanguage): string {
  const match = value.trim().match(CONFIGURATOR_OFFER_EVENT); if (!match) return value;
  const label = language === 'da' ? 'Tilbud oprettet via konfiguratoren' : language === 'de' ? 'Angebot über den Konfigurator erstellt' : 'Offer created via the Configurator';
  return match[1] ? `${label} — ${match[1]}` : label;
}
export function localizeLeadHistoryBlock(value: string, language: PortalUiLanguage): string {
  return value.split(/\r?\n/).map((line) => localizeLeadHistoryText(line, language)).join('\n');
}
export function crmLeadLocale(language: PortalUiLanguage): string { return language === 'da' ? 'da-DK' : language === 'de' ? 'de-DE' : 'en-GB'; }
