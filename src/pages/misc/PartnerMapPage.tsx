import { useMemo, useState } from 'react';
import { Search, MapPin, Users, FileText, ShoppingCart, TrendingUp, ExternalLink, Filter, X, Globe2, Building2, Wrench, Package, Sparkles } from 'lucide-react';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

type PartnerType = 'dealer' | 'service' | 'importer' | 'demo';
type Seller = 'EM' | 'JTN' | 'BP' | 'AKR' | 'NB';
type ViewLevel = 'europe' | 'country' | 'local';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  country: string; // ISO-like key: DE, DK, FR, GB, ...
  countryName: string;
  city: string;
  zip: string;
  account?: string;
  seller: Seller;
  users: number;
  quotes: number;
  orders: number;
  pipeline: number; // EUR k
  // Position in % within Europe SVG viewBox (0-100)
  ex: number;
  ey: number;
  // Position in % within Germany SVG viewBox
  dx?: number;
  dy?: number;
  // Position in % within local zoom viewBox
  lx?: number;
  ly?: number;
  linked?: string[]; // gennemfakturering
}

const PARTNERS: Partner[] = [
  { id: 'p1', name: 'Wilmers Kommunaltechnik GmbH', type: 'dealer', country: 'DE', countryName: 'Tyskland', city: 'Nordhorn', zip: '48529', account: '11081', seller: 'AKR', users: 5, quotes: 18, orders: 12, pipeline: 240, ex: 52, ey: 38, dx: 18, dy: 22, lx: 30, ly: 40, linked: ['Wilmers Service Süd'] },
  { id: 'p2', name: 'Valtec Technik', type: 'dealer', country: 'DE', countryName: 'Tyskland', city: 'Berlin', zip: '10267', account: '10267', seller: 'NB', users: 8, quotes: 31, orders: 27, pipeline: 510, ex: 58, ey: 34, dx: 70, dy: 28 },
  { id: 'p3', name: 'Bremen Servicepartner', type: 'service', country: 'DE', countryName: 'Tyskland', city: 'Bremen', zip: '28195', seller: 'NB', users: 3, quotes: 4, orders: 2, pipeline: 35, ex: 53, ey: 35, dx: 30, dy: 18 },
  { id: 'p4', name: 'Bayern Import GmbH', type: 'importer', country: 'DE', countryName: 'Tyskland', city: 'München', zip: '80331', seller: 'EM', users: 6, quotes: 12, orders: 9, pipeline: 320, ex: 55, ey: 42, dx: 60, dy: 78 },
  { id: 'p5', name: 'Nordhorn Demo Park', type: 'demo', country: 'DE', countryName: 'Tyskland', city: 'Nordhorn', zip: '48529', seller: 'AKR', users: 1, quotes: 0, orders: 0, pipeline: 0, ex: 51.5, ey: 37.5, dx: 19, dy: 23, lx: 55, ly: 50 },
  { id: 'p6', name: 'Timan Danmark', type: 'dealer', country: 'DK', countryName: 'Danmark', city: 'Tim', zip: '6980', account: '1000', seller: 'NB', users: 12, quotes: 44, orders: 38, pipeline: 870, ex: 55, ey: 22 },
  { id: 'p7', name: 'Valtec France', type: 'dealer', country: 'FR', countryName: 'Frankrig', city: 'Lyon', zip: '69000', account: '4850', seller: 'BP', users: 4, quotes: 9, orders: 6, pipeline: 140, ex: 42, ey: 55 },
  { id: 'p8', name: 'UK Grounds Import', type: 'importer', country: 'GB', countryName: 'Storbritannien', city: 'Birmingham', zip: 'B1', seller: 'JTN', users: 7, quotes: 15, orders: 11, pipeline: 290, ex: 36, ey: 32 },
  { id: 'p9', name: 'Hamburg Service Nord', type: 'service', country: 'DE', countryName: 'Tyskland', city: 'Hamburg', zip: '20095', seller: 'NB', users: 2, quotes: 3, orders: 1, pipeline: 20, ex: 54, ey: 33, dx: 45, dy: 14 },
  { id: 'p10', name: 'Köln Demo Center', type: 'demo', country: 'DE', countryName: 'Tyskland', city: 'Köln', zip: '50667', seller: 'EM', users: 1, quotes: 0, orders: 0, pipeline: 0, ex: 52.5, ey: 38.5, dx: 20, dy: 48 },
  { id: 'p11', name: 'Polen Maskiner sp.', type: 'dealer', country: 'PL', countryName: 'Polen', city: 'Warszawa', zip: '00-001', account: '7720', seller: 'NB', users: 3, quotes: 7, orders: 4, pipeline: 95, ex: 64, ey: 30 },
  { id: 'p12', name: 'Italia Verde srl', type: 'dealer', country: 'IT', countryName: 'Italien', city: 'Milano', zip: '20100', account: '6610', seller: 'EM', users: 5, quotes: 12, orders: 8, pipeline: 175, ex: 52, ey: 60 },
];

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  intro: {
    da: 'Globalt overblik over Timans forhandlere, servicepartnere, importører og demo-lokationer.',
    en: 'Global overview of Timan dealers, service partners, importers and demo locations.',
    de: 'Globaler Überblick über Timan-Händler, Servicepartner, Importeure und Demo-Standorte.',
    it: 'Panoramica globale di rivenditori, partner di servizio, importatori e demo Timan.',
    hu: 'Globális áttekintés a Timan partnerekről.',
  },
  search: { da: 'Søg firma, land, kontonr. eller postnr…', en: 'Search company, country, account or zip…', de: 'Firma, Land, Konto oder PLZ suchen…', it: 'Cerca azienda, paese, conto o CAP…', hu: 'Keresés…' },
  filters: { da: 'Filtre', en: 'Filters', de: 'Filter', it: 'Filtri', hu: 'Szűrők' },
  type: { da: 'Type', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus' },
  country: { da: 'Land', en: 'Country', de: 'Land', it: 'Paese', hu: 'Ország' },
  seller: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Eladó' },
  dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Forgalmazó' },
  service: { da: 'Servicepartner', en: 'Service partner', de: 'Servicepartner', it: 'Partner servizio', hu: 'Szervizpartner' },
  importer: { da: 'Importør', en: 'Importer', de: 'Importeur', it: 'Importatore', hu: 'Importőr' },
  demo: { da: 'Demo-lokation', en: 'Demo location', de: 'Demo-Standort', it: 'Demo', hu: 'Demo' },
  reset: { da: 'Nulstil', en: 'Reset', de: 'Zurücksetzen', it: 'Reimposta', hu: 'Visszaállítás' },
  europe: { da: 'Europa', en: 'Europe', de: 'Europa', it: 'Europa', hu: 'Európa' },
  germany: { da: 'Tyskland', en: 'Germany', de: 'Deutschland', it: 'Germania', hu: 'Németország' },
  local: { da: 'Lokalområde', en: 'Local area', de: 'Lokalbereich', it: 'Area locale', hu: 'Helyi terület' },
  details: { da: 'Partnerdetaljer', en: 'Partner details', de: 'Partnerdetails', it: 'Dettagli partner', hu: 'Partner adatok' },
  selectPin: { da: 'Klik en pin på kortet for at se detaljer.', en: 'Click a pin on the map to see details.', de: 'Pin anklicken für Details.', it: 'Clicca un pin per i dettagli.', hu: 'Kattints egy tűre.' },
  users: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felhasználók' },
  quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Ajánlatok' },
  orders: { da: 'Ordrer', en: 'Orders', de: 'Bestellungen', it: 'Ordini', hu: 'Rendelések' },
  pipeline: { da: 'Pipeline', en: 'Pipeline', de: 'Pipeline', it: 'Pipeline', hu: 'Pipeline' },
  openCrm: { da: 'Åbn CRM', en: 'Open CRM', de: 'CRM öffnen', it: 'Apri CRM', hu: 'CRM megnyitása' },
  linked: { da: 'Tilknyttede partnere', en: 'Linked partners', de: 'Verknüpfte Partner', it: 'Partner collegati', hu: 'Kapcsolt partnerek' },
  stats: { da: 'Statistik', en: 'Statistics', de: 'Statistik', it: 'Statistiche', hu: 'Statisztika' },
  total: { da: 'I alt', en: 'Total', de: 'Gesamt', it: 'Totale', hu: 'Összesen' },
  assignedSeller: { da: 'Tildelt sælger', en: 'Assigned seller', de: 'Zugewiesener Verkäufer', it: 'Venditore assegnato', hu: 'Eladó' },
  legend: { da: 'Forklaring', en: 'Legend', de: 'Legende', it: 'Legenda', hu: 'Jelmagyarázat' },
};

