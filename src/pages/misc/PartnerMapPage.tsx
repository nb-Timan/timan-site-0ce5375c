import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Users, FileText, ShoppingCart, TrendingUp, ExternalLink, X, Phone, Mail, MapPin, Home, ChevronLeft, ChevronRight, Maximize2, HelpCircle, Target, Link2, User as UserIcon } from 'lucide-react';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

type PartnerType = 'dealer' | 'service' | 'importer' | 'demo';
type Seller = 'EM' | 'JTN' | 'BP' | 'AKR' | 'NB';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  countryCode: string; // ISO3
  country: string;
  city: string;
  zip: string;
  address?: string;
  account?: string;
  seller: Seller;
  users: number;
  quotes: number;
  orders: number;
  pipeline: number; // k EUR
  budgetPct?: number;
  email?: string;
  phone: string;
  coords: [number, number];
  linked?: { id: string; name: string }[];
}

const PARTNERS: Partner[] = [
  { id: 'p1', name: 'Wilmers Kommunaltechnik GmbH', type: 'dealer', countryCode: 'DEU', country: 'Tyskland', city: 'Nordhorn', zip: '48529', address: 'Industriestr. 12', account: '11081', seller: 'AKR', users: 4, quotes: 8, orders: 12, pipeline: 250, budgetPct: 78, email: 'info@wilmers.de', phone: '+49 5921 12345', coords: [52.4375, 7.0758], linked: [{ id: 'p5', name: 'Nordhorn Demo Park' }, { id: 'p3', name: 'Bremen Servicepartner' }, { id: 'p9', name: 'Hamburg Service Nord' }] },
  { id: 'p2', name: 'Valtec Technik', type: 'dealer', countryCode: 'DEU', country: 'Tyskland', city: 'Bremen', zip: '28195', address: 'Hafenstr. 4', account: '10267', seller: 'NB', users: 8, quotes: 31, orders: 27, pipeline: 510, budgetPct: 92, email: 'kontakt@valtec.de', phone: '+49 421 5544221', coords: [53.0793, 8.8017] },
  { id: 'p3', name: 'Bremen Servicepartner', type: 'service', countryCode: 'DEU', country: 'Tyskland', city: 'Bremen', zip: '28209', address: 'Werkstattweg 7', seller: 'NB', users: 3, quotes: 4, orders: 2, pipeline: 35, budgetPct: 41, email: 'service@bremen.de', phone: '+49 421 9911000', coords: [53.099, 8.812] },
  { id: 'p4', name: 'Bayern Import GmbH', type: 'importer', countryCode: 'DEU', country: 'Tyskland', city: 'München', zip: '80331', address: 'Maximilianstr. 22', seller: 'EM', users: 6, quotes: 12, orders: 9, pipeline: 320, budgetPct: 65, email: 'office@bayern-import.de', phone: '+49 89 4477001', coords: [48.1351, 11.5820] },
  { id: 'p5', name: 'Nordhorn Demo Park', type: 'demo', countryCode: 'DEU', country: 'Tyskland', city: 'Nordhorn', zip: '48529', address: 'Demoallee 1', seller: 'AKR', users: 1, quotes: 0, orders: 0, pipeline: 0, email: 'demo@nordhorn.de', phone: '+49 5921 99000', coords: [52.43, 7.083] },
  { id: 'p6', name: 'Timan Danmark', type: 'dealer', countryCode: 'DNK', country: 'Danmark', city: 'Tim', zip: '6980', address: 'Osvald Pedersens Vej 2', account: '1000', seller: 'NB', users: 12, quotes: 44, orders: 38, pipeline: 870, budgetPct: 88, email: 'timan@timan.dk', phone: '+45 96 74 44 66', coords: [56.1840, 8.2750] },
  { id: 'p7', name: 'Valtec France', type: 'dealer', countryCode: 'FRA', country: 'Frankrig', city: 'Lyon', zip: '69000', address: 'Rue de la Part-Dieu 10', account: '4850', seller: 'BP', users: 4, quotes: 9, orders: 6, pipeline: 140, budgetPct: 54, email: 'contact@valtec.fr', phone: '+33 4 7200 1100', coords: [45.7640, 4.8357] },
  { id: 'p8', name: 'UK Grounds Import', type: 'importer', countryCode: 'GBR', country: 'Storbritannien', city: 'Leeds', zip: 'LS1', address: 'Wellington St 50', seller: 'JTN', users: 7, quotes: 15, orders: 11, pipeline: 290, budgetPct: 70, email: 'info@ukgrounds.co.uk', phone: '+44 113 200 2000', coords: [53.8008, -1.5491] },
  { id: 'p9', name: 'Hamburg Service Nord', type: 'service', countryCode: 'DEU', country: 'Tyskland', city: 'Hamburg', zip: '20095', address: 'Hafenstr. 21', seller: 'NB', users: 2, quotes: 3, orders: 1, pipeline: 20, budgetPct: 30, email: 'service@hh-nord.de', phone: '+49 40 30000', coords: [53.5511, 9.9937] },
  { id: 'p10', name: 'Köln Demo Center', type: 'demo', countryCode: 'DEU', country: 'Tyskland', city: 'Köln', zip: '50667', address: 'Domkloster 4', seller: 'EM', users: 1, quotes: 0, orders: 0, pipeline: 0, email: 'demo@koeln.de', phone: '+49 221 22100', coords: [50.9375, 6.9603] },
  { id: 'p11', name: 'Polen Maskiner sp.', type: 'dealer', countryCode: 'POL', country: 'Polen', city: 'Warszawa', zip: '00-001', account: '7720', seller: 'NB', users: 3, quotes: 7, orders: 4, pipeline: 95, budgetPct: 48, email: 'kontakt@polenmaskiner.pl', phone: '+48 22 100 2000', coords: [52.2297, 21.0122] },
  { id: 'p12', name: 'Italia Verde srl', type: 'dealer', countryCode: 'ITA', country: 'Italien', city: 'Milano', zip: '20100', account: '6610', seller: 'EM', users: 5, quotes: 12, orders: 8, pipeline: 175, budgetPct: 62, email: 'info@italiaverde.it', phone: '+39 02 7700 1100', coords: [45.4642, 9.1900] },
];

