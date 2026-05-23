// Phase 43 — Service registrering og vedligehold
// Two-part page: (1) Timan internal machine overview, (2) Create service registration.
// Dealer users see only their own machines/registrations + the create form.

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, Upload, Search, Filter } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { Language } from '@/types/configurator';
import { derivePortalRole } from '@/lib/portalAccess';
import {
  ServiceMachine,
  ServiceRegistration,
  ServiceInterval,
  listServiceIntervals,
  listServiceMachines,
  listServiceRegistrations,
  createServiceRegistration,
} from '@/lib/serviceMaintenanceService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { SERVICE_MACHINE_TYPES, getBasisIntervals, findServiceMachineType } from '@/lib/serviceMachineTypes';

const ALL_DEALERS = '__all__';
const ALL_TYPES = '__all_types__';

const T: Record<string, Record<Language, string>> = {
  back: { da: 'Tilbage til Teknik & Service', en: 'Back to Technical & Service', de: 'Zurück zu Technik & Service', it: 'Torna a Tecnico & Assistenza', hu: 'Vissza a Műszaki & Szervizhez' },
  title: { da: 'Service registrering og vedligehold', en: 'Service registration and maintenance', de: 'Serviceerfassung und Wartung', it: 'Registrazione servizio e manutenzione', hu: 'Szervizregisztráció és karbantartás' },
  subtitle: { da: 'Registrer udført service og se komplet servicehistorik pr. maskine.', en: 'Register completed service and view the full service history per machine.', de: 'Erfassen Sie durchgeführten Service und sehen Sie die vollständige Service-Historie pro Maschine.', it: 'Registra il servizio completato e visualizza la cronologia completa per macchina.', hu: 'Regisztrálja az elvégzett szervizt és tekintse meg a teljes szerviz előzményeket gépenként.' },
  tabOverview: { da: 'Maskinoversigt', en: 'Machine overview', de: 'Maschinenübersicht', it: 'Panoramica macchine', hu: 'Gépáttekintés' },
  tabNew: { da: 'Opret service registrering', en: 'Create service registration', de: 'Serviceerfassung anlegen', it: 'Crea registrazione servizio', hu: 'Új szervizregisztráció' },
  tabMine: { da: 'Mine service registreringer', en: 'My service registrations', de: 'Meine Serviceerfassungen', it: 'Le mie registrazioni', hu: 'Saját regisztrációim' },
  filterDealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  filterType: { da: 'Maskintype', en: 'Machine type', de: 'Maschinentyp', it: 'Tipo macchina', hu: 'Géptípus' },
  filterSerial: { da: 'Serienummer', en: 'Serial number', de: 'Seriennummer', it: 'Numero di serie', hu: 'Sorozatszám' },
  search: { da: 'Søg', en: 'Search', de: 'Suchen', it: 'Cerca', hu: 'Keresés' },
  none: { da: 'Ingen resultater.', en: 'No results.', de: 'Keine Ergebnisse.', it: 'Nessun risultato.', hu: 'Nincs találat.' },
  colSerial: { da: 'Serienr.', en: 'Serial no.', de: 'Seriennr.', it: 'N. serie', hu: 'Sorozatszám' },
  colType: { da: 'Maskintype', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus' },
  colDealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  colCustomer: { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  colLastService: { da: 'Seneste service', en: 'Last service', de: 'Letzter Service', it: 'Ultimo servizio', hu: 'Utolsó szerviz' },
  colNextService: { da: 'Næste interval', en: 'Next interval', de: 'Nächstes Intervall', it: 'Prossimo intervallo', hu: 'Köv. intervallum' },
  colHours: { da: 'Driftstimer', en: 'Hours', de: 'Betriebsstunden', it: 'Ore', hu: 'Üzemóra' },
  colNotes: { da: 'Åbne bemærkninger', en: 'Open notes', de: 'Offene Hinweise', it: 'Note aperte', hu: 'Nyitott megj.' },
  history: { da: 'Servicehistorik', en: 'Service history', de: 'Service-Historie', it: 'Cronologia servizi', hu: 'Szerviz előzmények' },
  closeHistory: { da: 'Luk', en: 'Close', de: 'Schließen', it: 'Chiudi', hu: 'Bezárás' },
  fSerial: { da: 'Maskinnr. / serienummer *', en: 'Machine no. / serial number *', de: 'Maschinennr. / Seriennummer *', it: 'N. macchina / serie *', hu: 'Gépszám / sorozatszám *' },
  fType: { da: 'Maskintype *', en: 'Machine type *', de: 'Maschinentyp *', it: 'Tipo macchina *', hu: 'Géptípus *' },
  fDealer: { da: 'Forhandler der udfører service *', en: 'Dealer performing service *', de: 'Servicedurchführender Händler *', it: 'Rivenditore che esegue il servizio *', hu: 'Szervizt végző kereskedő *' },
  fCustomer: { da: 'Kunde / bruger', en: 'Customer / user', de: 'Kunde / Benutzer', it: 'Cliente / utente', hu: 'Ügyfél / felhasználó' },
  fDate: { da: 'Servicedato *', en: 'Service date *', de: 'Servicedatum *', it: 'Data servizio *', hu: 'Szervizdátum *' },
  fHours: { da: 'Driftstimer *', en: 'Operating hours *', de: 'Betriebsstunden *', it: 'Ore di esercizio *', hu: 'Üzemóra *' },
  fInterval: { da: 'Service interval *', en: 'Service interval *', de: 'Serviceintervall *', it: 'Intervallo servizio *', hu: 'Szerviz intervallum *' },
  fTech: { da: 'Tekniker / signatur *', en: 'Technician / signature *', de: 'Techniker / Unterschrift *', it: 'Tecnico / firma *', hu: 'Technikus / aláírás *' },
  fPlan: { da: 'Udført iht. serviceplan', en: 'Completed per service plan', de: 'Gemäß Serviceplan ausgeführt', it: 'Eseguito secondo il piano', hu: 'Szervizterv szerint elvégezve' },
  fNotes: { da: 'Bemærkninger / indsigelser', en: 'Notes / objections', de: 'Bemerkungen / Einwände', it: 'Note / obiezioni', hu: 'Megjegyzések / kifogások' },
  fFaults: { da: 'Fejl fundet under service', en: 'Faults found during service', de: 'Bei Service gefundene Fehler', it: 'Guasti rilevati', hu: 'Szerviz közben talált hibák' },
  fParts: { da: 'Anvendte reservedele', en: 'Spare parts used', de: 'Verwendete Ersatzteile', it: 'Ricambi utilizzati', hu: 'Felhasznált alkatrészek' },
  fUpload: { da: 'Vedhæft billeder/dokumenter (kommer snart)', en: 'Attach images/documents (coming soon)', de: 'Bilder/Dokumente anhängen (bald)', it: 'Allega immagini/documenti (in arrivo)', hu: 'Képek/dokumentumok csatolása (hamarosan)' },
  save: { da: 'Gem service', en: 'Save service', de: 'Service speichern', it: 'Salva servizio', hu: 'Szerviz mentése' },
  saving: { da: 'Gemmer…', en: 'Saving…', de: 'Speichern…', it: 'Salvataggio…', hu: 'Mentés…' },
  required: { da: 'Felt er påkrævet', en: 'Field is required', de: 'Pflichtfeld', it: 'Campo obbligatorio', hu: 'Kötelező mező' },
  saved: { da: 'Service registreret', en: 'Service registered', de: 'Service erfasst', it: 'Servizio registrato', hu: 'Szerviz regisztrálva' },
  savedDesc: { da: 'Registreringen er gemt og knyttet til maskinen.', en: 'Registration saved and linked to the machine.', de: 'Erfassung gespeichert und der Maschine zugeordnet.', it: 'Registrazione salvata e collegata alla macchina.', hu: 'A regisztráció elmentve és a géphez kapcsolva.' },
  saveError: { da: 'Kunne ikke gemme', en: 'Could not save', de: 'Speichern fehlgeschlagen', it: 'Salvataggio non riuscito', hu: 'Mentés sikertelen' },
  ownDealer: { da: 'Egen forhandler', en: 'Own dealer', de: 'Eigener Händler', it: 'Proprio rivenditore', hu: 'Saját kereskedő' },
  dealerLocked: { da: 'Forhandler er låst til din konto', en: 'Dealer locked to your account', de: 'Händler ist mit Ihrem Konto verknüpft', it: 'Rivenditore bloccato sul tuo account', hu: 'A kereskedő a fiókodhoz van rögzítve' },
  dealerLockedHelp: { da: 'Du kan kun registrere service for din egen forhandlerkonto.', en: 'You can only register service for your own dealer account.', de: 'Sie können Service nur für Ihr eigenes Händlerkonto erfassen.', it: 'Puoi registrare servizi solo per il tuo account rivenditore.', hu: 'Csak a saját kereskedői fiókodhoz regisztrálhatsz szervizt.' },
  noDealerLink: { da: 'Din bruger er ikke knyttet til en forhandlerkonto. Kontakt Timan.', en: 'Your user is not linked to a dealer account. Contact Timan.', de: 'Ihr Benutzer ist keinem Händlerkonto zugeordnet. Kontaktieren Sie Timan.', it: 'Il tuo utente non è collegato a un account rivenditore. Contatta Timan.', hu: 'A felhasználód nincs kereskedői fiókhoz rendelve. Lépj kapcsolatba a Timannal.' },
};

type Tab = 'overview' | 'new' | 'mine';

export default function ServiceMaintenancePage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const t = (k: keyof typeof T) => T[k][lang] || T[k].en;

  const portalRole = derivePortalRole(appUser);
  const isBackend = portalRole === 'timan_backend' || portalRole === 'timan_seller' || portalRole === 'timan_service';

  const [tab, setTab] = useState<Tab>(isBackend ? 'overview' : 'new');
  const [machines, setMachines] = useState<ServiceMachine[]>([]);
  const [registrations, setRegistrations] = useState<ServiceRegistration[]>([]);
  const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
  const [historyFor, setHistoryFor] = useState<ServiceMachine | null>(null);
  const [historyRows, setHistoryRows] = useState<ServiceRegistration[]>([]);

  // Filters
  const [fDealer, setFDealer] = useState('');
  const [fType, setFType] = useState('');
  const [fSerial, setFSerial] = useState('');
  const [dealers, setDealers] = useState<DealerAccount[]>([]);

  useEffect(() => {
    if (!isBackend) return;
    fetchDealerAccounts().then(r => setDealers(r.rows.filter(d => !d.is_deleted))).catch(() => setDealers([]));
  }, [isBackend]);

  // Form
  const dealerNumber = appUser?.dealer_number ?? null;
  const dealerName = appUser?.company_dealer ?? null;
  const [form, setForm] = useState({
    serial_number: '',
    machine_type: 'RC-1000',
    dealer_number: dealerNumber ?? '',
    dealer_name: dealerName ?? '',
    customer_name: '',
    service_date: new Date().toISOString().slice(0, 10),
    operating_hours: '',
    service_interval_hours: '',
    technician_name: '',
    service_plan_completed: true,
    notes: '',
    faults_found: '',
    spare_parts_used: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listServiceIntervals(form.machine_type).then(setIntervals).catch(() => setIntervals([]));
  }, [form.machine_type]);

  const reload = useMemo(() => async () => {
    try {
      const m = await listServiceMachines({
        dealerNumber: isBackend ? (fDealer || null) : dealerNumber,
        machineType: fType || null,
        search: fSerial || null,
      });
      setMachines(m);
      const r = await listServiceRegistrations({
        dealerNumber: isBackend ? (fDealer || undefined) : dealerNumber ?? undefined,
      });
      setRegistrations(r);
    } catch (e) {
      console.error('[service-maintenance] load failed', e);
    }
  }, [isBackend, dealerNumber, fDealer, fType, fSerial]);

  useEffect(() => { if (appUser) reload(); }, [appUser, reload]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;

  const lastServiceFor = (serial: string) => registrations.find(r => r.serial_number.toLowerCase() === serial.toLowerCase());
  const historyOpen = async (m: ServiceMachine) => {
    setHistoryFor(m);
    const rows = await listServiceRegistrations({ serialNumber: m.serial_number });
    setHistoryRows(rows);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, boolean> = {};
    if (!form.serial_number.trim()) newErrors.serial_number = true;
    if (!form.machine_type.trim()) newErrors.machine_type = true;
    if (!form.dealer_number.trim() && !form.dealer_name.trim()) newErrors.dealer_name = true;
    if (!form.service_date) newErrors.service_date = true;
    if (!form.operating_hours.trim()) newErrors.operating_hours = true;
    if (!form.service_interval_hours.trim()) newErrors.service_interval_hours = true;
    if (!form.technician_name.trim()) newErrors.technician_name = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setSubmitting(true);
    try {
      // Dealer-scoped users: ignore any dealer values from UI/state, always
      // force the logged-in user's own dealer account.
      const effectiveDealerNumber = isBackend ? (form.dealer_number.trim() || null) : (dealerNumber || null);
      const effectiveDealerName = isBackend ? (form.dealer_name.trim() || null) : (dealerName || null);
      if (!isBackend && !effectiveDealerNumber) {
        toast({ title: t('saveError'), description: t('noDealerLink'), variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      await createServiceRegistration({
        serial_number: form.serial_number.trim(),
        machine_type: form.machine_type.trim(),
        dealer_number: effectiveDealerNumber,
        dealer_name: effectiveDealerName,
        customer_name: form.customer_name.trim() || null,
        service_date: form.service_date,
        operating_hours: Number(form.operating_hours) || 0,
        service_interval_hours: Number(form.service_interval_hours) || 0,
        technician_name: form.technician_name.trim() || null,
        service_plan_completed: form.service_plan_completed,
        notes: form.notes.trim() || null,
        faults_found: form.faults_found.trim() || null,
        spare_parts_used: form.spare_parts_used.trim() || null,
        attachment_urls: [],
      }, appUser.email ?? null);
      toast({ title: t('saved'), description: t('savedDesc') });
      setForm(f => ({ ...f, operating_hours: '', service_interval_hours: '', notes: '', faults_found: '', spare_parts_used: '' }));
      await reload();
      if (isBackend) setTab('overview');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: t('saveError'), description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <Link to="/portal/teknik-service" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />{t('back')}
        </Link>
        <div className="mb-8 flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#2d5a27]/10 flex items-center justify-center"><Wrench className="h-8 w-8 text-[#2d5a27]" /></div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-gray-600 text-base mt-1 max-w-3xl">{t('subtitle')}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {isBackend && <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>}
            {!isBackend && <TabsTrigger value="mine">{t('tabMine')}</TabsTrigger>}
            <TabsTrigger value="new">{t('tabNew')}</TabsTrigger>
          </TabsList>

          {isBackend && (
            <TabsContent value="overview" className="mt-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                  <div>
                    <Label className="text-xs">{t('filterDealer')}</Label>
                    <Select value={fDealer || ALL_DEALERS} onValueChange={(v) => setFDealer(v === ALL_DEALERS ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={t('filterDealer')} /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={ALL_DEALERS}>{t('filterDealer')}</SelectItem>
                        {dealers.map(d => (
                          <SelectItem key={d.id} value={d.account_number}>
                            {d.account_number} — {d.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">{t('filterType')}</Label><Input value={fType} onChange={e => setFType(e.target.value)} placeholder="RC-1000" /></div>
                  <div><Label className="text-xs">{t('filterSerial')}</Label><Input value={fSerial} onChange={e => setFSerial(e.target.value)} placeholder="…" /></div>
                  <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => reload()}><Filter className="h-4 w-4 mr-2" />{t('search')}</Button></div>
                </div>
                <MachineTable machines={machines} t={t} lastServiceFor={lastServiceFor} onOpen={historyOpen} />
              </div>
            </TabsContent>
          )}

          {!isBackend && (
            <TabsContent value="mine" className="mt-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <MachineTable machines={machines} t={t} lastServiceFor={lastServiceFor} onOpen={historyOpen} />
              </div>
            </TabsContent>
          )}

          <TabsContent value="new" className="mt-6">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t('fSerial')} error={errors.serial_number ? t('required') : null}>
                <Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
              </Field>
              <Field label={t('fType')} error={errors.machine_type ? t('required') : null}>
                <Input value={form.machine_type} onChange={e => setForm({ ...form, machine_type: e.target.value })} />
              </Field>
              <Field label={isBackend ? t('fDealer') : t('ownDealer')} error={isBackend && errors.dealer_name ? t('required') : null}>
                {isBackend ? (
                  <Select
                    value={form.dealer_number || ''}
                    onValueChange={(v) => {
                      const d = dealers.find(x => x.account_number === v);
                      setForm({ ...form, dealer_number: v, dealer_name: d?.company_name ?? '' });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={t('fDealer')} /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {dealers.map(d => (
                        <SelectItem key={d.id} value={d.account_number}>
                          {d.account_number} — {d.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <Input
                      value={dealerNumber ? `${dealerNumber}${dealerName ? ' — ' + dealerName : ''}` : ''}
                      placeholder={t('noDealerLink')}
                      disabled
                      readOnly
                      aria-label={t('dealerLocked')}
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('dealerLockedHelp')}</p>
                  </div>
                )}
              </Field>
              <Field label={t('fCustomer')}>
                <Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              </Field>
              <Field label={t('fDate')} error={errors.service_date ? t('required') : null}>
                <Input type="date" value={form.service_date} onChange={e => setForm({ ...form, service_date: e.target.value })} />
              </Field>
              <Field label={t('fHours')} error={errors.operating_hours ? t('required') : null}>
                <Input type="number" min={0} value={form.operating_hours} onChange={e => setForm({ ...form, operating_hours: e.target.value })} />
              </Field>
              <Field label={t('fInterval')} error={errors.service_interval_hours ? t('required') : null}>
                <Select value={form.service_interval_hours} onValueChange={(v) => setForm({ ...form, service_interval_hours: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {intervals.map(i => <SelectItem key={i.id} value={String(i.interval_hours)}>{i.label || `${i.interval_hours} h`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('fTech')} error={errors.technician_name ? t('required') : null}>
                <Input value={form.technician_name} onChange={e => setForm({ ...form, technician_name: e.target.value })} />
              </Field>
              <div className="md:col-span-2 flex items-center gap-2">
                <Checkbox id="plan" checked={form.service_plan_completed} onCheckedChange={(v) => setForm({ ...form, service_plan_completed: v === true })} />
                <Label htmlFor="plan">{t('fPlan')}</Label>
              </div>
              <Field label={t('fNotes')} full><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <Field label={t('fFaults')} full><Textarea rows={2} value={form.faults_found} onChange={e => setForm({ ...form, faults_found: e.target.value })} /></Field>
              <Field label={t('fParts')} full><Textarea rows={2} value={form.spare_parts_used} onChange={e => setForm({ ...form, spare_parts_used: e.target.value })} /></Field>
              <div className="md:col-span-2">
                <Label className="text-xs text-gray-500 flex items-center gap-2"><Upload className="h-4 w-4" />{t('fUpload')}</Label>
                <Input type="file" disabled className="mt-1 opacity-60" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={submitting}>{submitting ? t('saving') : t('save')}</Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>

        {historyFor && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{t('history')} — {historyFor.serial_number} ({historyFor.machine_type})</h2>
                <Button variant="secondary" onClick={() => setHistoryFor(null)}>{t('closeHistory')}</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t('colLastService')}</TableHead>
                  <TableHead>{t('colHours')}</TableHead>
                  <TableHead>{t('fInterval')}</TableHead>
                  <TableHead>{t('fTech')}</TableHead>
                  <TableHead>{t('fNotes')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {historyRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-500">{t('none')}</TableCell></TableRow>}
                  {historyRows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.service_date}</TableCell>
                      <TableCell>{r.operating_hours ?? '—'}</TableCell>
                      <TableCell>{r.service_interval_hours} h</TableCell>
                      <TableCell>{r.technician_name ?? '—'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={r.notes ?? ''}>{r.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>
      <PortalFooter language={lang} />
    </div>
  );
}

function Field({ label, error, full, children }: { label: string; error?: string | null; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function MachineTable({ machines, t, lastServiceFor, onOpen }: {
  machines: ServiceMachine[];
  t: (k: string) => string;
  lastServiceFor: (s: string) => ServiceRegistration | undefined;
  onOpen: (m: ServiceMachine) => void;
}) {
  if (machines.length === 0) return <div className="text-sm text-gray-500 py-8 text-center">{t('none')}</div>;
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{t('colSerial')}</TableHead>
        <TableHead>{t('colType')}</TableHead>
        <TableHead>{t('colDealer')}</TableHead>
        <TableHead>{t('colCustomer')}</TableHead>
        <TableHead>{t('colLastService')}</TableHead>
        <TableHead>{t('colNextService')}</TableHead>
        <TableHead>{t('colHours')}</TableHead>
        <TableHead>{t('history')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {machines.map(m => {
          const last = lastServiceFor(m.serial_number);
          const next = last ? last.service_interval_hours + (last.service_interval_hours >= 1000 ? 100 : 100) : 100;
          return (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.serial_number}</TableCell>
              <TableCell>{m.machine_type}</TableCell>
              <TableCell>{m.dealer_name ?? m.dealer_number ?? '—'}</TableCell>
              <TableCell>{m.customer_name ?? '—'}</TableCell>
              <TableCell>{last?.service_date ?? '—'}</TableCell>
              <TableCell>{next} h</TableCell>
              <TableCell>{last?.operating_hours ?? '—'}</TableCell>
              <TableCell><Button size="sm" variant="secondary" onClick={() => onOpen(m)}><Search className="h-3 w-3 mr-1" />{t('history')}</Button></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
