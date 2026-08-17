import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  createLead, updateLead, getLead, MACHINE_TYPE_OPTIONS, NEXT_ACTIVITY_OPTIONS, CONTACT_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS, LOST_COMPETITOR_OPTIONS, LOST_REASON_OPTIONS,
  PipelineStage, formatLeadNo,
} from '@/lib/crmLeadsService';
import {
  nextActivityToProbability,
  deriveLegacyPipelineStage,
  NEXT_ACTIVITY_LOST,
} from '@/lib/leadStatus';
import { listConfigurationsForLead, type CrmLeadQuoteRow } from '@/lib/crmConfigurationsService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { fetchBackendUsers } from '@/lib/backendUsersService';
import type { BackendUser } from '@/lib/backend-users-store';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Save, X, Upload, AlertTriangle, ChevronsUpDown, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { sellerInitialsMatch } from '@/lib/sellerInitials';
import { useSellerDirectory, resolveDealerSellerInitials } from '@/lib/sellerDirectory';

// ---- i18n. English is the fallback. ----
type TKey =
  | 'page_title' | 'page_sub' | 'back' | 'cancel' | 'saving' | 'save'
  | 'sec_basic' | 'sec_basic_sub' | 'sec_machines' | 'sec_machines_sub'
  | 'sec_next_act' | 'sec_demo' | 'sec_contact_cust' | 'sec_details'
  | 'sec_lost' | 'sec_files' | 'sec_files_sub'
  | 'lbl_title' | 'ph_title' | 'lbl_seller' | 'ph_seller'
  | 'lbl_dealer' | 'ph_dealer' | 'lbl_first_contact'
  | 'lbl_expected_close' | 'lbl_next_followup' | 'lbl_next_activity'
  | 'pick' | 'lbl_demo_held' | 'yes' | 'no' | 'lbl_convert' | 'cta_convert'
  | 'lbl_contact_type' | 'lbl_customer_type'
  | 'lbl_contact_info' | 'ph_contact_info' | 'lbl_tradefair' | 'lbl_country' | 'lbl_notes'
  | 'lbl_budget' | 'lbl_probability' | 'lbl_pipeline' | 'lbl_move_work' | 'hlp_move_work'
  | 'lbl_lost_to' | 'lbl_lost_other' | 'lbl_lost_reason' | 'lbl_lost_comment'
  | 'pick_files' | 'mine_dealers' | 'other_dealers'
  | 'loading_dealers' | 'no_match' | 'search_dealer'
  | 'val_title' | 'val_seller' | 'val_dealer' | 'val_first' | 'val_close'
  | 'val_followup' | 'val_contact' | 'val_customer' | 'val_next_act'
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
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
      <header className="mb-5">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('flex flex-col gap-1.5', full && 'md:col-span-2')}>
      <span className="text-[12px] font-medium text-gray-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none transition';