// Timan green palette
const TIMAN_GREEN = '#2d5a27';
const TIMAN_GREEN_DARK = '#1f3f1b';

const TYPE_COLORS: Record<PartnerType, string> = {
  dealer: '#dc2626',   // red
  service: '#16a34a',  // green
  importer: '#2563eb', // blue
  demo: '#7c3aed',     // purple
};

// White-on-color SVG glyph for each type (rendered inside pin)
const TYPE_GLYPH: Record<PartnerType, string> = {
  // map-pin (circle)
  dealer: `<circle cx="20" cy="18" r="5.5" fill="white"/>`,
  // wrench
  service: `<path d="M25.5 11.2 a4.5 4.5 0 0 0 -5.6 5.6 l-5.7 5.7 a1.6 1.6 0 1 0 2.3 2.3 l5.7 -5.7 a4.5 4.5 0 0 0 5.6 -5.6 l-2.2 2.2 -2.1 -.6 -.6 -2.1 z" fill="white"/>`,
  // star
  importer: `<path d="M20 11.5 l1.9 4 4.4 .5 -3.3 3 .9 4.3 -3.9 -2.2 -3.9 2.2 .9 -4.3 -3.3 -3 4.4 -.5 z" fill="white"/>`,
  // truck
  demo: `<g fill="white"><rect x="11" y="14" width="9" height="7" rx="1"/><path d="M20 16 h4 l3 3 v2 h-7 z"/><circle cx="14" cy="22.5" r="1.8" fill="#7c3aed" stroke="white" stroke-width="1"/><circle cx="24" cy="22.5" r="1.8" fill="#7c3aed" stroke="white" stroke-width="1"/></g>`,
};

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  intro: { da: 'Find dine partnere på kortet. Klik på et land for at zoome ind, klik på en pin for detaljer.', en: 'Find partners on the map.', de: 'Partner auf der Karte finden.', it: 'Trova i partner.', hu: 'Partnerek a térképen.' },
  search: { da: 'Søg på land, firma eller kontonr.', en: 'Search…', de: 'Suchen…', it: 'Cerca…', hu: 'Keresés…' },
  dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Forgalmazó' },
  service: { da: 'Servicepartner', en: 'Service partner', de: 'Servicepartner', it: 'Servizio', hu: 'Szervizpartner' },
  importer: { da: 'Importør', en: 'Importer', de: 'Importeur', it: 'Importatore', hu: 'Importőr' },
  demo: { da: 'Demo-lokation', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo' },
  allSellers: { da: 'Alle sælgere', en: 'All sellers', de: 'Alle', it: 'Tutti', hu: 'Mind' },
  resetView: { da: 'Vis Europa', en: 'Show Europe', de: 'Europa', it: 'Europa', hu: 'Európa' },
  details: { da: 'Partnerprofil', en: 'Partner profile', de: 'Profil', it: 'Profilo', hu: 'Profil' },
  users: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felh.' },
  quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Ajánlatok' },
  orders: { da: 'Ordrer', en: 'Orders', de: 'Bestellungen', it: 'Ordini', hu: 'Rendelések' },
  pipeline: { da: 'Pipeline', en: 'Pipeline', de: 'Pipeline', it: 'Pipeline', hu: 'Pipeline' },
  budget: { da: 'Budget', en: 'Budget', de: 'Budget', it: 'Budget', hu: 'Költségvetés' },
  openCrm: { da: 'Åbn CRM', en: 'Open CRM', de: 'CRM öffnen', it: 'Apri CRM', hu: 'CRM' },
  call: { da: 'Ring', en: 'Call', de: 'Anrufen', it: 'Chiama', hu: 'Hívás' },
  mail: { da: 'Mail', en: 'Mail', de: 'Mail', it: 'Mail', hu: 'Mail' },
  linked: { da: 'Gennemfaktureringspartnere', en: 'Linked partners', de: 'Verknüpfte Partner', it: 'Collegati', hu: 'Kapcsolt' },
  assignedSeller: { da: 'Tildelt sælger', en: 'Assigned seller', de: 'Verkäufer', it: 'Venditore', hu: 'Eladó' },
  countryLegend: { da: 'Marked – partnere pr. land', en: 'Market — partners per country', de: 'Markt', it: 'Mercato', hu: 'Piac' },
  pinLegend: { da: 'Partnertyper', en: 'Partner types', de: 'Typen', it: 'Tipi', hu: 'Típusok' },
};

