import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, ExternalLink, X, MapPin, Home, ChevronLeft, ChevronRight, Maximize2, HelpCircle, User as UserIcon, AlertTriangle, Users, FileText, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import { fetchDealerAccounts, fetchDealerAccountStats, type DealerAccount, type DealerAccountStats } from '@/lib/dealerAccountsService';

type PartnerType = 'dealer' | 'service_partner' | 'importer' | 'demo_location';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  account: string;
  country: string;
  city: string;
  postal: string;
  addressLine1: string;
  addressLine2: string;
  seller: string | null;
  sellerName: string | null;
  coords: [number, number];
  users: number;
  quotes: number;
  orders: number;
}

const TIMAN_GREEN = '#2d5a27';

const TYPE_COLORS: Record<PartnerType, string> = {
  dealer: '#dc2626',
  service_partner: '#16a34a',
  importer: '#2563eb',
  demo_location: '#7c3aed',
};

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  intro: { da: 'Forhandlere fra SharePoint/Supabase. Manglende koordinater vises i panelet til højre.', en: 'Dealers from SharePoint/Supabase.', de: 'Händler aus SharePoint/Supabase.', it: 'Rivenditori da SharePoint/Supabase.', hu: 'Forgalmazók SharePoint/Supabase-ből.' },
  search: { da: 'Søg på land, firma eller kontonr.', en: 'Search…', de: 'Suchen…', it: 'Cerca…', hu: 'Keresés…' },
  dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Forgalmazó' },
  service_partner: { da: 'Servicepartner', en: 'Service partner', de: 'Servicepartner', it: 'Servizio', hu: 'Szervizpartner' },
  importer: { da: 'Importør', en: 'Importer', de: 'Importeur', it: 'Importatore', hu: 'Importőr' },
  demo_location: { da: 'Demo-lokation', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo' },
  allSellers: { da: 'Alle sælgere', en: 'All sellers', de: 'Alle', it: 'Tutti', hu: 'Mind' },
  resetView: { da: 'Vis Europa', en: 'Show Europe', de: 'Europa', it: 'Europa', hu: 'Európa' },
  users: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felh.' },
  quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Ajánlatok' },
  orders: { da: 'Ordrer', en: 'Orders', de: 'Bestellungen', it: 'Ordini', hu: 'Rendelések' },
  openCrm: { da: 'Åbn CRM', en: 'Open CRM', de: 'CRM öffnen', it: 'Apri CRM', hu: 'CRM' },
  assignedSeller: { da: 'Tildelt sælger', en: 'Assigned seller', de: 'Verkäufer', it: 'Venditore', hu: 'Eladó' },
  pinLegend: { da: 'Partnertyper', en: 'Partner types', de: 'Typen', it: 'Tipi', hu: 'Típusok' },
  missing: { da: 'Mangler koordinater', en: 'Missing coordinates', de: 'Fehlende Koordinaten', it: 'Coordinate mancanti', hu: 'Hiányzó koordináták' },
  missingHint: { da: 'Kør "Geocode forhandlere" i Backend → Forhandlere for at hente koordinater.', en: 'Run "Geocode dealers" in Backend.', de: 'Backend → Forhandlere.', it: 'Backend → Forhandlere.', hu: 'Backend → Forhandlere.' },
  loading: { da: 'Henter forhandlere…', en: 'Loading…', de: 'Laden…', it: 'Caricamento…', hu: 'Betöltés…' },
  noData: { da: 'Ingen forhandlere fundet.', en: 'No dealers found.', de: 'Keine Händler.', it: 'Nessun rivenditore.', hu: 'Nincs forgalmazó.' },
};

interface Position { center: [number, number]; zoom: number }
const EUROPE_VIEW: Position = { center: [50.5, 9.5], zoom: 5 };

function normalizeType(t: string | null): PartnerType {
  const v = (t ?? '').toLowerCase();
  if (v === 'service_partner' || v === 'service' || v === 'servicepartner') return 'service_partner';
  if (v === 'importer' || v === 'importør') return 'importer';
  if (v === 'demo_location' || v === 'demo') return 'demo_location';
  return 'dealer';
}