const taCls = inputCls + ' min-h-[90px] resize-y';

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
  const canCreate = isCrmAdmin(portalRole) || isScopedSeller(portalRole);

  // External users: dealer is auto-filled and locked.
  const isInternal = isCrmAdmin(portalRole) || isScopedSeller(portalRole);
  const lockedDealerNumber = !isInternal ? (appUser?.dealer_number ?? null) : null;

  const today = new Date().toISOString().slice(0, 10);

  const [loadingLead, setLoadingLead] = useState(isEdit);
  const [editLeadNo, setEditLeadNo] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  // Responsible seller is now a dropdown (app_users id). Default = logged-in user.
  const [responsibleSellerId, setResponsibleSellerId] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState(appUser?.display_name || appUser?.email || '');
  const [linkedDealer, setLinkedDealer] = useState<string>(lockedDealerNumber || '');
  const [firstContact, setFirstContact] = useState(today);
  const [expectedClose, setExpectedClose] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');

  const [machineTypes, setMachineTypes] = useState<string[]>([]);
  const [nextActivity, setNextActivity] = useState<string>('');
  const [demoHasRun, setDemoHasRun] = useState<'yes' | 'no'>('no');
  const [contactType, setContactType] = useState<string>('');
  const [customerType, setCustomerType] = useState<string>('');

  const [contactInfo, setContactInfo] = useState('');
  const [tradeFair, setTradeFair] = useState('');
  const [country, setCountry] = useState('Danmark');
  const [notes, setNotes] = useState('');
  const [estimatedValue, setEstimatedValue] = useState<string>('');
  const [probability, setProbability] = useState<string>('25');
  const [moveToWorking, setMoveToWorking] = useState<string>('');
  const [stage, setStage] = useState<PipelineStage>('Lead');

  const [lostCompetitor, setLostCompetitor] = useState<string>('');
  const [lostCompetitorCustom, setLostCompetitorCustom] = useState('');
  const [lostReason, setLostReason] = useState<string>('');
  const [lostComment, setLostComment] = useState('');

  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Phase 33 — configurator quotes linked to this lead (edit mode only).
  const [linkedQuotes, setLinkedQuotes] = useState<CrmLeadQuoteRow[]>([]);

  // Dealer picker state
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sellers (Timan Sælger / Timan Backend) for the responsible-seller dropdown.
  const [sellers, setSellers] = useState<BackendUser[]>([]);

  useEffect(() => {
    if (appUser && !responsibleName) setResponsibleName(appUser.display_name || appUser.email);
  }, [appUser, responsibleName]);

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
      setMachineTypes(lead.machine_types || []);
      setNextActivity(lead.next_activity || '');
      setDemoHasRun(lead.demo_has_run || 'no');
      setContactType(lead.contact_type || '');
      setCustomerType(lead.customer_type || '');
      setContactInfo(lead.contact_information || '');
      setTradeFair(lead.trade_fair || '');
      setCountry(lead.country || '');
      setNotes(lead.notes || '');
      setEstimatedValue(lead.estimated_value != null ? String(lead.estimated_value) : '');
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

  const isLost = nextActivity === NEXT_ACTIVITY_LOST || stage === 'Lost';

  // Auto-derive probability + legacy pipeline stage from next_activity selection.
  function handleNextActivityChange(na: string) {
    setNextActivity(na);
    if (na) {
      setProbability(String(nextActivityToProbability(na)));
      setStage(deriveLegacyPipelineStage(na));
    }
  }

  if (!authLoading && !canCreate) return <Navigate to="/portal/crm" replace />;

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

    setSubmitting(true);
    try {
      // Use the explicitly chosen responsible seller (allows handover),
      // fall back to the logged-in user if for some reason it's missing.
      const chosen = sellers.find(s => s.id === responsibleSellerId);
      const sellerId = chosen?.id || (await resolveSellerId(appUser?.email));
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
        contact_information: contactInfo || null,
        trade_fair: tradeFair || null,
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
      if (isEdit && editId) {
        await updateLead(editId, payload);
        toast.success(tt('updated_ok', lang));
      } else {
        await createLead(payload);
        toast.success(tt('created_ok', lang));
      }
      navigate('/portal/crm/leads');
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
          <Link to="/portal/crm/leads" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> {tt('back', lang)}
          </Link>
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
            <Field label={tt('lbl_first_contact', lang)} required>
              <input type="date" className={inputCls} value={firstContact} onChange={e=>setFirstContact(e.target.value)} />
            </Field>
            <Field label={tt('lbl_expected_close', lang)} required>
              <input type="date" className={inputCls} value={expectedClose} onChange={e=>setExpectedClose(e.target.value)} />
            </Field>
            <Field label={tt('lbl_next_followup', lang)} required full>
              <input type="date" className={inputCls} value={nextFollowup} onChange={e=>setNextFollowup(e.target.value)} />
            </Field>
          </Section>

          <Section title={tt('sec_machines', lang)} subtitle={tt('sec_machines_sub', lang)}>
            <div className="md:col-span-2">
              <MultiChip options={MACHINE_TYPE_OPTIONS} value={machineTypes} onChange={setMachineTypes} />
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
            <Field label={tt('lbl_contact_info', lang)} full>
              <textarea className={taCls} value={contactInfo} onChange={e=>setContactInfo(e.target.value)} placeholder={tt('ph_contact_info', lang)} />
            </Field>
            <Field label={tt('lbl_tradefair', lang)}>
              <input className={inputCls} value={tradeFair} onChange={e=>setTradeFair(e.target.value)} />
            </Field>
            <Field label={tt('lbl_country', lang)}>
              <input className={inputCls} value={country} onChange={e=>setCountry(e.target.value)} />
            </Field>
            <Field label={tt('lbl_notes', lang)} full>
              <textarea className={taCls} value={notes} onChange={e=>setNotes(e.target.value)} />
            </Field>
            <Field label={tt('lbl_budget', lang)}>
              <input type="number" min={0} className={inputCls} value={estimatedValue} onChange={e=>setEstimatedValue(e.target.value)} placeholder="0" />
            </Field>
            <Field label={tt('lbl_move_work', lang)}>
              <input
                type="number"
                min={0}
                step={1}
                className={inputCls}
                value={moveToWorking}
                onChange={e=>setMoveToWorking(e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">{tt('hlp_move_work', lang)}</p>
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
                  {lang === 'da' ? 'Linkede tilbud (konfigurator)' : 'Linked configurator quotes'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {lang === 'da'
                    ? 'Tilbud oprettet i konfiguratoren og knyttet til dette lead.'
                    : 'Quotes created in the configurator and linked to this lead.'}
                </p>
              </header>
              <ul className="divide-y divide-gray-100">
                {linkedQuotes.map(q => {
                  const dealer = q.dealer_company_name || q.dealer_name || q.dealer_number || '—';
                  const sentAt = q.quote_sent_at || q.submitted_at || q.created_at;
                  const machines = q.machine_keys.join(', ') || '—';
                  return (
                    <li key={q.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                        {q.quote_number || '—'}
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
                      <Link to={`/portal/crm/tilbud?focus=${q.id}`} className="text-xs text-[#2d5a27] hover:underline">
                        {lang === 'da' ? 'Åbn' : 'Open'}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <Section title={tt('sec_files', lang)} subtitle={tt('sec_files_sub', lang)}>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-gray-300 rounded-xl px-4 py-6 justify-center hover:bg-gray-50 transition">
                <Upload className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">{tt('pick_files', lang)}</span>
                <input type="file" multiple className="hidden" onChange={e => {
                  const list = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }));
                  setFiles(prev => [...prev, ...list]);
                }} />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <span className="truncate text-gray-700">{f.name}</span>
                      <button type="button" onClick={()=>setFiles(files.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-rose-600">
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
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm transition">
              <Save className="h-4 w-4" />
              {submitting ? tt('saving', lang) : (isEdit ? tt('save_changes', lang) : tt('save', lang))}
            </button>
          </div>
        </form>
        )}
      </div>
    </CrmLayout>
  );
}
