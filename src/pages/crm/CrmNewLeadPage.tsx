import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isExternalCrmRole, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  createLead, updateLead, getLead, NEXT_ACTIVITY_OPTIONS, CONTACT_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS, LOST_COMPETITOR_OPTIONS, LOST_REASON_OPTIONS,
  PipelineStage, formatLeadNo,
  getLeadAttachmentSignedUrl, getLeadAttachmentSignedUrls, getLeadImageAttachments, uploadLeadAttachments, type CrmLeadAttachment,
} from '@/lib/crmLeadsService';
import {
  nextActivityToProbability,
  deriveLegacyPipelineStage,
  NEXT_ACTIVITY_LOST,
} from '@/lib/leadStatus';
import {
  getCrmConfigurationDeepLink,
  getCrmLinkedConfigurationKind,
  listConfigurationsForLead,
  type CrmLeadQuoteRow,
} from '@/lib/crmConfigurationsService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { fetchBackendUsers } from '@/lib/backendUsersService';
import type { BackendUser } from '@/lib/backend-users-store';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Save, X, Upload, AlertTriangle, ChevronsUpDown, Check, Lock, ExternalLink, Image as ImageIcon, CalendarIcon, Share2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { sellerInitialsMatch } from '@/lib/sellerInitials';
import { useSellerDirectory, resolveDealerSellerInitials } from '@/lib/sellerDirectory';
import { calculateMachineInterestEstimate } from '@/lib/leadToConfiguratorDraft';
import {
  getResponsibleTimanSellerTarget,
  leadShareMailto,
  listActiveDealerLeadShareTargets,
  listLeadShares,
  resolveAppUserByEmail,
  shareLead,
  type CrmLeadShare,
  type LeadShareTarget,
} from '@/lib/crmLeadSharingService';
import {
  getMissingOrdinaryCrmLeadFields,
  type OrdinaryCrmLeadRequiredField,
} from '@/lib/crmLeadValidation';

// ---- i18n. English is the fallback. ----
type TKey =
  | 'page_title' | 'page_sub' | 'back' | 'cancel' | 'saving' | 'save'
  | 'sec_basic' | 'sec_basic_sub' | 'sec_machines' | 'sec_machines_sub'
  | 'sec_contact_info_structured' | 'sec_contact_info_structured_sub'
  | 'sec_next_act' | 'sec_demo' | 'sec_contact_cust' | 'sec_details'
  | 'sec_lost' | 'sec_files' | 'sec_files_sub'
  | 'lbl_title' | 'ph_title' | 'lbl_seller' | 'ph_seller'
  | 'lbl_dealer' | 'ph_dealer' | 'lbl_first_contact'
  | 'lbl_expected_close' | 'lbl_next_followup' | 'lbl_next_activity'
  | 'pick' | 'lbl_demo_held' | 'yes' | 'no' | 'lbl_convert' | 'cta_convert'
  | 'lbl_contact_type' | 'lbl_customer_type'
  | 'lbl_contact_info' | 'ph_contact_info' | 'lbl_tradefair' | 'lbl_country' | 'lbl_notes'
  | 'lbl_contact_company' | 'lbl_contact_person' | 'lbl_contact_phone' | 'lbl_contact_email'
  | 'lbl_contact_address' | 'lbl_contact_zip_city' | 'lbl_contact_postal_code' | 'lbl_contact_city'
  | 'lbl_budget' | 'lbl_probability' | 'lbl_pipeline' | 'lbl_move_work' | 'hlp_move_work'
  | 'lbl_lost_to' | 'lbl_lost_other' | 'lbl_lost_reason' | 'lbl_lost_comment'
  | 'pick_files' | 'mine_dealers' | 'other_dealers'
  | 'loading_dealers' | 'no_match' | 'search_dealer'
  | 'val_title' | 'val_seller' | 'val_dealer' | 'val_first' | 'val_close'
  | 'val_followup' | 'val_contact' | 'val_customer' | 'val_next_act' | 'val_required'
  | 'created_ok' | 'created_err' | 'edit_title' | 'edit_sub' | 'updated_ok' | 'updated_err' | 'save_changes' | 'loading';