const TYPE_COLORS: Record<PartnerType, string> = {
  dealer: '#dc2626',     // red
  service: '#16a34a',    // green
  importer: '#2563eb',   // blue
  demo: '#9333ea',       // purple
};

const TYPE_ICON: Record<PartnerType, typeof Building2> = {
  dealer: Building2,
  service: Wrench,
  importer: Package,
  demo: Sparkles,
};

function countryShade(n: number): string {
  if (n === 0) return '#e5e7eb';
  if (n <= 3) return '#bbf7d0';
  if (n <= 10) return '#4ade80';
  return '#15803d';
}

// Simplified Europe country shapes (very stylized blocks for visual prototype)
const EUROPE_COUNTRIES: { code: string; name: string; path: string }[] = [
  { code: 'GB', name: 'Storbritannien', path: 'M30,22 L40,20 L42,32 L34,40 L28,36 Z' },
  { code: 'FR', name: 'Frankrig', path: 'M36,46 L50,44 L52,60 L40,64 L34,58 Z' },
  { code: 'DE', name: 'Tyskland', path: 'M48,28 L62,28 L62,44 L48,44 Z' },
  { code: 'DK', name: 'Danmark', path: 'M52,18 L60,18 L60,26 L52,26 Z' },
  { code: 'PL', name: 'Polen', path: 'M62,26 L74,26 L74,40 L62,40 Z' },
  { code: 'IT', name: 'Italien', path: 'M48,52 L58,52 L60,72 L52,74 L48,66 Z' },
  { code: 'ES', name: 'Spanien', path: 'M22,58 L38,58 L38,72 L22,72 Z' },
  { code: 'NL', name: 'Holland', path: 'M48,28 L52,28 L52,32 L48,32 Z' },
  { code: 'SE', name: 'Sverige', path: 'M58,8 L66,8 L68,22 L60,22 Z' },
  { code: 'NO', name: 'Norge', path: 'M48,6 L58,8 L60,22 L50,22 Z' },
];