interface Position { center: [number, number]; zoom: number }
// Tighter Central-Europe focus
const EUROPE_VIEW: Position = { center: [50.5, 9.5], zoom: 5 };

function makePinIcon(type: PartnerType, pulse: boolean, selected: boolean): L.DivIcon {
  const color = TYPE_COLORS[type];
  const glyph = TYPE_GLYPH[type];
  const ring = pulse ? `<span class="pm-pulse" style="--pm-pulse-color:${color}"></span>` : '';
  const sel = selected ? 'pm-pin--selected' : '';
  const html = `
    <div class="pm-pin ${sel}">
      ${ring}
      <svg width="40" height="48" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))">
        <path d="M20 2 C10 2 3 9 3 18 C3 30 20 46 20 46 C20 46 37 30 37 18 C37 9 30 2 20 2 Z" fill="${color}" stroke="white" stroke-width="2.5"/>
        ${glyph}
      </svg>
    </div>`;
  return L.divIcon({
    html, className: 'pm-pin-wrap',
    iconSize: [40, 48], iconAnchor: [20, 46], popupAnchor: [0, -40],
  });
}

function countryShade(n: number): string {
  if (!n) return '#e5e7eb';
  if (n <= 3) return '#bbf7d0';
  if (n <= 10) return '#4ade80';
  return '#15803d';
}