const T: Record<TKey, Record<Language, string>> = {
  page_title:    { da: 'Nyt lead', en: 'New lead', de: 'Neuer Lead', it: 'Nuovo lead', hu: 'Új lead' },
  page_sub:      { da: 'Opret et nyt lead i CRM. Aktivitet logges automatisk.', en: 'Create a new CRM lead. Activity is logged automatically.', de: 'Neuen CRM-Lead anlegen. Aktivität wird automatisch protokolliert.', it: 'Crea un nuovo lead CRM. L\'attività viene registrata automaticamente.', hu: 'Új CRM lead létrehozása. A tevékenység automatikusan rögzítésre kerül.' },
  back:          { da: 'Tilbage til leads', en: 'Back to leads', de: 'Zurück zu Leads', it: 'Torna ai lead', hu: 'Vissza a leadekhez' },
  cancel:        { da: 'Annuller', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', hu: 'Mégse' },
  saving:        { da: 'Gemmer…', en: 'Saving…', de: 'Speichert…', it: 'Salvataggio…', hu: 'Mentés…' },
  save:          { da: 'Gem lead', en: 'Save lead', de: 'Lead speichern', it: 'Salva lead', hu: 'Lead mentése' },
  sec_basic:     { da: 'Grundinformation', en: 'Basic information', de: 'Grundinformationen', it: 'Informazioni di base', hu: 'Alapadatok' },
  sec_basic_sub: { da: 'Hvem og hvornår', en: 'Who and when', de: 'Wer und wann', it: 'Chi e quando', hu: 'Ki és mikor' },
  sec_contact_info_structured: { da: 'Kontaktinformation', en: 'Contact information', de: 'Kontaktinformationen', it: 'Informazioni di contatto', hu: 'Elérhetőségek' },
  sec_contact_info_structured_sub: { da: 'Strukturerede kundeoplysninger fra leadet', en: 'Structured customer details from the lead', de: 'Strukturierte Kundendaten aus dem Lead', it: 'Dati cliente strutturati dal lead', hu: 'Strukturált ügyféladatok a leadből' },
  sec_machines:  { da: 'Maskine-interesse', en: 'Machine interest', de: 'Maschineninteresse', it: 'Interesse macchine', hu: 'Gép-érdeklődés' },
  sec_machines_sub:{ da: 'Vælg en eller flere maskiner kunden er interesseret i', en: 'Pick one or more machines the customer is interested in', de: 'Eine oder mehrere Maschinen wählen, an denen der Kunde interessiert ist', it: 'Selezionare una o più macchine di interesse', hu: 'Válassza ki a vevőt érdeklő gépeket' },
  sec_next_act:  { da: 'Næste aktivitet', en: 'Next activity', de: 'Nächste Aktivität', it: 'Prossima attività', hu: 'Következő tevékenység' },
  sec_demo:      { da: 'Demo', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo' },
  sec_contact_cust:{ da: 'Kontakttype & kundetype', en: 'Contact & customer type', de: 'Kontakt- & Kundentyp', it: 'Tipo contatto e cliente', hu: 'Kapcsolat- és ügyféltípus' },
  sec_details:   { da: 'Detaljer', en: 'Details', de: 'Details', it: 'Dettagli', hu: 'Részletek' },
  sec_lost:      { da: 'Lost Deal Analysis', en: 'Lost Deal Analysis', de: 'Lost-Deal-Analyse', it: 'Analisi affare perso', hu: 'Elveszített üzlet elemzése' },
  sec_files:     { da: 'Filer', en: 'Files', de: 'Dateien', it: 'File', hu: 'Fájlok' },
  sec_files_sub: { da: 'Vedhæft tilbud, billeder eller PDF (gemmes som metadata i preview)', en: 'Attach quotes, photos or PDF (saved as metadata in preview)', de: 'Angebote, Fotos oder PDF anhängen (in Vorschau als Metadaten gespeichert)', it: 'Allega preventivi, foto o PDF (salvati come metadati nell\'anteprima)', hu: 'Csatoljon árajánlatot, képet vagy PDF-et (előnézetben metaadatként mentve)' },
  lbl_title:     { da: 'Titel', en: 'Title', de: 'Titel', it: 'Titolo', hu: 'Cím' },
  ph_title:      { da: "Fx 'Aalborg Kommune – RC-1000s'", en: "e.g. 'Aalborg Municipality – RC-1000s'", de: "z. B. 'Stadt Aalborg – RC-1000s'", it: "es. 'Comune di Aalborg – RC-1000s'", hu: "Pl. 'Aalborg Önkormányzat – RC-1000s'" },
  lbl_seller:    { da: 'Ansvarlig sælger', en: 'Responsible seller', de: 'Verantwortlicher Verkäufer', it: 'Venditore responsabile', hu: 'Felelős értékesítő' },
  ph_seller:     { da: 'Vælg sælger…', en: 'Select seller…', de: 'Verkäufer wählen…', it: 'Seleziona venditore…', hu: 'Válasszon értékesítőt…' },
  lbl_dealer:    { da: 'Linket forhandler', en: 'Linked dealer', de: 'Verknüpfter Händler', it: 'Rivenditore collegato', hu: 'Kapcsolt kereskedő' },
  ph_dealer:     { da: 'Vælg forhandler…', en: 'Select dealer…', de: 'Händler wählen…', it: 'Seleziona rivenditore…', hu: 'Válasszon kereskedőt…' },
  lbl_first_contact:{ da: 'Første kontakt', en: 'First contact', de: 'Erstkontakt', it: 'Primo contatto', hu: 'Első kapcsolat' },
  lbl_expected_close:{ da: 'Forventet lukkedato', en: 'Expected close date', de: 'Erwartetes Abschlussdatum', it: 'Data chiusura prevista', hu: 'Várható zárás dátuma' },
  lbl_next_followup:{ da: 'Næste opfølgning', en: 'Next follow-up', de: 'Nächste Nachverfolgung', it: 'Prossimo follow-up', hu: 'Következő utánkövetés' },
  lbl_next_activity:{ da: 'Næste aktivitet', en: 'Next activity', de: 'Nächste Aktivität', it: 'Prossima attività', hu: 'Következő tevékenység' },
  pick:          { da: 'Vælg…', en: 'Select…', de: 'Wählen…', it: 'Seleziona…', hu: 'Válasszon…' },
  lbl_demo_held: { da: 'Demo afholdt?', en: 'Demo held?', de: 'Demo durchgeführt?', it: 'Demo effettuata?', hu: 'Demo megtartva?' },
  yes:           { da: 'Ja', en: 'Yes', de: 'Ja', it: 'Sì', hu: 'Igen' },
  no:            { da: 'Nej', en: 'No', de: 'Nein', it: 'No', hu: 'Nem' },
  lbl_convert:   { da: 'Konvertering', en: 'Conversion', de: 'Konvertierung', it: 'Conversione', hu: 'Konverzió' },
  cta_convert:   { da: 'Konvertér til Demo Lead →', en: 'Convert to Demo Lead →', de: 'In Demo-Lead umwandeln →', it: 'Converti in Demo Lead →', hu: 'Átalakítás Demo Leaddé →' },
  lbl_contact_type:{ da: 'Kontakttype', en: 'Contact type', de: 'Kontakttyp', it: 'Tipo contatto', hu: 'Kapcsolat típusa' },
  lbl_customer_type:{ da: 'Kundetype', en: 'Customer type', de: 'Kundentyp', it: 'Tipo cliente', hu: 'Ügyféltípus' },
  lbl_contact_info:{ da: 'Kontaktinformation', en: 'Contact information', de: 'Kontaktinformationen', it: 'Informazioni di contatto', hu: 'Elérhetőségek' },
  ph_contact_info:{ da: 'Navn, telefon, email, virksomhed…', en: 'Name, phone, email, company…', de: 'Name, Telefon, E-Mail, Firma…', it: 'Nome, telefono, email, azienda…', hu: 'Név, telefon, email, cég…' },
  lbl_contact_company: { da: 'Firma/CVR', en: 'Company/CVR', de: 'Firma/CVR', it: 'Azienda/CVR', hu: 'Cég/CVR' },
  lbl_contact_person: { da: 'Kontaktperson', en: 'Contact person', de: 'Kontaktperson', it: 'Referente', hu: 'Kapcsolattartó' },
  lbl_contact_phone: { da: 'Telefon', en: 'Phone', de: 'Telefon', it: 'Telefono', hu: 'Telefon' },
  lbl_contact_email: { da: 'E-mail', en: 'Email', de: 'E-Mail', it: 'E-mail', hu: 'E-mail' },
  lbl_contact_address: { da: 'Adresse', en: 'Address', de: 'Adresse', it: 'Indirizzo', hu: 'Cím' },
  lbl_contact_zip_city: { da: 'Postnr. og by', en: 'ZIP code and city', de: 'PLZ und Ort', it: 'CAP e città', hu: 'Irányítószám és város' },
  lbl_contact_postal_code: { da: 'Postnr.', en: 'ZIP code', de: 'PLZ', it: 'CAP', hu: 'Irányítószám' },
  lbl_contact_city: { da: 'By', en: 'City', de: 'Ort', it: 'Città', hu: 'Város' },
  lbl_tradefair: { da: 'Messe', en: 'Trade fair', de: 'Messe', it: 'Fiera', hu: 'Vásár' },
  lbl_country:   { da: 'Land', en: 'Country', de: 'Land', it: 'Paese', hu: 'Ország' },
  lbl_notes:     { da: 'Noter', en: 'Notes', de: 'Notizen', it: 'Note', hu: 'Megjegyzések' },
  lbl_budget:    { da: 'Budget-estimat (DKK)', en: 'Budget estimate (DKK)', de: 'Budget-Schätzung (DKK)', it: 'Stima budget (DKK)', hu: 'Költségvetés-becslés (DKK)' },
  lbl_move_work: { da: 'Flyt til arbejdsbudget (stk.)', en: 'Move to working forecast (qty)', de: 'In Arbeitsprognose verschieben (Stk.)', it: 'Sposta in previsione (pz.)', hu: 'Munka-előrejelzésbe (db)' },
  hlp_move_work: { da: 'Hvis > 0 tæller dette lead i Arbejdsbudget på maskine + forventet lukkedato. Påvirker IKKE pipeline.',
                   en: 'If > 0 this lead counts in Working forecast for machine + expected close date. Does NOT affect pipeline.',
                   de: 'Wenn > 0, zählt dieser Lead in Arbeitsprognose für Maschine + erwartetes Abschlussdatum. Beeinflusst NICHT die Pipeline.',
                   it: 'Se > 0 questo lead conta nella previsione di lavoro per macchina + data chiusura prevista. NON influisce sulla pipeline.',
                   hu: 'Ha > 0, a lead beleszámít a Munka-előrejelzésbe a gép + várható zárási dátum alapján. NEM befolyásolja a pipeline-t.' },
  lbl_probability:{ da: 'Sandsynlighed (%)', en: 'Probability (%)', de: 'Wahrscheinlichkeit (%)', it: 'Probabilità (%)', hu: 'Valószínűség (%)' },
  lbl_pipeline:  { da: 'Pipeline-stage', en: 'Pipeline stage', de: 'Pipeline-Phase', it: 'Fase pipeline', hu: 'Pipeline szakasz' },
  lbl_lost_to:   { da: 'Tabt til konkurrent', en: 'Lost to competitor', de: 'An Wettbewerber verloren', it: 'Perso a concorrente', hu: 'Versenytársnak veszítve' },
  lbl_lost_other:{ da: 'Anden konkurrent', en: 'Other competitor', de: 'Anderer Wettbewerber', it: 'Altro concorrente', hu: 'Más versenytárs' },
  lbl_lost_reason:{ da: 'Hvorfor mistede vi ordren', en: 'Why we lost the order', de: 'Warum wir den Auftrag verloren haben', it: 'Perché abbiamo perso', hu: 'Miért vesztettük el' },
  lbl_lost_comment:{ da: 'Kommentar', en: 'Comment', de: 'Kommentar', it: 'Commento', hu: 'Megjegyzés' },
  pick_files:    { da: 'Klik for at vælge filer eller træk dem hertil', en: 'Click to choose files or drop them here', de: 'Dateien wählen oder hierher ziehen', it: 'Clicca per scegliere file o trascinali qui', hu: 'Kattintson fájlt választani vagy húzza ide' },
  mine_dealers:  { da: 'Mine forhandlere', en: 'My dealers', de: 'Meine Händler', it: 'I miei rivenditori', hu: 'Kereskedőim' },
  other_dealers: { da: 'Andre forhandlere', en: 'Other dealers', de: 'Andere Händler', it: 'Altri rivenditori', hu: 'Más kereskedők' },
  loading_dealers:{ da: 'Henter forhandlere…', en: 'Loading dealers…', de: 'Händler laden…', it: 'Caricamento rivenditori…', hu: 'Kereskedők betöltése…' },
  no_match:      { da: 'Ingen match', en: 'No match', de: 'Kein Treffer', it: 'Nessuna corrispondenza', hu: 'Nincs találat' },
  search_dealer: { da: 'Søg forhandler, nr., by, land…', en: 'Search dealer, no., city, country…', de: 'Händler, Nr., Stadt, Land suchen…', it: 'Cerca rivenditore, n., città, paese…', hu: 'Keresés: kereskedő, szám, város, ország…' },
  val_title:     { da: 'Titel er påkrævet', en: 'Title is required', de: 'Titel ist erforderlich', it: 'Il titolo è obbligatorio', hu: 'A cím kötelező' },
  val_seller:    { da: 'Vælg en ansvarlig sælger.', en: 'Select a responsible seller.', de: 'Wählen Sie einen Verkäufer.', it: 'Selezionare un venditore.', hu: 'Válasszon felelős értékesítőt.' },
  val_dealer:    { da: 'Vælg en linket forhandler.', en: 'Select a linked dealer.', de: 'Wählen Sie einen verknüpften Händler.', it: 'Selezionare un rivenditore collegato.', hu: 'Válasszon kapcsolt kereskedőt.' },
  val_first:     { da: 'Vælg dato for første kontakt.', en: 'Select first contact date.', de: 'Datum des Erstkontakts wählen.', it: 'Selezionare la data del primo contatto.', hu: 'Válassza ki az első kapcsolat dátumát.' },
  val_close:     { da: 'Vælg forventet lukkedato.', en: 'Select expected close date.', de: 'Erwartetes Abschlussdatum wählen.', it: 'Selezionare la data di chiusura prevista.', hu: 'Válasszon várható zárási dátumot.' },
  val_followup:  { da: 'Vælg næste opfølgning.', en: 'Select next follow-up.', de: 'Nächste Nachverfolgung wählen.', it: 'Selezionare il prossimo follow-up.', hu: 'Válasszon következő utánkövetést.' },
  val_contact:   { da: 'Vælg kontakttype.', en: 'Select contact type.', de: 'Kontakttyp wählen.', it: 'Selezionare il tipo di contatto.', hu: 'Válasszon kapcsolattípust.' },
  val_customer:  { da: 'Vælg kundetype.', en: 'Select customer type.', de: 'Kundentyp wählen.', it: 'Selezionare il tipo di cliente.', hu: 'Válasszon ügyféltípust.' },
  val_next_act:  { da: 'Vælg næste aktivitet.', en: 'Select next activity.', de: 'Nächste Aktivität wählen.', it: 'Selezionare la prossima attività.', hu: 'Válasszon következő tevékenységet.' },
  val_required:  { da: 'Feltet er påkrævet.', en: 'This field is required.', de: 'Dieses Feld ist erforderlich.', it: 'Campo obbligatorio.', hu: 'Ez a mező kötelező.' },
  created_ok:    { da: 'Lead oprettet', en: 'Lead created', de: 'Lead erstellt', it: 'Lead creato', hu: 'Lead létrehozva' },
  created_err:   { da: 'Kunne ikke oprette lead', en: 'Could not create lead', de: 'Lead konnte nicht erstellt werden', it: 'Impossibile creare il lead', hu: 'Nem sikerült létrehozni a leadet' },
  edit_title:    { da: 'Rediger lead', en: 'Edit lead', de: 'Lead bearbeiten', it: 'Modifica lead', hu: 'Lead szerkesztése' },
  edit_sub:      { da: 'Opdater eksisterende lead i CRM.', en: 'Update existing CRM lead.', de: 'Bestehenden CRM-Lead aktualisieren.', it: 'Aggiorna il lead CRM esistente.', hu: 'Frissítse a meglévő CRM leadet.' },
  updated_ok:    { da: 'Leadet er opdateret.', en: 'Lead updated.', de: 'Lead aktualisiert.', it: 'Lead aggiornato.', hu: 'Lead frissítve.' },
  updated_err:   { da: 'Kunne ikke opdatere leadet.', en: 'Could not update lead.', de: 'Lead konnte nicht aktualisiert werden.', it: 'Impossibile aggiornare il lead.', hu: 'Nem sikerült frissíteni a leadet.' },
  save_changes:  { da: 'Gem ændringer', en: 'Save changes', de: 'Änderungen speichern', it: 'Salva modifiche', hu: 'Módosítások mentése' },
  loading:       { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
};
function tt(k: TKey, lang: Language): string { return T[k][lang] || T[k].en; }


// ---- Tiny shared form primitives (kept in this file to avoid extra files) ----
function Section({ title, subtitle, children, required }: { title: string; subtitle?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
      <header className="mb-5">
        <h3 className="text-[15px] font-semibold text-gray-900">
          {title} {required && <span className="text-rose-500">*</span>}
        </h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
function Field({ label, required, children, full, error }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean; error?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', full && 'md:col-span-2')}>
      <span className="text-[12px] font-medium text-gray-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {error && <span className="text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

type StructuredContactInfo = {
  company: string;
  contactPerson: string;
  address: string;
  postalCode: string;
  city: string;
  zipCity: string;
  phone: string;
  email: string;
  country: string;
};

function splitPostalCodeAndCity(value: string): { postalCode: string; city: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Z]{0,3}[-\s]?\d{3,6})\s+(.+)$/i);
  if (!match) return { postalCode: '', city: '' };
  return { postalCode: match[1].trim(), city: match[2].trim() };
}

function parseStructuredContactInformation(value: string, fallbackCountry: string): StructuredContactInfo {
  const info: StructuredContactInfo = {
    company: '',
    contactPerson: '',
    address: '',
    postalCode: '',
    city: '',
    zipCity: '',
    phone: '',
    email: '',
    country: '',
  };

  value.split(/\r?\n/).forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) return;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const fieldValue = line.slice(separatorIndex + 1).trim();
    if (!fieldValue) return;

    if (key.startsWith('firma')) info.company = fieldValue;
    else if (key.startsWith('kontaktperson')) info.contactPerson = fieldValue;
    else if (key.startsWith('adresse')) info.address = fieldValue;
    else if (key.startsWith('postnr') || key.includes('zip') || key.includes('plz')) {
      info.zipCity = fieldValue;
      const split = splitPostalCodeAndCity(fieldValue);
      info.postalCode = split.postalCode;
      info.city = split.city;
    }
    else if (key === 'by' || key === 'city' || key === 'ort') info.city = fieldValue;
    else if (key.startsWith('telefon') || key.startsWith('phone')) info.phone = fieldValue;
    else if (key.startsWith('e-mail') || key === 'email') info.email = fieldValue;
    else if (key.startsWith('land') || key === 'country') info.country = fieldValue;
  });

  if (!info.country && value.trim() && fallbackCountry) {
    info.country = fallbackCountry;
  }

  return info;
}