interface PinProps { partner: Partner; x: number; y: number; selected: boolean; onClick: () => void }
function Pin({ partner, x, y, selected, onClick }: PinProps) {
  const color = TYPE_COLORS[partner.type];
  // Activity ring scaling
  const baseR = 1.6;
  const ringR = partner.orders >= 25 ? 4.5 : partner.orders >= 10 ? 3.2 : 0;
  return (
    <g onClick={onClick} className="cursor-pointer" style={{ transition: 'transform .2s' }}>
      {ringR > 0 && (
        <circle cx={x} cy={y} r={ringR} fill={color} opacity={0.18} />
      )}
      <circle cx={x} cy={y} r={baseR + (selected ? 0.6 : 0)} fill={color} stroke="white" strokeWidth={selected ? 0.6 : 0.4} />
      {selected && <circle cx={x} cy={y} r={baseR + 1.5} fill="none" stroke={color} strokeWidth={0.35} opacity={0.7} />}
    </g>
  );
}

export default function PartnerMapPage() {
  const { language: lang } = useLanguage();
  const [view, setView] = useState<ViewLevel>('europe');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<PartnerType>>(new Set(['dealer','service','importer','demo']));
  const [activeSellers, setActiveSellers] = useState<Set<Seller>>(new Set(['EM','JTN','BP','AKR','NB']));
  const [countryFilter, setCountryFilter] = useState<string>('all');

  const toggleType = (t: PartnerType) => {
    const n = new Set(activeTypes); n.has(t) ? n.delete(t) : n.add(t); setActiveTypes(n);
  };
  const toggleSeller = (s: Seller) => {
    const n = new Set(activeSellers); n.has(s) ? n.delete(s) : n.add(s); setActiveSellers(n);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PARTNERS.filter(p => {
      if (!activeTypes.has(p.type)) return false;
      if (!activeSellers.has(p.seller)) return false;
      if (countryFilter !== 'all' && p.country !== countryFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.countryName} ${p.country} ${p.account ?? ''} ${p.zip} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, activeTypes, activeSellers, countryFilter]);

  // Auto-zoom on search
  const handleSearch = (val: string) => {
    setSearch(val);
    const q = val.trim().toLowerCase();
    if (!q) return;
    if (q.includes('tysk') || q === 'de' || q.includes('german')) { setView('country'); setSelectedCountry('DE'); return; }
    const hit = PARTNERS.find(p =>
      p.name.toLowerCase().includes(q) || p.account === q || p.zip.toLowerCase() === q
    );
    if (hit) {
      if (hit.country === 'DE') {
        setView(hit.zip.startsWith('48') ? 'local' : 'country');
        setSelectedCountry('DE');
      } else {
        setView('europe');
      }
      setSelectedId(hit.id);
    }
  };

  const selected = selectedId ? PARTNERS.find(p => p.id === selectedId) ?? null : null;

  // Country counts for shading
  const countryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of filtered) m[p.country] = (m[p.country] ?? 0) + 1;
    return m;
  }, [filtered]);

  const countries = Array.from(new Set(PARTNERS.map(p => p.country)));

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      {/* Search + view buttons */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={T.search[lang]}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/20 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(['europe','country','local'] as ViewLevel[]).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); if (v !== 'europe' && !selectedCountry) setSelectedCountry('DE'); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  view === v ? 'bg-[#2d5a27] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {v === 'europe' ? T.europe[lang] : v === 'country' ? T.germany[lang] : T.local[lang]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Filters */}
        <aside className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5 sticky top-4">
            <div className="flex items-center gap-2 text-gray-900 font-bold">
              <Filter className="h-4 w-4" /> {T.filters[lang]}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">{T.type[lang]}</div>
              <div className="space-y-1.5">
                {(['dealer','service','importer','demo'] as PartnerType[]).map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={activeTypes.has(t)} onChange={() => toggleType(t)} className="accent-[#2d5a27]" />
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                    {T[t][lang]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">{T.country[lang]}</div>
              <select
                value={countryFilter}
                onChange={e => setCountryFilter(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-[#2d5a27] outline-none"
              >
                <option value="all">{T.total[lang]}</option>
                {countries.map(c => {
                  const ex = PARTNERS.find(p => p.country === c);
                  return <option key={c} value={c}>{ex?.countryName ?? c}</option>;
                })}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">{T.seller[lang]}</div>
              <div className="flex flex-wrap gap-1.5">
                {(['EM','JTN','BP','AKR','NB'] as Seller[]).map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSeller(s)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                      activeSellers.has(s)
                        ? 'bg-[#2d5a27] text-white border-[#2d5a27]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setSearch(''); setActiveTypes(new Set(['dealer','service','importer','demo'])); setActiveSellers(new Set(['EM','JTN','BP','AKR','NB'])); setCountryFilter('all'); }}
              className="w-full text-xs font-semibold text-gray-600 hover:text-gray-900 py-2 border-t border-gray-100"
            >{T.reset[lang]}</button>

            <div className="border-t border-gray-100 pt-4">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">{T.legend[lang]}</div>
              <div className="space-y-1.5 text-xs text-gray-600">
                {(['dealer','service','importer','demo'] as PartnerType[]).map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} /> {T[t][lang]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Map */}
        <section className="lg:col-span-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Globe2 className="h-4 w-4 text-[#2d5a27]" />
                {view === 'europe' ? T.europe[lang] : view === 'country' ? T.germany[lang] : T.local[lang]}
              </div>
              <div className="text-xs text-gray-500">{filtered.length} {T.total[lang].toLowerCase()}</div>
            </div>

            <div className="aspect-[4/3] bg-gradient-to-br from-[#eef5ec] to-[#f7faf6] relative">
              <svg viewBox="0 0 100 80" className="w-full h-full">
                {view === 'europe' && (
                  <>
                    {EUROPE_COUNTRIES.map(c => (
                      <path
                        key={c.code}
                        d={c.path}
                        fill={countryShade(countryCounts[c.code] ?? 0)}
                        stroke="#ffffff"
                        strokeWidth={0.4}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        onClick={() => { if (c.code === 'DE') { setView('country'); setSelectedCountry('DE'); } }}
                      />
                    ))}
                    {filtered.map(p => (
                      <Pin key={p.id} partner={p} x={p.ex} y={p.ey} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                    ))}
                  </>
                )}

                {view === 'country' && (
                  <>
                    {/* stylized Germany shape */}
                    <path d="M20,10 L80,10 L82,28 L78,50 L72,68 L40,72 L24,60 L18,38 Z" fill="#bbf7d0" stroke="#ffffff" strokeWidth={0.5} />
                    {/* fake regions */}
                    <path d="M20,10 L50,10 L52,30 L20,32 Z" fill="#86efac" opacity={0.6}
                      className="cursor-pointer hover:opacity-90" onClick={() => setView('local')} />
                    {filtered.filter(p => p.country === 'DE').map(p => (
                      <Pin key={p.id} partner={p} x={p.dx ?? p.ex} y={p.dy ?? p.ey} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                    ))}
                    <text x={50} y={6} textAnchor="middle" fontSize={3} fill="#15803d" fontWeight="bold">Deutschland</text>
                  </>
                )}

                {view === 'local' && (
                  <>
                    <rect x={10} y={10} width={80} height={60} fill="#dcfce7" stroke="#ffffff" strokeWidth={0.5} rx={2} />
                    {/* roads */}
                    <line x1={20} y1={20} x2={85} y2={50} stroke="#ffffff" strokeWidth={1.2} />
                    <line x1={15} y1={55} x2={70} y2={25} stroke="#ffffff" strokeWidth={1.2} />
                    <line x1={40} y1={12} x2={45} y2={65} stroke="#ffffff" strokeWidth={0.8} />
                    {filtered.filter(p => p.lx !== undefined).map(p => (
                      <Pin key={p.id} partner={p} x={p.lx!} y={p.ly!} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                    ))}
                    <text x={50} y={75} textAnchor="middle" fontSize={2.5} fill="#15803d" fontWeight="bold">Nordhorn (48529)</text>
                  </>
                )}
              </svg>
            </div>
          </div>
        </section>

        {/* Details */}
        <aside className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-4">
            <div className="flex items-center gap-2 text-gray-900 font-bold mb-4">
              <MapPin className="h-4 w-4 text-[#2d5a27]" /> {T.details[lang]}
            </div>

            {!selected && (
              <p className="text-sm text-gray-500">{T.selectPin[lang]}</p>
            )}

            {selected && (() => {
              const Icon = TYPE_ICON[selected.type];
              return (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: TYPE_COLORS[selected.type] }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 leading-tight">{selected.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{T[selected.type][lang]} · {selected.countryName}</div>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="ml-auto text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
                  </div>

                  <div className="text-xs text-gray-500 grid grid-cols-2 gap-2">
                    <div>
                      <div className="uppercase font-semibold text-[10px] text-gray-400">{T.assignedSeller[lang]}</div>
                      <div className="text-gray-800 font-semibold mt-0.5">{selected.seller}</div>
                    </div>
                    {selected.account && (
                      <div>
                        <div className="uppercase font-semibold text-[10px] text-gray-400">Konto</div>
                        <div className="text-gray-800 font-semibold mt-0.5">{selected.account}</div>
                      </div>
                    )}
                    <div>
                      <div className="uppercase font-semibold text-[10px] text-gray-400">Postnr</div>
                      <div className="text-gray-800 font-semibold mt-0.5">{selected.zip}</div>
                    </div>
                    <div>
                      <div className="uppercase font-semibold text-[10px] text-gray-400">By</div>
                      <div className="text-gray-800 font-semibold mt-0.5">{selected.city}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: Users, label: T.users[lang], value: selected.users },
                      { icon: FileText, label: T.quotes[lang], value: selected.quotes },
                      { icon: ShoppingCart, label: T.orders[lang], value: selected.orders },
                      { icon: TrendingUp, label: T.pipeline[lang], value: `${selected.pipeline}k €` },
                    ].map((s, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-500">
                          <s.icon className="h-3 w-3" /> {s.label}
                        </div>
                        <div className="text-sm font-bold text-gray-900 mt-0.5">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {selected.linked && selected.linked.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="text-[10px] uppercase font-semibold text-gray-500 mb-1.5">{T.linked[lang]}</div>
                      <ul className="space-y-1 text-sm text-gray-700">
                        {selected.linked.map(l => <li key={l} className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#2d5a27]" />{l}</li>)}
                      </ul>
                    </div>
                  )}

                  <button className="w-full mt-2 px-4 py-2.5 bg-[#2d5a27] hover:bg-[#244c1f] text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                    <ExternalLink className="h-4 w-4" /> {T.openCrm[lang]}
                  </button>
                </div>
              );
            })()}

            {/* Stats summary */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="text-[10px] uppercase font-semibold text-gray-500 mb-2">{T.stats[lang]}</div>
              <div className="space-y-1.5 text-sm">
                {(['dealer','service','importer','demo'] as PartnerType[]).map(t => (
                  <div key={t} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                      {T[t][lang]}
                    </span>
                    <span className="font-semibold text-gray-900">{filtered.filter(p => p.type === t).length}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
                  <span className="text-gray-700 font-semibold">{T.total[lang]}</span>
                  <span className="font-bold text-[#2d5a27]">{filtered.length}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </MiscPageShell>
  );
}
