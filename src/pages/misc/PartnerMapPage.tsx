import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Users, FileText, ShoppingCart, TrendingUp, ExternalLink, X, Building2, Wrench, Package, Sparkles, Phone, Home, ChevronLeft, ChevronRight, Maximize2, HelpCircle } from 'lucide-react';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

type PartnerType = 'dealer' | 'service' | 'importer' | 'demo';
type Seller = 'EM' | 'JTN' | 'BP' | 'AKR' | 'NB';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  countryCode: string;
  country: string;
  city: string;
  zip: string;
  address?: string;
  account?: string;
  seller: Seller;
  users: number;
  quotes: number;
  orders: number;
  pipeline: number;
  phone: string;
  coords: [number, number]; // [lat, lng] for Leaflet
  linked?: { id: string; name: string }[];
}

const PARTNERS: Partner[] = [
  { id: 'p1', name: 'Wilmers Kommunaltechnik GmbH', type: 'dealer', countryCode: 'DEU', country: 'Tyskland', city: 'Nordhorn', zip: '48529', address: 'Industriestr. 12', account: '11081', seller: 'AKR', users: 5, quotes: 18, orders: 12, pipeline: 240, phone: '+49 5921 12345', coords: [52.4375, 7.0758], linked: [{ id: 'p5', name: 'Nordhorn Demo Park' }] },
  { id: 'p2', name: 'Valtec Technik', type: 'dealer', countryCode: 'DEU', country: 'Tyskland', city: 'Bremen', zip: '28195', address: 'Hafenstr. 4', account: '10267', seller: 'NB', users: 8, quotes: 31, orders: 27, pipeline: 510, phone: '+49 421 5544221', coords: [53.0793, 8.8017] },
  { id: 'p3', name: 'Bremen Servicepartner', type: 'service', countryCode: 'DEU', country: 'Tyskland', city: 'Bremen', zip: '28209', address: 'Werkstattweg 7', seller: 'NB', users: 3, quotes: 4, orders: 2, pipeline: 35, phone: '+49 421 9911000', coords: [53.099, 8.812] },
  { id: 'p4', name: 'Bayern Import GmbH', type: 'importer', countryCode: 'DEU', country: 'Tyskland', city: 'München', zip: '80331', address: 'Maximilianstr. 22', seller: 'EM', users: 6, quotes: 12, orders: 9, pipeline: 320, phone: '+49 89 4477001', coords: [48.1351, 11.5820] },
  { id: 'p5', name: 'Nordhorn Demo Park', type: 'demo', countryCode: 'DEU', country: 'Tyskland', city: 'Nordhorn', zip: '48529', address: 'Demoallee 1', seller: 'AKR', users: 1, quotes: 0, orders: 0, pipeline: 0, phone: '+49 5921 99000', coords: [52.43, 7.083] },
  { id: 'p6', name: 'Timan Danmark', type: 'dealer', countryCode: 'DNK', country: 'Danmark', city: 'Tim', zip: '6980', address: 'Osvald Pedersens Vej 2', account: '1000', seller: 'NB', users: 12, quotes: 44, orders: 38, pipeline: 870, phone: '+45 96 74 44 66', coords: [56.1840, 8.2750] },
  { id: 'p7', name: 'Valtec France', type: 'dealer', countryCode: 'FRA', country: 'Frankrig', city: 'Lyon', zip: '69000', address: 'Rue de la Part-Dieu 10', account: '4850', seller: 'BP', users: 4, quotes: 9, orders: 6, pipeline: 140, phone: '+33 4 7200 1100', coords: [45.7640, 4.8357] },
  { id: 'p8', name: 'UK Grounds Import', type: 'importer', countryCode: 'GBR', country: 'Storbritannien', city: 'Leeds', zip: 'LS1', address: 'Wellington St 50', seller: 'JTN', users: 7, quotes: 15, orders: 11, pipeline: 290, phone: '+44 113 200 2000', coords: [53.8008, -1.5491] },
  { id: 'p9', name: 'Hamburg Service Nord', type: 'service', countryCode: 'DEU', country: 'Tyskland', city: 'Hamburg', zip: '20095', address: 'Hafenstr. 21', seller: 'NB', users: 2, quotes: 3, orders: 1, pipeline: 20, phone: '+49 40 30000', coords: [53.5511, 9.9937] },
  { id: 'p10', name: 'Köln Demo Center', type: 'demo', countryCode: 'DEU', country: 'Tyskland', city: 'Köln', zip: '50667', address: 'Domkloster 4', seller: 'EM', users: 1, quotes: 0, orders: 0, pipeline: 0, phone: '+49 221 22100', coords: [50.9375, 6.9603] },
  { id: 'p11', name: 'Polen Maskiner sp.', type: 'dealer', countryCode: 'POL', country: 'Polen', city: 'Warszawa', zip: '00-001', account: '7720', seller: 'NB', users: 3, quotes: 7, orders: 4, pipeline: 95, phone: '+48 22 100 2000', coords: [52.2297, 21.0122] },
  { id: 'p12', name: 'Italia Verde srl', type: 'dealer', countryCode: 'ITA', country: 'Italien', city: 'Milano', zip: '20100', account: '6610', seller: 'EM', users: 5, quotes: 12, orders: 8, pipeline: 175, phone: '+39 02 7700 1100', coords: [45.4642, 9.1900] },
];

