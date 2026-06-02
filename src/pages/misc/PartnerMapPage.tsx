import { useMemo, useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import { Search, Users, FileText, ShoppingCart, TrendingUp, ExternalLink, Filter, X, Building2, Wrench, Package, Sparkles, Phone, Home, ChevronLeft } from 'lucide-react';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

type PartnerType = 'dealer' | 'service' | 'importer' | 'demo';
type Seller = 'EM' | 'JTN' | 'BP' | 'AKR' | 'NB';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  countryCode: string; // ISO-3 used by world-atlas
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
  // Real geographic coordinates [lng, lat]
  coords: [number, number];
  linked?: { id: string; name: string }[];
}

const PARTNERS: Partner[] = [
  { id: 'p1', name: 'Wilmers Kommunaltechnik GmbH', type: 'dealer', countryCode: 'DEU', country: 'Tyskland', city: 'Nordhorn', zip: '48529', address: 'Industriestr. 12', account: '11081', seller: 'AKR', users: 5, quotes: 18, orders: 12, pipeline: 240, phone: '+49 5921 12345', coords: [7.0758, 52.4375], linked: [{ id: 'p5', name: 'Nordhorn Demo Park' }] },
  { id: 'p2', name: 'Valtec Technik', type: 'dealer', countryCode: 'DEU', country: 'Tyskland', city: 'Bremen', zip: '28195', address: 'Hafenstr. 4', account: '10267', seller: 'NB', users: 8, quotes: 31, orders: 27, pipeline: 510, phone: '+49 421 5544221', coords: [8.8017, 53.0793] },
  { id: 'p3', name: 'Bremen Servicepartner', type: 'service', countryCode: 'DEU', country: 'Tyskland', city: 'Bremen', zip: '28209', address: 'Werkstattweg 7', seller: 'NB', users: 3, quotes: 4, orders: 2, pipeline: 35, phone: '+49 421 9911000', coords: [8.812, 53.099] },
  { id: 'p4', name: 'Bayern Import GmbH', type: 'importer', countryCode: 'DEU', country: 'Tyskland', city: 'München', zip: '80331', address: 'Maximilianstr. 22', seller: 'EM', users: 6, quotes: 12, orders: 9, pipeline: 320, phone: '+49 89 4477001', coords: [11.5820, 48.1351] },
  { id: 'p5', name: 'Nordhorn Demo Park', type: 'demo', countryCode: 'DEU', country: 'Tyskland', city: 'Nordhorn', zip: '48529', address: 'Demoallee 1', seller: 'AKR', users: 1, quotes: 0, orders: 0, pipeline: 0, phone: '+49 5921 99000', coords: [7.083, 52.43] },
  { id: 'p6', name: 'Timan Danmark', type: 'dealer', countryCode: 'DNK', country: 'Danmark', city: 'Tim', zip: '6980', address: 'Osvald Pedersens Vej 2', account: '1000', seller: 'NB', users: 12, quotes: 44, orders: 38, pipeline: 870, phone: '+45 96 74 44 66', coords: [8.2750, 56.1840] },
  { id: 'p7', name: 'Valtec France', type: 'dealer', countryCode: 'FRA', country: 'Frankrig', city: 'Lyon', zip: '69000', address: 'Rue de la Part-Dieu 10', account: '4850', seller: 'BP', users: 4, quotes: 9, orders: 6, pipeline: 140, phone: '+33 4 7200 1100', coords: [4.8357, 45.7640] },
  { id: 'p8', name: 'UK Grounds Import', type: 'importer', countryCode: 'GBR', country: 'Storbritannien', city: 'Leeds', zip: 'LS1', address: 'Wellington St 50', seller: 'JTN', users: 7, quotes: 15, orders: 11, pipeline: 290, phone: '+44 113 200 2000', coords: [-1.5491, 53.8008] },
  { id: 'p9', name: 'Hamburg Service Nord', type: 'service', countryCode: 'DEU', country: 'Tyskland', city: 'Hamburg', zip: '20095', address: 'Hafenstr. 21', seller: 'NB', users: 2, quotes: 3, orders: 1, pipeline: 20, phone: '+49 40 30000', coords: [9.9937, 53.5511] },
  { id: 'p10', name: 'Köln Demo Center', type: 'demo', countryCode: 'DEU', country: 'Tyskland', city: 'Köln', zip: '50667', address: 'Domkloster 4', seller: 'EM', users: 1, quotes: 0, orders: 0, pipeline: 0, phone: '+49 221 22100', coords: [6.9603, 50.9375] },
  { id: 'p11', name: 'Polen Maskiner sp.', type: 'dealer', countryCode: 'POL', country: 'Polen', city: 'Warszawa', zip: '00-001', account: '7720', seller: 'NB', users: 3, quotes: 7, orders: 4, pipeline: 95, phone: '+48 22 100 2000', coords: [21.0122, 52.2297] },
  { id: 'p12', name: 'Italia Verde srl', type: 'dealer', countryCode: 'ITA', country: 'Italien', city: 'Milano', zip: '20100', account: '6610', seller: 'EM', users: 5, quotes: 12, orders: 8, pipeline: 175, phone: '+39 02 7700 1100', coords: [9.1900, 45.4642] },
];

