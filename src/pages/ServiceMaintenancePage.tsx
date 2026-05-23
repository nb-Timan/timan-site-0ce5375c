// Phase 43 — Service registrering og vedligehold
// Two-part page: (1) Timan internal machine overview, (2) Create service registration.
// Dealer users see only their own machines/registrations + the create form.

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, Upload, Search, Filter, Plus, Trash2 } from 'lucide-react';
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
  
  listServiceMachines,
  listServiceRegistrations,
  createServiceRegistration,
} from '@/lib/serviceMaintenanceService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { SERVICE_MACHINE_TYPES, getBasisIntervals, findServiceMachineType, getBasisStep } from '@/lib/serviceMachineTypes';

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
  selectType: { da: 'Vælg maskintype', en: 'Select machine type', de: 'Maschinentyp wählen', it: 'Seleziona tipo macchina', hu: 'Válassz géptípust' },
  allTypes: { da: 'Alle maskintyper', en: 'All machine types', de: 'Alle Maschinentypen', it: 'Tutti i tipi', hu: 'Minden géptípus' },
  basisMissing: { da: 'Servicegrundlag ikke opsat endnu for denne maskintype.', en: 'Service basis not configured yet for this machine type.', de: 'Servicegrundlage für diesen Maschinentyp noch nicht eingerichtet.', it: 'Base di servizio non ancora configurata per questo tipo di macchina.', hu: 'Ehhez a géptípushoz még nincs szervizalap beállítva.' },
  intervalHoursPlaceholder: { da: 'Timer, fx 250', en: 'Hours, e.g. 250', de: 'Stunden, z. B. 250', it: 'Ore, es. 250', hu: 'Óra, pl. 250' },
  basisTitle: { da: 'Servicegrundlag', en: 'Service basis', de: 'Servicegrundlage', it: 'Base servizio', hu: 'Szervizalap' },
  colItemNo: { da: 'Varenr', en: 'Item no.', de: 'Art.-Nr.', it: 'Cod.', hu: 'Cikkszám' },
  colItemName: { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás' },
  colUnitPrice: { da: 'Stk pris', en: 'Unit price', de: 'Stückpreis', it: 'Prezzo unit.', hu: 'Egységár' },
  colQty: { da: 'Antal', en: 'Qty', de: 'Anzahl', it: 'Qta', hu: 'Db' },
  colSum: { da: 'Sum', en: 'Sum', de: 'Summe', it: 'Somma', hu: 'Összeg' },
  colTotal: { da: 'Total', en: 'Total', de: 'Gesamt', it: 'Totale', hu: 'Összesen' },
  extraTitle: { da: 'Ekstra reservedele uden for servicekit', en: 'Extra spare parts outside service kit', de: 'Zusätzliche Ersatzteile außerhalb des Servicekits', it: 'Ricambi extra fuori dal kit di servizio', hu: 'Extra alkatrészek a szervizkészleten kívül' },
  extraAdd: { da: 'Tilføj ekstra reservedel', en: 'Add extra spare part', de: 'Zusätzliches Ersatzteil hinzufügen', it: 'Aggiungi ricambio extra', hu: 'Extra alkatrész hozzáadása' },
  extraEmpty: { da: 'Ingen ekstra reservedele tilføjet.', en: 'No extra spare parts added.', de: 'Keine zusätzlichen Ersatzteile.', it: 'Nessun ricambio extra.', hu: 'Nincs extra alkatrész.' },
  totalKit: { da: 'Total servicekit', en: 'Total service kit', de: 'Servicekit gesamt', it: 'Totale kit servizio', hu: 'Szervizkészlet összesen' },
  totalExtra: { da: 'Total ekstra reservedele', en: 'Total extra parts', de: 'Zusätzliche Teile gesamt', it: 'Totale ricambi extra', hu: 'Extra alkatrészek összesen' },
  totalGrand: { da: 'Total samlet', en: 'Grand total', de: 'Gesamtsumme', it: 'Totale generale', hu: 'Mindösszesen' },
  remove: { da: 'Slet', en: 'Remove', de: 'Entfernen', it: 'Rimuovi', hu: 'Törlés' },
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
    machine_type: SERVICE_MACHINE_TYPES[0].value,
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
  });
  const [extraParts, setExtraParts] = useState<Array<{ id: string; name: string; price: string; qty: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Intervals come exclusively from the shared serviceBasisData
  // (same source as TCO/Driftberegner "Se grundlag"). No DB fallback.
  const basisIntervals = useMemo(() => getBasisIntervals(form.machine_type), [form.machine_type]);
  const hasBasis = !!findServiceMachineType(form.machine_type)?.basisKey;
  useEffect(() => {
    setIntervals(
      basisIntervals.map((h) => ({
        id: `basis-${h}`,
        machine_type: form.machine_type,
        interval_hours: h,
        label: `${h} timer`,
        active: true,
      })),
    );
  }, [form.machine_type, basisIntervals]);

  // Reset interval when machine type changes.
  useEffect(() => {
    setForm((f) => ({ ...f, service_interval_hours: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.machine_type]);

  // Selected service step (rows + total) from serviceBasisData.
  const selectedStep = useMemo(
    () => getBasisStep(form.machine_type, Number(form.service_interval_hours) || null),
    [form.machine_type, form.service_interval_hours],
  );

  // Extra parts totals
  const extraRows = useMemo(() => extraParts.map((p) => {
    const price = Number(p.price) || 0;
    const qty = Number(p.qty) || 0;
    return { ...p, priceNum: price, qtyNum: qty, sum: price * qty };
  }), [extraParts]);
  const extraTotal = useMemo(() => extraRows.reduce((s, r) => s + r.sum, 0), [extraRows]);
  const kitTotal = selectedStep?.stepTotal ?? 0;
  const grandTotal = kitTotal + extraTotal;

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
        spare_parts_used: serializeParts(form.machine_type, form.service_interval_hours, selectedStep, extraRows, kitTotal, extraTotal, grandTotal),
        attachment_urls: [],
      }, appUser.email ?? null);
      toast({ title: t('saved'), description: t('savedDesc') });
      setForm(f => ({ ...f, operating_hours: '', service_interval_hours: '', notes: '', faults_found: '' }));
      setExtraParts([]);
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
                  <div>
                    <Label className="text-xs">{t('filterType')}</Label>
                    <Select value={fType || ALL_TYPES} onValueChange={(v) => setFType(v === ALL_TYPES ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={t('allTypes')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_TYPES}>{t('allTypes')}</SelectItem>
                        {SERVICE_MACHINE_TYPES.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                <Select value={form.machine_type} onValueChange={(v) => setForm({ ...form, machine_type: v })}>
                  <SelectTrigger><SelectValue placeholder={t('selectType')} /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_MACHINE_TYPES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {hasBasis ? (
                  <Select value={form.service_interval_hours} onValueChange={(v) => setForm({ ...form, service_interval_hours: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {intervals.map(i => <SelectItem key={i.id} value={String(i.interval_hours)}>{i.label || `${i.interval_hours} h`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <Input
                      type="number"
                      min={0}
                      value={form.service_interval_hours}
                      onChange={e => setForm({ ...form, service_interval_hours: e.target.value })}
                      placeholder={t('intervalHoursPlaceholder')}
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('basisMissing')}</p>
                  </div>
                )}
              </Field>
              <Field label={t('fTech')} error={errors.technician_name ? t('required') : null}>
                <Input value={form.technician_name} onChange={e => setForm({ ...form, technician_name: e.target.value })} />
              </Field>
              {selectedStep && (
                <div className="md:col-span-2 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                    {t('basisTitle')} — {form.machine_type} / {form.service_interval_hours} timer
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('colItemNo')}</TableHead>
                        <TableHead>{t('colItemName')}</TableHead>
                        <TableHead className="text-right">{t('colUnitPrice')}</TableHead>
                        <TableHead className="text-right">{t('colQty')}</TableHead>
                        <TableHead className="text-right">{t('colSum')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedStep.rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right">{r.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right">{r.sum.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={4} className="text-right font-semibold">{t('colTotal')}</TableCell>
                        <TableCell className="text-right font-semibold">{selectedStep.stepTotal.toFixed(2)} kr</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="md:col-span-2 flex items-center gap-2">
                <Checkbox id="plan" checked={form.service_plan_completed} onCheckedChange={(v) => setForm({ ...form, service_plan_completed: v === true })} />
                <Label htmlFor="plan">{t('fPlan')}</Label>
              </div>
              <Field label={t('fNotes')} full><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <Field label={t('fFaults')} full><Textarea rows={2} value={form.faults_found} onChange={e => setForm({ ...form, faults_found: e.target.value })} /></Field>
              <div className="md:col-span-2 border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 flex items-center justify-between">
                  <span>{t('extraTitle')}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setExtraParts((rows) => [...rows, { id: '', name: '', price: '', qty: '1' }])}
                  >
                    <Plus className="h-4 w-4 mr-1" />{t('extraAdd')}
                  </Button>
                </div>
                {extraParts.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500 text-center">{t('extraEmpty')}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('colItemNo')}</TableHead>
                        <TableHead>{t('colItemName')}</TableHead>
                        <TableHead className="text-right w-32">{t('colUnitPrice')}</TableHead>
                        <TableHead className="text-right w-20">{t('colQty')}</TableHead>
                        <TableHead className="text-right w-28">{t('colSum')}</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extraRows.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              value={r.id}
                              onChange={(e) => setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, id: e.target.value } : x))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.name}
                              onChange={(e) => setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="text-right"
                              value={r.price}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
                                const parts = v.split('.');
                                const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
                                setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, price: cleaned } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="text-right"
                              value={r.qty}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, '');
                                setExtraParts((rows) => rows.map((x, i) => i === idx ? { ...x, qty: v } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">{r.sum.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={t('remove')}
                              onClick={() => setExtraParts((rows) => rows.filter((_, i) => i !== idx))}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              {(selectedStep || extraParts.length > 0) && (
                <div className="md:col-span-2 border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-600">{t('totalKit')}</span>
                      <div className="font-semibold">{kitTotal.toFixed(2)} kr</div>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-600">{t('totalExtra')}</span>
                      <div className="font-semibold">{extraTotal.toFixed(2)} kr</div>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-600">{t('totalGrand')}</span>
                      <div className="font-bold text-base">{grandTotal.toFixed(2)} kr</div>
                    </div>
                  </div>
                </div>
              )}
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

type ExtraRow = { id: string; name: string; priceNum: number; qtyNum: number; sum: number };

function serializeParts(
  machineType: string,
  intervalHours: string,
  selectedStep: { rows: { id: string; name: string; price: number; count: number; sum: number }[]; stepTotal: number } | null,
  extras: ExtraRow[],
  kitTotal: number,
  extraTotal: number,
  grandTotal: number,
): string | null {
  const parts: string[] = [];
  if (selectedStep) {
    parts.push(`[Servicekit] ${machineType} — ${intervalHours} timer`);
    selectedStep.rows.forEach((r) => {
      parts.push(`${r.id}\t${r.name}\t${r.count} stk\t${r.price.toFixed(2)} kr\t${r.sum.toFixed(2)} kr`);
    });
    parts.push(`Total servicekit: ${kitTotal.toFixed(2)} kr`);
  }
  if (extras.length > 0) {
    parts.push('');
    parts.push('[Ekstra reservedele uden for servicekit]');
    extras.forEach((r) => {
      parts.push(`${r.id || '-'}\t${r.name || '-'}\t${r.qtyNum} stk\t${r.priceNum.toFixed(2)} kr\t${r.sum.toFixed(2)} kr`);
    });
    parts.push(`Total ekstra: ${extraTotal.toFixed(2)} kr`);
  }
  if (selectedStep || extras.length > 0) {
    parts.push('');
    parts.push(`Total samlet: ${grandTotal.toFixed(2)} kr`);
  }
  const out = parts.join('\n').trim();
  return out || null;
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