function buildStructuredContactInformation(info: StructuredContactInfo): string {
  const postalCode = info.postalCode.trim();
  const city = info.city.trim();
  const zipCity = info.zipCity.trim() || [postalCode, city].filter(Boolean).join(' ').trim();
  return [
    info.company.trim() ? `Firma/CVR: ${info.company.trim()}` : null,
    info.contactPerson.trim() ? `Kontaktperson: ${info.contactPerson.trim()}` : null,
    info.address.trim() ? `Adresse: ${info.address.trim()}` : null,
    zipCity ? `Postnr. og by: ${zipCity}` : null,
    info.phone.trim() ? `Telefon: ${info.phone.trim()}` : null,
    info.email.trim() ? `E-mail: ${info.email.trim()}` : null,
    info.country.trim() ? `Land: ${info.country.trim()}` : null,
  ].filter(Boolean).join('\n');
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none transition';
const inputErrorCls = 'border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-500/10';
const taCls = inputCls + ' min-h-[90px] resize-y';

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalIsoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function formatDateDisplay(value: string): string {
  const date = parseLocalIsoDate(value);
  if (!date) return value;
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('-');
}

function parseDateInput(value: string): string | null {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const danishMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!danishMatch) return null;
  const [, day, month, year] = danishMatch;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function addDaysToIsoDate(baseIso: string, days: number): string {
  const date = parseLocalIsoDate(baseIso) || new Date();
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function addMonthsToIsoDate(baseIso: string, months: number): string {
  const date = parseLocalIsoDate(baseIso) || new Date();
  date.setMonth(date.getMonth() + months);
  return toLocalIsoDate(date);
}

type DateQuickOption = {
  label: string;
  value: string;
};

function SmartDateField({
  label,
  required,
  value,
  onChange,
  options,
  full,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: DateQuickOption[];
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseLocalIsoDate(value);
  const today = toLocalIsoDate(new Date());

  function openDateOptions() {
    setOpen(true);
  }

  return (
    <Field label={label} required={required} full={full}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className="relative"
            onClick={openDateOptions}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') openDateOptions();
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd-mm-yyyy"
              className={cn(inputCls, 'pr-10 cursor-pointer')}
              value={formatDateDisplay(value)}
              onChange={(event) => onChange(parseDateInput(event.target.value) || event.target.value)}
              onClick={openDateOptions}
            />
            <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[290px] overflow-hidden p-0" align="start">
          <div className="grid grid-cols-2 gap-1 border-b border-slate-100 p-2 sm:grid-cols-3">
            {options.map((option) => (
              <Button
                key={option.label}
                type="button"
                variant={option.value === value ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-8 px-2 text-xs', option.value === value && 'bg-[#0b875b] hover:bg-[#08724e]')}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              onChange(toLocalIsoDate(date));
              setOpen(false);
            }}
            initialFocus
          />
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-slate-600"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Ryd
            </Button>
            <Button
              type="button"
              variant={value === today ? 'default' : 'ghost'}
              size="sm"
              className={cn('h-8 px-2 text-xs', value === today && 'bg-[#0b875b] hover:bg-[#08724e]')}
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
            >
              I dag
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

const TRADE_FAIR_OPTIONS = [
  { value: 'DemoPark', country: 'Tyskland' },
  { value: 'GaLaBau', country: 'Tyskland' },
  { value: 'Have & Landskab', country: 'Danmark' },
  { value: 'Maskiner Under Broen', country: 'Danmark' },
  { value: 'Other', country: null },
] as const;
const KNOWN_TRADE_FAIRS = TRADE_FAIR_OPTIONS.filter(o => o.value !== 'Other').map(o => o.value);
const COUNTRY_OPTIONS = ['Danmark', 'Tyskland', 'Other'] as const;
const CURRENT_YEAR = new Date().getFullYear();
const TRADE_FAIR_YEARS = Array.from({ length: 7 }, (_, index) => String(CURRENT_YEAR - 1 + index));

function splitTradeFairYear(value: string): { name: string; year: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*)\s+\((\d{4})\)$/);
  if (!match) return { name: trimmed, year: String(CURRENT_YEAR) };
  return { name: match[1].trim(), year: match[2] };
}

function buildTradeFairValue(name: string, year: string): string | null {
  const cleanName = name.trim();
  if (!cleanName) return null;
  return `${cleanName} (${year || CURRENT_YEAR})`;
}

function formatDkkEstimate(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `${Math.round(amount).toLocaleString('da-DK')},-`;
}

function parseDkkEstimate(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? String(Number(digits)) : '';
}

function MultiChip({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button type="button" key={o} onClick={() => onChange(active ? value.filter(v => v !== o) : [...value, o])}
            className={cn('text-[12px] px-2.5 py-1.5 rounded-lg border transition',
              active ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                     : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50')}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

const MACHINE_INTEREST_MAIN = [
  { label: 'RC-751', values: ['RC-751'] },
  { label: 'RC-1000s', values: ['RC-1000', 'RC-1000s'] },
  { label: 'Timan 2620', values: ['Timan 2620', 'New 2620'] },
  { label: 'Timan 3330', values: ['Timan 3330'] },
  { label: 'Loader line / traktor-redskaber', values: ['Loader line / Tractor Equipment'] },
] as const;

const MACHINE_INTEREST_EQUIPMENT = [
  {
    machine: 'RC-1000s',
    items: [
      'Slagleklipper inkl. Y-slagle sæt',
      'Rotorklipper 1350 mm',
      'Fingerklipper 1700 mm',
      'Skivehøster 1150mm',
      'Stubfræser m/hydraulisk sving',
      'V-plov m/gummiskær',
      'Centerdrevet fejemaskine',
      'Sneslynge 1100 mm',
      'WB-170 ukrudtsbørste basis enhed',
    ],
  },
  {
    machine: 'Timan 2620',
    items: ['Med kabine', 'Uden kabine', 'V-plov', 'Skovl', 'Skrabeblad/Dozerblad', 'DS-250 Saltspreder'],
  },
  {
    machine: 'Loader line / Tractor Equipment',
    groups: [
      {
        title: 'Loader line',
        items: [
          'CS-200 Valspreder, manuel reg. Inklusiv svingbar ophængs beslag',
          'CS-200 Combi, manuel reg. Inklusiv svingbar ophængs beslag til Weidemann',
          'CS-200 Combi, El. reg. Inklusiv svingbar ophængs beslag til Weidemann',
          'Timan hydr. fejemaskine D1316 med skrabeblad Ø600 mm børster',
          'Timan hydr. fejemaskine D1518 med skrabeblad Ø600 mm børster',
          'Flydende ophæng inklusiv 6/2 ventil til Weidemann',
          'Tornado 400 fejebredde 135 til 180 cm. 400 liter beholder, 50 liter vandtank',
        ],
      },
      {
        title: 'Tractor',
        items: [
          'CS-200 Valspreder, manuel reg.',
          'CS-200 Combi, manuel reg.',
          'CS-200 Combi, El. reg.',
        ],
      },
    ],
  },
  {
    machine: 'Timan 3330',
    groups: [
      {
        title: 'Feje/Sug Redskaber',
        items: [
          'T2 Opsamlingstank uden højtryksslange',
          'T2 Opsamlingstank inkl. højtryksrenser',
          'T3 Opsamlingstank med tørsug',
          'T3 Opsamlingstank med tørsug og højtryksrenser',
          'Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost',
        ],
      },
      { title: 'Ukrudtsbørste', items: ['WB-170 Ukrudtsbørste basisenhed'] },
      {
        title: 'Græs opgaver',
        items: [
          'Rotorklipper med 3 gatorknive og tilt-up, 135 cm klippebredde',
          'Rotorklipper 150 cm med hydraulisk højdejustering og tilt-up',
          'Rotorklipper 120 cm for opsamling til fejesugtank',
        ],
      },
      {
        title: 'Vinter redskaber',
        items: [
          'Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster',
          'V-plov 130-150 cm med gummiskær',
          'Dozerblad 130 cm med gummiskær',
          'Sneslynge, 110 cm arbejdsbredde',
          'CS-200 Valsespreder, for lad, manuel reg. Husk lad og vogn',
          'CS-200 Combi, for lad, manuel reg. Husk lad og vogn',
          'CS-200 Combi, for lad, el reg. Husk lad og vogn',
        ],
      },
      {
        title: 'Øvrige Redskaber',
        items: [
          'Fingerklipper for Termit-arm',
          'Multitrimmer for Termit-arm',
          'Skovl med hydraulisk tip',
          'Ramme for montering af udstyr bag - andre end Timan produkter',
          'Hurtigkobling for frontudstyr - andre end Timan produkter',
          'Fabriksmontering af centerslange for fejesug T2 og T3',
          'Ekstra vogn til afmontering af redskaber',
          'Ekstra lad med hydraulisk tip uden vogn',
          'Timan 3330 udvidet komponentgaranti med 12 mdr.',
        ],
      },
    ],
  },
] as const;

function equipmentValue(machine: string, item: string, group?: string): string {
  return group ? `Equipment: ${machine} - ${group} - ${item}` : `Equipment: ${machine} - ${item}`;
}

function MachineInterestPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggleValue = (item: string) => {
    onChange(value.includes(item) ? value.filter(v => v !== item) : [...value, item]);
  };
  const toggleMain = (entry: typeof MACHINE_INTEREST_MAIN[number]) => {
    const active = entry.values.some(v => value.includes(v));
    const without = value.filter(v => !(entry.values as readonly string[]).includes(v));
    onChange(active ? without : [...without, entry.values[0]]);
  };
  const knownEquipment = new Set<string>();
  for (const group of MACHINE_INTEREST_EQUIPMENT) {
    if ('groups' in group) {
      for (const sub of group.groups) for (const item of sub.items) knownEquipment.add(equipmentValue(group.machine, item, sub.title));
    } else {
      for (const item of group.items) knownEquipment.add(equipmentValue(group.machine, item));
    }
  }
  const knownMain = new Set<string>(MACHINE_INTEREST_MAIN.flatMap(m => [...m.values]));
  const otherSelected = value.filter(v => !knownMain.has(v) && !knownEquipment.has(v));
  const hasSelectedEquipmentContext = value.some(v => v.startsWith('Equipment:'))
    || value.some(v => ['RC-1000', 'RC-1000s', 'Timan 2620', 'New 2620', 'Timan 3330', 'Loader line / Tractor Equipment'].includes(v));
  const isEquipmentGroupActive = (machine: string) => {
    if (machine === 'RC-1000s') return value.includes('RC-1000') || value.includes('RC-1000s');
    if (machine === 'Timan 2620') return value.includes('Timan 2620') || value.includes('New 2620');
    if (machine === 'Timan 3330') return value.includes('Timan 3330');
    if (machine === 'Loader line / Tractor Equipment') return value.includes('Loader line / Tractor Equipment');
    return false;
  };
  const equipmentGroupClass = (active: boolean) => cn(
    'rounded-xl border p-3 shadow-sm transition',
    active
      ? 'border-emerald-700 bg-emerald-100/80 ring-2 ring-emerald-200'
      : 'border-slate-300 bg-white',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MACHINE_INTEREST_MAIN.map(entry => {
          const active = entry.values.some(v => value.includes(v));
          return (
            <button
              type="button"
              key={entry.label}
              onClick={() => toggleMain(entry)}
              className={cn('text-[12px] px-3 py-1.5 rounded-lg border transition',
                active ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                       : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50')}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <details className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3" open={hasSelectedEquipmentContext}>
        <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Redskaber under maskiner</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {MACHINE_INTEREST_EQUIPMENT.map(group => (
            <div key={group.machine} className={equipmentGroupClass(isEquipmentGroupActive(group.machine))}>
              <h4 className="mb-2 text-sm font-bold text-slate-900">{group.machine}</h4>
              {'groups' in group ? (
                <div className="space-y-3">
                  {group.groups.map(sub => (
                    <div key={sub.title} className="space-y-2">
                      <div className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{sub.title}</div>
                      {sub.items.map(item => {
                        const val = equipmentValue(group.machine, item, sub.title);
                        return (
                          <label key={val} className="flex items-start gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={value.includes(val)} onChange={() => toggleValue(val)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                            <span>{item}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {group.items.map(item => {
                    const val = equipmentValue(group.machine, item);
                    return (
                      <label key={val} className="flex items-start gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={value.includes(val)} onChange={() => toggleValue(val)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      {otherSelected.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <div className="mb-2 text-xs font-bold text-amber-900">Andre valgte CRM-interesser</div>
          <MultiChip options={otherSelected} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ---- Dealer picker option (mirrors Calendar behaviour) ----
interface DealerOption {
  value: string;          // dealer_accounts.id
  label: string;          // "Axima AB · 10239 · BP"
  searchKey: string;
  isMine: boolean;
  company_name: string;
  account_number: string;
}

function dealerToOption(d: DealerAccount, mine: boolean, liveInitials: string): DealerOption {
  const initials = liveInitials || d.assigned_seller_initials || '';
  const label = `${d.company_name} · ${d.account_number}${initials ? ` · ${initials}` : ''}`;
  return {
    value: d.id,
    label,
    searchKey: [d.company_name, d.account_number, d.city, d.country, initials].filter(Boolean).join(' ').toLowerCase(),
    isMine: mine,
    company_name: d.company_name,
    account_number: d.account_number,
  };
}

export default function CrmNewLeadPage() {
  const { appUser, loading: authLoading } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;
  const portalRole = derivePortalRole(appUser);
  const canCreate = isCrmAdmin(portalRole) || isScopedSeller(portalRole) || isExternalCrmRole(portalRole);

  // External users: dealer is auto-filled and locked.
  const isInternal = isCrmAdmin(portalRole) || isScopedSeller(portalRole);
  const lockedDealerNumber = !isInternal ? (appUser?.dealer_number ?? null) : null;

  const today = toLocalIsoDate(new Date());

  const [loadingLead, setLoadingLead] = useState(isEdit);
  const [editLeadNo, setEditLeadNo] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  // Responsible seller is now a dropdown (app_users id). Default = logged-in user.
  const [responsibleSellerId, setResponsibleSellerId] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState(appUser?.display_name || appUser?.email || '');
  const [linkedDealer, setLinkedDealer] = useState<string>(lockedDealerNumber || '');
  const [firstContact, setFirstContact] = useState(today);
  const [expectedClose, setExpectedClose] = useState(() => addMonthsToIsoDate(today, 6));
  const [nextFollowup, setNextFollowup] = useState(() => addDaysToIsoDate(today, 7));
  const [expectedCloseChanged, setExpectedCloseChanged] = useState(isEdit);
  const [nextFollowupChanged, setNextFollowupChanged] = useState(isEdit);

  const [machineTypes, setMachineTypes] = useState<string[]>([]);
  const [nextActivity, setNextActivity] = useState<string>('');
  const [demoHasRun, setDemoHasRun] = useState<'yes' | 'no'>('no');
  const [contactType, setContactType] = useState<string>('');
  const [customerType, setCustomerType] = useState<string>('');

  const [contactCompany, setContactCompany] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [contactPostalCode, setContactPostalCode] = useState('');
  const [contactCity, setContactCity] = useState('');
  const [tradeFairChoice, setTradeFairChoice] = useState('');
  const [tradeFair, setTradeFair] = useState('');
  const [tradeFairYear, setTradeFairYear] = useState(String(CURRENT_YEAR));
  const [countryChoice, setCountryChoice] = useState<(typeof COUNTRY_OPTIONS)[number]>('Danmark');
  const [country, setCountry] = useState('Danmark');
  const [notes, setNotes] = useState('');
  const [estimatedValue, setEstimatedValue] = useState<string>('');
  const [loadedEstimatedValue, setLoadedEstimatedValue] = useState<string | null>(null);
  const [machineTypesChanged, setMachineTypesChanged] = useState(false);
  const [probability, setProbability] = useState<string>('25');
  const [moveToWorking, setMoveToWorking] = useState<string>('');
  const [stage, setStage] = useState<PipelineStage>('Lead');

  const [lostCompetitor, setLostCompetitor] = useState<string>('');
  const [lostCompetitorCustom, setLostCompetitorCustom] = useState('');
  const [lostReason, setLostReason] = useState<string>('');
  const [lostComment, setLostComment] = useState('');

  const [files, setFiles] = useState<CrmLeadAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Phase 33 — configurator quotes linked to this lead (edit mode only).
  const [linkedQuotes, setLinkedQuotes] = useState<CrmLeadQuoteRow[]>([]);
  const [currentShareUser, setCurrentShareUser] = useState<LeadShareTarget | null>(null);
  const [leadShares, setLeadShares] = useState<CrmLeadShare[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<LeadShareTarget[]>([]);
  const [shareTargetId, setShareTargetId] = useState('');
  const [shareIncludeEmail, setShareIncludeEmail] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<OrdinaryCrmLeadRequiredField, string>>>({});

  // Dealer picker state
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sellers (Timan Sælger / Timan Backend) for the responsible-seller dropdown.
  const [sellers, setSellers] = useState<BackendUser[]>([]);

  useEffect(() => {
    if (appUser && !responsibleName) setResponsibleName(appUser.display_name || appUser.email);
  }, [appUser, responsibleName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await resolveAppUserByEmail(appUser?.email);
      if (!cancelled) setCurrentShareUser(user);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email]);

  // Load dealer_accounts (same as Calendar) + sellers list.
  useEffect(() => {
    let cancelled = false;
    setDealersLoading(true);
    fetchDealerAccounts({ includeDeleted: false })
      .then(res => { if (!cancelled) setDealers(res.rows); })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setDealersLoading(false); });
    fetchBackendUsers()
      .then(res => {
        if (cancelled) return;
        const list = res.users
          .filter(u => (u.role === 'timan_seller' || u.role === 'timan_backend') && u.status === 'active')
          .sort((a, b) => (a.initials || '').localeCompare(b.initials || ''));
        setSellers(list);
      })
      .catch(() => { /* keep empty */ });
    return () => { cancelled = true; };
  }, []);

  // Auto-select the logged-in user as responsible seller once sellers load.
  useEffect(() => {
    if (isEdit) return; // never override loaded values when editing
    if (responsibleSellerId) return;
    if (!sellers.length || !appUser?.email) return;
    const me = sellers.find(s => (s.email || '').toLowerCase() === appUser.email.toLowerCase());
    if (me) {
      setResponsibleSellerId(me.id);
      setResponsibleName(me.name || me.email);
    }
  }, [sellers, appUser?.email, responsibleSellerId, isEdit]);

  useEffect(() => {
    if (isEdit || !lockedDealerNumber || !dealers.length) return;
    if (linkedDealer && linkedDealer !== lockedDealerNumber) return;
    const ownDealer = dealers.find((dealer) => dealer.account_number === lockedDealerNumber);
    if (!ownDealer) return;

    setLinkedDealer(ownDealer.id);
    if (responsibleSellerId) return;

    const assignedSeller = sellers.find((seller) =>
      (!!ownDealer.assigned_seller_id && seller.id === ownDealer.assigned_seller_id)
      || (!!ownDealer.assigned_seller_email && seller.email.toLowerCase() === ownDealer.assigned_seller_email.toLowerCase())
    );
    if (assignedSeller) {
      setResponsibleSellerId(assignedSeller.id);
      setResponsibleName(assignedSeller.name || assignedSeller.email);
    }
  }, [dealers, isEdit, linkedDealer, lockedDealerNumber, responsibleSellerId, sellers]);

  // Load existing lead when in edit mode.
  useEffect(() => {
    if (!isEdit || !editId) return;
    let cancelled = false;
    (async () => {
      const lead = await getLead(editId);
      if (cancelled || !lead) { setLoadingLead(false); return; }
      setEditLeadNo(typeof lead.lead_no === 'number' ? lead.lead_no : null);
      setTitle(lead.title || '');
      setResponsibleSellerId(lead.owner_user_id || '');
      setResponsibleName(lead.owner_name || '');
      setLinkedDealer(lead.linked_dealer_id || '');
      setFirstContact(lead.first_contact_date || '');
      setExpectedClose(lead.expected_close_date || '');
      setNextFollowup(lead.next_followup_date || '');
      setExpectedCloseChanged(true);
      setNextFollowupChanged(true);
      setMachineTypes(lead.machine_types || []);
      setNextActivity(lead.next_activity || '');
      setDemoHasRun(lead.demo_has_run || 'no');
      setContactType(lead.contact_type || '');
      setCustomerType(lead.customer_type || '');
      const parsedContact = parseStructuredContactInformation(lead.contact_information || '', lead.country || '');
      setContactCompany(parsedContact.company);
      setContactPersonName(parsedContact.contactPerson);
      setContactPhone(parsedContact.phone);
      setContactEmail(parsedContact.email);
      setContactAddress(parsedContact.address);
      setContactPostalCode(parsedContact.postalCode);
      setContactCity(parsedContact.city || (!parsedContact.postalCode ? parsedContact.zipCity : ''));
      const parsedTradeFair = splitTradeFairYear(lead.trade_fair || '');
      if ((KNOWN_TRADE_FAIRS as readonly string[]).includes(parsedTradeFair.name)) {
        setTradeFairChoice(parsedTradeFair.name);
        setTradeFair(parsedTradeFair.name);
      } else if (parsedTradeFair.name) {
        setTradeFairChoice('Other');
        setTradeFair(parsedTradeFair.name);
      } else {
        setTradeFairChoice('');
        setTradeFair('');
      }
      setTradeFairYear(parsedTradeFair.year);
      const loadedCountry = lead.country || parsedContact.country || 'Danmark';
      if (loadedCountry === 'Danmark' || loadedCountry === 'Tyskland') {
        setCountryChoice(loadedCountry);
      } else {
        setCountryChoice('Other');
      }
      setCountry(loadedCountry);
      setNotes(lead.notes || '');
      const savedEstimatedValue = lead.estimated_value != null ? String(lead.estimated_value) : '';
      setLoadedEstimatedValue(savedEstimatedValue);
      setMachineTypesChanged(false);
      setEstimatedValue(savedEstimatedValue);
      setProbability(lead.probability != null ? String(lead.probability) : '');
      setMoveToWorking(typeof lead.move_to_working_qty === 'number' && lead.move_to_working_qty > 0
        ? String(lead.move_to_working_qty) : '');
      setStage((lead.pipeline_stage as PipelineStage) || 'Lead');
      setLostCompetitor(lead.lost_competitor || '');
      setLostReason(lead.lost_reason || '');
      setLostComment(lead.lost_comment || '');
      setFiles(lead.attachments || []);
      setLoadingLead(false);
    })();
    return () => { cancelled = true; };
  }, [isEdit, editId]);

  useEffect(() => {
    if (!isEdit || !editId) return;
    let cancelled = false;
    (async () => {
      const rows = await listLeadShares(editId);
      if (!cancelled) setLeadShares(rows);
    })();
    return () => { cancelled = true; };
  }, [isEdit, editId]);

  // Phase 33 — load configurator quotes linked to this lead.
  useEffect(() => {
    if (!isEdit || !editId) return;
    let cancelled = false;
    (async () => {
      const { rows } = await listConfigurationsForLead(editId);
      if (!cancelled) setLinkedQuotes(rows);
    })();
    return () => { cancelled = true; };
  }, [isEdit, editId]);

  const sellerDir = useSellerDirectory();
  const { mineOptions, otherOptions, allOptions } = useMemo(() => {
    const selectedSeller = sellers.find(s => s.id === responsibleSellerId);
    const mineEmail = (selectedSeller?.email || appUser?.email || '').toLowerCase();
    const mineInitials = (selectedSeller?.initials || '').toUpperCase();
    const opts: DealerOption[] = dealers.map(d => {
      const de = (d.assigned_seller_email || '').toLowerCase();
      const mine = (mineEmail !== '' && de === mineEmail)
        || (mineInitials !== '' && sellerInitialsMatch(d.assigned_seller_initials, mineInitials));
      const liveInitials = resolveDealerSellerInitials(d, sellerDir);
      return dealerToOption(d, mine, liveInitials);
    });
    const mine = opts.filter(o => o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    const others = opts.filter(o => !o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    return { mineOptions: mine, otherOptions: others, allOptions: opts };
  }, [dealers, appUser, sellers, responsibleSellerId, sellerDir]);

  const selectedDealer = allOptions.find(o => o.value === linkedDealer) || null;
  const dealerTriggerLabel = selectedDealer
    ? selectedDealer.label
    : (linkedDealer ? linkedDealer : tt('ph_dealer', lang));

  const firstContactQuickOptions: DateQuickOption[] = [
    { label: '-1 dag', value: addDaysToIsoDate(today, -1) },
    { label: 'I dag', value: today },
    { label: '+1 dag', value: addDaysToIsoDate(today, 1) },
  ];
  const relativeDateBase = firstContact || today;
  const relativeDateQuickOptions: DateQuickOption[] = [
    { label: '+1 uge', value: addDaysToIsoDate(relativeDateBase, 7) },
    { label: '+1 måned', value: addMonthsToIsoDate(relativeDateBase, 1) },
    { label: '+3 måneder', value: addMonthsToIsoDate(relativeDateBase, 3) },
    { label: '+6 måneder', value: addMonthsToIsoDate(relativeDateBase, 6) },
  ];

  const isLost = nextActivity === NEXT_ACTIVITY_LOST || stage === 'Lost';
  const shareDirection = isInternal ? 'timan_to_dealer' : 'dealer_to_timan';
  const shareButtonLabel = isInternal ? 'Del med forhandler' : 'Del med Timan';
  const selectedShareTarget = shareTargets.find((target) => target.id === shareTargetId) || null;

  const machineEstimate = useMemo(() => {
    const estimate = calculateMachineInterestEstimate(machineTypes, 'da');
    return {
      value: estimate.total > 0 ? String(estimate.total) : '',
      unmappedItems: estimate.unmappedItems,
      pricedItems: estimate.pricedItems,
    };
  }, [machineTypes]);
  const structuredContactInfo = useMemo<StructuredContactInfo>(() => {
    const postalCode = contactPostalCode.trim();
    const city = contactCity.trim();
    return {
      company: contactCompany,
      contactPerson: contactPersonName,
      address: contactAddress,
      postalCode: contactPostalCode,
      city: contactCity,
      zipCity: [postalCode, city].filter(Boolean).join(' '),
      phone: contactPhone,
      email: contactEmail,
      country,
    };
  }, [contactCompany, contactPersonName, contactAddress, contactPostalCode, contactCity, contactPhone, contactEmail, country]);
  const isLeadFormReady = Boolean(
    title.trim()
    && responsibleSellerId
    && linkedDealer
    && firstContact
    && expectedClose
    && nextFollowup
    && nextActivity
    && contactType
    && customerType
    && machineTypes.length > 0
    && contactCompany.trim()
    && contactPersonName.trim()
    && contactPhone.trim()
    && contactEmail.trim()
    && contactPostalCode.trim()
    && contactCity.trim()
    && country.trim()
  );
  const fieldError = (field: OrdinaryCrmLeadRequiredField) => fieldErrors[field];
  const requiredInputClass = (field: OrdinaryCrmLeadRequiredField) => cn(inputCls, fieldError(field) && inputErrorCls);
  const clearFieldError = (field: OrdinaryCrmLeadRequiredField) => {
    if (!fieldErrors[field]) return;
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    const hasMeaningfulSavedEstimate = isEdit
      && !machineTypesChanged
      && loadedEstimatedValue != null
      && Number(loadedEstimatedValue) > 0;
    if (hasMeaningfulSavedEstimate) return;
    setEstimatedValue(machineEstimate.value);
  }, [isEdit, loadedEstimatedValue, machineEstimate.value, machineTypesChanged]);

  function handleFirstContactChange(value: string) {
    const baseDate = value || today;
    setFirstContact(value);
    if (!expectedCloseChanged) setExpectedClose(addMonthsToIsoDate(baseDate, 6));
    if (!nextFollowupChanged) setNextFollowup(addDaysToIsoDate(baseDate, 7));
  }

  function handleExpectedCloseChange(value: string) {
    setExpectedCloseChanged(true);
    setExpectedClose(value);
  }

  function handleNextFollowupChange(value: string) {
    setNextFollowupChanged(true);
    setNextFollowup(value);
  }

  function handleMachineTypesChange(next: string[]) {
    setMachineTypesChanged(true);
    setMachineTypes(next);
    if (next.length > 0) clearFieldError('machineTypes');
  }

  useEffect(() => {
    let cancelled = false;
    const images = getLeadImageAttachments(files);
    if (images.length === 0) {
      setAttachmentPreviewUrls({});
      return;
    }
    (async () => {
      const previews = await getLeadAttachmentSignedUrls(images);
      if (cancelled) return;
      setAttachmentPreviewUrls(Object.fromEntries(previews.map((attachment) => [attachment.storage_path, attachment.signed_url])));
    })();
    return () => { cancelled = true; };
  }, [files]);

  function handleTradeFairChoiceChange(value: string) {
    setTradeFairChoice(value);
    if (value === 'Other') {
      setTradeFair('');
      return;
    }
    setTradeFair(value);
    const preset = TRADE_FAIR_OPTIONS.find(option => option.value === value);
    if (preset?.country) {
      setCountryChoice(preset.country);
      setCountry(preset.country);
    }
  }

  function handleCountryChoiceChange(value: (typeof COUNTRY_OPTIONS)[number]) {
    setCountryChoice(value);
    setCountry(value === 'Other' ? '' : value);
    if (value !== 'Other') clearFieldError('country');
  }

  // Auto-derive probability + legacy pipeline stage from next_activity selection.
  function handleNextActivityChange(na: string) {
    setNextActivity(na);
    if (na) {
      setProbability(String(nextActivityToProbability(na)));
      setStage(deriveLegacyPipelineStage(na));
    }
  }

  useEffect(() => {
    if (!shareDialogOpen || !linkedDealer) return;
    let cancelled = false;
    setShareLoading(true);
    setShareError(null);
    setShareTargets([]);
    setShareTargetId('');
    (async () => {
      const targets = isInternal
        ? await listActiveDealerLeadShareTargets(linkedDealer)
        : await getResponsibleTimanSellerTarget(linkedDealer).then((target) => target ? [target] : []);
      if (cancelled) return;
      setShareTargets(targets);
      setShareTargetId(targets[0]?.id || '');
      if (targets.length === 0) {
        setShareError(isInternal
          ? 'Der er ingen aktive brugere på den valgte forhandler.'
          : 'Der er ikke fundet en ansvarlig Timan-sælger på forhandleren.');
      }
      setShareLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setShareError('Kunne ikke hente modtagere til deling.');
      setShareLoading(false);
    });
    return () => { cancelled = true; };
  }, [shareDialogOpen, linkedDealer, isInternal]);

  async function handleShareLead() {
    if (!editId || !selectedShareTarget) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const saved = await shareLead({
        leadId: editId,
        sharedBy: currentShareUser,
        target: selectedShareTarget,
        dealerAccountId: linkedDealer || null,
        direction: shareDirection,
        includeEmail: shareIncludeEmail,
      });
      const rows = await listLeadShares(editId);
      setLeadShares(rows.some((row) => row.id === saved.id) ? rows : [saved, ...rows]);
      setShareDialogOpen(false);
      toast.success(shareIncludeEmail ? 'Lead delt. Mail åbnes nu.' : 'Lead delt i portalen.');
      if (shareIncludeEmail && selectedShareTarget.email) {
        const leadTitle = title || (editLeadNo != null ? formatLeadNo(editLeadNo) : 'Lead');
        window.location.href = leadShareMailto({
          targetEmail: selectedShareTarget.email,
          leadTitle,
          leadUrl: `${window.location.origin}/portal/crm/leads/${editId}`,
          senderName: currentShareUser?.name || appUser?.display_name || appUser?.email,
        });
      }
    } catch (error) {
      console.error(error);
      setShareError('Kunne ikke dele leadet.');
      toast.error('Kunne ikke dele leadet');
    } finally {
      setShareLoading(false);
    }
  }

  if (!authLoading && !canCreate && !isEdit) return <Navigate to="/portal/crm" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim())       { toast.error(tt('val_title', lang)); return; }
    if (!responsibleSellerId){ toast.error(tt('val_seller', lang)); return; }
    if (!linkedDealer)       { toast.error(tt('val_dealer', lang)); return; }
    if (!firstContact)       { toast.error(tt('val_first', lang)); return; }
    if (!expectedClose)      { toast.error(tt('val_close', lang)); return; }
    if (!nextFollowup)       { toast.error(tt('val_followup', lang)); return; }
    if (!contactType)        { toast.error(tt('val_contact', lang)); return; }
    if (!customerType)       { toast.error(tt('val_customer', lang)); return; }
    if (!nextActivity)       { toast.error(tt('val_next_act', lang)); return; }
    const missingFields = getMissingOrdinaryCrmLeadFields({
      machineTypes,
      contactCompany,
      contactPersonName,
      contactPhone,
      contactEmail,
      contactPostalCode,
      contactCity,
      country,
    });
    if (missingFields.length > 0) {
      setFieldErrors(
        Object.fromEntries(missingFields.map((field) => [field, tt('val_required', lang)])) as Partial<Record<OrdinaryCrmLeadRequiredField, string>>
      );
      toast.error(tt('val_required', lang));
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      // Use the explicitly chosen responsible seller (allows handover),
      // fall back to the logged-in user if for some reason it's missing.
      const chosen = sellers.find(s => s.id === responsibleSellerId);
      const sellerId = chosen?.id || (await resolveSellerId(appUser?.email));
      const contactInformation = buildStructuredContactInformation(structuredContactInfo);
      const payload = {
        title: title.trim(),
        owner_user_id: sellerId,
        owner_name: chosen?.name || responsibleName || null,
        linked_dealer_id: linkedDealer,
        first_contact_date: firstContact || null,
        expected_close_date: expectedClose || null,
        next_followup_date: nextFollowup || null,
        machine_types: machineTypes,
        next_activity: nextActivity,
        demo_has_run: demoHasRun,
        contact_type: contactType,
        customer_type: customerType,
        contact_information: contactInformation || null,
        trade_fair: buildTradeFairValue(tradeFair, tradeFairYear),
        country: country || null,
        notes: notes || null,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        probability: probability ? Number(probability) : null,
        move_to_working_qty: moveToWorking ? Math.max(0, Math.floor(Number(moveToWorking) || 0)) : 0,
        pipeline_stage: stage,
        lost_competitor: isLost ? (lostCompetitor === 'Andre' ? (lostCompetitorCustom || 'Andre') : lostCompetitor) || null : null,
        lost_reason: isLost ? (lostReason || null) : null,
        lost_comment: isLost ? (lostComment || null) : null,
        attachments: files,
        status: 'open',
        // Phase 40 — required fields are validated above, so a successful
        // save here means the lead is no longer "incomplete from configurator".
        incomplete_from_configurator: false,
      };
      let savedLeadId = editId || '';
      if (isEdit && editId) {
        await updateLead(editId, payload);
        savedLeadId = editId;
        toast.success(tt('updated_ok', lang));
      } else {
        const created = await createLead(payload, { requireRemote: pendingFiles.length > 0 });
        savedLeadId = created.id;
        toast.success(tt('created_ok', lang));
      }
      if (pendingFiles.length > 0) {
        const uploadedAttachments = await uploadLeadAttachments(savedLeadId, pendingFiles);
        if (uploadedAttachments.length > 0) {
          const nextAttachments = [...files, ...uploadedAttachments];
          await updateLead(savedLeadId, { attachments: nextAttachments });
          setFiles(nextAttachments);
          setPendingFiles([]);
        }
      }
      navigate('/portal/crm');
    } catch (err) {
      console.error(err);
      toast.error(tt(isEdit ? 'updated_err' : 'created_err', lang));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CrmLayout pageTitle={isEdit ? tt('edit_title', lang) : tt('page_title', lang)}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 inline-flex items-center gap-2.5">
              {isEdit ? tt('edit_title', lang) : tt('page_title', lang)}
              {isEdit && editLeadNo != null && (
                <span className="font-mono text-xs text-slate-500 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                  {formatLeadNo(editLeadNo)}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{isEdit ? tt('edit_sub', lang) : tt('page_sub', lang)}</p>
          </div>
        </div>

        {loadingLead ? (
          <p className="text-sm text-gray-500 p-8">{tt('loading', lang)}</p>
        ) : (
        <form onSubmit={handleSubmit}>
          <Section title={tt('sec_basic', lang)} subtitle={tt('sec_basic_sub', lang)}>
            {/* form sections below */}
            <Field label={tt('lbl_title', lang)} required full>
              <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder={tt('ph_title', lang)} />
            </Field>
            <Field label={tt('lbl_seller', lang)} required>
              <select
                className={inputCls}
                value={responsibleSellerId}
                onChange={e => {
                  const id = e.target.value;
                  setResponsibleSellerId(id);
                  const s = sellers.find(x => x.id === id);
                  setResponsibleName(s ? (s.name || s.email) : '');
                }}
              >
                <option value="">{tt('ph_seller', lang)}</option>
                {sellers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.initials ? `${s.initials} - ${s.name || s.email}` : (s.name || s.email)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tt('lbl_dealer', lang)} required>
              {lockedDealerNumber ? (
                <div className={cn(inputCls, 'flex items-center justify-between bg-gray-50 text-gray-700')}>
                  <span className="truncate">{selectedDealer?.label || lockedDealerNumber}</span>
                  <Lock className="h-3.5 w-3.5 text-gray-400 ml-2 shrink-0" />
                </div>
              ) : (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'w-full justify-between font-normal h-10 rounded-xl border-gray-200',
                        !linkedDealer && 'text-gray-400'
                      )}
                    >
                      <span className="truncate text-left">{dealerTriggerLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                    <Command
                      filter={(value, search) => {
                        const opt = allOptions.find(o => o.value === value);
                        const hay = opt ? opt.searchKey : value.toLowerCase();
                        return hay.includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder={tt('search_dealer', lang)} />
                      <CommandList>
                        <CommandEmpty>{dealersLoading ? tt('loading_dealers', lang) : tt('no_match', lang)}</CommandEmpty>

                        {mineOptions.length > 0 && (
                          <CommandGroup heading={tt('mine_dealers', lang)}>
                            {mineOptions.map(o => (
                              <CommandItem
                                key={o.value}
                                value={o.value}
                                onSelect={() => { setLinkedDealer(o.value); setPickerOpen(false); }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', linkedDealer === o.value ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{o.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}

                        {otherOptions.length > 0 && (
                          <CommandGroup heading={tt('other_dealers', lang)}>
                            {otherOptions.map(o => (
                              <CommandItem
                                key={o.value}
                                value={o.value}
                                onSelect={() => { setLinkedDealer(o.value); setPickerOpen(false); }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', linkedDealer === o.value ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{o.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </Field>
            <SmartDateField
              label={tt('lbl_first_contact', lang)}
              required
              value={firstContact}
              onChange={handleFirstContactChange}
              options={firstContactQuickOptions}
            />
            <SmartDateField
              label={tt('lbl_expected_close', lang)}
              required
              value={expectedClose}
              onChange={handleExpectedCloseChange}
              options={relativeDateQuickOptions}
            />
            <SmartDateField
              label={tt('lbl_next_followup', lang)}
              required
              full
              value={nextFollowup}
              onChange={handleNextFollowupChange}
              options={relativeDateQuickOptions}
            />
          </Section>

          <Section title={tt('sec_contact_info_structured', lang)} subtitle={tt('sec_contact_info_structured_sub', lang)}>
            <Field label={tt('lbl_contact_company', lang)} required error={fieldError('contactCompany')}>
              <input
                className={requiredInputClass('contactCompany')}
                value={contactCompany}
                onChange={e=>{
                  setContactCompany(e.target.value);
                  if (e.target.value.trim()) clearFieldError('contactCompany');
                }}
              />
            </Field>
            <Field label={tt('lbl_contact_person', lang)} required error={fieldError('contactPersonName')}>
              <input
                className={requiredInputClass('contactPersonName')}
                value={contactPersonName}
                onChange={e=>{
                  setContactPersonName(e.target.value);
                  if (e.target.value.trim()) clearFieldError('contactPersonName');
                }}
              />
            </Field>
            <Field label={tt('lbl_contact_phone', lang)} required error={fieldError('contactPhone')}>
              <input
                type="tel"
                className={requiredInputClass('contactPhone')}
                value={contactPhone}
                onChange={e=>{
                  setContactPhone(e.target.value);
                  if (e.target.value.trim()) clearFieldError('contactPhone');
                }}
              />
            </Field>
            <Field label={tt('lbl_contact_email', lang)} required error={fieldError('contactEmail')}>
              <input
                type="email"
                className={requiredInputClass('contactEmail')}
                value={contactEmail}
                onChange={e=>{
                  setContactEmail(e.target.value);
                  if (e.target.value.trim()) clearFieldError('contactEmail');
                }}
              />
            </Field>
            <Field label={tt('lbl_contact_address', lang)} full>
              <input className={inputCls} value={contactAddress} onChange={e=>setContactAddress(e.target.value)} />
            </Field>
            <Field label={tt('lbl_contact_postal_code', lang)} required error={fieldError('contactPostalCode')}>
              <input
                className={requiredInputClass('contactPostalCode')}
                value={contactPostalCode}
                onChange={e=>{
                  setContactPostalCode(e.target.value);
                  if (e.target.value.trim()) clearFieldError('contactPostalCode');
                }}
              />
            </Field>
            <Field label={tt('lbl_contact_city', lang)} required error={fieldError('contactCity')}>
              <input
                className={requiredInputClass('contactCity')}
                value={contactCity}
                onChange={e=>{
                  setContactCity(e.target.value);
                  if (e.target.value.trim()) clearFieldError('contactCity');
                }}
              />
            </Field>
            <Field label={tt('lbl_country', lang)} required full error={fieldError('country')}>
              <input
                className={requiredInputClass('country')}
                value={country}
                onChange={e=>{
                  const nextCountry = e.target.value;
                  setCountry(nextCountry);
                  if (nextCountry.trim()) clearFieldError('country');
                  if (nextCountry === 'Danmark' || nextCountry === 'Tyskland') {
                    setCountryChoice(nextCountry);
                  } else {
                    setCountryChoice('Other');
                  }
                }}
              />
            </Field>
          </Section>

          <Section title={tt('sec_machines', lang)} subtitle={tt('sec_machines_sub', lang)} required>
            <div className="md:col-span-2">
              <div className={cn('rounded-xl', fieldError('machineTypes') && 'ring-2 ring-rose-300 ring-offset-2')}>
                <MachineInterestPicker value={machineTypes} onChange={handleMachineTypesChange} />
              </div>
              {fieldError('machineTypes') && (
                <p className="mt-2 text-[11px] font-medium text-rose-600">{fieldError('machineTypes')}</p>
              )}
              {machineEstimate.unmappedItems.length > 0 && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Kunne ikke matche pris for: {machineEstimate.unmappedItems.join(', ')}
                </p>
              )}
            </div>
          </Section>

          <Section title={tt('sec_next_act', lang)}>
            <Field label={tt('lbl_next_activity', lang)} required full>
              <select className={inputCls} value={nextActivity} onChange={e=>handleNextActivityChange(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {NEXT_ACTIVITY_OPTIONS
                  .filter(o => o !== 'Closed with order' && o !== 'Closed without order')
                  .slice()
                  .sort((a, b) => nextActivityToProbability(a) - nextActivityToProbability(b))
                  .map(o => <option key={o} value={o}>{o} — {nextActivityToProbability(o)}%</option>)}
                {/* Preserve current value if it's a closed status (legacy/edited lead) so it still displays */}
                {(nextActivity === 'Closed with order' || nextActivity === 'Closed without order') && (
                  <option value={nextActivity}>{nextActivity}</option>
                )}
              </select>
            </Field>
          </Section>

          <Section title={tt('sec_demo', lang)}>
            <Field label={tt('lbl_demo_held', lang)}>
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setDemoHasRun(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      demoHasRun===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes' ? tt('yes', lang) : tt('no', lang)}
                  </button>
                ))}
              </div>
            </Field>
            {demoHasRun === 'yes' && (
              <Field label={tt('lbl_convert', lang)}>
                <Link to="/portal/crm/demo-leads/new" className="inline-flex items-center gap-1.5 text-sm text-[#2d5a27] hover:underline self-start mt-1">
                  {tt('cta_convert', lang)}
                </Link>
              </Field>
            )}
          </Section>

          <Section title={tt('sec_contact_cust', lang)}>
            <Field label={tt('lbl_contact_type', lang)} required>
              <select className={inputCls} value={contactType} onChange={e=>setContactType(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label={tt('lbl_customer_type', lang)} required>
              <select className={inputCls} value={customerType} onChange={e=>setCustomerType(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {CUSTOMER_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          <Section title={tt('sec_details', lang)}>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
              <Field label={tt('lbl_tradefair', lang)}>
                <select className={inputCls} value={tradeFairChoice} onChange={e=>handleTradeFairChoiceChange(e.target.value)}>
                  <option value="">{tt('pick', lang)}</option>
                  {TRADE_FAIR_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.value}</option>
                  ))}
                </select>
              </Field>
              <Field label={tt('lbl_country', lang)} required error={fieldError('country')}>
                <select className={requiredInputClass('country')} value={countryChoice} onChange={e=>handleCountryChoiceChange(e.target.value as (typeof COUNTRY_OPTIONS)[number])}>
                  {COUNTRY_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="År">
                <select className={inputCls} value={tradeFairYear} onChange={e=>setTradeFairYear(e.target.value)}>
                  {TRADE_FAIR_YEARS.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </Field>
              {tradeFairChoice === 'Other' && (
                <Field label="Messenavn" full>
                  <input className={inputCls} value={tradeFair} onChange={e=>setTradeFair(e.target.value)} placeholder="Skriv messens navn" />
                </Field>
              )}
              {countryChoice === 'Other' && (
                <Field label="Land" required full error={fieldError('country')}>
                  <input
                    className={requiredInputClass('country')}
                    value={country}
                    onChange={e=>{
                      setCountry(e.target.value);
                      if (e.target.value.trim()) clearFieldError('country');
                    }}
                    placeholder="Skriv land"
                  />
                </Field>
              )}
            </div>
            <Field label={tt('lbl_notes', lang)} full>
              <textarea className={taCls} value={notes} onChange={e=>setNotes(e.target.value)} />
            </Field>
            <Field label={tt('lbl_budget', lang)}>
              <input
                type="text"
                inputMode="numeric"
                className={inputCls}
                value={formatDkkEstimate(estimatedValue)}
                onChange={e=>setEstimatedValue(parseDkkEstimate(e.target.value))}
                placeholder="0,-"
              />
            </Field>
            <Field label={tt('lbl_move_work', lang).replace(/\s*\([^)]*\)$/, '?')}>
              <div className="flex gap-2">
                {(['1',''] as const).map(v => {
                  const active = (moveToWorking ? '1' : '') === v;
                  return (
                    <button
                      type="button"
                      key={v || '0'}
                      onClick={() => setMoveToWorking(v)}
                      className={cn('px-4 py-2 rounded-xl text-sm border transition',
                        active ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}
                    >
                      {v ? tt('yes', lang) : tt('no', lang)}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                {lang === 'da'
                  ? 'Ja fordeler leadet i Arbejdsbudget pr. valgt maskine/redskab på forventet lukkedato. Påvirker IKKE pipeline.'
                  : tt('hlp_move_work', lang)}
              </p>
            </Field>
            <Field label={tt('lbl_probability', lang)}>
              <input type="number" min={0} max={100} className={inputCls} value={probability} onChange={e=>setProbability(e.target.value)} />
            </Field>
            {/* Pipeline-stage is no longer manually editable — derived from Næste aktivitet. */}
          </Section>

          {isLost && (
            <section className="bg-rose-50/40 rounded-2xl border border-rose-100 shadow-sm p-6 mb-5">
              <header className="mb-5 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 className="text-[15px] font-semibold text-rose-900">{tt('sec_lost', lang)}</h3>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                <Field label={tt('lbl_lost_to', lang)}>
                  <select className={inputCls} value={lostCompetitor} onChange={e=>setLostCompetitor(e.target.value)}>
                    <option value="">{tt('pick', lang)}</option>
                    {LOST_COMPETITOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                {lostCompetitor === 'Andre' && (
                  <Field label={tt('lbl_lost_other', lang)}>
                    <input className={inputCls} value={lostCompetitorCustom} onChange={e=>setLostCompetitorCustom(e.target.value)} />
                  </Field>
                )}
                <Field label={tt('lbl_lost_reason', lang)} full>
                  <select className={inputCls} value={lostReason} onChange={e=>setLostReason(e.target.value)}>
                    <option value="">{tt('pick', lang)}</option>
                    {LOST_REASON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label={tt('lbl_lost_comment', lang)} full>
                  <textarea className={taCls} value={lostComment} onChange={e=>setLostComment(e.target.value)} />
                </Field>
              </div>
            </section>
          )}

          {isEdit && linkedQuotes.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
              <header className="mb-4">
                <h3 className="text-[15px] font-semibold text-gray-900">
                  {lang === 'da' ? 'Linkede konfigurationer / tilbud' : 'Linked configurations / quotes'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {lang === 'da'
                    ? 'Konfigurationer, tilbud og ordrer fra konfiguratoren knyttet til dette lead.'
                    : 'Configurations, quotes and orders from the configurator linked to this lead.'}
                </p>
              </header>
              <ul className="divide-y divide-gray-100">
                {linkedQuotes.map(q => {
                  const kind = getCrmLinkedConfigurationKind(q);
                  const kindLabel = kind === 'order'
                    ? (lang === 'da' ? 'Ordre' : 'Order')
                    : kind === 'quote'
                      ? (lang === 'da' ? 'Tilbud' : 'Quote')
                      : (lang === 'da' ? 'Konfiguration' : 'Configuration');
                  const dealer = q.dealer_company_name || q.dealer_name || q.dealer_number || '—';
                  const sentAt = q.order_sent_at || q.submitted_at || q.quote_sent_at || q.created_at;
                  const machines = q.machine_keys.join(', ') || '—';
                  const documentNumber = kind === 'order'
                    ? (q.order_number || q.quote_number || '—')
                    : (q.quote_number || '—');
                  return (
                    <li key={q.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                        {documentNumber}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">
                        {kindLabel}
                      </span>
                      <span className="flex-1 truncate text-gray-800">{q.title || dealer}</span>
                      <span className="text-xs text-gray-500 truncate">{dealer}</span>
                      <span className="text-xs text-gray-500 truncate">{machines}</span>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(q.total_value || 0)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {sentAt ? new Date(sentAt).toLocaleDateString('da-DK') : '—'}
                      </span>
                      <Link to={getCrmConfigurationDeepLink(q)} className="text-xs text-[#2d5a27] hover:underline">
                        {lang === 'da' ? 'Åbn' : 'Open'}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {isEdit && editId && (
            <section className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6 mb-5">
              <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">Lead-deling</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Del samme lead i portalen uden at oprette en kopi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareDialogOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] text-white text-sm font-medium px-4 py-2.5 shadow-sm transition"
                >
                  <Share2 className="h-4 w-4" />
                  {shareButtonLabel}
                </button>
              </header>
              {leadShares.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {leadShares.map((share) => (
                    <span key={share.id} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                      <Share2 className="h-3.5 w-3.5" />
                      {share.shared_with_name || share.shared_with_email || 'Delt bruger'}
                      {share.channel === 'portal_email' && <Mail className="h-3.5 w-3.5" />}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Dette lead er ikke delt endnu.</p>
              )}
            </section>
          )}

          <Section title={tt('sec_files', lang)} subtitle={tt('sec_files_sub', lang)}>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-gray-300 rounded-xl px-4 py-6 justify-center hover:bg-gray-50 transition">
                <Upload className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">{tt('pick_files', lang)}</span>
                <input type="file" multiple className="hidden" onChange={e => {
                  const list = Array.from(e.target.files || []);
                  setPendingFiles(prev => [...prev, ...list]);
                  e.currentTarget.value = '';
                }} />
              </label>
              {(files.length > 0 || pendingFiles.length > 0) && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {files.map((f, i) => {
                    const viewUrl = attachmentPreviewUrls[f.storage_path];
                    const isImage = !!viewUrl;
                    return (
                      <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white flex items-center justify-center">
                          {isImage ? (
                            <img src={viewUrl} alt={f.name} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-gray-700">{f.name}</div>
                          {viewUrl && (
                            <button
                              type="button"
                              onClick={async () => {
                                const signedUrl = await getLeadAttachmentSignedUrl(f);
                                if (!signedUrl) {
                                  toast.error('Kunne ikke åbne filen');
                                  return;
                                }
                                window.open(signedUrl, '_blank', 'noopener,noreferrer');
                              }}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
                            >
                              Åbn <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <button type="button" onClick={()=>setFiles(files.filter((_,j)=>j!==i))} className="shrink-0 text-gray-400 hover:text-rose-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                  {pendingFiles.map((f, i) => (
                    <li key={`pending-${f.name}-${f.size}-${i}`} className="flex items-center gap-3 text-xs bg-amber-50 rounded-lg px-3 py-2">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-amber-200 bg-white flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-gray-700">{f.name}</div>
                        <div className="mt-1 text-[11px] text-amber-700">Uploades når leadet gemmes</div>
                      </div>
                      <button type="button" onClick={()=>setPendingFiles(pendingFiles.filter((_,j)=>j!==i))} className="shrink-0 text-gray-400 hover:text-rose-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <div className="sticky bottom-4 flex items-center justify-end gap-3 bg-white/90 backdrop-blur rounded-2xl border border-gray-100 shadow-sm p-3 mt-6">
            <Link to="/portal/crm/leads" className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900">{tt('cancel', lang)}</Link>
            <button type="submit" disabled={submitting || !isLeadFormReady}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm transition">
              <Save className="h-4 w-4" />
              {submitting ? tt('saving', lang) : (isEdit ? tt('save_changes', lang) : tt('save', lang))}
            </button>
          </div>
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{shareButtonLabel}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Leadet deles altid i portalen. Vælg mail, hvis modtageren også skal have besked.
                </p>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Modtager
                  <select
                    className={cn(inputCls, 'mt-1')}
                    value={shareTargetId}
                    onChange={(event) => setShareTargetId(event.target.value)}
                    disabled={shareLoading || shareTargets.length === 0}
                  >
                    {shareTargets.length === 0 && <option value="">Ingen modtager fundet</option>}
                    {shareTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name} - {target.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={shareIncludeEmail}
                    onChange={(event) => setShareIncludeEmail(event.target.checked)}
                  />
                  Send også som mail
                </label>
                {shareError && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {shareError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShareDialogOpen(false)}>
                  Annuller
                </Button>
                <Button type="button" onClick={handleShareLead} disabled={shareLoading || !selectedShareTarget}>
                  {shareLoading ? 'Deler...' : 'Del lead'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </form>
        )}
      </div>
    </CrmLayout>
  );
}
