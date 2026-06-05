import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Search, ExternalLink, X, MapPin, Home, ChevronLeft, ChevronRight, Maximize2, HelpCircle, User as UserIcon, AlertTriangle, Users, FileText, ShoppingCart, List, Phone, Mail, Navigation, Globe, Wrench, Facebook } from 'lucide-react';
import { Link } from 'react-router-dom';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { useCountryFormatter } from '@/lib/formatCountry';
import { Language } from '@/types/configurator';
import { fetchDealerAccounts, fetchDealerAccountStats, type DealerAccount, type DealerAccountStats } from '@/lib/dealerAccountsService';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { fetchPartnerMachineStats, type PartnerMachineStats } from '@/lib/partnerMachineStatsService';
import { fetchWarrantyMachinePins, fetchWarrantyMachineMissingCoords, type WarrantyMachinePin, type WarrantyMachineMissing } from '@/lib/warrantyMachinePinsService';
import { useSellerDirectory, resolveSellerDisplay } from '@/lib/sellerDirectory';
import { formatDate } from '@/lib/format-date';

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
  coords: [number, number] | null;
  users: number;
  quotes: number;
  orders: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebook: string | null;
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
  search: { da: 'Søg på land, by, sælger, firma eller kontonr.', en: 'Search…', de: 'Suchen…', it: 'Cerca…', hu: 'Keresés…' },
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
  results: { da: 'Resultater', en: 'Results', de: 'Ergebnisse', it: 'Risultati', hu: 'Találatok' },
  noMatches: { da: 'Ingen matchende partnere.', en: 'No matches.', de: 'Keine Treffer.', it: 'Nessun risultato.', hu: 'Nincs találat.' },
  noCoords: { da: '(ingen koordinater)', en: '(no coords)', de: '(keine Koord.)', it: '(no coord.)', hu: '(nincs koord.)' },
  worldView: { da: 'Vis hele verden', en: 'Show world', de: 'Weltweit', it: 'Mondo', hu: 'Világ' },
  europeView: { da: 'Vis Europa', en: 'Show Europe', de: 'Europa', it: 'Europa', hu: 'Európa' },
  countries: { da: 'Lande', en: 'Countries', de: 'Länder', it: 'Paesi', hu: 'Országok' },
  coverage: { da: 'Partnerdækning', en: 'Partner coverage', de: 'Partnerabdeckung', it: 'Copertura', hu: 'Lefedettség' },
  noPartnerIn: { da: 'Lande uden partner', en: 'Countries without partner', de: 'Länder ohne Partner', it: 'Paesi senza partner', hu: 'Partner nélkül' },
};

interface Position { center: [number, number]; zoom: number }
const EUROPE_VIEW: Position = { center: [50.5, 9.5], zoom: 4 };
const WORLD_VIEW: Position = { center: [25, 10], zoom: 2 };

type Continent = 'europe' | 'north_america' | 'south_america' | 'asia' | 'africa' | 'oceania' | 'other';

// Country → continent + approximate bounds [south, west, north, east]
const COUNTRY_INFO: Record<string, { continent: Continent; bounds: [number, number, number, number] }> = {
  denmark: { continent: 'europe', bounds: [54.5, 8.0, 57.8, 15.2] },
  danmark: { continent: 'europe', bounds: [54.5, 8.0, 57.8, 15.2] },
  sweden: { continent: 'europe', bounds: [55.3, 11.0, 69.1, 24.2] },
  sverige: { continent: 'europe', bounds: [55.3, 11.0, 69.1, 24.2] },
  norway: { continent: 'europe', bounds: [57.9, 4.5, 71.2, 31.1] },
  norge: { continent: 'europe', bounds: [57.9, 4.5, 71.2, 31.1] },
  finland: { continent: 'europe', bounds: [59.8, 20.5, 70.1, 31.6] },
  iceland: { continent: 'europe', bounds: [63.3, -24.5, 66.6, -13.5] },
  germany: { continent: 'europe', bounds: [47.3, 5.9, 55.1, 15.0] },
  tyskland: { continent: 'europe', bounds: [47.3, 5.9, 55.1, 15.0] },
  deutschland: { continent: 'europe', bounds: [47.3, 5.9, 55.1, 15.0] },
  netherlands: { continent: 'europe', bounds: [50.7, 3.3, 53.6, 7.2] },
  holland: { continent: 'europe', bounds: [50.7, 3.3, 53.6, 7.2] },
  belgium: { continent: 'europe', bounds: [49.5, 2.5, 51.5, 6.4] },
  france: { continent: 'europe', bounds: [41.3, -5.1, 51.1, 9.6] },
  spain: { continent: 'europe', bounds: [35.9, -9.4, 43.8, 3.4] },
  italy: { continent: 'europe', bounds: [36.6, 6.6, 47.1, 18.5] },
  poland: { continent: 'europe', bounds: [49.0, 14.1, 54.9, 24.2] },
  polen: { continent: 'europe', bounds: [49.0, 14.1, 54.9, 24.2] },
  'czech republic': { continent: 'europe', bounds: [48.5, 12.1, 51.1, 18.9] },
  czechia: { continent: 'europe', bounds: [48.5, 12.1, 51.1, 18.9] },
  austria: { continent: 'europe', bounds: [46.4, 9.5, 49.0, 17.2] },
  switzerland: { continent: 'europe', bounds: [45.8, 5.9, 47.8, 10.5] },
  'united kingdom': { continent: 'europe', bounds: [49.9, -8.6, 60.9, 1.8] },
  uk: { continent: 'europe', bounds: [49.9, -8.6, 60.9, 1.8] },
  ireland: { continent: 'europe', bounds: [51.4, -10.5, 55.4, -5.4] },
  portugal: { continent: 'europe', bounds: [36.9, -9.5, 42.2, -6.2] },
  estonia: { continent: 'europe', bounds: [57.5, 21.8, 59.7, 28.2] },
  latvia: { continent: 'europe', bounds: [55.7, 20.9, 58.1, 28.2] },
  lithuania: { continent: 'europe', bounds: [53.9, 21.0, 56.5, 26.8] },
  hungary: { continent: 'europe', bounds: [45.7, 16.1, 48.6, 22.9] },
  slovakia: { continent: 'europe', bounds: [47.7, 16.8, 49.6, 22.6] },
  slovenia: { continent: 'europe', bounds: [45.4, 13.4, 46.9, 16.6] },
  croatia: { continent: 'europe', bounds: [42.4, 13.5, 46.6, 19.4] },
  romania: { continent: 'europe', bounds: [43.6, 20.3, 48.3, 29.7] },
  bulgaria: { continent: 'europe', bounds: [41.2, 22.4, 44.2, 28.6] },
  greece: { continent: 'europe', bounds: [34.8, 19.4, 41.7, 28.2] },
  luxembourg: { continent: 'europe', bounds: [49.4, 5.7, 50.2, 6.6] },
  usa: { continent: 'north_america', bounds: [24.5, -125.0, 49.4, -66.9] },
  'united states': { continent: 'north_america', bounds: [24.5, -125.0, 49.4, -66.9] },
  canada: { continent: 'north_america', bounds: [41.7, -141.0, 70.0, -52.6] },
  mexico: { continent: 'north_america', bounds: [14.5, -118.4, 32.7, -86.7] },
  japan: { continent: 'asia', bounds: [30.0, 129.0, 45.6, 145.8] },
  china: { continent: 'asia', bounds: [18.2, 73.5, 53.6, 134.8] },
  india: { continent: 'asia', bounds: [6.7, 68.1, 35.5, 97.4] },
  australia: { continent: 'oceania', bounds: [-43.6, 113.3, -10.7, 153.6] },
  australien: { continent: 'oceania', bounds: [-43.6, 113.3, -10.7, 153.6] },
  'new zealand': { continent: 'oceania', bounds: [-46.6, 166.5, -34.4, 178.5] },
  brazil: { continent: 'south_america', bounds: [-33.7, -73.9, 5.3, -34.7] },
  argentina: { continent: 'south_america', bounds: [-55.0, -73.5, -21.8, -53.6] },
  'south africa': { continent: 'africa', bounds: [-34.8, 16.5, -22.1, 32.9] },
};