function MapController({ position }: { position: Position }) {
  const map = useMap();
  useEffect(() => { map.flyTo(position.center, position.zoom, { duration: 0.8 }); }, [position, map]);
  return null;
}

// Resize Leaflet when container size changes (panel open/close)
function MapResizer({ trigger }: { trigger: unknown }) {
  const map = useMap();
  useEffect(() => { const id = setTimeout(() => map.invalidateSize(), 320); return () => clearTimeout(id); }, [trigger, map]);
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
  const [geo, setGeo] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load world country polygons (lightweight ~250KB)
  useEffect(() => {
    let alive = true;
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(r => r.json()).then(d => { if (alive) setGeo(d); })
      .catch(() => { /* silent — map still works without polygons */ });
    return () => { alive = false; };
  }, []);

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
    if (matches.length === 1) { setPosition({ center: matches[0].coords, zoom: 12 }); setSelectedId(matches[0].id); }
    else if (matches.length > 1 && matches.length <= 4) {
      const avgLat = matches.reduce((s, p) => s + p.coords[0], 0) / matches.length;
      const avgLng = matches.reduce((s, p) => s + p.coords[1], 0) / matches.length;
      setPosition({ center: [avgLat, avgLng], zoom: 8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // counts based on ALL partners (not filtered) so colors are stable
  const countryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of PARTNERS) m[p.countryCode] = (m[p.countryCode] ?? 0) + 1;
    return m;
  }, []);

  const selected = selectedId ? PARTNERS.find(p => p.id === selectedId) ?? null : null;
  const resetView = () => { setPosition(EUROPE_VIEW); setSelectedId(null); };

  // Style features by partner count
  const styleFeature = (feature: any) => {
    const id = feature?.id ?? feature?.properties?.iso_a3;
    const n = countryCounts[id] ?? 0;
    return {
      fillColor: countryShade(n),
      fillOpacity: n ? 0.55 : 0.18,
      color: '#94a3b8',
      weight: 0.6,
    };
  };

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      {/* Inline CSS */}
      <style>{`
        .pm-pin-wrap { background:transparent !important; border:none !important; }
        .pm-pin { position:relative; width:40px; height:48px; transition:transform .15s ease; cursor:pointer; }
        .pm-pin:hover { transform:translateY(-4px) scale(1.08); }
        .pm-pin--selected { transform:translateY(-5px) scale(1.12); }
        .pm-pulse { position:absolute; left:8px; top:6px; width:24px; height:24px; border-radius:50%;
          background:var(--pm-pulse-color); opacity:.5; animation:pm-pulse 1.8s ease-out infinite; }
        @keyframes pm-pulse {
          0% { transform:scale(.6); opacity:.55; }
          70% { transform:scale(2.4); opacity:0; }
          100% { transform:scale(2.4); opacity:0; }
        }
        .leaflet-container { font-family:inherit; background:#cfe7f1; }
        .leaflet-control-zoom a { border:none !important; background:white !important; color:#374151 !important;
          width:34px !important; height:34px !important; line-height:34px !important; font-size:18px !important;
          box-shadow:0 2px 8px rgba(0,0,0,.12); }
        .leaflet-control-zoom a:hover { color:${TIMAN_GREEN} !important; }
        .leaflet-control-zoom { border:none !important; margin-bottom:24px !important; margin-left:16px !important; }
        .leaflet-control-attribution { font-size:9px !important; background:rgba(255,255,255,.75) !important; }
      `}</style>

      {/* Full-bleed wrapper to override shell max-w-7xl + py-12 */}
      <div className="relative left-1/2 right-1/2 w-screen -mx-[50vw] -mt-12 -mb-12 bg-gray-50 px-3 sm:px-5 py-4">
        <div className="flex gap-3">
          {/* Collapsible legend */}
          <aside className={`hidden lg:flex flex-col shrink-0 transition-all duration-200 ${legendOpen ? 'w-56' : 'w-0'}`}>
            {legendOpen && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-5 sticky top-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-gray-900 uppercase tracking-wider">{T.countryLegend[lang]}</div>
                  <button onClick={() => setLegendOpen(false)} className="text-gray-400 hover:text-gray-700"><ChevronLeft className="h-4 w-4" /></button>
                </div>
                <div className="space-y-1.5">
                  {[
                    { n: 0, label: '0' },
                    { n: 1, label: '1–3' },
                    { n: 4, label: '4–10' },
                    { n: 11, label: '10+' },
                  ].map(r => (
                    <div key={r.n} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="w-6 h-3.5 rounded-sm shrink-0 border border-gray-200" style={{ background: countryShade(r.n) }} />
                      {r.label}
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t border-gray-100">
                  <div className="text-[11px] font-bold text-gray-900 uppercase tracking-wider mb-2">{T.pinLegend[lang]}</div>
                  <div className="space-y-2">
                    {(['dealer','service','importer','demo'] as PartnerType[]).map(t => (
                      <div key={t} className="flex items-center gap-2 text-xs text-gray-700">
                        <span className="inline-block w-4 h-4 rounded-full shrink-0" style={{ background: TYPE_COLORS[t] }} />
                        {T[t][lang]}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Map area */}
          <section className="flex-1 min-w-0">
            {/* Topbar */}
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
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? TYPE_COLORS[t] : '#d1d5db' }} />
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
              <div className="h-[74vh] min-h-[520px] max-h-[760px]">
                <MapContainer
                  center={EUROPE_VIEW.center}
                  zoom={EUROPE_VIEW.zoom}
                  minZoom={3}
                  maxZoom={16}
                  scrollWheelZoom={false}
                  zoomControl
                  style={{ height: '100%', width: '100%' }}
                  worldCopyJump={false}
                  maxBounds={[[34, -25], [72, 45]]}
                  maxBoundsViscosity={0.6}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {geo && (
                    <GeoJSON
                      key={`geo-${Object.keys(countryCounts).join('-')}`}
                      data={geo}
                      style={styleFeature as any}
                    />
                  )}
                  <MapController position={position} />
                  <MapResizer trigger={selectedId} />
                  {filtered.map(p => {
                    const pulse = p.orders >= 10;
                    const sel = selectedId === p.id;
                    return (
                      <Marker
                        key={p.id}
                        position={p.coords}
                        icon={makePinIcon(p.type, pulse, sel)}
                        eventHandlers={{ click: () => setSelectedId(p.id) }}
                      />
                    );
                  })}
                </MapContainer>

                {/* Timan branding overlay (top-right of map) */}
                <div className="pointer-events-none absolute top-3 right-3 z-[500] bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-100 px-3 py-1.5 flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TIMAN_GREEN }} />
                  <span className="text-[11px] font-bold tracking-wider text-gray-800">TIMAN <span className="text-gray-400 font-medium">PARTNER MAP</span></span>
                </div>
              </div>
            </div>
            {/* Scroll safe-zone below map */}
            <div className="h-12 lg:h-14 flex items-center justify-center text-[11px] text-gray-400">
              Tip: Hold <kbd className="mx-1 px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 font-mono text-[10px]">Ctrl</kbd> nede mens du scroller for at zoome på kortet
            </div>
          </section>
        </div>
      </div>


      {/* Slide-in mini CRM profile */}
      {selected && (() => {
        const linkedCount = selected.linked?.length ?? 0;
        return (
          <>
            <div className="fixed inset-0 z-[1000] bg-black/30 lg:hidden" onClick={() => setSelectedId(null)} />
            <aside className="fixed z-[1001] bg-white shadow-2xl border-gray-200
                              inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t
                              lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0
                              animate-in slide-in-from-bottom lg:slide-in-from-right duration-300 overflow-y-auto">
              {/* Header with type-colored band */}
              <div className="relative">
                <div className="h-2" style={{ background: TYPE_COLORS[selected.type] }} />
                <div className="px-5 pt-4 pb-3 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-sm" style={{ background: TYPE_COLORS[selected.type] }}>
                          {T[selected.type][lang]}
                        </span>
                        {selected.account && (
                          <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{selected.account}</span>
                        )}
                      </div>
                      <h2 className="font-bold text-gray-900 text-base leading-tight">{selected.name}</h2>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 shrink-0 -mr-1 -mt-1 p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Address */}
                <div className="flex items-start gap-2.5 text-sm text-gray-700">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="leading-snug">
                    {selected.address && <div>{selected.address}</div>}
                    <div className="text-gray-500">{selected.zip} {selected.city}, {selected.country}</div>
                  </div>
                </div>

                {/* Quick contact buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  <a href={`tel:${selected.phone.replace(/\s/g,'')}`}
                    className="px-2 py-2 bg-[#2d5a27] hover:bg-[#244c1f] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
                    <Phone className="h-3.5 w-3.5" /> {T.call[lang]}
                  </a>
                  {selected.email ? (
                    <a href={`mailto:${selected.email}`}
                      className="px-2 py-2 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
                      <Mail className="h-3.5 w-3.5" /> {T.mail[lang]}
                    </a>
                  ) : <span />}
                  <button className="px-2 py-2 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" /> CRM
                  </button>
                </div>

                {/* Assigned seller strip */}
                <div className="flex items-center justify-between bg-gradient-to-r from-[#2d5a27]/5 to-transparent border-l-2 border-[#2d5a27] rounded-r-md px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-[#2d5a27]" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-none">{T.assignedSeller[lang]}</div>
                      <div className="text-sm font-bold text-gray-900 mt-0.5">{selected.seller}</div>
                    </div>
                  </div>
                </div>

                {/* CRM metric cards */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Users, label: T.users[lang], value: selected.users, tone: 'text-gray-700' },
                    { icon: FileText, label: T.quotes[lang], value: selected.quotes, tone: 'text-gray-700' },
                    { icon: ShoppingCart, label: T.orders[lang], value: selected.orders, tone: 'text-gray-700' },
                    { icon: TrendingUp, label: T.pipeline[lang], value: `€${selected.pipeline}k`, tone: 'text-[#2d5a27]' },
                  ].map((s, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-2.5 hover:border-[#2d5a27]/30 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-500">
                        <s.icon className="h-3 w-3" /> {s.label}
                      </div>
                      <div className={`text-lg font-bold mt-0.5 ${s.tone}`}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Budget progress */}
                {typeof selected.budgetPct === 'number' && (
                  <div className="bg-white border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-500">
                        <Target className="h-3 w-3" /> {T.budget[lang]}
                      </div>
                      <div className="text-sm font-bold text-[#2d5a27]">{selected.budgetPct}%</div>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, selected.budgetPct)}%`, background: `linear-gradient(90deg, ${TIMAN_GREEN}, #4ade80)` }} />
                    </div>
                  </div>
                )}

                {/* Linked partners */}
                {linkedCount > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-500">
                        <Link2 className="h-3 w-3" /> {T.linked[lang]}
                      </div>
                      <span className="text-[10px] font-bold text-gray-900 bg-gray-100 rounded-full px-1.5 py-0.5">{linkedCount}</span>
                    </div>
                    <ul className="space-y-1">
                      {selected.linked!.map(l => (
                        <li key={l.id}>
                          <button onClick={() => setSelectedId(l.id)}
                            className="w-full text-left flex items-center gap-2 text-sm text-gray-700 hover:text-[#2d5a27] py-1.5 px-2 rounded-md hover:bg-[#2d5a27]/5 transition-colors">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2d5a27]" />
                            {l.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Open CRM CTA */}
                <button className="w-full mt-2 px-3 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                  <ExternalLink className="h-4 w-4" /> {T.openCrm[lang]}
                </button>
              </div>
            </aside>
          </>
        );
      })()}
    </MiscPageShell>
  );
}