const TYPE_COLORS: Record<PartnerType, string> = {
  dealer: '#dc2626', service: '#16a34a', importer: '#2563eb', demo: '#9333ea',
};
const TYPE_ICON = { dealer: Building2, service: Wrench, importer: Package, demo: Sparkles } as const;

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  intro: { da: 'Find dine partnere på kortet. Klik på et land for at zoome ind, klik på en pin for detaljer.', en: 'Find partners on the map. Click a country to zoom, click a pin for details.', de: 'Partner auf der Karte finden.', it: 'Trova i partner sulla mappa.', hu: 'Partnerek a térképen.' },
  search: { da: 'Søg på land, firma eller kontonr.', en: 'Search country, company or account', de: 'Land, Firma oder Konto suchen', it: 'Cerca…', hu: 'Keresés…' },
  dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Forgalmazó' },
  service: { da: 'Servicepartner', en: 'Service partner', de: 'Servicepartner', it: 'Servizio', hu: 'Szervizpartner' },
  importer: { da: 'Importør', en: 'Importer', de: 'Importeur', it: 'Importatore', hu: 'Importőr' },
  demo: { da: 'Demo', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo' },
  allSellers: { da: 'Alle sælgere', en: 'All sellers', de: 'Alle Verkäufer', it: 'Tutti', hu: 'Mind' },
  resetView: { da: 'Vis hele Europa', en: 'Show Europe', de: 'Europa', it: 'Europa', hu: 'Európa' },
  details: { da: 'Partnerdetaljer', en: 'Partner details', de: 'Details', it: 'Dettagli', hu: 'Adatok' },
  users: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felhasználók' },
  quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Ajánlatok' },
  orders: { da: 'Ordrer', en: 'Orders', de: 'Bestellungen', it: 'Ordini', hu: 'Rendelések' },
  pipeline: { da: 'Pipeline', en: 'Pipeline', de: 'Pipeline', it: 'Pipeline', hu: 'Pipeline' },
  openCrm: { da: 'Åbn CRM', en: 'Open CRM', de: 'CRM öffnen', it: 'Apri CRM', hu: 'CRM' },
  call: { da: 'Ring', en: 'Call', de: 'Anrufen', it: 'Chiama', hu: 'Hívás' },
  linked: { da: 'Tilknyttede partnere', en: 'Linked partners', de: 'Verknüpfte Partner', it: 'Collegati', hu: 'Kapcsolt' },
  assignedSeller: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Eladó' },
  countryLegend: { da: 'Antal partnere pr. land', en: 'Partners per country', de: 'Partner pro Land', it: 'Per paese', hu: 'Országonként' },
  pinLegend: { da: 'Pin-typer', en: 'Pin types', de: 'Pin-Typen', it: 'Tipi pin', hu: 'Tűk' },
};