const CONTINENT_LABEL: Record<Continent, Record<Language, string>> = {
  europe: { da: 'Europa', en: 'Europe', de: 'Europa', it: 'Europa', hu: 'Európa' },
  north_america: { da: 'Nordamerika', en: 'North America', de: 'Nordamerika', it: 'Nord America', hu: 'Észak-Amerika' },
  south_america: { da: 'Sydamerika', en: 'South America', de: 'Südamerika', it: 'Sud America', hu: 'Dél-Amerika' },
  asia: { da: 'Asien', en: 'Asia', de: 'Asien', it: 'Asia', hu: 'Ázsia' },
  africa: { da: 'Afrika', en: 'Africa', de: 'Afrika', it: 'Africa', hu: 'Afrika' },
  oceania: { da: 'Oceanien', en: 'Oceania', de: 'Ozeanien', it: 'Oceania', hu: 'Óceánia' },
  other: { da: 'Andre', en: 'Other', de: 'Andere', it: 'Altro', hu: 'Egyéb' },
};

// Countries Timan tracks as expected presence in Europe (for "missing partner" hint)
const EXPECTED_EUROPE = ['Denmark','Sweden','Norway','Finland','Germany','Netherlands','Belgium','France','Spain','Italy','Poland','Czech Republic','Austria','Switzerland','United Kingdom','Ireland','Portugal','Estonia','Latvia','Lithuania','Hungary','Slovakia','Slovenia','Croatia','Romania','Bulgaria','Greece','Luxembourg','Iceland'];

function countryKey(name: string): string { return name.trim().toLowerCase(); }
function getCountryInfo(name: string) { return COUNTRY_INFO[countryKey(name)]; }

function normalizeType(t: string | null): PartnerType {
  const v = (t ?? '').toLowerCase();
  if (v === 'service_partner' || v === 'service' || v === 'servicepartner') return 'service_partner';
  if (v === 'importer' || v === 'importør') return 'importer';
  if (v === 'demo_location' || v === 'demo') return 'demo_location';
  return 'dealer';
}