function makePinIcon(type: PartnerType, selected: boolean): L.DivIcon {
  const color = TYPE_COLORS[type];
  const sel = selected ? 'pm-pin--selected' : '';
  const html = `
    <div class="pm-pin ${sel}">
      <svg width="36" height="44" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))">
        <path d="M20 2 C10 2 3 9 3 18 C3 30 20 46 20 46 C20 46 37 30 37 18 C37 9 30 2 20 2 Z" fill="${color}" stroke="white" stroke-width="2.5"/>
        <circle cx="20" cy="18" r="5.5" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({ html, className: 'pm-pin-wrap', iconSize: [36, 44], iconAnchor: [18, 42], popupAnchor: [0, -36] });
}

function MapController({ position }: { position: Position }) {
  const map = useMap();
  useEffect(() => { map.flyTo(position.center, position.zoom, { duration: 0.8 }); }, [position, map]);
  return null;
}

function MapResizer({ trigger }: { trigger: unknown }) {
  const map = useMap();
  useEffect(() => { const id = setTimeout(() => map.invalidateSize(), 320); return () => clearTimeout(id); }, [trigger, map]);
  return null;
}

function CtrlWheelZoom() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) { if (!map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable(); }
      else { if (map.scrollWheelZoom.enabled()) map.scrollWheelZoom.disable(); }
    };
    container.addEventListener('wheel', onWheel, { passive: true });
    return () => container.removeEventListener('wheel', onWheel);
  }, [map]);
  return null;
}

export default function PartnerMapPage() {
  const { language: lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<PartnerType>>(new Set(['dealer','service_partner','importer','demo_location']));
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>(EUROPE_VIEW);
  const [legendOpen, setLegendOpen] = useState(false);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [dRes, sRes] = await Promise.all([fetchDealerAccounts({}), fetchDealerAccountStats().catch(() => ({ rows: [] as DealerAccountStats[] }))]);
      if (!alive) return;
      if (dRes.error) setLoadError(dRes.error);
      setDealers(dRes.rows);
      const map: Record<string, DealerAccountStats> = {};
      for (const s of sRes.rows ?? []) map[s.id] = s;
      setStats(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const partners: Partner[] = useMemo(() => dealers
    .filter((d) => !d.is_deleted)
    .map((d) => {
      const st = stats[d.id];
      return {
        id: d.id,
        name: d.company_name,
        type: normalizeType(d.dealer_type),
        account: d.account_number,
        country: d.country ?? '',
        city: d.city ?? '',
        postal: d.postal_code ?? '',
        addressLine1: d.address_line_1 ?? '',
        addressLine2: d.address_line_2 ?? '',
        seller: d.assigned_seller_initials,
        sellerName: d.assigned_seller_name,
        coords: d.latitude != null && d.longitude != null ? [d.latitude, d.longitude] : null as any,
        users: st?.user_count ?? 0,
        quotes: st?.quote_count ?? 0,
        orders: st?.order_count ?? 0,
      } as Partner;
    }), [dealers, stats]);

  const sellerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of partners) if (p.seller) s.add(p.seller);
    return Array.from(s).sort();
  }, [partners]);

  const toggleType = (t: PartnerType) => {
    const n = new Set(activeTypes); n.has(t) ? n.delete(t) : n.add(t); setActiveTypes(n);
  };

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return partners.filter((p) => {
      if (!activeTypes.has(p.type)) return false;
      if (sellerFilter !== 'all' && p.seller !== sellerFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.country} ${p.account} ${p.postal} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [partners, search, activeTypes, sellerFilter]);

  const withCoords = useMemo(() => filteredAll.filter((p) => p.coords && Number.isFinite(p.coords[0]) && Number.isFinite(p.coords[1])), [filteredAll]);
  const missingCoords = useMemo(() => filteredAll.filter((p) => !p.coords), [filteredAll]);

  const selected = selectedId ? partners.find((p) => p.id === selectedId) ?? null : null;
  const resetView = () => { setPosition(EUROPE_VIEW); setSelectedId(null); };

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      <style>{`
        .pm-pin-wrap { background:transparent !important; border:none !important; }
        .pm-pin { position:relative; width:36px; height:44px; transition:transform .15s ease; cursor:pointer; }
        .pm-pin:hover { transform:translateY(-3px) scale(1.08); }
        .pm-pin--selected { transform:translateY(-4px) scale(1.12); }
        .leaflet-container { font-family:inherit; background:#cfe7f1; }
        .leaflet-control-zoom a { border:none !important; background:white !important; color:#374151 !important;
          width:34px !important; height:34px !important; line-height:34px !important; font-size:18px !important;
          box-shadow:0 2px 8px rgba(0,0,0,.12); }
        .leaflet-control-zoom a:hover { color:${TIMAN_GREEN} !important; }
        .leaflet-control-zoom { border:none !important; margin-bottom:24px !important; margin-left:16px !important; }
        .leaflet-control-attribution { font-size:9px !important; background:rgba(255,255,255,.75) !important; }
      `}</style>

      <div className="relative left-1/2 right-1/2 w-screen -mx-[50vw] -mt-12 -mb-12 bg-gray-50 px-3 sm:px-5 py-4">
        <div className="flex gap-3">
          {/* Legend */}
          <aside className={`hidden lg:flex flex-col shrink-0 transition-all duration-200 ${legendOpen ? 'w-56' : 'w-0'}`}>
            {legendOpen && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-5 sticky top-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-gray-900 uppercase tracking-wider">{T.pinLegend[lang]}</div>
                  <button onClick={() => setLegendOpen(false)} className="text-gray-400 hover:text-gray-700"><ChevronLeft className="h-4 w-4" /></button>
                </div>
                <div className="space-y-2">
                  {(['dealer','service_partner','importer','demo_location'] as PartnerType[]).map((t) => (
                    <div key={t} className="flex items-center gap-2 text-xs text-gray-700">
                      <span className="inline-block w-4 h-4 rounded-full shrink-0" style={{ background: TYPE_COLORS[t] }} />
                      {T[t][lang]}
                    </div>
                  ))}
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
                  ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.search[lang]}
                  className="w-full pl-9 pr-9 py-2 bg-gray-50 hover:bg-white focus:bg-white border border-transparent focus:border-[#2d5a27] rounded-lg text-sm outline-none transition-colors"
                />
                {search && (<button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>)}
              </div>
              <div className="flex items-center gap-1.5">
                {(['dealer','service_partner','importer','demo_location'] as PartnerType[]).map((t) => {
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
                value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}
                className="text-xs font-medium px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:border-[#2d5a27]">
                <option value="all">{T.allSellers[lang]}</option>
                {sellerOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={resetView} className="h-9 w-9 flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title={T.resetView[lang]}>
                  <Home className="h-4 w-4" />
                </button>
                <button className="h-9 w-9 hidden md:flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Fuldskærm"><Maximize2 className="h-4 w-4" /></button>
                <button className="h-9 w-9 hidden md:flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Hjælp"><HelpCircle className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Map */}
            <div className="relative bg-white rounded-b-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-[74vh] min-h-[520px] max-h-[760px]">
                <MapContainer
                  center={EUROPE_VIEW.center} zoom={EUROPE_VIEW.zoom} minZoom={3} maxZoom={16}
                  scrollWheelZoom={false} zoomControl
                  style={{ height: '100%', width: '100%' }}
                  worldCopyJump={false}
                  maxBounds={[[34, -25], [72, 45]]}
                  maxBoundsViscosity={0.6}
                >
                  <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapController position={position} />
                  <CtrlWheelZoom />
                  <MapResizer trigger={selectedId} />
                  {withCoords.map((p) => (
                    <Marker key={p.id} position={p.coords} icon={makePinIcon(p.type, selectedId === p.id)}
                      eventHandlers={{ click: () => setSelectedId(p.id) }} />
                  ))}
                </MapContainer>

                <div className="pointer-events-none absolute top-3 right-3 z-[500] bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-100 px-3 py-1.5 flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TIMAN_GREEN }} />
                  <span className="text-[11px] font-bold tracking-wider text-gray-800">TIMAN <span className="text-gray-400 font-medium">PARTNER MAP</span></span>
                </div>

                {loading && (
                  <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/40 text-sm text-gray-700">
                    {T.loading[lang]}
                  </div>
                )}
              </div>
            </div>

            {/* Missing coordinates */}
            {!loading && (missingCoords.length > 0 || loadError) && (
              <div className="mt-3 bg-white rounded-2xl border border-amber-200 shadow-sm p-4">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm font-bold text-gray-900">{T.missing[lang]} ({missingCoords.length})</div>
                </div>
                {loadError && <div className="text-xs text-rose-700 mb-2">{loadError}</div>}
                <p className="text-xs text-gray-600 mb-3">{T.missingHint[lang]}</p>
                <div className="max-h-56 overflow-auto divide-y divide-gray-100">
                  {missingCoords.map((p) => (
                    <div key={p.id} className="py-1.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{p.name} <span className="text-gray-400 font-mono ml-1">#{p.account}</span></div>
                        <div className="text-gray-500 truncate">{[p.addressLine1, p.postal, p.city, p.country].filter(Boolean).join(', ') || '—'}</div>
                      </div>
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[p.type] }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && partners.length === 0 && (
              <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-sm text-gray-600">{T.noData[lang]}</div>
            )}

            <div className="h-12 lg:h-14 flex items-center justify-center text-[11px] text-gray-400">
              Tip: Hold <kbd className="mx-1 px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 font-mono text-[10px]">Ctrl</kbd> nede mens du scroller for at zoome på kortet
            </div>
          </section>
        </div>
      </div>

      {/* Popup / side panel */}
      {selected && (
        <>
          <div className="fixed inset-0 z-[1000] bg-black/30 lg:hidden" onClick={() => setSelectedId(null)} />
          <aside className="fixed z-[1001] bg-white shadow-2xl border-gray-200
                            inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t
                            lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0
                            animate-in slide-in-from-bottom lg:slide-in-from-right duration-300 overflow-y-auto">
            <div className="relative">
              <div className="h-2" style={{ background: TYPE_COLORS[selected.type] }} />
              <div className="px-5 pt-4 pb-3 border-b border-gray-100">
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
                  <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 shrink-0 -mr-1 -mt-1 p-1"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="leading-snug">
                  {selected.addressLine1 && <div>{selected.addressLine1}</div>}
                  {selected.addressLine2 && <div>{selected.addressLine2}</div>}
                  <div className="text-gray-500">{[selected.postal, selected.city].filter(Boolean).join(' ')}{selected.country ? `, ${selected.country}` : ''}</div>
                </div>
              </div>

              {(selected.seller || selected.sellerName) && (
                <div className="flex items-center justify-between bg-gradient-to-r from-[#2d5a27]/5 to-transparent border-l-2 border-[#2d5a27] rounded-r-md px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-[#2d5a27]" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-none">{T.assignedSeller[lang]}</div>
                      <div className="text-sm font-bold text-gray-900 mt-0.5">{selected.seller}{selected.sellerName ? ` — ${selected.sellerName}` : ''}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Users, label: T.users[lang], value: selected.users },
                  { icon: FileText, label: T.quotes[lang], value: selected.quotes },
                  { icon: ShoppingCart, label: T.orders[lang], value: selected.orders },
                ].map((s, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-500">
                      <s.icon className="h-3 w-3" /> {s.label}
                    </div>
                    <div className="text-lg font-bold mt-0.5 text-gray-700">{s.value}</div>
                  </div>
                ))}
              </div>

              <Link
                to={`/portal/crm/dealers/${selected.id}`}
                className="w-full mt-2 px-3 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> {T.openCrm[lang]}
              </Link>
            </div>
          </aside>
        </>
      )}
    </MiscPageShell>
  );
}
