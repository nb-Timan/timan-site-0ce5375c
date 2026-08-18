import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  createDemoLead, getLead, formatLeadNo,
  DEMO_MACHINE_CATEGORY, DEMO_MACHINE_OPTIONS, DEMO_EQUIPMENT_OPTIONS, DEMO_RESULT_STATUS,
} from '@/lib/crmLeadsService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { fetchBackendUsers } from '@/lib/backendUsersService';
import type { BackendUser } from '@/lib/backend-users-store';
import { toast } from 'sonner';
import { Save, X, Upload, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { sellerInitialsMatch } from '@/lib/sellerInitials';
import { useSellerDirectory, resolveDealerSellerInitials } from '@/lib/sellerDirectory';
import AddressAutocomplete from '@/components/crm/AddressAutocomplete';

// ---------- i18n. English is the fallback. ----------
type TKey =
  | 'page_title' | 'page_sub' | 'back' | 'cancel' | 'saving' | 'save'
  | 'sec_basic' | 'sec_demo_type' | 'sec_demo_type_sub' | 'sec_demo_machine'
  | 'sec_demo_equipment' | 'sec_demo_equipment_sub' | 'sec_demo_result'
  | 'sec_status' | 'sec_files' | 'sec_files_sub'
  | 'lbl_title' | 'ph_title' | 'lbl_seller' | 'ph_seller' | 'lbl_dealer'
  | 'ph_dealer' | 'lbl_dealer_rep' | 'lbl_customer' | 'lbl_customer_addr'
  | 'lbl_notes' | 'lbl_demo_date' | 'lbl_interest' | 'lbl_wants_offer'
  | 'lbl_followup' | 'lbl_value' | 'lbl_probability' | 'lbl_competitors'
  | 'lbl_competitor_name' | 'lbl_notes_after' | 'yes' | 'no'
  | 'pick_files' | 'mine_dealers' | 'other_dealers' | 'loading_dealers'
  | 'no_match' | 'val_title' | 'val_seller' | 'val_dealer'
  | 'created_ok' | 'created_err' | 'search_dealer'
  | 'val_demo_type' | 'val_demo_machine' | 'val_demo_equipment' | 'ph_addr'
  | 'from_lead_banner' | 'from_lead_link';

const T: Record<TKey, Record<Language, string>> = {
  page_title:    { da: 'Nyt demo lead', en: 'New demo lead', de: 'Neuer Demo-Lead', it: 'Nuovo demo lead', hu: 'Új demo lead' },
  page_sub:      { da: 'Opfølgning efter en gennemført maskindemonstration.', en: 'Follow-up after a completed machine demo.', de: 'Nachbereitung einer durchgeführten Maschinendemo.', it: 'Follow-up dopo una demo macchina completata.', hu: 'Utánkövetés egy elvégzett gép-bemutató után.' },
  back:          { da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza' },
  cancel:        { da: 'Annuller', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', hu: 'Mégse' },
  saving:        { da: 'Gemmer…', en: 'Saving…', de: 'Speichert…', it: 'Salvataggio…', hu: 'Mentés…' },
  save:          { da: 'Gem demo lead', en: 'Save demo lead', de: 'Demo-Lead speichern', it: 'Salva demo lead', hu: 'Demo lead mentése' },
  sec_basic:     { da: 'Grundinformation', en: 'Basic information', de: 'Grundinformationen', it: 'Informazioni di base', hu: 'Alapadatok' },
  sec_demo_type: { da: 'Demo-type', en: 'Demo type', de: 'Demo-Typ', it: 'Tipo di demo', hu: 'Demo típus' },
  sec_demo_type_sub: { da: 'Hvad blev demonstreret', en: 'What was demonstrated', de: 'Was wurde vorgeführt', it: 'Cosa è stato dimostrato', hu: 'Mit mutattak be' },
  sec_demo_machine: { da: 'Demonstreret maskine', en: 'Demonstrated machine', de: 'Vorgeführte Maschine', it: 'Macchina dimostrata', hu: 'Bemutatott gép' },
  sec_demo_equipment: { da: 'Demonstreret udstyr', en: 'Demonstrated equipment', de: 'Vorgeführtes Zubehör', it: 'Attrezzatura dimostrata', hu: 'Bemutatott felszerelés' },
  sec_demo_equipment_sub: { da: 'Vælg et eller flere', en: 'Select one or more', de: 'Eines oder mehrere wählen', it: 'Selezionare uno o più', hu: 'Válasszon egyet vagy többet' },
  sec_demo_result: { da: 'Demo-resultat', en: 'Demo result', de: 'Demo-Ergebnis', it: 'Risultato demo', hu: 'Demo eredmény' },
  sec_status:    { da: 'Resultat (status)', en: 'Result (status)', de: 'Ergebnis (Status)', it: 'Risultato (stato)', hu: 'Eredmény (státusz)' },
  sec_files:     { da: 'Vedhæftninger', en: 'Attachments', de: 'Anhänge', it: 'Allegati', hu: 'Mellékletek' },
  sec_files_sub: { da: 'Billeder, signerede papirer, noter, demo-dokumenter', en: 'Photos, signed papers, notes, demo documents', de: 'Fotos, unterschriebene Papiere, Notizen, Demo-Dokumente', it: 'Foto, documenti firmati, note, documenti demo', hu: 'Fényképek, aláírt papírok, jegyzetek, demo dokumentumok' },
  lbl_title:     { da: 'Titel', en: 'Title', de: 'Titel', it: 'Titolo', hu: 'Cím' },
  ph_title:      { da: "Fx 'Demo Aalborg Kommune – RC-1000s'", en: "e.g. 'Demo Aalborg – RC-1000s'", de: "z. B. 'Demo Aalborg – RC-1000s'", it: "es. 'Demo Aalborg – RC-1000s'", hu: "Pl. 'Demo Aalborg – RC-1000s'" },
  lbl_seller:    { da: 'Ansvarlig sælger', en: 'Responsible seller', de: 'Verantwortlicher Verkäufer', it: 'Venditore responsabile', hu: 'Felelős értékesítő' },
  ph_seller:     { da: 'Vælg sælger…', en: 'Select seller…', de: 'Verkäufer wählen…', it: 'Seleziona venditore…', hu: 'Válasszon értékesítőt…' },
  lbl_dealer:    { da: 'Forhandler-firma', en: 'Dealer company', de: 'Händler-Firma', it: 'Azienda rivenditore', hu: 'Kereskedő cég' },
  ph_dealer:     { da: 'Vælg forhandler…', en: 'Select dealer…', de: 'Händler wählen…', it: 'Seleziona rivenditore…', hu: 'Válasszon kereskedőt…' },
  lbl_dealer_rep:{ da: 'Sælger / demonstrator hos forhandler', en: 'Seller / demonstrator at dealer', de: 'Verkäufer / Vorführer beim Händler', it: 'Venditore / dimostratore presso rivenditore', hu: 'Értékesítő / bemutató a kereskedőnél' },
  lbl_customer:  { da: 'Kunde-firma / CVR', en: 'Customer company / VAT', de: 'Kundenfirma / USt-IdNr.', it: 'Azienda cliente / P.IVA', hu: 'Ügyfél cég / adószám' },
  lbl_customer_addr: { da: 'Kunde-adresse', en: 'Customer address', de: 'Kundenadresse', it: 'Indirizzo cliente', hu: 'Ügyfél cím' },
  lbl_notes:     { da: 'Noter / øvrig info', en: 'Notes / other info', de: 'Notizen / weitere Infos', it: 'Note / altre info', hu: 'Megjegyzések / egyéb' },
  lbl_demo_date: { da: 'Demo-dato', en: 'Demo date', de: 'Demo-Datum', it: 'Data demo', hu: 'Demo dátuma' },
  lbl_interest:  { da: 'Kundens interesse (1-5)', en: "Customer interest (1-5)", de: 'Kundeninteresse (1-5)', it: 'Interesse cliente (1-5)', hu: 'Vevői érdeklődés (1-5)' },
  lbl_wants_offer:{ da: 'Ønsker tilbud?', en: 'Wants quote?', de: 'Möchte Angebot?', it: 'Vuole preventivo?', hu: 'Kér árajánlatot?' },
  lbl_followup:  { da: 'Opfølgningsdato', en: 'Follow-up date', de: 'Nachfass-Datum', it: 'Data follow-up', hu: 'Utánkövetés dátuma' },
  lbl_value:     { da: 'Forventet handelsstørrelse (DKK)', en: 'Expected deal size (DKK)', de: 'Erwartete Auftragsgröße (DKK)', it: 'Dimensione affare attesa (DKK)', hu: 'Várható üzletméret (DKK)' },
  lbl_probability:{ da: 'Sandsynlighed (%)', en: 'Probability (%)', de: 'Wahrscheinlichkeit (%)', it: 'Probabilità (%)', hu: 'Valószínűség (%)' },
  lbl_competitors:{ da: 'Konkurrenter til stede?', en: 'Competitors present?', de: 'Wettbewerber anwesend?', it: 'Concorrenti presenti?', hu: 'Versenytársak jelen?' },
  lbl_competitor_name:{ da: 'Hvilken konkurrent', en: 'Which competitor', de: 'Welcher Wettbewerber', it: 'Quale concorrente', hu: 'Melyik versenytárs' },
  lbl_notes_after:{ da: 'Noter efter demo', en: 'Notes after demo', de: 'Notizen nach Demo', it: 'Note dopo demo', hu: 'Jegyzetek a demo után' },
  yes:           { da: 'Ja', en: 'Yes', de: 'Ja', it: 'Sì', hu: 'Igen' },
  no:            { da: 'Nej', en: 'No', de: 'Nein', it: 'No', hu: 'Nem' },
  pick_files:    { da: 'Klik for at vælge filer', en: 'Click to choose files', de: 'Dateien auswählen', it: 'Clicca per scegliere file', hu: 'Kattintson fájlt választani' },
  mine_dealers:  { da: 'Mine forhandlere', en: 'My dealers', de: 'Meine Händler', it: 'I miei rivenditori', hu: 'Kereskedőim' },
  other_dealers: { da: 'Andre forhandlere', en: 'Other dealers', de: 'Andere Händler', it: 'Altri rivenditori', hu: 'Más kereskedők' },
  loading_dealers:{ da: 'Henter forhandlere…', en: 'Loading dealers…', de: 'Händler laden…', it: 'Caricamento rivenditori…', hu: 'Kereskedők betöltése…' },
  no_match:      { da: 'Ingen match', en: 'No match', de: 'Kein Treffer', it: 'Nessuna corrispondenza', hu: 'Nincs találat' },
  search_dealer: { da: 'Søg forhandler, nr., by, land…', en: 'Search dealer, no., city, country…', de: 'Händler, Nr., Stadt, Land suchen…', it: 'Cerca rivenditore, n., città, paese…', hu: 'Keresés: kereskedő, szám, város, ország…' },
  val_title:     { da: 'Titel er påkrævet', en: 'Title is required', de: 'Titel ist erforderlich', it: 'Il titolo è obbligatorio', hu: 'A cím kötelező' },
  val_seller:    { da: 'Vælg en ansvarlig sælger.', en: 'Select a responsible seller.', de: 'Wählen Sie einen Verkäufer.', it: 'Selezionare un venditore.', hu: 'Válasszon felelős értékesítőt.' },
  val_dealer:    { da: 'Vælg en forhandler.', en: 'Select a dealer.', de: 'Wählen Sie einen Händler.', it: 'Selezionare un rivenditore.', hu: 'Válasszon kereskedőt.' },
  created_ok:    { da: 'Demo lead oprettet', en: 'Demo lead created', de: 'Demo-Lead erstellt', it: 'Demo lead creato', hu: 'Demo lead létrehozva' },
  created_err:   { da: 'Kunne ikke oprette demo lead', en: 'Could not create demo lead', de: 'Demo-Lead konnte nicht erstellt werden', it: 'Impossibile creare il demo lead', hu: 'Nem sikerült létrehozni a demo leadet' },
  val_demo_type: { da: 'Vælg demo-type.', en: 'Select demo type.', de: 'Demo-Typ auswählen.', it: 'Seleziona il tipo di demo.', hu: 'Válasszon demó típust.' },
  val_demo_machine: { da: 'Vælg mindst én demonstreret maskine.', en: 'Select at least one demonstrated machine.', de: 'Wählen Sie mindestens eine vorgeführte Maschine.', it: 'Seleziona almeno una macchina dimostrata.', hu: 'Válasszon legalább egy bemutatott gépet.' },
  val_demo_equipment: { da: 'Vælg mindst ét demonstreret udstyr.', en: 'Select at least one demonstrated equipment item.', de: 'Wählen Sie mindestens ein vorgeführtes Zubehör.', it: 'Seleziona almeno un accessorio dimostrato.', hu: 'Válasszon legalább egy bemutatott eszközt.' },
  ph_addr:       { da: 'Begynd at skrive adresse…', en: 'Start typing address…', de: 'Adresse eingeben…', it: 'Inizia a digitare l\'indirizzo…', hu: 'Kezdjen címet írni…' },
  from_lead_banner: { da: 'Oprettet fra lead', en: 'Created from lead', de: 'Erstellt aus Lead', it: 'Creato dal lead', hu: 'Leadből létrehozva' },
  from_lead_link:   { da: 'Åbn oprindeligt lead', en: 'Open original lead', de: 'Ursprünglichen Lead öffnen', it: 'Apri lead originale', hu: 'Eredeti lead megnyitása' },
};

function tt(k: TKey, lang: Language): string {
  return T[k][lang] || T[k].en;
}

// ---------- Tiny shared form primitives ----------
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

function Chips({ options, value, onChange, single }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button type="button" key={o} onClick={() => {
            if (single) onChange([o]);
            else onChange(active ? value.filter(v => v !== o) : [...value, o]);
          }}
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

// ---------- Dealer picker option ----------
interface DealerOption {
  value: string;
  label: string;
  searchKey: string;
  isMine: boolean;
}
function dealerToOption(d: DealerAccount, mine: boolean, liveInitials: string): DealerOption {
  const initials = liveInitials || d.assigned_seller_initials || '';
  const label = `${d.company_name} · ${d.account_number}${initials ? ` · ${initials}` : ''}`;
  return {
    value: d.account_number,
    label,
    searchKey: [d.company_name, d.account_number, d.city, d.country, initials].filter(Boolean).join(' ').toLowerCase(),
    isMine: mine,
  };
}

export default function CrmNewDemoLeadPage() {
  const { appUser, loading: authLoading } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromLeadId = searchParams.get('fromLead') || '';
  const portalRole = derivePortalRole(appUser);
  const canCreate = isCrmAdmin(portalRole) || isScopedSeller(portalRole);

  const today = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState('');
  const [responsibleSellerId, setResponsibleSellerId] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState(appUser?.display_name || appUser?.email || '');
  const [dealerCompany, setDealerCompany] = useState<string>(''); // account_number
  const [dealerCompanyLabel, setDealerCompanyLabel] = useState<string>(''); // display label persisted to DB
  const [dealerRep, setDealerRep] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [machineCategory, setMachineCategory] = useState<string[]>([]);
  const [demoMachine, setDemoMachine] = useState<string[]>([]); // single
  const [demoEquipment, setDemoEquipment] = useState<string[]>([]);

  const [demoDate, setDemoDate] = useState(today);
  const [interest, setInterest] = useState(3);
  const [wantsOffer, setWantsOffer] = useState<'yes' | 'no'>('yes');
  const [followup, setFollowup] = useState('');
  const [estValue, setEstValue] = useState('');
  const [probability, setProbability] = useState('40');
  const [competitorsPresent, setCompetitorsPresent] = useState<'yes' | 'no'>('no');
  const [competitorName, setCompetitorName] = useState('');
  const [notesAfter, setNotesAfter] = useState('');
  const [status, setStatus] = useState<string>('Warm lead');

  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Phase 38 — prefill from a CRM lead when ?fromLead=<id> is in the URL.
  const [sourceLeadId, setSourceLeadId] = useState<string | null>(null);
  const [sourceLeadNo, setSourceLeadNo] = useState<number | null>(null);


  // Dealers + sellers
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sellers, setSellers] = useState<BackendUser[]>([]);

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

  // Default responsible seller = active seller context (logged-in user, or "view as" seller).
  useEffect(() => {
    if (responsibleSellerId) return;
    if (!sellers.length || !appUser?.email) return;
    // resolveSellerId honours backend "view as <seller>" override.
    let cancelled = false;
    (async () => {
      const sid = await resolveSellerId(appUser.email);
      if (cancelled) return;
      const me = sid
        ? sellers.find(s => s.id === sid)
        : sellers.find(s => (s.email || '').toLowerCase() === appUser.email.toLowerCase());
      if (me) {
        setResponsibleSellerId(me.id);
        setResponsibleName(me.name || me.email);
      }
    })();
    return () => { cancelled = true; };
  }, [sellers, appUser?.email, responsibleSellerId]);

  // Phase 38 — prefill from originating lead.
  useEffect(() => {
    if (!fromLeadId) return;
    let cancelled = false;
    (async () => {
      const lead = await getLead(fromLeadId);
      if (cancelled || !lead) return;
      setSourceLeadId(lead.id);
      setSourceLeadNo(typeof lead.lead_no === 'number' ? lead.lead_no : null);
      setTitle(prev => prev || lead.title || '');
      if (lead.owner_user_id) setResponsibleSellerId(prev => prev || lead.owner_user_id || '');
      if (lead.owner_name) setResponsibleName(prev => prev || lead.owner_name || '');
      if (lead.linked_dealer_id) {
        setDealerCompany(prev => prev || lead.linked_dealer_id || '');
        setDealerCompanyLabel(prev => prev || lead.linked_dealer_id || '');
      }
      if (lead.contact_information) setCustomerName(prev => prev || lead.contact_information || '');
      if (lead.notes) setNotes(prev => prev || lead.notes || '');
      // machine_types → demoMachine (single) + machine_category default.
      const types = (lead.machine_types || []).filter(Boolean);
      if (types.length) {
        const matched = types.find(t => (DEMO_MACHINE_OPTIONS as readonly string[]).includes(t));
        if (matched) setDemoMachine(prev => prev.length ? prev : [matched]);
        setMachineCategory(prev => prev.length ? prev : ['Timan machine']);
      }
      if (lead.estimated_value != null) setEstValue(prev => prev || String(lead.estimated_value));
      if (lead.probability != null) setProbability(String(lead.probability));
    })();
    return () => { cancelled = true; };
  }, [fromLeadId]);


  const sellerDir = useSellerDirectory();
  const { mineOptions, otherOptions, allOptions } = useMemo(() => {
    const selected = sellers.find(s => s.id === responsibleSellerId);
    const mineEmail = (selected?.email || appUser?.email || '').toLowerCase();
    const mineInitials = (selected?.initials || '').toUpperCase();
    const opts = dealers.map(d => {
      const de = (d.assigned_seller_email || '').toLowerCase();
      const mine = (mineEmail !== '' && de === mineEmail)
        || (mineInitials !== '' && sellerInitialsMatch(d.assigned_seller_initials, mineInitials));
      const liveInitials = resolveDealerSellerInitials(d, sellerDir);
      return dealerToOption(d, mine, liveInitials);
    });
    const mine = opts.filter(o => o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    const others = opts.filter(o => !o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    return { mineOptions: mine, otherOptions: others, allOptions: opts };
  }, [dealers, sellers, responsibleSellerId, appUser?.email, sellerDir]);

  const selectedDealer = allOptions.find(o => o.value === dealerCompany) || null;
  const dealerTriggerLabel = selectedDealer ? selectedDealer.label : (dealerCompanyLabel || tt('ph_dealer', lang));

  if (!authLoading && !canCreate) return <Navigate to="/portal/crm" replace />;

  const errDemoType = machineCategory.length === 0 ? tt('val_demo_type', lang) : '';
  const errDemoMachine = demoMachine.length === 0 ? tt('val_demo_machine', lang) : '';
  const errDemoEquipment = demoEquipment.length === 0 ? tt('val_demo_equipment', lang) : '';
  const [showErrors, setShowErrors] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim())        { toast.error(tt('val_title', lang)); return; }
    if (!responsibleSellerId) { toast.error(tt('val_seller', lang)); return; }
    if (!dealerCompany)       { toast.error(tt('val_dealer', lang)); return; }
    if (errDemoType || errDemoMachine || errDemoEquipment) {
      setShowErrors(true);
      toast.error(errDemoType || errDemoMachine || errDemoEquipment);
      return;
    }
    setSubmitting(true);
    try {
      const chosen = sellers.find(s => s.id === responsibleSellerId);
      const sellerId = chosen?.id || (await resolveSellerId(appUser?.email));
      const dealerLabel = selectedDealer?.label || dealerCompanyLabel || dealerCompany;
      await createDemoLead({
        title: title.trim(),
        owner_user_id: sellerId,
        owner_name: chosen?.name || responsibleName || null,
        dealer_company: dealerLabel || null,
        dealer_rep: dealerRep || null,
        customer_name: customerName || null,
        customer_address: customerAddress || null,
        notes: notes || null,
        machine_category: machineCategory,
        demo_machine: demoMachine[0] || null,
        demo_equipment: demoEquipment,
        demo_date: demoDate || null,
        interest_level: interest,
        wants_offer: wantsOffer,
        followup_date: followup || null,
        estimated_value: estValue ? Number(estValue) : null,
        probability: probability ? Number(probability) : null,
        competitors_present: competitorsPresent,
        competitor_name: competitorsPresent === 'yes' ? (competitorName || null) : null,
        notes_after_demo: notesAfter || null,
        result_status: status,
        attachments: files,
        source_lead_id: sourceLeadId,
      });
      toast.success(tt('created_ok', lang));
      navigate('/portal/crm/demo-leads');
    } catch (err) {
      console.error(err);
      toast.error(tt('created_err', lang));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CrmLayout pageTitle={tt('page_title', lang)}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{tt('page_title', lang)}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{tt('page_sub', lang)}</p>
          </div>
        </div>

        {sourceLeadId && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
            <span>
              {tt('from_lead_banner', lang)}{' '}
              <span className="font-mono">{formatLeadNo(sourceLeadNo)}</span>
            </span>
            <Link to={`/portal/crm/leads/${sourceLeadId}`} className="text-xs text-violet-800 hover:underline">
              {tt('from_lead_link', lang)} →
            </Link>
          </div>
        )}


        <form onSubmit={handleSubmit}>
          <Section title={tt('sec_basic', lang)}>
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
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between font-normal h-10 rounded-xl border-gray-200',
                      !dealerCompany && 'text-gray-400'
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
                              onSelect={() => { setDealerCompany(o.value); setDealerCompanyLabel(o.label); setPickerOpen(false); }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', dealerCompany === o.value ? 'opacity-100' : 'opacity-0')} />
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
                              onSelect={() => { setDealerCompany(o.value); setDealerCompanyLabel(o.label); setPickerOpen(false); }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', dealerCompany === o.value ? 'opacity-100' : 'opacity-0')} />
                              <span className="truncate">{o.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>

            <Field label={tt('lbl_dealer_rep', lang)}>
              <input className={inputCls} value={dealerRep} onChange={e=>setDealerRep(e.target.value)} />
            </Field>
            <Field label={tt('lbl_customer', lang)}>
              <input className={inputCls} value={customerName} onChange={e=>setCustomerName(e.target.value)} />
            </Field>
            <Field label={tt('lbl_customer_addr', lang)} full>
              <AddressAutocomplete className={inputCls} value={customerAddress} onChange={setCustomerAddress} placeholder={tt('ph_addr', lang)} showValidationState addressParts={{ address_line_1: customerAddress }} />
            </Field>
            <Field label={tt('lbl_notes', lang)} full>
              <textarea className={taCls} value={notes} onChange={e=>setNotes(e.target.value)} />
            </Field>
          </Section>

          <Section title={tt('sec_demo_type', lang)} subtitle={tt('sec_demo_type_sub', lang)}>
            <div className="md:col-span-2">
              <div className="text-[12px] font-medium text-gray-700 mb-1.5">{tt('sec_demo_type', lang)} <span className="text-rose-500">*</span></div>
              <Chips options={DEMO_MACHINE_CATEGORY} value={machineCategory} onChange={setMachineCategory} />
              {showErrors && errDemoType && <p className="mt-1.5 text-xs text-rose-600">{errDemoType}</p>}
            </div>
          </Section>

          <Section title={tt('sec_demo_machine', lang)}>
            <div className="md:col-span-2">
              <div className="text-[12px] font-medium text-gray-700 mb-1.5">{tt('sec_demo_machine', lang)} <span className="text-rose-500">*</span></div>
              <Chips options={DEMO_MACHINE_OPTIONS} value={demoMachine} onChange={setDemoMachine} single />
              {showErrors && errDemoMachine && <p className="mt-1.5 text-xs text-rose-600">{errDemoMachine}</p>}
            </div>
          </Section>

          <Section title={tt('sec_demo_equipment', lang)} subtitle={tt('sec_demo_equipment_sub', lang)}>
            <div className="md:col-span-2">
              <div className="text-[12px] font-medium text-gray-700 mb-1.5">{tt('sec_demo_equipment', lang)} <span className="text-rose-500">*</span></div>
              <Chips options={DEMO_EQUIPMENT_OPTIONS} value={demoEquipment} onChange={setDemoEquipment} />
              {showErrors && errDemoEquipment && <p className="mt-1.5 text-xs text-rose-600">{errDemoEquipment}</p>}
            </div>
          </Section>

          <Section title={tt('sec_demo_result', lang)}>
            <Field label={tt('lbl_demo_date', lang)}>
              <input type="date" className={inputCls} value={demoDate} onChange={e=>setDemoDate(e.target.value)} />
            </Field>
            <Field label={tt('lbl_interest', lang)}>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button type="button" key={n} onClick={()=>setInterest(n)}
                    className={cn('w-10 h-10 rounded-xl border text-sm font-medium transition',
                      interest===n ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tt('lbl_wants_offer', lang)}>
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setWantsOffer(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      wantsOffer===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes' ? tt('yes', lang) : tt('no', lang)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tt('lbl_followup', lang)}>
              <input type="date" className={inputCls} value={followup} onChange={e=>setFollowup(e.target.value)} />
            </Field>
            <Field label={tt('lbl_value', lang)}>
              <input type="number" min={0} className={inputCls} value={estValue} onChange={e=>setEstValue(e.target.value)} />
            </Field>
            <Field label={tt('lbl_probability', lang)}>
              <input type="number" min={0} max={100} className={inputCls} value={probability} onChange={e=>setProbability(e.target.value)} />
            </Field>
            <Field label={tt('lbl_competitors', lang)}>
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setCompetitorsPresent(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      competitorsPresent===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes' ? tt('yes', lang) : tt('no', lang)}
                  </button>
                ))}
              </div>
            </Field>
            {competitorsPresent === 'yes' && (
              <Field label={tt('lbl_competitor_name', lang)}>
                <input className={inputCls} value={competitorName} onChange={e=>setCompetitorName(e.target.value)} />
              </Field>
            )}
            <Field label={tt('lbl_notes_after', lang)} full>
              <textarea className={taCls} value={notesAfter} onChange={e=>setNotesAfter(e.target.value)} />
            </Field>
          </Section>

          <Section title={tt('sec_status', lang)}>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {DEMO_RESULT_STATUS.map(s => (
                <button type="button" key={s} onClick={()=>setStatus(s)}
                  className={cn('px-3.5 py-2 rounded-xl text-sm border transition',
                    status===s ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                  {s}
                </button>
              ))}
            </div>
          </Section>

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
            <Link to="/portal/crm/demo-leads" className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900">{tt('cancel', lang)}</Link>
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm transition">
              <Save className="h-4 w-4" />
              {submitting ? tt('saving', lang) : tt('save', lang)}
            </button>
          </div>
        </form>
      </div>
    </CrmLayout>
  );
}