interface Position { center: [number, number]; zoom: number }
const EUROPE_VIEW: Position = { center: [52, 12], zoom: 4 };

function makePinIcon(color: string, pulse: boolean, selected: boolean): L.DivIcon {
  // 44px clickable target, pulsing ring if pulse=true
  const ring = pulse
    ? `<span class="pm-pulse" style="--pm-pulse-color:${color}"></span>`
    : '';
  const sel = selected ? 'pm-pin--selected' : '';
  const html = `
    <div class="pm-pin ${sel}">
      ${ring}
      <svg width="40" height="48" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">
        <path d="M20 2 C10 2 3 9 3 18 C3 30 20 46 20 46 C20 46 37 30 37 18 C37 9 30 2 20 2 Z" fill="${color}" stroke="white" stroke-width="2.5"/>
        <circle cx="20" cy="18" r="6" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: 'pm-pin-wrap',
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    popupAnchor: [0, -40],
  });
}

function countryShade(n: number): string {
  if (n === 0) return '#e5e7eb';
  if (n <= 3) return '#d1fae5';
  if (n <= 10) return '#86efac';
  return '#22c55e';
}

// Imperative helper to fly the map
function MapController({ position }: { position: Position }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position.center, position.zoom, { duration: 0.8 });
  }, [position, map]);
  return null;
}

export default function PartnerMapPage() {
  const { language: lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<PartnerType>>(new Set(['dealer','service','importer','demo']));
  const [sellerFilter, setSellerFilter] = useState<Seller | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>(EUROPE_VIEW);
  const [legendOpen, setLegendOpen] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleType = (t: PartnerType) => {
    const n = new Set(activeTypes); n.has(t) ? n.delete(t) : n.add(t); setActiveTypes(n);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PARTNERS.filter(p => {
      if (!activeTypes.has(p.type)) return false;
      if (sellerFilter !== 'all' && p.seller !== sellerFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.country} ${p.countryCode} ${p.account ?? ''} ${p.zip} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, activeTypes, sellerFilter]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 2) return;
    if (q.includes('tysk') || q === 'de') { setPosition({ center: [51, 10.5], zoom: 6 }); return; }
    if (q.includes('dan')) { setPosition({ center: [56, 10.5], zoom: 7 }); return; }
    if (q.includes('frank')) { setPosition({ center: [46.5, 2.5], zoom: 6 }); return; }
    const matches = PARTNERS.filter(p =>
      p.name.toLowerCase().includes(q) || p.account === q || p.zip.toLowerCase().includes(q)
    );
    if (matches.length === 1) {
      setPosition({ center: matches[0].coords, zoom: 12 });
      setSelectedId(matches[0].id);
    } else if (matches.length > 1 && matches.length <= 4) {
      const avgLat = matches.reduce((s, p) => s + p.coords[0], 0) / matches.length;
      const avgLng = matches.reduce((s, p) => s + p.coords[1], 0) / matches.length;
      setPosition({ center: [avgLat, avgLng], zoom: 8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const countryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of filtered) m[p.countryCode] = (m[p.countryCode] ?? 0) + 1;
    return m;
  }, [filtered]);

  const selected = selectedId ? PARTNERS.find(p => p.id === selectedId) ?? null : null;
  const resetView = () => { setPosition(EUROPE_VIEW); setSelectedId(null); };

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      {/* Inline CSS: pulse, pin polish, Leaflet override */}
      <style>{`
        .pm-pin-wrap { background:transparent !important; border:none !important; }
        .pm-pin { position:relative; width:40px; height:48px; transition:transform .15s ease; cursor:pointer; }
        .pm-pin:hover { transform:translateY(-3px) scale(1.05); }
        .pm-pin--selected { transform:translateY(-4px) scale(1.1); }
        .pm-pulse { position:absolute; left:8px; top:6px; width:24px; height:24px; border-radius:50%;
          background:var(--pm-pulse-color); opacity:.5; animation:pm-pulse 1.8s ease-out infinite; }
        @keyframes pm-pulse {
          0% { transform:scale(.6); opacity:.55; }
          70% { transform:scale(2.4); opacity:0; }
          100% { transform:scale(2.4); opacity:0; }
        }
        .pm-tip {
          background:#111827; color:white; font-size:11px; font-weight:600; padding:4px 8px;
          border-radius:6px; border:none; box-shadow:0 4px 10px rgba(0,0,0,.25); white-space:nowrap;
        }
        .pm-tip::before { border-top-color:#111827 !important; }
        .leaflet-container { font-family:inherit; background:#a5d8e6; }
        .leaflet-control-zoom a { border:none !important; background:white !important; color:#374151 !important;
          width:34px !important; height:34px !important; line-height:34px !important; font-size:18px !important;
          box-shadow:0 2px 6px rgba(0,0,0,.1); }
        .leaflet-control-zoom { border:none !important; margin-bottom:24px !important; margin-left:16px !important; }
        .leaflet-control-attribution { font-size:9px !important; background:rgba(255,255,255,.7) !important; }
      `}</style>

      {/* Compact top bar over map */}
      <div className="flex gap-3">
        {/* Collapsible legend */}
        <aside className={`hidden lg:flex flex-col shrink-0 transition-all duration-200 ${legendOpen ? 'w-52' : 'w-0'}`}>
          {legendOpen && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-5 sticky top-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-900 uppercase tracking-wide">{T.countryLegend[lang]}</div>
                <button onClick={() => setLegendOpen(false)} className="text-gray-400 hover:text-gray-700"><ChevronLeft className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1.5">
                {[
                  { n: 0, label: '0' },
                  { n: 1, label: '1-3' },
                  { n: 4, label: '4-10' },
                  { n: 11, label: '10+' },
                ].map(r => (
                  <div key={r.n} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-5 h-3 rounded-sm shrink-0" style={{ background: countryShade(r.n) }} />
                    {r.label}
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-gray-100 space-y-2">
                {(['dealer','service','importer','demo'] as PartnerType[]).map(t => (
                  <div key={t} className="flex items-center gap-2 text-xs text-gray-700">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[t] }} />
                    {T[t][lang]}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Map area — dominant */}
        <section className="flex-1 min-w-0">
          {/* Compact topbar */}
          <div className="bg-white rounded-t-2xl border border-b-0 border-gray-100 shadow-sm px-3 py-2 flex flex-wrap items-center gap-2">
            {!legendOpen && (
              <button onClick={() => setLegendOpen(true)} className="hidden lg:flex h-9 w-9 items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Vis legend">
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <div className="relative flex-1 min-w-[220px] max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={T.search[lang]}
                className="w-full pl-9 pr-9 py-2 bg-gray-50 hover:bg-white focus:bg-white border border-transparent focus:border-[#2d5a27] rounded-lg text-sm outline-none transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(['dealer','service','importer','demo'] as PartnerType[]).map(t => {
                const on = activeTypes.has(t);
                return (
                  <button key={t} onClick={() => toggleType(t)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${on ? 'bg-gray-50 text-gray-800 border border-gray-200' : 'bg-white text-gray-400 border border-transparent hover:border-gray-200'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: on ? TYPE_COLORS[t] : '#d1d5db' }} />
                    {T[t][lang]}
                  </button>
                );
              })}
            </div>
            <select
              value={sellerFilter} onChange={e => setSellerFilter(e.target.value as Seller | 'all')}
              className="text-xs font-medium px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:border-[#2d5a27]">
              <option value="all">{T.allSellers[lang]}</option>
              {(['EM','JTN','BP','AKR','NB'] as Seller[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={resetView} className="h-9 w-9 flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title={T.resetView[lang]}>
                <Home className="h-4 w-4" />
              </button>
              <button className="h-9 w-9 hidden md:flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Fuldskærm">
                <Maximize2 className="h-4 w-4" />
              </button>
              <button className="h-9 w-9 hidden md:flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Hjælp">
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Map */}
          <div className="relative bg-white rounded-b-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-[82vh] min-h-[600px]">
              <MapContainer
                center={EUROPE_VIEW.center}
                zoom={EUROPE_VIEW.zoom}
                minZoom={3}
                maxZoom={16}
                scrollWheelZoom
                zoomControl
                style={{ height: '100%', width: '100%' }}
                worldCopyJump={false}
                maxBounds={[[34, -25], [72, 45]]}
                maxBoundsViscosity={0.6}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController position={position} />
                {filtered.map(p => {
                  const pulse = p.orders >= 10;
                  const sel = selectedId === p.id;
                  return (
                    <Marker
                      key={p.id}
                      position={p.coords}
                      icon={makePinIcon(TYPE_COLORS[p.type], pulse, sel)}
                      eventHandlers={{ click: () => setSelectedId(p.id) }}
                    />
                  );
                })}
              </MapContainer>
            </div>
          </div>
        </section>
      </div>

      {/* Slide-in detail panel (desktop) / bottom sheet (mobile) */}
      {selected && (() => {
        const Icon = TYPE_ICON[selected.type];
        return (
          <>
            <div className="fixed inset-0 z-[1000] bg-black/30 lg:hidden" onClick={() => setSelectedId(null)} />
            <aside className="fixed z-[1001] bg-white shadow-2xl border-gray-200
                              inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t
                              lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none lg:w-[380px] lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0
                              animate-in slide-in-from-bottom lg:slide-in-from-right duration-300 overflow-y-auto">
              <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 px-5 py-3 flex items-center gap-2">
                <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-gray-900">
                  <ChevronLeft className="h-5 w-5 lg:hidden" />
                  <X className="h-5 w-5 hidden lg:block" />
                </button>
                <div className="text-sm font-semibold text-gray-700">{T.details[lang]}</div>
              </div>

              <div className="p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm" style={{ background: TYPE_COLORS[selected.type] }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 leading-tight text-base">{selected.name}</div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: TYPE_COLORS[selected.type] }} />
                      {T[selected.type][lang]} · {selected.country}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-gray-700 leading-relaxed">
                  {selected.address && <div>{selected.address}</div>}
                  <div>{selected.zip} {selected.city}</div>
                </div>

                <div className="flex gap-2">
                  <a href={`tel:${selected.phone.replace(/\s/g,'')}`}
                    className="flex-1 px-3 py-2.5 bg-[#2d5a27] hover:bg-[#244c1f] text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                    <Phone className="h-4 w-4" /> {T.call[lang]}
                  </a>
                  <button className="flex-1 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                    <ExternalLink className="h-4 w-4" /> {T.openCrm[lang]}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Users, label: T.users[lang], value: selected.users },
                    { icon: FileText, label: T.quotes[lang], value: selected.quotes },
                    { icon: ShoppingCart, label: T.orders[lang], value: selected.orders },
                    { icon: TrendingUp, label: T.pipeline[lang], value: `${selected.pipeline}k €` },
                  ].map((s, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-500">
                        <s.icon className="h-3 w-3" /> {s.label}
                      </div>
                      <div className="text-base font-bold text-gray-900 mt-1">{s.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-gray-400">{T.assignedSeller[lang]}</div>
                    <div className="font-semibold text-gray-900 mt-0.5">{selected.seller}</div>
                  </div>
                  {selected.account && (
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-gray-400">Konto</div>
                      <div className="font-semibold text-gray-900 mt-0.5">{selected.account}</div>
                    </div>
                  )}
                </div>

                {selected.linked && selected.linked.length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <div className="text-[10px] uppercase font-semibold text-gray-400 mb-2">{T.linked[lang]}</div>
                    <ul className="space-y-1.5">
                      {selected.linked.map(l => (
                        <li key={l.id}>
                          <button onClick={() => setSelectedId(l.id)}
                            className="w-full text-left flex items-center gap-2 text-sm text-gray-700 hover:text-[#2d5a27] py-1.5 px-2 rounded-md hover:bg-gray-50">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2d5a27]" />
                            {l.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          </>
        );
      })()}

      {/* keep countryCounts referenced (for legend color reference) */}
      <span className="hidden">{Object.keys(countryCounts).length}</span>
    </MiscPageShell>
  );
}
