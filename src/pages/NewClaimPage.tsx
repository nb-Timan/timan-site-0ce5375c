import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, AlertCircle, Plus, Trash2, Save, Send, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';
import {
  derivePortalRole,
  getPortalPermissions,
  hasModuleAccess,
  getClaimsViewVariant,
  ModuleAccessKey,
} from '@/lib/portalAccess';
import {
  saveClaim,
  ClaimPartLine,
  ClaimWorkLine,
  ClaimStatus,
} from '@/lib/claimsService';

const T: Record<string, Record<Language, string>> = {
  back:        { da: 'Tilbage til sagsoversigt', en: 'Back to claims list', de: 'Zurück zur Fallübersicht', it: 'Torna ai reclami', hu: 'Vissza az ügylistához' },
  title:       { da: 'Ny sag', en: 'New claim', de: 'Neuer Fall', it: 'Nuovo reclamo', hu: 'Új ügy' },
  intro:       { da: 'Opret en ny service- eller garantisag.', en: 'Create a new service or warranty case.', de: 'Neuen Service- oder Garantiefall anlegen.', it: 'Crea un nuovo caso.', hu: 'Új szerviz- vagy garanciaeset létrehozása.' },
  noAccess:    { da: 'Ingen adgang til oprettelse af sager.', en: 'No access to create claims.', de: 'Kein Zugriff zum Anlegen.', it: 'Nessun accesso alla creazione.', hu: 'Nincs jogosultság új ügy létrehozására.' },
  required:    { da: 'Påkrævet', en: 'Required', de: 'Pflicht', it: 'Obbligatorio', hu: 'Kötelező' },
  saveDraft:   { da: 'Gem til senere', en: 'Save for later', de: 'Später speichern', it: 'Salva per dopo', hu: 'Mentés későbbre' },
  sendTiman:   { da: 'Send til Timan', en: 'Send to Timan', de: 'An Timan senden', it: 'Invia a Timan', hu: 'Küldés a Timan-nak' },
  saving:      { da: 'Gemmer…', en: 'Saving…', de: 'Speichert…', it: 'Salvataggio…', hu: 'Mentés…' },
  savedDraft:  { da: 'Gemt som kladde', en: 'Saved as draft', de: 'Als Entwurf gespeichert', it: 'Salvato come bozza', hu: 'Vázlatként mentve' },
  sentOk:      { da: 'Sendt til Timan', en: 'Sent to Timan', de: 'An Timan gesendet', it: 'Inviato a Timan', hu: 'Elküldve a Timan-nak' },
  saveError:   { da: 'Kunne ikke gemme. Prøv igen.', en: 'Could not save. Try again.', de: 'Speichern fehlgeschlagen.', it: 'Salvataggio fallito.', hu: 'Mentés sikertelen.' },
  validation:  { da: 'Ret venligst de markerede felter.', en: 'Please fix the highlighted fields.', de: 'Bitte markierte Felder korrigieren.', it: 'Correggi i campi evidenziati.', hu: 'Kérlek javítsd a megjelölt mezőket.' },

  sDealer:     { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  sOwner:      { da: 'Ejer / Kunde', en: 'Owner / Customer', de: 'Eigentümer / Kunde', it: 'Proprietario / Cliente', hu: 'Tulajdonos / Ügyfél' },
  sMachine:    { da: 'Maskininformation', en: 'Machine information', de: 'Maschineninformation', it: 'Informazioni macchina', hu: 'Gép adatai' },
  sDates:      { da: 'Datoer', en: 'Dates', de: 'Daten', it: 'Date', hu: 'Dátumok' },
  sFault:      { da: 'Fejlbeskrivelse', en: 'Fault description', de: 'Fehlerbeschreibung', it: 'Descrizione del guasto', hu: 'Hibaleírás' },
  sRepair:     { da: 'Reparationsbeskrivelse', en: 'Repair description', de: 'Reparaturbeschreibung', it: 'Descrizione riparazione', hu: 'Javítás leírása' },
  sParts:      { da: 'Reservedele', en: 'Spare parts', de: 'Ersatzteile', it: 'Ricambi', hu: 'Pótalkatrészek' },
  sWork:       { da: 'Arbejdslinjer', en: 'Work lines', de: 'Arbeitspositionen', it: 'Voci di lavoro', hu: 'Munkasorok' },
  sService:    { da: 'Service', en: 'Service', de: 'Service', it: 'Servizio', hu: 'Szerviz' },
  sTotals:     { da: 'Totaloversigt', en: 'Total overview', de: 'Gesamtübersicht', it: 'Totale', hu: 'Összesítés' },
  sFiles:      { da: 'Vedhæftninger', en: 'Attachments', de: 'Anhänge', it: 'Allegati', hu: 'Csatolmányok' },
  filesSoon:   { da: 'Upload kommer snart.', en: 'Upload coming soon.', de: 'Upload folgt bald.', it: 'Caricamento in arrivo.', hu: 'A feltöltés hamarosan elérhető.' },

  fCompany:    { da: 'Firma', en: 'Company', de: 'Firma', it: 'Azienda', hu: 'Cégnév' },
  fContact:    { da: 'Kontaktperson', en: 'Contact person', de: 'Ansprechpartner', it: 'Contatto', hu: 'Kapcsolattartó' },
  fEmail:      { da: 'E-mail', en: 'Email', de: 'E-Mail', it: 'Email', hu: 'E-mail' },
  fPhone:      { da: 'Telefon', en: 'Phone', de: 'Telefon', it: 'Telefono', hu: 'Telefon' },
  fName:       { da: 'Navn', en: 'Name', de: 'Name', it: 'Nome', hu: 'Név' },
  fModel:      { da: 'Model', en: 'Model', de: 'Modell', it: 'Modello', hu: 'Modell' },
  fSerial:     { da: 'Serienummer', en: 'Serial number', de: 'Seriennummer', it: 'N. di serie', hu: 'Sorozatszám' },
  fYear:       { da: 'Årgang', en: 'Year', de: 'Baujahr', it: 'Anno', hu: 'Év' },
  fDelivery:   { da: 'Leveringsdato', en: 'Delivery date', de: 'Lieferdatum', it: 'Consegna', hu: 'Szállítás dátuma' },
  fFault:      { da: 'Fejldato', en: 'Fault date', de: 'Fehlerdatum', it: 'Data guasto', hu: 'Hiba dátuma' },
  fRepair:     { da: 'Reparationsdato', en: 'Repair date', de: 'Reparaturdatum', it: 'Data riparazione', hu: 'Javítás dátuma' },
  fHours:      { da: 'Arbejdstimer', en: 'Work hours', de: 'Arbeitsstunden', it: 'Ore di lavoro', hu: 'Munkaóra' },
  fKm:         { da: 'Kørte km', en: 'Driven km', de: 'Gefahrene km', it: 'Km percorsi', hu: 'Megtett km' },
  fPart:       { da: 'Reservedelsnr.', en: 'Part #', de: 'Ersatzteil-Nr.', it: 'N. ricambio', hu: 'Alkatrész szám' },
  fDesc:       { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás' },
  fQty:        { da: 'Antal', en: 'Qty', de: 'Menge', it: 'Q.tà', hu: 'Db' },
  fUnit:       { da: 'Stykpris (netto)', en: 'Unit price (net)', de: 'Stückpreis (netto)', it: 'Prezzo unitario (netto)', hu: 'Egységár (nettó)' },
  fRate:       { da: 'Timepris (netto)', en: 'Hourly rate (net)', de: 'Stundensatz (netto)', it: 'Tariffa oraria (netta)', hu: 'Óradíj (nettó)' },
  fLineHours:  { da: 'Timer', en: 'Hours', de: 'Std.', it: 'Ore', hu: 'Óra' },
  addLine:     { da: 'Tilføj linje', en: 'Add line', de: 'Zeile hinzufügen', it: 'Aggiungi riga', hu: 'Sor hozzáadása' },
  total:       { da: 'I alt (netto)', en: 'Total (net)', de: 'Gesamt (netto)', it: 'Totale (netto)', hu: 'Összesen (nettó)' },

  viewInternal:{ da: 'Intern visning', en: 'Internal view', de: 'Interne Ansicht', it: 'Vista interna', hu: 'Belső nézet' },
  viewDealer:  { da: 'Forhandlervisning', en: 'Dealer view', de: 'Händleransicht', it: 'Vista rivenditore', hu: 'Kereskedői nézet' },
};

// ---- Validation ----
const lineSchemaPart = z.object({
  description: z.string().trim().max(200),
  part_number: z.string().trim().max(100).optional(),
  quantity: z.number().min(0).max(100000),
  unit_price_net: z.number().min(0).max(10_000_000),
});
const lineSchemaWork = z.object({
  description: z.string().trim().max(200),
  hours: z.number().min(0).max(10000),
  hourly_rate_net: z.number().min(0).max(100000),
});

const formSchema = z.object({
  dealer_company: z.string().trim().min(1, 'required').max(150),
  dealer_contact: z.string().trim().max(100).optional(),
  dealer_email: z.string().trim().email('email').max(255).optional().or(z.literal('')),
  dealer_phone: z.string().trim().max(50).optional(),
  customer_name: z.string().trim().min(1, 'required').max(150),
  customer_contact: z.string().trim().max(100).optional(),
  customer_email: z.string().trim().email('email').max(255).optional().or(z.literal('')),
  customer_phone: z.string().trim().max(50).optional(),
  machine_model: z.string().trim().min(1, 'required').max(100),
  machine_serial: z.string().trim().min(1, 'required').max(100),
  machine_year: z.string().trim().max(10).optional(),
  delivery_date: z.string().optional(),
  fault_date: z.string().optional(),
  repair_date: z.string().optional(),
  description: z.string().trim().min(1, 'required').max(4000),
  repair_description: z.string().trim().max(4000).optional(),
  work_hours: z.number().min(0).max(100000),
  driven_km: z.number().min(0).max(10_000_000),
});

type FormState = {
  dealer_company: string;
  dealer_contact: string;
  dealer_email: string;
  dealer_phone: string;
  customer_name: string;
  customer_contact: string;
  customer_email: string;
  customer_phone: string;
  machine_model: string;
  machine_serial: string;
  machine_year: string;
  delivery_date: string;
  fault_date: string;
  repair_date: string;
  description: string;
  repair_description: string;
  work_hours: string;
  driven_km: string;
};

const initial: FormState = {
  dealer_company: '', dealer_contact: '', dealer_email: '', dealer_phone: '',
  customer_name: '', customer_contact: '', customer_email: '', customer_phone: '',
  machine_model: '', machine_serial: '', machine_year: '',
  delivery_date: '', fault_date: '', repair_date: '',
  description: '', repair_description: '',
  work_hours: '', driven_km: '',
};

function uid() {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toNonNegNumber(s: string): number {
  const n = Number(String(s).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export default function NewClaimPage() {
  const { appUser, loading: authLoading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(initial);
  const [parts, setParts] = useState<ClaimPartLine[]>([
    { id: uid(), description: '', quantity: 0, unit_price_net: 0 },
  ]);
  const [workLines, setWorkLines] = useState<ClaimWorkLine[]>([
    { id: uid(), description: '', hours: 0, hourly_rate_net: 0 },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<null | ClaimStatus>(null);
  const [done, setDone] = useState<{ id: string; status: ClaimStatus } | null>(null);

  const total = useMemo(() => {
    const partsTotal = parts.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price_net || 0), 0);
    const workTotal = workLines.reduce((s, w) => s + (w.hours || 0) * (w.hourly_rate_net || 0), 0);
    return partsTotal + workTotal;
  }, [parts, workLines]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const portalRole = derivePortalRole(appUser);
  const allowed = hasModuleAccess(portalRole, 'claims', (appUser.module_access as ModuleAccessKey[] | null | undefined) ?? null);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;
  const canCreate = !!perms?.canCreateClaim;
  const viewVariant = getClaimsViewVariant(portalRole);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
    }
  }

  function validate(): { ok: boolean; values?: z.infer<typeof formSchema> } {
    const candidate = {
      ...form,
      work_hours: toNonNegNumber(form.work_hours || '0'),
      driven_km: toNonNegNumber(form.driven_km || '0'),
    };
    const res = formSchema.safeParse(candidate);
    if (!res.success) {
      const map: Record<string, string> = {};
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return { ok: false };
    }
    // Validate lines (skip empty-only rows)
    for (const p of parts) {
      if (!p.description && !p.part_number && !p.quantity && !p.unit_price_net) continue;
      if (!lineSchemaPart.safeParse(p).success) {
        toast.error(T.validation[lang]);
        return { ok: false };
      }
    }
    for (const w of workLines) {
      if (!w.description && !w.hours && !w.hourly_rate_net) continue;
      if (!lineSchemaWork.safeParse(w).success) {
        toast.error(T.validation[lang]);
        return { ok: false };
      }
    }
    setErrors({});
    return { ok: true, values: res.data };
  }

  async function handleSubmit(status: ClaimStatus) {
    if (!canCreate) return;
    const { ok, values } = validate();
    if (!ok || !values) {
      toast.error(T.validation[lang]);
      return;
    }
    setSubmitting(status);
    try {
      const cleanParts = parts.filter(p => p.description || p.part_number || p.quantity || p.unit_price_net);
      const cleanWork = workLines.filter(w => w.description || w.hours || w.hourly_rate_net);
      const res = await saveClaim({
        dealer_company: values.dealer_company,
        dealer_contact: values.dealer_contact || null,
        dealer_email: values.dealer_email || null,
        dealer_phone: values.dealer_phone || null,
        customer_name: values.customer_name,
        customer_contact: values.customer_contact || null,
        customer_email: values.customer_email || null,
        customer_phone: values.customer_phone || null,
        machine_model: values.machine_model,
        machine_serial: values.machine_serial,
        machine_year: values.machine_year || null,
        delivery_date: values.delivery_date || null,
        fault_date: values.fault_date || null,
        repair_date: values.repair_date || null,
        description: values.description,
        repair_description: values.repair_description || null,
        work_hours: values.work_hours,
        driven_km: values.driven_km,
        parts: cleanParts,
        work_lines: cleanWork,
        total_price_net: total,
        created_by_email: appUser.email,
      }, status);

      toast.success(status === 'draft' ? T.savedDraft[lang] : T.sentOk[lang]);
      setDone({ id: res.claim.id, status });
    } catch {
      toast.error(T.saveError[lang]);
    } finally {
      setSubmitting(null);
    }
  }

  const inputCls = (key: string, extra = '') =>
    `w-full rounded-lg border px-3 py-2 text-sm bg-white ${
      errors[key] ? 'border-rose-400 focus:outline-rose-500' : 'border-gray-300 focus:outline-[#2d5a27]'
    } ${extra}`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      {/* Back button */}
      <div className="bg-white border-b border-gray-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/portal/service/claims')}
            className="flex items-center text-[#2d5a27] font-semibold hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>
        </div>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
              <LifeBuoy className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{T.title[lang]}</h1>
              <p className="text-gray-500 mt-1 text-sm">{T.intro[lang]}</p>
            </div>
          </div>
          {viewVariant !== 'none' && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${viewVariant === 'internal' ? 'bg-[#2d5a27]/10 text-[#2d5a27]' : 'bg-blue-50 text-blue-700'}`}>
              {viewVariant === 'internal' ? T.viewInternal[lang] : T.viewDealer[lang]}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        {!allowed || !canCreate ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center gap-3 text-gray-700">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            {T.noAccess[lang]}
          </div>
        ) : done ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {done.status === 'draft' ? T.savedDraft[lang] : T.sentOk[lang]}
            </h2>
            <p className="text-sm text-gray-500 mb-6">#{done.id}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/portal/service/claims')}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50"
              >
                {T.back[lang]}
              </button>
              <button
                onClick={() => navigate(`/portal/service/claims/${done.id}`)}
                className="px-4 py-2 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244820]"
              >
                {T.title[lang]} →
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit('submitted'); }}
            className="space-y-6"
          >
            {/* Dealer */}
            <Section title={T.sDealer[lang]}>
              <Grid>
                <FieldText label={T.fCompany[lang]} required value={form.dealer_company} onChange={(v) => setField('dealer_company', v)} cls={inputCls('dealer_company')} error={errors.dealer_company} />
                <FieldText label={T.fContact[lang]} value={form.dealer_contact} onChange={(v) => setField('dealer_contact', v)} cls={inputCls('dealer_contact')} />
                <FieldText label={T.fEmail[lang]} type="email" value={form.dealer_email} onChange={(v) => setField('dealer_email', v)} cls={inputCls('dealer_email')} error={errors.dealer_email} />
                <FieldText label={T.fPhone[lang]} value={form.dealer_phone} onChange={(v) => setField('dealer_phone', v)} cls={inputCls('dealer_phone')} />
              </Grid>
            </Section>

            {/* Owner */}
            <Section title={T.sOwner[lang]}>
              <Grid>
                <FieldText label={T.fName[lang]} required value={form.customer_name} onChange={(v) => setField('customer_name', v)} cls={inputCls('customer_name')} error={errors.customer_name} />
                <FieldText label={T.fContact[lang]} value={form.customer_contact} onChange={(v) => setField('customer_contact', v)} cls={inputCls('customer_contact')} />
                <FieldText label={T.fEmail[lang]} type="email" value={form.customer_email} onChange={(v) => setField('customer_email', v)} cls={inputCls('customer_email')} error={errors.customer_email} />
                <FieldText label={T.fPhone[lang]} value={form.customer_phone} onChange={(v) => setField('customer_phone', v)} cls={inputCls('customer_phone')} />
              </Grid>
            </Section>

            {/* Machine */}
            <Section title={T.sMachine[lang]}>
              <Grid>
                <FieldText label={T.fModel[lang]} required value={form.machine_model} onChange={(v) => setField('machine_model', v)} cls={inputCls('machine_model')} error={errors.machine_model} />
                <FieldText label={T.fSerial[lang]} required value={form.machine_serial} onChange={(v) => setField('machine_serial', v)} cls={inputCls('machine_serial')} error={errors.machine_serial} />
                <FieldText label={T.fYear[lang]} value={form.machine_year} onChange={(v) => setField('machine_year', v)} cls={inputCls('machine_year')} />
              </Grid>
            </Section>

            {/* Dates */}
            <Section title={T.sDates[lang]}>
              <Grid>
                <FieldText label={T.fDelivery[lang]} type="date" value={form.delivery_date} onChange={(v) => setField('delivery_date', v)} cls={inputCls('delivery_date')} />
                <FieldText label={T.fFault[lang]} type="date" value={form.fault_date} onChange={(v) => setField('fault_date', v)} cls={inputCls('fault_date')} />
                <FieldText label={T.fRepair[lang]} type="date" value={form.repair_date} onChange={(v) => setField('repair_date', v)} cls={inputCls('repair_date')} />
              </Grid>
            </Section>

            {/* Fault description */}
            <Section title={T.sFault[lang]}>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                {T.fDesc[lang]} <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                className={inputCls('description')}
              />
              {errors.description && <p className="mt-1 text-xs text-rose-600">{T.required[lang]}</p>}
            </Section>

            {/* Repair description */}
            <Section title={T.sRepair[lang]}>
              <textarea
                rows={4}
                value={form.repair_description}
                onChange={(e) => setField('repair_description', e.target.value)}
                className={inputCls('repair_description')}
              />
            </Section>

            {/* Service hours / km */}
            <Section title={T.sService[lang]}>
              <Grid>
                <FieldNumber label={T.fHours[lang]} value={form.work_hours} onChange={(v) => setField('work_hours', v)} cls={inputCls('work_hours')} />
                <FieldNumber label={T.fKm[lang]} value={form.driven_km} onChange={(v) => setField('driven_km', v)} cls={inputCls('driven_km')} />
              </Grid>
            </Section>

            {/* Parts */}
            <Section title={T.sParts[lang]}>
              <div className="space-y-2">
                {parts.map((p, idx) => (
                  <div key={p.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <Label>{T.fPart[lang]}</Label>
                      <input className={inputCls('')} value={p.part_number || ''} onChange={(e) => {
                        const v = e.target.value;
                        setParts(prev => prev.map((x, i) => i === idx ? { ...x, part_number: v } : x));
                      }} />
                    </div>
                    <div className="col-span-4">
                      <Label>{T.fDesc[lang]}</Label>
                      <input className={inputCls('')} value={p.description} onChange={(e) => {
                        const v = e.target.value;
                        setParts(prev => prev.map((x, i) => i === idx ? { ...x, description: v } : x));
                      }} />
                    </div>
                    <div className="col-span-2">
                      <Label>{T.fQty[lang]}</Label>
                      <input type="number" min={0} step="1" className={inputCls('')} value={p.quantity || ''} onChange={(e) => {
                        const v = toNonNegNumber(e.target.value);
                        setParts(prev => prev.map((x, i) => i === idx ? { ...x, quantity: v } : x));
                      }} />
                    </div>
                    <div className="col-span-2">
                      <Label>{T.fUnit[lang]}</Label>
                      <input type="number" min={0} step="0.01" className={inputCls('')} value={p.unit_price_net || ''} onChange={(e) => {
                        const v = toNonNegNumber(e.target.value);
                        setParts(prev => prev.map((x, i) => i === idx ? { ...x, unit_price_net: v } : x));
                      }} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" onClick={() => setParts(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-rose-600" aria-label="remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setParts(prev => [...prev, { id: uid(), description: '', quantity: 0, unit_price_net: 0 }])}
                  className="inline-flex items-center gap-1 text-[#2d5a27] text-sm font-semibold hover:underline"
                >
                  <Plus className="h-4 w-4" /> {T.addLine[lang]}
                </button>
              </div>
            </Section>

            {/* Work lines */}
            <Section title={T.sWork[lang]}>
              <div className="space-y-2">
                {workLines.map((w, idx) => (
                  <div key={w.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-6">
                      <Label>{T.fDesc[lang]}</Label>
                      <input className={inputCls('')} value={w.description} onChange={(e) => {
                        const v = e.target.value;
                        setWorkLines(prev => prev.map((x, i) => i === idx ? { ...x, description: v } : x));
                      }} />
                    </div>
                    <div className="col-span-2">
                      <Label>{T.fLineHours[lang]}</Label>
                      <input type="number" min={0} step="0.25" className={inputCls('')} value={w.hours || ''} onChange={(e) => {
                        const v = toNonNegNumber(e.target.value);
                        setWorkLines(prev => prev.map((x, i) => i === idx ? { ...x, hours: v } : x));
                      }} />
                    </div>
                    <div className="col-span-3">
                      <Label>{T.fRate[lang]}</Label>
                      <input type="number" min={0} step="0.01" className={inputCls('')} value={w.hourly_rate_net || ''} onChange={(e) => {
                        const v = toNonNegNumber(e.target.value);
                        setWorkLines(prev => prev.map((x, i) => i === idx ? { ...x, hourly_rate_net: v } : x));
                      }} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" onClick={() => setWorkLines(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-rose-600" aria-label="remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setWorkLines(prev => [...prev, { id: uid(), description: '', hours: 0, hourly_rate_net: 0 }])}
                  className="inline-flex items-center gap-1 text-[#2d5a27] text-sm font-semibold hover:underline"
                >
                  <Plus className="h-4 w-4" /> {T.addLine[lang]}
                </button>
              </div>
            </Section>

            {/* Total */}
            <Section title={T.sTotals[lang]}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{T.total[lang]}</span>
                <span className="text-2xl font-bold text-gray-900">
                  {total.toLocaleString(lang === 'en' ? 'en-GB' : lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </Section>

            {/* Attachments placeholder */}
            <Section title={T.sFiles[lang]}>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
                {T.filesSoon[lang]}
              </div>
            </Section>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
              <button
                type="button"
                disabled={submitting !== null}
                onClick={() => handleSubmit('draft')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {submitting === 'draft' ? T.saving[lang] : T.saveDraft[lang]}
              </button>
              <button
                type="submit"
                disabled={submitting !== null}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244820] disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {submitting === 'submitted' ? T.saving[lang] : T.sendTiman[lang]}
              </button>
            </div>
          </form>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

// ---------- Small UI helpers ----------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">{children}</label>;
}
function FieldText({
  label, value, onChange, cls, type = 'text', required, error,
}: {
  label: string; value: string; onChange: (v: string) => void; cls: string;
  type?: string; required?: boolean; error?: string;
}) {
  return (
    <div>
      <Label>
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cls} maxLength={255} />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
function FieldNumber({
  label, value, onChange, cls,
}: { label: string; value: string; onChange: (v: string) => void; cls: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange('');
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return;
          onChange(raw);
        }}
        className={cls}
      />
    </div>
  );
}