const TYPE_COLORS: Record<PartnerType, string> = {
  dealer: '#dc2626', service: '#16a34a', importer: '#2563eb', demo: '#9333ea',
};
const TYPE_ICON = { dealer: Building2, service: Wrench, importer: Package, demo: Sparkles } as const;

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  intro: { da: 'Find dine partnere på kortet. Klik et land for at zoome ind, klik en pin for detaljer.', en: 'Find partners on the map. Click a country to zoom, click a pin for details.', de: 'Partner auf der Karte finden.', it: 'Trova i partner sulla mappa.', hu: 'Partnerek a térképen.' },
  search: { da: 'Søg firma, land, konto eller postnr…', en: 'Search company, country, account or zip…', de: 'Firma, Land, Konto oder PLZ…', it: 'Cerca…', hu: 'Keresés…' },
  filters: { da: 'Filtre', en: 'Filters', de: 'Filter', it: 'Filtri', hu: 'Szűrők' },
  type: { da: 'Type', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus' },
  seller: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Eladó' },
  dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Forgalmazó' },
  service: { da: 'Servicepartner', en: 'Service partner', de: 'Servicepartner', it: 'Servizio', hu: 'Szervizpartner' },
  importer: { da: 'Importør', en: 'Importer', de: 'Importeur', it: 'Importatore', hu: 'Importőr' },
  demo: { da: 'Demo', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo' },
  reset: { da: 'Nulstil', en: 'Reset', de: 'Zurücksetzen', it: 'Reimposta', hu: 'Visszaállítás' },
  resetView: { da: 'Vis hele Europa', en: 'Show all Europe', de: 'Ganz Europa', it: 'Tutta Europa', hu: 'Egész Európa' },
  details: { da: 'Partnerdetaljer', en: 'Partner details', de: 'Partnerdetails', it: 'Dettagli partner', hu: 'Adatok' },
  users: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felhasználók' },
  quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Ajánlatok' },
  orders: { da: 'Ordrer', en: 'Orders', de: 'Bestellungen', it: 'Ordini', hu: 'Rendelések' },
  pipeline: { da: 'Pipeline', en: 'Pipeline', de: 'Pipeline', it: 'Pipeline', hu: 'Pipeline' },
  openCrm: { da: 'Åbn CRM', en: 'Open CRM', de: 'CRM öffnen', it: 'Apri CRM', hu: 'CRM' },
  call: { da: 'Ring', en: 'Call', de: 'Anrufen', it: 'Chiama', hu: 'Hívás' },
  linked: { da: 'Tilknyttede partnere', en: 'Linked partners', de: 'Verknüpfte Partner', it: 'Partner collegati', hu: 'Kapcsolt' },
  assignedSeller: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Eladó' },
  countryLegend: { da: 'Land — antal partnere', en: 'Country — partner count', de: 'Land — Anzahl', it: 'Paese — numero', hu: 'Ország' },
  pinLegend: { da: 'Pin-typer', en: 'Pin types', de: 'Pin-Typen', it: 'Tipi pin', hu: 'Tűk' },
};

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';

function countryShade(n: number): string {
  if (n === 0) return '#eef2f1';
  if (n <= 3) return '#d1fae5';
  if (n <= 10) return '#86efac';
  return '#22c55e';
}

interface Position { coordinates: [number, number]; zoom: number }
const EUROPE_VIEW: Position = { coordinates: [12, 53], zoom: 1 };

export default function PartnerMapPage() {
  const { language: lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<PartnerType>>(new Set(['dealer','service','importer','demo']));
  const [activeSellers, setActiveSellers] = useState<Set<Seller>>(new Set(['EM','JTN','BP','AKR','NB']));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverCountry, setHoverCountry] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>(EUROPE_VIEW);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
      if (q) {
        const hay = `${p.name} ${p.country} ${p.countryCode} ${p.account ?? ''} ${p.zip} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, activeTypes, activeSellers]);

  // Auto-zoom on search match
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 2) return;
    // Country-name shortcut
    const byCountry = PARTNERS.filter(p => p.country.toLowerCase().includes(q));
    if (byCountry.length > 0 && filtered.length > 1) {
      const c = byCountry[0].coords;
      setPosition({ coordinates: [c[0], c[1]], zoom: 4 });
      return;
    }
    if (filtered.length === 1) {
      const p = filtered[0];
      setPosition({ coordinates: p.coords, zoom: 7 });
      setSelectedId(p.id);
    } else if (filtered.length > 1 && filtered.length <= 5) {
      const avgX = filtered.reduce((s, p) => s + p.coords[0], 0) / filtered.length;
      const avgY = filtered.reduce((s, p) => s + p.coords[1], 0) / filtered.length;
      setPosition({ coordinates: [avgX, avgY], zoom: 3 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const countryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of filtered) m[p.countryCode] = (m[p.countryCode] ?? 0) + 1;
    return m;
  }, [filtered]);

  const selected = selectedId ? PARTNERS.find(p => p.id === selectedId) ?? null : null;

  const handleCountryClick = (geo: { id: string }, centroid: [number, number]) => {
    setPosition({ coordinates: centroid, zoom: 4 });
    // light filter feedback: count
    void geo;
  };

  const resetView = () => { setPosition(EUROPE_VIEW); setSelectedId(null); };

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      <div className="grid grid-cols-12 gap-4 lg:gap-5">
        {/* Left rail */}
        <aside className={`${mobileFiltersOpen ? 'fixed inset-0 z-40 bg-black/40 lg:bg-transparent lg:static' : 'hidden lg:block'} lg:col-span-3 xl:col-span-2`}>
          <div className={`${mobileFiltersOpen ? 'absolute left-0 top-0 bottom-0 w-[85%] max-w-xs bg-white p-4 overflow-y-auto' : ''} lg:bg-white lg:rounded-2xl lg:border lg:border-gray-100 lg:shadow-sm lg:p-4 lg:sticky lg:top-4 space-y-5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                <Filter className="h-4 w-4" /> {T.filters[lang]}
              </div>
              <button onClick={() => setMobileFiltersOpen(false)} className="lg:hidden text-gray-400"><X className="h-5 w-5" /></button>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{T.type[lang]}</div>
              <div className="space-y-1">
                {(['dealer','service','importer','demo'] as PartnerType[]).map(t => {
                  const on = activeTypes.has(t);
                  return (
                    <button key={t} onClick={() => toggleType(t)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${on ? 'bg-gray-50 text-gray-900' : 'text-gray-400 hover:bg-gray-50'}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: on ? TYPE_COLORS[t] : '#d1d5db' }} />
                      <span className="flex-1 text-left">{T[t][lang]}</span>
                      <span className="text-[10px] text-gray-400">{PARTNERS.filter(p => p.type === t).length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{T.seller[lang]}</div>
              <div className="flex flex-wrap gap-1.5">
                {(['EM','JTN','BP','AKR','NB'] as Seller[]).map(s => (
                  <button key={s} onClick={() => toggleSeller(s)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${activeSellers.has(s) ? 'bg-[#2d5a27] text-white border-[#2d5a27]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{s}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{T.countryLegend[lang]}</div>
              <div className="flex items-center gap-1">
                {[0, 1, 4, 11].map(n => (
                  <div key={n} className="flex-1 h-2 rounded-sm" style={{ background: countryShade(n) }} title={`${n}+`} />
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                <span>0</span><span>1-3</span><span>4-10</span><span>10+</span>
              </div>
            </div>

            <button onClick={() => { setSearch(''); setActiveTypes(new Set(['dealer','service','importer','demo'])); setActiveSellers(new Set(['EM','JTN','BP','AKR','NB'])); resetView(); }}
              className="w-full text-xs font-semibold text-gray-500 hover:text-gray-900 py-2 border-t border-gray-100">{T.reset[lang]}</button>
          </div>
        </aside>

        {/* Map area */}
        <section className="col-span-12 lg:col-span-9 xl:col-span-10">
          <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Floating search */}
            <div className="absolute top-4 left-4 right-4 z-20 flex gap-2 pointer-events-none">
              <div className="relative flex-1 max-w-md pointer-events-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={T.search[lang]}
                  className="w-full pl-10 pr-9 py-2.5 bg-white rounded-full border border-gray-200 shadow-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden pointer-events-auto bg-white rounded-full shadow-md border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Filter className="h-4 w-4" />
              </button>
              <button onClick={resetView}
                className="pointer-events-auto hidden md:flex bg-white rounded-full shadow-md border border-gray-200 px-3.5 py-2.5 text-xs font-semibold text-gray-700 items-center gap-1.5 hover:bg-gray-50">
                <Home className="h-3.5 w-3.5" /> {T.resetView[lang]}
              </button>
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-4 left-4 z-20 flex flex-col bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <button onClick={() => setPosition(p => ({ ...p, zoom: Math.min(p.zoom * 1.5, 12) }))} className="w-9 h-9 flex items-center justify-center text-lg font-semibold text-gray-700 hover:bg-gray-50 border-b border-gray-100">+</button>
              <button onClick={() => setPosition(p => ({ ...p, zoom: Math.max(p.zoom / 1.5, 1) }))} className="w-9 h-9 flex items-center justify-center text-lg font-semibold text-gray-700 hover:bg-gray-50">−</button>
            </div>

            {/* Pin legend */}
            <div className="absolute bottom-4 right-4 z-20 bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-200 px-3 py-2 flex items-center gap-3 text-[11px]">
              {(['dealer','service','importer','demo'] as PartnerType[]).map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                  <span className="text-gray-600">{T[t][lang]}</span>
                </div>
              ))}
            </div>

            {/* Hover country tooltip */}
            {hoverCountry && (
              <div className="absolute top-20 right-4 z-20 bg-white/95 backdrop-blur rounded-md shadow-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700">
                {hoverCountry}
              </div>
            )}

            <div className="aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/8] bg-[#f3f6f8]">
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 700, center: [12, 53] }}
                style={{ width: '100%', height: '100%' }}
              >
                <ZoomableGroup
                  center={position.coordinates}
                  zoom={position.zoom}
                  minZoom={1}
                  maxZoom={12}
                  onMoveEnd={(pos) => setPosition({ coordinates: pos.coordinates as [number, number], zoom: pos.zoom })}
                >
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) => geographies.map((geo) => {
                      const name: string = geo.properties.name;
                      const NAME_TO_ISO: Record<string,string> = { Germany:'DEU', Denmark:'DNK', France:'FRA', 'United Kingdom':'GBR', Poland:'POL', Italy:'ITA' };
                      const code = NAME_TO_ISO[name] ?? '';
                      const count = countryCounts[code] ?? 0;
                      const isHover = hoverCountry === name;
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onMouseEnter={() => setHoverCountry(name)}
                          onMouseLeave={() => setHoverCountry(null)}
                          onClick={() => handleCountryClick(geo, geoCentroid(geo) as [number, number])}
                          style={{
                            default: { fill: countryShade(count), stroke: '#ffffff', strokeWidth: 0.5, outline: 'none', transition: 'fill .2s' },
                            hover: { fill: isHover ? '#bbf7d0' : countryShade(count), stroke: '#94a3b8', strokeWidth: 0.7, outline: 'none', cursor: 'pointer' },
                            pressed: { fill: '#86efac', outline: 'none' },
                          }}
                        />
                      );
                    })}
                  </Geographies>

                  {/* Relationship lines */}
                  {filtered.map(p => p.linked?.map(l => {
                    const other = PARTNERS.find(q => q.id === l.id);
                    if (!other) return null;
                    return (
                      <line
                        key={`${p.id}-${l.id}`}
                        x1={0} y1={0} x2={0} y2={0}
                        style={{ display: 'none' }}
                      />
                    );
                  }))}

                  {filtered.map(p => {
                    const ringR = p.orders >= 25 ? 16 : p.orders >= 10 ? 11 : 0;
                    const isSel = selectedId === p.id;
                    const isHov = hoveredId === p.id;
                    const color = TYPE_COLORS[p.type];
                    // scale inverse to zoom so pins stay readable
                    const k = 1 / Math.max(1, position.zoom * 0.6);
                    return (
                      <Marker key={p.id} coordinates={p.coords} onClick={() => setSelectedId(p.id)}
                        onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)}
                        style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: { cursor: 'pointer' } }}>
                        <g transform={`scale(${k})`}>
                          {ringR > 0 && <circle r={ringR} fill={color} opacity={0.18} />}
                          {(isSel || isHov) && <circle r={10} fill={color} opacity={0.25} />}
                          {/* Map marker shape */}
                          <g transform="translate(0,-2)">
                            <path
                              d="M0,-14 C-5,-14 -8,-10 -8,-6 C-8,-1 0,8 0,8 C0,8 8,-1 8,-6 C8,-10 5,-14 0,-14 Z"
                              fill={color}
                              stroke="white"
                              strokeWidth={1.2}
                              style={{ filter: `drop-shadow(0 ${isHov || isSel ? 3 : 1.5}px ${isHov || isSel ? 3 : 1.5}px rgba(0,0,0,${isHov || isSel ? 0.35 : 0.25}))`, transition: 'all .15s' }}
                            />
                            <circle cx={0} cy={-7} r={2.4} fill="white" />
                          </g>
                          {isHov && (
                            <g transform="translate(0,-22)">
                              <rect x={-50} y={-12} width={100} height={16} rx={3} fill="#111827" />
                              <text textAnchor="middle" y={-1} fontSize={8} fill="white" fontWeight={600}>{p.name.length > 22 ? p.name.slice(0,21)+'…' : p.name}</text>
                            </g>
                          )}
                        </g>
                      </Marker>
                    );
                  })}
                </ZoomableGroup>
              </ComposableMap>
            </div>
          </div>
        </section>
      </div>

      {/* Slide-in right detail panel (desktop) / bottom sheet (mobile) */}
      {selected && (() => {
        const Icon = TYPE_ICON[selected.type];
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSelectedId(null)} />
            <aside className="fixed z-50 bg-white shadow-2xl border-gray-200
                              inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t
                              lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0
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
                      {selected.linked.map(l => {
                        const other = PARTNERS.find(p => p.id === l.id);
                        return (
                          <li key={l.id}>
                            <button onClick={() => other && setSelectedId(other.id)}
                              className="w-full text-left flex items-center gap-2 text-sm text-gray-700 hover:text-[#2d5a27] py-1.5 px-2 rounded-md hover:bg-gray-50">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2d5a27]" />
                              {l.name}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          </>
        );
      })()}
    </MiscPageShell>
  );
}