function makePinDivIcon(type: PartnerType, selected: boolean): L.DivIcon {
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

const MACHINE_PIN_COLOR = '#f59e0b'; // amber-500 — clearly distinct from dealer red/green/blue/purple

function makeMachinePinIcon(): L.DivIcon {
  const html = `
    <div class="pm-machine-pin" title="Registreret maskine">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <circle cx="12" cy="12" r="10" fill="${MACHINE_PIN_COLOR}" stroke="white" stroke-width="2.5"/>
        <path d="M14.7 10.5l-1.4-1.4a1 1 0 0 0-1.4 0L7 13.9V17h3.1l4.6-4.6a1 1 0 0 0 0-1.4l0-.5z" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({ html, className: 'pm-machine-wrap', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

// Cluster + marker layer driven by props
function ClusterLayer({
  partners,
  selectedId,
  onSelect,
  lang,
}: {
  partners: Partner[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: Language;
}) {
  const map = useMap();
  const clusterRef = useRef<any>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 14,
      maxClusterRadius: 50,
      iconCreateFunction: (c: any) => {
        const count = c.getChildCount();
        const size = count < 10 ? 36 : count < 50 ? 42 : 50;
        return L.divIcon({
          html: `<div class="pm-cluster" style="width:${size}px;height:${size}px;line-height:${size}px;">${count}</div>`,
          className: 'pm-cluster-wrap',
          iconSize: [size, size],
        });
      },
    });
    clusterRef.current = cluster;
    map.addLayer(cluster);
    return () => { map.removeLayer(cluster); clusterRef.current = null; markersRef.current.clear(); };
  }, [map]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    markersRef.current.clear();

    // Hover tooltips: only enable on devices with a real hover-capable pointer (i.e. not touch/mobile).
    const hoverCapable = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const tAccount = lang === 'da' ? 'Kontonr.' : lang === 'de' ? 'Konto-Nr.' : lang === 'it' ? 'N. conto' : lang === 'hu' ? 'Számlasz.' : 'Account';
    const tSeller = T.assignedSeller[lang];

    for (const p of partners) {
      if (!p.coords) continue;
      const m = L.marker(p.coords, { icon: makePinDivIcon(p.type, selectedId === p.id) });
      // Attach partner ref so cluster hover handler can list child partners.
      (m as any).__pmPartner = p;
      m.on('click', () => onSelect(p.id));

      if (hoverCapable) {
        const color = TYPE_COLORS[p.type];
        const typeLabel = T[p.type][lang];
        const sellerText = [p.sellerName, p.seller ? `(${p.seller})` : ''].filter(Boolean).join(' ');
        const sellerLine = sellerText
          ? `<div class="pm-tt-row"><span class="pm-tt-k">${escapeHtml(tSeller)}:</span> ${escapeHtml(sellerText)}</div>`
          : '';
        const html = `
          <div class="pm-tt" style="border-left:3px solid ${color}">
            <div class="pm-tt-name">${escapeHtml(p.name)}</div>
            <div class="pm-tt-type" style="color:${color}">${escapeHtml(typeLabel)}</div>
            ${p.country ? `<div class="pm-tt-row">${escapeHtml(p.country)}</div>` : ''}
            ${p.account ? `<div class="pm-tt-row"><span class="pm-tt-k">${escapeHtml(tAccount)}:</span> <span class="pm-tt-mono">${escapeHtml(p.account)}</span></div>` : ''}
            ${sellerLine}
          </div>`;
        m.bindTooltip(html, {
          direction: 'top',
          offset: [0, -36],
          opacity: 1,
          className: 'pm-tooltip',
          sticky: false,
          interactive: false,
        });
        let timer: any = null;
        m.on('mouseover', () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => { try { m.openTooltip(); } catch { /* noop */ } }, 200);
        });
        m.on('mouseout', () => {
          if (timer) { clearTimeout(timer); timer = null; }
          try { m.closeTooltip(); } catch { /* noop */ }
        });
      }

      cluster.addLayer(m);
      markersRef.current.set(p.id, m);
    }

    // --- Cluster hover tooltip (lists partners within the cluster) ---
    cluster.off('clustermouseover');
    cluster.off('clustermouseout');
    cluster.off('clusterclick');

    if (hoverCapable) {
      const MAX_LIST = 8;
      let clusterTimer: any = null;
      let clusterTooltip: L.Tooltip | null = null;

      const closeClusterTooltip = () => {
        if (clusterTimer) { clearTimeout(clusterTimer); clusterTimer = null; }
        if (clusterTooltip) {
          try { map.closeTooltip(clusterTooltip); } catch { /* noop */ }
          clusterTooltip = null;
        }
      };

      cluster.on('clustermouseover', (e: any) => {
        closeClusterTooltip();
        const children: any[] = e.layer.getAllChildMarkers();
        const partnersInCluster: Partner[] = children
          .map((c) => c.__pmPartner as Partner | undefined)
          .filter((p): p is Partner => !!p);
        if (partnersInCluster.length === 0) return;

        const total = partnersInCluster.length;
        const shown = partnersInCluster.slice(0, MAX_LIST);
        const headerCount = lang === 'da' ? 'partnere' : lang === 'de' ? 'Partner' : lang === 'it' ? 'partner' : lang === 'hu' ? 'partner' : 'partners';
        const moreLabel = lang === 'da' ? 'flere' : lang === 'de' ? 'weitere' : lang === 'it' ? 'altri' : lang === 'hu' ? 'további' : 'more';
        const rows = shown.map((p) => {
          const color = TYPE_COLORS[p.type];
          const typeLabel = T[p.type][lang];
          return `<div class="pm-tt-cluster-row">
            <span class="pm-tt-cluster-dot" style="background:${color}"></span>
            <span class="pm-tt-cluster-name">${escapeHtml(p.name)}</span>
            <span class="pm-tt-cluster-type" style="color:${color}">${escapeHtml(typeLabel)}</span>
          </div>`;
        }).join('');
        const more = total > MAX_LIST
          ? `<div class="pm-tt-cluster-more">+ ${total - MAX_LIST} ${escapeHtml(moreLabel)}</div>`
          : '';
        const html = `
          <div class="pm-tt pm-tt-cluster">
            <div class="pm-tt-cluster-header">${total} ${escapeHtml(headerCount)}</div>
            ${rows}
            ${more}
          </div>`;

        clusterTimer = setTimeout(() => {
          try {
            const tt = L.tooltip({
              direction: 'top',
              offset: [0, -10],
              opacity: 1,
              className: 'pm-tooltip',
              interactive: false,
              permanent: false,
            })
              .setLatLng(e.layer.getLatLng())
              .setContent(html);
            tt.addTo(map);
            clusterTooltip = tt;
          } catch { /* noop */ }
        }, 200);
      });

      cluster.on('clustermouseout', () => { closeClusterTooltip(); });
      // Click still zooms in (default behaviour) — also dismiss any pending tooltip.
      cluster.on('clusterclick', () => { closeClusterTooltip(); });
    }
  }, [partners, selectedId, onSelect, lang, map]);

  return null;
}

// Machine/warranty cluster layer — separate from dealer pins, smaller amber icons.
function MachineLayer({ pins }: { pins: WarrantyMachinePin[] }) {
  const map = useMap();
  const clusterRef = useRef<any>(null);

  useEffect(() => {
    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 15,
      maxClusterRadius: 40,
      iconCreateFunction: (c: any) => {
        const count = c.getChildCount();
        const size = count < 10 ? 28 : count < 50 ? 34 : 40;
        return L.divIcon({
          html: `<div class="pm-machine-cluster" style="width:${size}px;height:${size}px;line-height:${size}px;">${count}</div>`,
          className: 'pm-machine-cluster-wrap',
          iconSize: [size, size],
        });
      },
    });
    clusterRef.current = cluster;
    map.addLayer(cluster);
    return () => { map.removeLayer(cluster); clusterRef.current = null; };
  }, [map]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const icon = makeMachinePinIcon();
    for (const p of pins) {
      const m = L.marker(p.coords, { icon });
      const cityLine = [p.customerCity, p.customerCountry].filter(Boolean).map(escapeHtml).join(', ');
      const dd = p.deliveryDate ? new Date(p.deliveryDate).toLocaleDateString('da-DK') : '';
      const html = `
        <div style="font-family:inherit; min-width:200px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;">
            <div style="font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#92400e;">Registreret maskine</div>
            ${p.spId ? `<div style="font-size:10px; font-family:ui-monospace,monospace; color:#9ca3af;">${escapeHtml(p.spId)}</div>` : ''}
          </div>
          <div style="font-size:13px; font-weight:700; color:#111; margin-bottom:6px;">${escapeHtml(p.machineModel) || '—'}</div>
          <div style="font-size:11px; color:#374151; line-height:1.6;">
            ${p.machineSerial ? `<div><span style="color:#6b7280">Serienr.:</span> <span style="font-family:ui-monospace,monospace">${escapeHtml(p.machineSerial)}</span></div>` : ''}
            ${dd ? `<div><span style="color:#6b7280">Leveret:</span> ${escapeHtml(dd)}</div>` : ''}
            ${p.dealerNameSnapshot ? `<div><span style="color:#6b7280">Forhandler:</span> ${escapeHtml(p.dealerNameSnapshot)}${p.dealerAccountNumber ? ` <span style="color:#9ca3af; font-family:ui-monospace,monospace">#${escapeHtml(p.dealerAccountNumber)}</span>` : ''}</div>` : ''}
            ${cityLine ? `<div><span style="color:#6b7280">Kunde:</span> ${cityLine}</div>` : ''}
          </div>
        </div>`;
      m.bindPopup(html, { closeButton: true, maxWidth: 280 });
      cluster.addLayer(m);
    }
  }, [pins]);

  return null;
}


// Imperative map controller for fit-bounds / fly
function MapView({
  fitTo,
  resetTo,
  resetTick,
}: {
  fitTo: [number, number][] | null;
  resetTo: Position;
  resetTick: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (fitTo && fitTo.length > 0) {
      if (fitTo.length === 1) {
        map.flyTo(fitTo[0], 13, { duration: 0.8 });
      } else {
        const bounds = L.latLngBounds(fitTo);
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 12, duration: 0.8 });
      }
    }
  }, [fitTo, map]);
  useEffect(() => {
    map.flyTo(resetTo.center, resetTo.zoom, { duration: 0.6 });
  }, [resetTick]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function PartnerMapPage() {
  const { language: lang } = useLanguage();
  const { formatCountry } = useCountryFormatter();
  const { appUser } = useAppUser();
  const portalRole = derivePortalRole(appUser);
  const canOpenCrm = portalRole === 'timan_backend' || portalRole === 'timan_seller';
  const canSeeAssignedSeller = canOpenCrm;
  const canSeeMachineStats =
    portalRole === 'timan_backend' || portalRole === 'timan_service' || portalRole === 'timan_seller';
  const sellerDir = useSellerDirectory();
  const currentSellerInitials = useMemo(() => {
    if (!appUser?.email) return null;
    const d = resolveSellerDisplay({ email: appUser.email }, sellerDir);
    return (d.initials || '').toUpperCase() || null;
  }, [sellerDir, appUser?.email]);
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<PartnerType>>(new Set(['dealer','service_partner','importer','demo_location']));
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  // Phase 60 — successor filter. Default: kun aktive forhandlere på kortet.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetTick, setResetTick] = useState(0);
  const [resetTarget, setResetTarget] = useState<Position>(EUROPE_VIEW);
  const [legendOpen, setLegendOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [machineStats, setMachineStats] = useState<Record<string, PartnerMachineStats>>({});
  const [machinePinsAll, setMachinePinsAll] = useState<WarrantyMachinePin[]>([]);
  const [machineMissingAll, setMachineMissingAll] = useState<WarrantyMachineMissing[]>([]);
  // Layer visibility — partners always on; machine layer opt-in (and role-gated).
  const [showPartnerLayer, setShowPartnerLayer] = useState(true);
  const [showMachineLayer, setShowMachineLayer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const [fitTo, setFitTo] = useState<[number, number][] | null>(null);

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

      if (canSeeMachineStats) {
        const ids = dRes.rows.map((d) => d.id);
        const [ms, mp, mm] = await Promise.all([
          fetchPartnerMachineStats(ids).catch(() => ({})),
          fetchWarrantyMachinePins().catch(() => ({ rows: [] as WarrantyMachinePin[], error: null as string | null })),
          fetchWarrantyMachineMissingCoords().catch(() => ({ rows: [] as WarrantyMachineMissing[], error: null as string | null })),
        ]);
        if (!alive) return;
        setMachineStats(ms);
        setMachinePinsAll(mp.rows);
        setMachineMissingAll(mm.rows);
      }
    })();
    return () => { alive = false; };
  }, [canSeeMachineStats]);

  const partners: Partner[] = useMemo(() => dealers
    .filter((d) => {
      if (d.is_deleted && statusFilter === 'active') return false;
      if (d.is_blocked && statusFilter === 'active') return false;
      if (statusFilter === 'inactive' && !d.is_blocked && !d.is_deleted) return false;
      // 'all' inkluderer alt undtagen hard-deleted (men is_deleted=true er soft-delete = lukket — vises ved inactive/all)
      return true;
    })
    .map((d) => {
      const st = stats[d.id];
      const hasCoords = d.latitude != null && d.longitude != null;
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
        coords: hasCoords ? [d.latitude as number, d.longitude as number] : null,
        users: st?.user_count ?? 0,
        quotes: st?.quote_count ?? 0,
        orders: st?.order_count ?? 0,
        phone: d.primary_contact_phone ?? d.phone ?? null,
        email: d.primary_contact_email ?? d.email ?? null,
        website: d.website ?? null,
        facebook: d.social_facebook ?? null,
      } as Partner;
    }), [dealers, stats, statusFilter]);

  // Machine pins visible to the current user.
  // - Backend / Service: all pins
  // - Sælger: only pins where the linked dealer's assigned_seller_initials
  //   matches the current user's initials (own/assigned dealers).
  // - Other roles: nothing (canSeeMachineStats is false so layer toggle is hidden).
  const visibleMachinePins = useMemo(() => {
    if (!canSeeMachineStats) return [];
    if (portalRole === 'timan_seller') {
      const me = (currentSellerInitials ?? '').toUpperCase();
      if (!me) return [];
      const ownDealerIds = new Set(
        dealers
          .filter((d) => (d.assigned_seller_initials ?? '').toUpperCase() === me)
          .map((d) => d.id),
      );
      return machinePinsAll.filter((p) => p.dealerAccountId && ownDealerIds.has(p.dealerAccountId));
    }
    return machinePinsAll;
  }, [machinePinsAll, canSeeMachineStats, portalRole, currentSellerInitials, dealers]);

  const visibleMachineMissing = useMemo(() => {
    if (!canSeeMachineStats) return [];
    if (portalRole === 'timan_seller') {
      const me = (currentSellerInitials ?? '').toUpperCase();
      if (!me) return [];
      const ownDealerIds = new Set(
        dealers.filter((d) => (d.assigned_seller_initials ?? '').toUpperCase() === me).map((d) => d.id),
      );
      return machineMissingAll.filter((r) => r.dealerAccountId && ownDealerIds.has(r.dealerAccountId));
    }
    return machineMissingAll;
  }, [machineMissingAll, canSeeMachineStats, portalRole, currentSellerInitials, dealers]);

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
        const hay = `${p.name} ${p.country} ${p.account} ${p.postal} ${p.city} ${p.seller ?? ''} ${p.sellerName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [partners, search, activeTypes, sellerFilter]);

  const withCoords = useMemo(() => filteredAll.filter((p) => p.coords), [filteredAll]);
  const missingCoords = useMemo(() => filteredAll.filter((p) => !p.coords), [filteredAll]);

  // Auto-fit when search/filters change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() === '' && activeTypes.size === 4 && sellerFilter === 'all') {
        setFitTo(null);
        return;
      }
      const coords = withCoords.map((p) => p.coords as [number, number]);
      if (coords.length > 0) setFitTo(coords);
    }, 250);
    return () => clearTimeout(t);
  }, [search, activeTypes, sellerFilter, withCoords]);

  // Grouped results by country
  const grouped = useMemo(() => {
    const map = new Map<string, Partner[]>();
    for (const p of filteredAll) {
      const key = p.country || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .map(([country, list]) => ({ country, list: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [filteredAll]);

  const selected = selectedId ? partners.find((p) => p.id === selectedId) ?? null : null;
  const goToView = (target: Position) => {
    setFitTo(null);
    setSelectedId(null);
    setResetTarget(target);
    setResetTick((n) => n + 1);
  };
  const resetView = () => goToView(EUROPE_VIEW);
  const worldView = () => { setSearch(''); goToView(WORLD_VIEW); };

  const focusPartner = (p: Partner) => {
    setSelectedId(p.id);
    if (p.coords) setFitTo([p.coords]);
  };

  const focusCountry = (countryName: string) => {
    const info = getCountryInfo(countryName);
    if (!info) {
      // fallback: fit to partners in that country
      const pts = partners.filter((p) => p.country.toLowerCase() === countryName.toLowerCase() && p.coords).map((p) => p.coords as [number, number]);
      if (pts.length > 0) setFitTo(pts);
      setSearch(countryName);
      return;
    }
    const [s, w, n, e] = info.bounds;
    setFitTo([[s, w], [n, e]]);
    setSearch(countryName);
  };

  // Country counts (from all partners, ignoring filters)
  const countryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of partners) {
      const c = (p.country || '').trim();
      if (!c) continue;
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [partners]);

  // Continent coverage
  const continentCounts = useMemo(() => {
    const m: Record<Continent, number> = { europe: 0, north_america: 0, south_america: 0, asia: 0, africa: 0, oceania: 0, other: 0 };
    for (const [country, n] of countryCounts) {
      const info = getCountryInfo(country);
      m[info?.continent ?? 'other'] += n;
    }
    return m;
  }, [countryCounts]);

  const missingEuropeCountries = useMemo(() => {
    const have = new Set(countryCounts.map(([c]) => c.toLowerCase()));
    return EXPECTED_EUROPE.filter((c) => !have.has(c.toLowerCase()));
  }, [countryCounts]);

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      <style>{`
        .pm-pin-wrap { background:transparent !important; border:none !important; }
        .pm-pin { position:relative; width:36px; height:44px; transition:transform .15s ease; cursor:pointer; }
        .pm-pin:hover { transform:translateY(-3px) scale(1.08); }
        .pm-pin--selected { transform:translateY(-4px) scale(1.12); }
        .pm-cluster-wrap { background:transparent !important; border:none !important; }
        .pm-cluster { background:${TIMAN_GREEN}; color:white; border-radius:50%; text-align:center;
          font-weight:700; font-size:13px; box-shadow:0 4px 10px rgba(0,0,0,.25); border:3px solid white; }
        .pm-machine-wrap { background:transparent !important; border:none !important; }
        .pm-machine-pin { width:22px; height:22px; transition:transform .15s ease; cursor:pointer; }
        .pm-machine-pin:hover { transform:scale(1.2); }
        .pm-machine-cluster-wrap { background:transparent !important; border:none !important; }
        .pm-machine-cluster { background:${MACHINE_PIN_COLOR}; color:white; border-radius:50%; text-align:center;
          font-weight:700; font-size:12px; box-shadow:0 3px 8px rgba(0,0,0,.2); border:2px solid white; }
        .leaflet-container { font-family:inherit; background:#cfe7f1; }
        .leaflet-control-zoom a { border:none !important; background:white !important; color:#374151 !important;
          width:34px !important; height:34px !important; line-height:34px !important; font-size:18px !important;
          box-shadow:0 2px 8px rgba(0,0,0,.12); }
        .leaflet-control-zoom a:hover { color:${TIMAN_GREEN} !important; }
        .leaflet-control-zoom { border:none !important; margin-bottom:24px !important; margin-left:16px !important; }
        .leaflet-control-attribution { font-size:9px !important; background:rgba(255,255,255,.75) !important; }
        .leaflet-tooltip.pm-tooltip { background:white; border:1px solid rgba(0,0,0,.08); border-radius:8px;
          box-shadow:0 6px 20px rgba(0,0,0,.18); padding:0; pointer-events:none; white-space:normal; max-width:240px; }
        .leaflet-tooltip.pm-tooltip:before { display:none; }
        .pm-tt { padding:8px 10px; font-family:inherit; min-width:170px; }
        .pm-tt-name { font-size:13px; font-weight:700; color:#111; line-height:1.25; margin-bottom:2px; }
        .pm-tt-type { font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; margin-bottom:4px; }
        .pm-tt-row { font-size:11px; color:#374151; line-height:1.5; }
        .pm-tt-k { color:#6b7280; }
        .pm-tt-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
        .pm-tt-cluster { padding:8px 10px; min-width:220px; max-width:300px; }
        .pm-tt-cluster-header { font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#6b7280; margin-bottom:6px; }
        .pm-tt-cluster-row { display:flex; align-items:center; gap:6px; padding:2px 0; font-size:11px; color:#111; line-height:1.35; }
        .pm-tt-cluster-dot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
        .pm-tt-cluster-name { flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
        .pm-tt-cluster-type { flex:0 0 auto; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; }
        .pm-tt-cluster-more { margin-top:4px; padding-top:4px; border-top:1px dashed #e5e7eb; font-size:10px; color:#6b7280; font-style:italic; }
      `}</style>

      <div className="relative left-1/2 right-1/2 w-screen -mx-[50vw] -mt-12 -mb-12 bg-gray-50 px-3 sm:px-5 py-4">
        <div className="flex gap-3">
          {/* Legend */}
          <aside className={`hidden lg:flex flex-col shrink-0 transition-all duration-200 ${legendOpen ? 'w-52' : 'w-0'}`}>
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
              <button
                onClick={() => setResultsOpen((v) => !v)}
                className={`hidden md:flex h-9 px-2.5 items-center gap-1.5 rounded-md text-xs font-medium border ${resultsOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                title={T.results[lang]}
              >
                <List className="h-4 w-4" /> {T.results[lang]} ({filteredAll.length})
              </button>
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
              <select
                value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
                title="Status"
                className="text-xs font-medium px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:border-[#2d5a27]">
                <option value="active">Aktive</option>
                <option value="inactive">Spærrede/Lukkede</option>
                <option value="all">Alle</option>
              </select>
              {canSeeMachineStats && (
                <div className="flex items-center gap-1 ml-1 border-l border-gray-200 pl-2">
                  <button
                    onClick={() => setShowPartnerLayer((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${showPartnerLayer ? 'bg-gray-50 text-gray-800 border-gray-200' : 'bg-white text-gray-400 border-transparent hover:border-gray-200'}`}
                    title="Vis partnere"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: showPartnerLayer ? TYPE_COLORS.dealer : '#d1d5db' }} />
                    Partnere
                  </button>
                  <button
                    onClick={() => setShowMachineLayer((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${showMachineLayer ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-white text-gray-400 border-transparent hover:border-gray-200'}`}
                    title="Vis registrerede maskiner"
                  >
                    <Wrench className="h-3 w-3" />
                    Maskiner {showMachineLayer ? <span className="font-bold tabular-nums">({visibleMachinePins.length})</span> : null}
                  </button>
                </div>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={resetView} className="h-9 w-9 flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title={T.europeView[lang]}>
                  <Home className="h-4 w-4" />
                </button>
                <button onClick={worldView} className="h-9 px-2.5 flex items-center gap-1.5 text-gray-600 hover:text-[#2d5a27] rounded-md hover:bg-gray-50 text-xs font-medium border border-gray-200" title={T.worldView[lang]}>
                  <Globe className="h-4 w-4" /> <span className="hidden sm:inline">{T.worldView[lang]}</span>
                </button>
                <button className="h-9 w-9 hidden md:flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Fuldskærm"><Maximize2 className="h-4 w-4" /></button>
                <button className="h-9 w-9 hidden md:flex items-center justify-center text-gray-500 hover:text-[#2d5a27] rounded-md hover:bg-gray-50" title="Hjælp"><HelpCircle className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Map + results panel */}
            <div className="relative bg-white rounded-b-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex h-[74vh] min-h-[520px] max-h-[760px]">
                {/* Results sidebar */}
                {resultsOpen && (
                  <div className="hidden md:flex flex-col w-72 shrink-0 border-r border-gray-100 bg-gray-50/60">
                    <div className="px-3 py-2 border-b border-gray-100 bg-white flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        {T.results[lang]} <span className="text-gray-400 font-medium">({filteredAll.length})</span>
                      </div>
                      <button onClick={() => setResultsOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {/* Coverage panel */}
                      <div className="px-3 py-2 border-b border-gray-100 bg-white">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">{T.coverage[lang]}</div>
                        <div className="space-y-0.5">
                          {(['europe','north_america','south_america','asia','africa','oceania'] as Continent[]).map((c) => (
                            continentCounts[c] > 0 && (
                              <div key={c} className="flex items-center justify-between text-[11px] text-gray-700">
                                <span>{CONTINENT_LABEL[c][lang]}</span>
                                <span className="font-semibold tabular-nums">{continentCounts[c]}</span>
                              </div>
                            )
                          ))}
                        </div>
                        {missingEuropeCountries.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-gray-400 hover:text-gray-700">{T.noPartnerIn[lang]} ({missingEuropeCountries.length})</summary>
                            <div className="mt-1 text-[10px] text-gray-500 leading-snug">{missingEuropeCountries.join(', ')}</div>
                          </details>
                        )}
                      </div>

                      {/* Countries panel */}
                      {countryCounts.length > 0 && (
                        <div className="px-3 py-2 border-b border-gray-100 bg-white">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">{T.countries[lang]}</div>
                          <div className="flex flex-wrap gap-1">
                            {countryCounts.map(([c, n]) => (
                              <button
                                key={c}
                                onClick={() => focusCountry(c)}
                                className="px-2 py-0.5 rounded-full text-[11px] bg-gray-50 hover:bg-[#2d5a27] hover:text-white border border-gray-200 text-gray-700 transition-colors"
                                title={c}
                              >
                                {formatCountry(c)} <span className="font-semibold">{n}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {grouped.length === 0 && (
                        <div className="p-4 text-xs text-gray-500">{T.noMatches[lang]}</div>
                      )}
                      {grouped.map(({ country, list }) => (
                        <div key={country} className="border-b border-gray-100">
                          <div className="sticky top-0 z-10 bg-gray-100/95 backdrop-blur px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 flex items-center justify-between">
                            <span>{formatCountry(country)}</span>
                            <span className="text-gray-400">({list.length})</span>
                          </div>
                          {list.map((p) => {
                            const isSel = p.id === selectedId;
                            return (
                              <button
                                key={p.id}
                                onClick={() => focusPartner(p)}
                                className={`w-full text-left px-3 py-2 border-b border-gray-50 hover:bg-white transition-colors flex items-start gap-2 ${isSel ? 'bg-white' : ''}`}
                              >
                                <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[p.type] }} />
                                <div className="min-w-0 flex-1">
                                  <div className={`text-xs font-semibold truncate ${isSel ? 'text-[#2d5a27]' : 'text-gray-900'}`}>{p.name}</div>
                                  <div className="text-[10px] text-gray-500 truncate">
                                    {[p.postal, p.city].filter(Boolean).join(' ') || '—'}
                                    {p.seller ? <span className="ml-1 text-gray-400">· {p.seller}</span> : null}
                                    {!p.coords ? <span className="ml-1 text-amber-600">{T.noCoords[lang]}</span> : null}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Map */}
                <div className="relative flex-1 min-w-0">
                  <MapContainer
                    center={EUROPE_VIEW.center} zoom={EUROPE_VIEW.zoom} minZoom={2} maxZoom={16}
                    scrollWheelZoom={false} zoomControl
                    style={{ height: '100%', width: '100%' }}
                    worldCopyJump={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      subdomains={['a','b','c','d']}
                    />
                    <CtrlWheelZoom />
                    <MapResizer trigger={`${selectedId}-${resultsOpen}`} />
                    <MapView fitTo={fitTo} resetTo={resetTarget} resetTick={resetTick} />
                    {showPartnerLayer && (
                      <ClusterLayer partners={withCoords} selectedId={selectedId} onSelect={setSelectedId} lang={lang} />
                    )}
                    {canSeeMachineStats && showMachineLayer && (
                      <MachineLayer pins={visibleMachinePins} />
                    )}
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
            </div>

            {/* Machine layer summary + missing coordinates (warranty) */}
            {!loading && canSeeMachineStats && showMachineLayer && (
              <div className="mt-3 bg-white rounded-2xl border border-amber-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wrench className="h-4 w-4 text-amber-600" />
                  <div className="text-sm font-bold text-gray-900">Garantiregistreringer på kortet</div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-amber-50/60 border border-amber-100 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">I alt</div>
                    <div className="text-lg font-bold tabular-nums text-gray-900">{visibleMachinePins.length + visibleMachineMissing.length}</div>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-100 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Vist på kortet</div>
                    <div className="text-lg font-bold tabular-nums text-gray-900">{visibleMachinePins.length}</div>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-100 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Mangler koordinater</div>
                    <div className="text-lg font-bold tabular-nums text-gray-900">{visibleMachineMissing.length}</div>
                  </div>
                </div>
                {visibleMachineMissing.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700 hover:text-amber-700">
                      Vis registreringer uden koordinater ({visibleMachineMissing.length})
                    </summary>
                    <div className="mt-2 max-h-64 overflow-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                      {visibleMachineMissing.map((r) => {
                        const city = [r.customerCity, r.customerCountry ? formatCountry(r.customerCountry) : ''].filter(Boolean).join(', ');
                        return (
                          <div key={r.id} className="px-3 py-1.5 text-xs flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">
                                {r.machineModel || '—'}
                                {r.machineSerial && <span className="ml-2 text-gray-400 font-mono">{r.machineSerial}</span>}
                              </div>
                              <div className="text-gray-500 truncate">
                                {r.dealerNameSnapshot || '—'}
                                {r.dealerAccountNumber && <span className="ml-1 text-gray-400 font-mono">#{r.dealerAccountNumber}</span>}
                                {city && <span className="ml-2">· {city}</span>}
                              </div>
                            </div>
                            {r.spId && <span className="shrink-0 text-[10px] font-mono text-gray-400">{r.spId}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            )}

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
                        <div className="text-gray-500 truncate">{[p.addressLine1, p.postal, p.city, formatCountry(p.country)].filter(Boolean).join(', ') || '—'}</div>
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
              {(() => {
                const hasAddress = !!(selected.addressLine1 || selected.postal || selected.city);
                const hasAnyLocation = hasAddress || !!selected.country;
                if (!hasAnyLocation) return null;
                const cityLine = [selected.postal, selected.city].filter(Boolean).join(' ');
                return (
                  <div className="flex items-start gap-2.5 text-sm text-gray-700">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div className="leading-snug">
                      {selected.addressLine1 && <div>{selected.addressLine1}</div>}
                      {selected.addressLine2 && <div>{selected.addressLine2}</div>}
                      {cityLine && <div className="text-gray-500">{cityLine}</div>}
                      {selected.country && <div className="text-gray-500">{formatCountry(selected.country)}</div>}
                    </div>
                  </div>
                );
              })()}

              {canSeeAssignedSeller && (selected.seller || selected.sellerName) && (
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

              {canOpenCrm && (
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
              )}

              {(() => {
                if (!canSeeMachineStats) return null;
                // Timan Sælger: kun aggregater for egne forhandlere
                if (portalRole === 'timan_seller') {
                  const own = currentSellerInitials && selected.seller && selected.seller.toUpperCase() === currentSellerInitials;
                  if (!own) return null;
                }
                const ms = machineStats[selected.id];
                const total = ms?.totalMachines ?? 0;
                const dealerHref = `/portal/service/warranty/registrations?dealer=${encodeURIComponent(selected.account)}`;
                return (
                  <div className="bg-white border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-2">
                      <Wrench className="h-3 w-3" /> Maskiner
                    </div>
                    {total === 0 ? (
                      <div className="text-xs text-gray-400 italic">Ingen registrerede maskiner</div>
                    ) : (
                      <div className="space-y-1.5 text-xs text-gray-700">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Registrerede maskiner</span>
                          <span className="font-bold tabular-nums">{total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Unikke serienumre</span>
                          <span className="font-semibold tabular-nums">{ms?.serialCount ?? 0}</span>
                        </div>
                        {ms?.latestDelivery && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Seneste levering</span>
                            <span className="font-semibold tabular-nums">{formatDate(ms.latestDelivery)}</span>
                          </div>
                        )}
                        {ms?.models && ms.models.length > 0 && (
                          <div className="pt-1.5 border-t border-gray-100">
                            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Modeller</div>
                            <div className="flex flex-wrap gap-1">
                              {ms.models.slice(0, 8).map((m) => (
                                <span key={m.model} className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[11px]">
                                  {m.model} <span className="font-semibold">({m.count})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <Link
                      to={dealerHref}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Se garantiregistreringer
                    </Link>
                  </div>
                );
              })()}

              {(() => {
                const addressForRoute = [selected.addressLine1, selected.postal, selected.city, selected.country].filter(Boolean).join(', ');
                const canRoute = !!selected.coords || addressForRoute.length > 0;
                const routeHref = selected.coords
                  ? `https://www.google.com/maps/dir/?api=1&destination=${selected.coords[0]},${selected.coords[1]}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressForRoute)}`;
                const normalizeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;
                const buttons: React.ReactNode[] = [];
                if (selected.phone) {
                  buttons.push(
                    <a key="phone" href={`tel:${selected.phone}`} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-sm font-semibold transition-colors">
                      <Phone className="h-4 w-4" /> Ring
                    </a>
                  );
                }
                if (selected.email) {
                  buttons.push(
                    <a key="mail" href={`mailto:${selected.email}`} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-sm font-semibold transition-colors">
                      <Mail className="h-4 w-4" /> Mail
                    </a>
                  );
                }
                if (selected.website && selected.website.trim()) {
                  buttons.push(
                    <a key="web" href={normalizeUrl(selected.website.trim())} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-sm font-semibold transition-colors">
                      <Globe className="h-4 w-4" /> Hjemmeside
                    </a>
                  );
                }
                if (selected.facebook && selected.facebook.trim()) {
                  buttons.push(
                    <a key="fb" href={normalizeUrl(selected.facebook.trim())} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#1877f2] hover:text-[#1877f2] text-gray-700 rounded-lg text-sm font-semibold transition-colors">
                      <Facebook className="h-4 w-4" /> Facebook
                    </a>
                  );
                }
                if (canRoute) {
                  buttons.push(
                    <a key="route" href={routeHref} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#2d5a27] hover:text-[#2d5a27] text-gray-700 rounded-lg text-sm font-semibold transition-colors">
                      <Navigation className="h-4 w-4" /> Rutevejledning
                    </a>
                  );
                }
                if (buttons.length === 0) return null;
                const cols = buttons.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
                return <div className={`grid gap-2 ${cols}`}>{buttons}</div>;
              })()}

              {canOpenCrm && (
                <Link
                  to={`/portal/crm/my-dealers/${encodeURIComponent(selected.account)}`}
                  className="w-full mt-2 px-3 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" /> {T.openCrm[lang]}
                </Link>
              )}
            </div>
          </aside>
        </>
      )}
    </MiscPageShell>
  );
}
