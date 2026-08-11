import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Search, ExternalLink, X, MapPin, User as UserIcon, AlertTriangle, Users, FileText, ShoppingCart, List, Phone, Mail, Navigation, Globe, Wrench, Facebook } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import MiscPageShell from './MiscPageShell';
import { useLanguage } from '@/context/LanguageContext';
import { useCountryFormatter } from '@/lib/formatCountry';
import { Language } from '@/types/configurator';
import { fetchDealerAccounts, fetchDealerAccountStats, type DealerAccount, type DealerAccountStats } from '@/lib/dealerAccountsService';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isMesseVariantUser } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { getEffectiveSellerInitials } from '@/lib/activeMode';
import { isMessePreviewActive, useMessePreviewVersion } from '@/lib/messePreview';
import { fetchPartnerMachineStats, type PartnerMachineStats } from '@/lib/partnerMachineStatsService';
import { fetchWarrantyMachinePins, fetchWarrantyMachineMissingCoords, type WarrantyMachinePin, type WarrantyMachineMissing } from '@/lib/warrantyMachinePinsService';
import { useSellerDirectory, resolveSellerDisplay } from '@/lib/sellerDirectory';
import { sellerInitialsMatch } from '@/lib/sellerInitials';
import { formatDate } from '@/lib/format-date';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';

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
  sellerEmail: string | null;
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
const TIMAN_GOLD = '#c9a227';
const TIMAN_HQ_COORDS: [number, number] = [56.1986, 8.3032];
const TIMAN_HQ_ADDRESS = 'Osvald Pedersens Vej 2A-D, 6980 Tim';

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
  openCrm: { da: 'Forhandlerinformation', en: 'Dealer information', de: 'Händlerinformation', it: 'Informazioni rivenditore', hu: 'Kereskedői információ' },
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

// Shared pin silhouette — identical geometry for every colour variant.
function pinSvgMarkup(color: string, width = 36, height = 44): string {
  return `
      <svg width="${width}" height="${height}" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))">
        <path d="M20 2 C10 2 3 9 3 18 C3 30 20 46 20 46 C20 46 37 30 37 18 C37 9 30 2 20 2 Z" fill="${color}" stroke="white" stroke-width="2.5"/>
        <circle cx="20" cy="18" r="5.5" fill="white"/>
      </svg>`;
}

function makePinDivIcon(type: PartnerType, selected: boolean): L.DivIcon {
  const color = TYPE_COLORS[type];
  const sel = selected ? 'pm-pin--selected' : '';
  const html = `
    <div class="pm-pin ${sel}">${pinSvgMarkup(color)}</div>`;
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

function normalizeExternalUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function partnerPopupHtml(p: Partner, lang: Language, formatCountry: (country: string) => string, canOpenCrm: boolean): string {
  const color = TYPE_COLORS[p.type];
  const cityLine = [p.postal, p.city].filter(Boolean).join(' ');
  const addressLine = [p.addressLine1, cityLine, p.country ? formatCountry(p.country) : ''].filter(Boolean).join(', ');
  const routeTarget = p.coords
    ? `${p.coords[0]},${p.coords[1]}`
    : addressLine;
  const routeHref = routeTarget
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeTarget)}`
    : '';
  const crmHref = `/portal/crm/my-dealers/${encodeURIComponent(p.account)}`;

  return `
    <div class="pm-popup-card" style="border-top-color:${color}">
      <div class="pm-popup-head">
        <span class="pm-popup-type" style="background:${color}">${escapeHtml(T[p.type][lang])}</span>
        ${p.account ? `<span class="pm-popup-account">#${escapeHtml(p.account)}</span>` : ''}
      </div>
      <div class="pm-popup-name">${escapeHtml(p.name)}</div>
      ${addressLine ? `<div class="pm-popup-address">${escapeHtml(addressLine)}</div>` : ''}
      <div class="pm-popup-actions">
        ${routeHref ? `<a href="${routeHref}" target="_blank" rel="noreferrer">Rutevejledning</a>` : ''}
        ${canOpenCrm ? `<a href="${crmHref}">Forhandlerinformation</a>` : ''}
        ${p.website ? `<a href="${normalizeExternalUrl(p.website.trim())}" target="_blank" rel="noreferrer">Hjemmeside</a>` : ''}
      </div>
    </div>`;
}

interface TimanContact {
  initials: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

const TIMAN_CONTACT_LABELS: Record<string, Partial<Record<PortalUiLanguage, string>>> = {
  title: { da: 'Timan A/S', en: 'Timan A/S', de: 'Timan A/S', it: 'Timan A/S', hu: 'Timan A/S', fr: 'Timan A/S' },
  badge: { da: 'Hovedkontor', en: 'Head office', de: 'Hauptsitz', it: 'Sede', hu: 'Kozpont', fr: 'Siege social' },
  sales: { da: 'Salg', en: 'Sales', de: 'Vertrieb', it: 'Vendite', hu: 'Ertekesites', fr: 'Ventes' },
  route: { da: 'Rutevejledning', en: 'Directions', de: 'Route', it: 'Indicazioni', hu: 'Utvonal', fr: 'Itineraire' },
  website: { da: 'Hjemmeside', en: 'Website', de: 'Webseite', it: 'Sito web', hu: 'Weboldal', fr: 'Site web' },
};

const TIMAN_SELLER_CONTACTS: Record<string, Omit<TimanContact, 'role'>> = {
  BP: { initials: 'BP', name: 'Birger Pedersen', email: 'bp@timan.dk', phone: '+45 23 20 68 31' },
  EM: { initials: 'EM', name: 'Esben Madsen', email: 'em@timan.dk', phone: '+45 93 63 68 62' },
  AKR: { initials: 'AKR', name: 'Alexander Kirschner', email: 'akr@timan.dk', phone: '+45 23 20 11 31' },
  JTN: { initials: 'JTN', name: 'Jakob', email: 'jtn@timan.dk', phone: '+45 93 63 68 62' },
};

const TIMAN_LANGUAGE_COUNTRY: Partial<Record<PortalUiLanguage, string>> = {
  da: 'denmark',
  en: 'united kingdom',
  de: 'germany',
  it: 'italy',
  hu: 'hungary',
  sv: 'sweden',
  fr: 'france',
  pl: 'poland',
  cs: 'czech republic',
};

const TIMAN_COUNTRY_CONTACT_INITIALS: Record<string, string[]> = {
  denmark: ['BP', 'EM'],
  danmark: ['BP', 'EM'],
  germany: ['AKR', 'JTN'],
  tyskland: ['AKR', 'JTN'],
  deutschland: ['AKR', 'JTN'],
  france: ['BP', 'AKR'],
  frankrig: ['BP', 'AKR'],
  italy: ['AKR'],
  italien: ['AKR'],
  italia: ['AKR'],
  hungary: ['AKR'],
  ungarn: ['AKR'],
  austria: ['AKR'],
  østrig: ['AKR'],
  oestrig: ['AKR'],
  switzerland: ['AKR'],
  schweiz: ['AKR'],
  suisse: ['AKR'],
};

const TIMAN_COUNTRY_ALIASES: Record<string, string[]> = {
  denmark: ['denmark', 'danmark'],
  'united kingdom': ['united kingdom', 'england', 'great britain', 'storbritannien'],
  germany: ['germany', 'tyskland', 'deutschland'],
  italy: ['italy', 'italien', 'italia'],
  hungary: ['hungary', 'ungarn'],
  sweden: ['sweden', 'sverige'],
  france: ['france', 'frankrig'],
  poland: ['poland', 'polen'],
  'czech republic': ['czech republic', 'czechia', 'tjekkiet', 'tsjekkiet', 'cesko'],
};

function timanLabel(key: keyof typeof TIMAN_CONTACT_LABELS, lang: PortalUiLanguage): string {
  return TIMAN_CONTACT_LABELS[key][lang] ?? TIMAN_CONTACT_LABELS[key].en ?? '';
}

function normalizeTimanSellerInitials(value: string | null | undefined): string | null {
  const initials = value?.trim().toUpperCase();
  if (!initials) return null;
  if (initials === 'AK') return 'AKR';
  return initials;
}

function uniqueTimanContacts(initials: string[], lang: PortalUiLanguage): TimanContact[] {
  const seen = new Set<string>();
  const role = timanLabel('sales', lang);
  return initials
    .map(normalizeTimanSellerInitials)
    .filter((i): i is string => !!i && !seen.has(i) && !!seen.add(i))
    .map((i) => TIMAN_SELLER_CONTACTS[i])
    .filter((c): c is Omit<TimanContact, 'role'> => !!c)
    .map((c) => ({ ...c, role }));
}

function timanCountryMatches(partnerCountry: string, targetCountry: string): boolean {
  const partnerKey = countryKey(partnerCountry);
  const aliases = TIMAN_COUNTRY_ALIASES[targetCountry] ?? [targetCountry];
  return aliases.includes(partnerKey);
}

function timanContactsForLanguage(lang: PortalUiLanguage, partners: Partner[]): TimanContact[] {
  const country = TIMAN_LANGUAGE_COUNTRY[lang];
  const fixedInitials = country ? TIMAN_COUNTRY_CONTACT_INITIALS[country] : undefined;
  if (fixedInitials?.length) return uniqueTimanContacts(fixedInitials, lang);

  const derivedInitials = partners
    .filter((p) => country && timanCountryMatches(p.country, country))
    .map((p) => p.seller);
  const derivedContacts = uniqueTimanContacts(derivedInitials.filter(Boolean) as string[], lang);
  return derivedContacts.length ? derivedContacts : uniqueTimanContacts(['BP'], lang);
}

function timanPopupHtml(lang: PortalUiLanguage, partners: Partner[]): string {
  const routeHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(TIMAN_HQ_ADDRESS)}`;
  const contacts = timanContactsForLanguage(lang, partners).map((c) => `
    <div class="pm-timan-contact">
      <div>
        <div class="pm-timan-contact-name">${escapeHtml(c.name)}</div>
        <div class="pm-timan-contact-role">${escapeHtml(c.role)}</div>
      </div>
      <div class="pm-timan-contact-links">
        <a href="tel:${escapeHtml(c.phone.replace(/\s+/g, ''))}">${escapeHtml(c.phone)}</a>
        <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>
      </div>
    </div>`).join('');

  return `
    <div class="pm-timan-popup-card">
      <div class="pm-timan-popup-head">
        <img src="${escapeHtml(timanLogo)}" alt="Timan" />
        <span>${escapeHtml(timanLabel('badge', lang))}</span>
      </div>
      <div class="pm-timan-popup-name">${escapeHtml(timanLabel('title', lang))}</div>
      <div class="pm-timan-popup-address">${escapeHtml(TIMAN_HQ_ADDRESS)}</div>
      <div class="pm-timan-contacts">${contacts}</div>
      <div class="pm-popup-actions">
        <a href="${routeHref}" target="_blank" rel="noreferrer">${escapeHtml(timanLabel('route', lang))}</a>
        <a href="https://timan.dk/" target="_blank" rel="noreferrer">${escapeHtml(timanLabel('website', lang))}</a>
      </div>
    </div>`;
}

function timanMarkerScale(zoom: number): number {
  if (zoom >= 11) return 1.45;
  if (zoom >= 9) return 1.28;
  if (zoom >= 7) return 1.12;
  return 1;
}

function makeTimanHeadquartersIcon(zoom = 6): L.DivIcon {
  const scale = timanMarkerScale(zoom);
  const markerWidth = Math.round(58 * scale);
  const markerHeight = Math.round(60 * scale);
  const logoWidth = Math.round(50 * scale);
  const pinSize = Math.round(26 * scale);
  const pinHeight = Math.round((pinSize * 44) / 36);
  const anchorX = Math.round(markerWidth / 2);
  const anchorY = markerHeight - Math.round(2 * scale);
  const html = `
    <div class="pm-timan-marker" title="Timan A/S" style="width:${markerWidth}px;height:${markerHeight}px;">
      <div class="pm-timan-marker-logo" style="width:${logoWidth}px;max-width:${logoWidth}px;">
        <img src="${escapeHtml(timanLogo)}" alt="Timan" style="display:block;width:${logoWidth}px;max-width:${logoWidth}px;height:auto;" />
      </div>
      <div class="pm-timan-marker-pin" style="width:${pinSize}px;height:${pinHeight}px;">
        ${pinSvgMarkup(TIMAN_GOLD, pinSize, pinHeight)}
      </div>
    </div>`;

  return L.divIcon({
    html,
    className: 'pm-timan-marker-wrap',
    iconSize: [markerWidth, markerHeight],
    iconAnchor: [anchorX, anchorY],
    popupAnchor: [0, -anchorY],
  });
}

function TimanHeadquartersLayer({ lang, partners }: { lang: PortalUiLanguage; partners: Partner[] }) {
  const map = useMap();

  useEffect(() => {
    const marker = L.marker(TIMAN_HQ_COORDS, {
      icon: makeTimanHeadquartersIcon(map.getZoom()),
      zIndexOffset: 1200,
    });
    const resizeMarker = () => {
      marker.setIcon(makeTimanHeadquartersIcon(map.getZoom()));
    };
    marker.bindPopup(timanPopupHtml(lang, partners), {
      closeButton: true,
      className: 'pm-timan-popup',
      autoPan: true,
      autoPanPadding: [28, 28],
      maxWidth: 320,
    });
    marker.addTo(map);
    map.on('zoomend', resizeMarker);
    return () => {
      map.off('zoomend', resizeMarker);
      marker.removeFrom(map);
    };
  }, [lang, map, partners]);

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

// Cluster + marker layer driven by props
function ClusterLayer({
  partners,
  selectedId,
  onSelect,
  lang,
  formatCountry,
  canOpenCrm,
}: {
  partners: Partner[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: Language;
  formatCountry: (country: string) => string;
  canOpenCrm: boolean;
}) {
  const map = useMap();
  const clusterRef = useRef<any>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: false,
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
      m.bindPopup(partnerPopupHtml(p, lang, formatCountry, canOpenCrm), {
        closeButton: true,
        className: 'pm-marker-popup',
        autoPan: true,
        autoPanPadding: [28, 28],
        maxWidth: 280,
      });
      const openPartner = () => {
        onSelect(p.id);
        try { m.openPopup(); } catch { /* noop */ }
      };
      m.on('click', openPartner);
      m.on('tap', openPartner as any);
      m.on('touchstart', (e: any) => {
        try { L.DomEvent.stopPropagation(e); } catch { /* noop */ }
        openPartner();
      });

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
      if (selectedId === p.id) {
        window.setTimeout(() => {
          try { m.openPopup(); } catch { /* noop */ }
        }, 0);
      }
    }

    // --- Cluster hover tooltip (lists partners within the cluster) ---
    cluster.off('clustermouseover');
    cluster.off('clustermouseout');
    cluster.off('clusterclick');

    const MAX_CLUSTER_LIST = 8;
    const getClusterPartners = (layer: any) => {
      const children: any[] = layer.getAllChildMarkers();
      return children
        .map((c) => c.__pmPartner as Partner | undefined)
        .filter((p): p is Partner => !!p);
    };

    const buildClusterListHtml = (partnersInCluster: Partner[]) => {
      const total = partnersInCluster.length;
      const shown = partnersInCluster.slice(0, MAX_CLUSTER_LIST);
      const lookup = new Map<string, Partner>();
      for (const p of shown) lookup.set(p.id, p);

      const headerCount = lang === 'da' ? 'partnere' : lang === 'de' ? 'Partner' : lang === 'it' ? 'partner' : lang === 'hu' ? 'partner' : 'partners';
      const moreLabel = lang === 'da' ? 'flere' : lang === 'de' ? 'weitere' : lang === 'it' ? 'altri' : lang === 'hu' ? 'további' : 'more';
      const rows = shown.map((p) => {
        const color = TYPE_COLORS[p.type];
        const typeLabel = T[p.type][lang];
        return `<button type="button" class="pm-tt-cluster-row" data-partner-id="${escapeHtml(p.id)}">
          <span class="pm-tt-cluster-dot" style="background:${color}"></span>
          <span class="pm-tt-cluster-name">${escapeHtml(p.name)}</span>
          <span class="pm-tt-cluster-type" style="color:${color}">${escapeHtml(typeLabel)}</span>
        </button>`;
      }).join('');
      const more = total > MAX_CLUSTER_LIST
        ? `<div class="pm-tt-cluster-more">+ ${total - MAX_CLUSTER_LIST} ${escapeHtml(moreLabel)}</div>`
        : '';
      const html = `
        <div class="pm-tt pm-tt-cluster">
          <div class="pm-tt-cluster-header">${total} ${escapeHtml(headerCount)}</div>
          ${rows}
          ${more}
        </div>`;

      return { html, lookup };
    };

    const openPartnerFromCluster = (id: string, lookup: Map<string, Partner>, close: () => void) => {
      const p = lookup.get(id);
      close();
      if (!p) return;
      onSelect(p.id);
      if (p.coords) {
        try { map.flyTo(p.coords, Math.max(map.getZoom(), 14), { duration: 0.6 }); } catch { /* noop */ }
      }
    };

    if (hoverCapable) {
      const MAX_LIST = MAX_CLUSTER_LIST;
      let openTimer: any = null;
      let closeTimer: any = null;
      let clusterTooltip: L.Tooltip | null = null;
      let tooltipPartners: Map<string, Partner> = new Map();

      const hardClose = () => {
        if (openTimer) { clearTimeout(openTimer); openTimer = null; }
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        if (clusterTooltip) {
          try { map.closeTooltip(clusterTooltip); } catch { /* noop */ }
          clusterTooltip = null;
        }
        tooltipPartners = new Map();
      };

      const scheduleClose = () => {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(hardClose, 120);
      };

      cluster.on('clustermouseover', (e: any) => {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        if (clusterTooltip) return; // already open
        if (openTimer) clearTimeout(openTimer);

        const partnersInCluster = getClusterPartners(e.layer);
        if (partnersInCluster.length === 0) return;

        const total = partnersInCluster.length;
        const shown = partnersInCluster.slice(0, MAX_LIST);
        const lookup = new Map<string, Partner>();
        for (const p of shown) lookup.set(p.id, p);

        const headerCount = lang === 'da' ? 'partnere' : lang === 'de' ? 'Partner' : lang === 'it' ? 'partner' : lang === 'hu' ? 'partner' : 'partners';
        const moreLabel = lang === 'da' ? 'flere' : lang === 'de' ? 'weitere' : lang === 'it' ? 'altri' : lang === 'hu' ? 'további' : 'more';
        const rows = shown.map((p) => {
          const color = TYPE_COLORS[p.type];
          const typeLabel = T[p.type][lang];
          return `<button type="button" class="pm-tt-cluster-row" data-partner-id="${escapeHtml(p.id)}">
            <span class="pm-tt-cluster-dot" style="background:${color}"></span>
            <span class="pm-tt-cluster-name">${escapeHtml(p.name)}</span>
            <span class="pm-tt-cluster-type" style="color:${color}">${escapeHtml(typeLabel)}</span>
          </button>`;
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

        openTimer = setTimeout(() => {
          try {
            const tt = L.tooltip({
              direction: 'top',
              offset: [0, -10],
              opacity: 1,
              className: 'pm-tooltip pm-tooltip-cluster',
              interactive: true,
              permanent: false,
            })
              .setLatLng(e.layer.getLatLng())
              .setContent(html);
            tt.addTo(map);
            clusterTooltip = tt;
            tooltipPartners = lookup;

            // Bind interactions on the tooltip DOM (hover lock + name click).
            const el = tt.getElement();
            if (el) {
              el.addEventListener('mouseenter', () => {
                if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
              });
              el.addEventListener('mouseleave', () => { scheduleClose(); });
              el.addEventListener('click', (ev) => {
                const target = ev.target as HTMLElement | null;
                const row = target?.closest('[data-partner-id]') as HTMLElement | null;
                if (!row) return;
                ev.stopPropagation();
                ev.preventDefault();
                const id = row.getAttribute('data-partner-id') || '';
                const p = tooltipPartners.get(id);
                hardClose();
                if (p) {
                  onSelect(p.id);
                  if (p.coords) {
                    try { map.flyTo(p.coords, Math.max(map.getZoom(), 14), { duration: 0.6 }); } catch { /* noop */ }
                  }
                }
              });
            }
          } catch { /* noop */ }
        }, 200);
      });

      cluster.on('clustermouseout', () => { scheduleClose(); });
      cluster.on('clusterclick', (e: any) => {
        hardClose();
        try {
          if (map.getZoom() >= 14 && typeof e.layer.spiderfy === 'function') e.layer.spiderfy();
          else e.layer.zoomToBounds({ padding: [48, 48] });
        } catch { /* noop */ }
      });
    } else {
      cluster.on('clusterclick', (e: any) => {
        const partnersInCluster = getClusterPartners(e.layer);
        if (partnersInCluster.length === 0) return;

        const { html, lookup } = buildClusterListHtml(partnersInCluster);
        const popup = L.popup({
          closeButton: true,
          closeOnClick: true,
          autoClose: true,
          autoPan: true,
          autoPanPadding: [28, 28],
          className: 'pm-cluster-popup',
          maxWidth: 320,
        })
          .setLatLng(e.layer.getLatLng())
          .setContent(html);

        popup.on('add', () => {
          const el = popup.getElement();
          if (!el) return;
          try {
            L.DomEvent.disableClickPropagation(el);
            L.DomEvent.disableScrollPropagation(el);
          } catch { /* noop */ }
          el.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement | null;
            const row = target?.closest('[data-partner-id]') as HTMLElement | null;
            if (!row) return;
            ev.stopPropagation();
            ev.preventDefault();
            const id = row.getAttribute('data-partner-id') || '';
            openPartnerFromCluster(id, lookup, () => {
              try { map.closePopup(popup); } catch { /* noop */ }
            });
          });
        });

        try { map.openPopup(popup); } catch { /* noop */ }
      });
    }
  }, [partners, selectedId, onSelect, lang, map, formatCountry, canOpenCrm]);

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

function SelectedVisibilityGuard({
  selected,
  onHidden,
}: {
  selected: Partner | null;
  onHidden: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selected?.coords) return;
    const selectedLatLng = L.latLng(selected.coords[0], selected.coords[1]);
    const closeIfHidden = () => {
      const bounds = map.getBounds().pad(0.06);
      if (!bounds.contains(selectedLatLng)) {
        onHidden();
        try { map.closePopup(); } catch { /* noop */ }
      }
    };
    map.on('moveend zoomend', closeIfHidden);
    return () => {
      map.off('moveend zoomend', closeIfHidden);
    };
  }, [map, selected?.id, selected?.coords, onHidden]);

  return null;
}

export default function PartnerMapPage() {
  const { language: lang, uiLanguage } = useLanguage();
  const { formatCountry } = useCountryFormatter();
  const { appUser } = useAppUser();
  const location = useLocation();
  const effectiveUser = useEffectivePortalUser(appUser);
  const portalRole = derivePortalRole(effectiveUser);
  const messePreviewVersion = useMessePreviewVersion();
  const isMessePreview = useMemo(
    () => isMessePreviewActive(appUser?.email),
    [appUser?.email, messePreviewVersion],
  );
  const onMesseRoute = location.pathname.includes('/messe');
  const isMesseMapView =
    onMesseRoute ||
    portalRole === 'exhibition_user' ||
    isMessePreview ||
    isMesseVariantUser(appUser) ||
    isMesseVariantUser(effectiveUser);
  const isInternalMapRole =
    portalRole === 'timan_backend' ||
    portalRole === 'timan_seller' ||
    portalRole === 'timan_service';
  const canSeeInternalMapFeatures = !isMesseMapView && isInternalMapRole;
  const canOpenCrm = !isMesseMapView && (portalRole === 'timan_backend' || portalRole === 'timan_seller');
  const canSeeAssignedSeller = canOpenCrm;
  // Internal roles get aggregate machine stats on partner cards. Dealer-side
  // roles do not (those cards are about other partners), but they can still
  // see the Garantiregistreringer-laget — scoped to their own dealer.
  const canSeeMachineStats = canSeeInternalMapFeatures;
  // Dealer-side users: forhandlere, importører, servicepartnere, dealer-users.
  // They MUST only see their own account/data — no Timan-wide partner browsing.
  const isDealerSide =
    portalRole === 'timan_dealer' ||
    portalRole === 'dealer_user' ||
    portalRole === 'timan_service_partner' ||
    portalRole === 'timan_importer';
  const canSeeMachineLayer = canSeeMachineStats;
  const canSeeDemoLocations = canSeeInternalMapFeatures;
  const ownDealerNumber = (effectiveUser?.dealer_number ?? '').trim().toUpperCase();
  const sellerDir = useSellerDirectory();
  const currentSellerInitials = useMemo(() => {
    // In "view as <seller>" mode this resolves to the previewed seller's
    // initials (e.g. AKR), not the logged-in backend user.
    const viaActiveMode = getEffectiveSellerInitials(appUser);
    if (viaActiveMode) return viaActiveMode.toUpperCase();
    if (!effectiveUser?.email) return null;
    const d = resolveSellerDisplay({ email: effectiveUser.email }, sellerDir);
    return (d.initials || '').toUpperCase() || null;
  }, [sellerDir, effectiveUser?.email, appUser]);
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<PartnerType>>(new Set(['dealer','service_partner','importer','demo_location']));
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  // Phase 60 — successor filter. Default: kun aktive forhandlere på kortet.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isTouchLike, setIsTouchLike] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  const [resetTarget, setResetTarget] = useState<Position>(EUROPE_VIEW);

  // Map base layer style — persisted per user in localStorage.
  type MapStyleId = 'standard' | 'satellite' | 'terrain' | 'dark';
  const MAP_STYLES: Record<MapStyleId, { label: string; url: string; attribution: string; subdomains?: string[]; maxZoom?: number }> = {
    standard: {
      label: 'Standard',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: ['a','b','c','d'],
      maxZoom: 19,
    },
    satellite: {
      label: 'Satellit',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Earthstar Geographics',
      subdomains: ['a','b','c'],
      maxZoom: 19,
    },
    terrain: {
      label: 'Terræn',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      subdomains: ['a','b','c'],
      maxZoom: 17,
    },
    dark: {
      label: 'Mørk',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: ['a','b','c','d'],
      maxZoom: 19,
    },
  };
  const MAP_STYLE_STORAGE_KEY = 'timan.partnerMap.baseStyle';
  const [mapStyle, setMapStyle] = useState<MapStyleId>(() => {
    if (typeof window === 'undefined') return 'standard';
    const saved = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    return (saved === 'standard' || saved === 'satellite' || saved === 'terrain' || saved === 'dark') ? saved : 'standard';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, mapStyle);
  }, [mapStyle]);

  
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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setIsTouchLike(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

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

      if (canSeeMachineLayer) {
        const ids = dRes.rows.map((d) => d.id);
        const [ms, mp, mm] = await Promise.all([
          canSeeMachineStats
            ? fetchPartnerMachineStats(ids).catch(() => ({}))
            : Promise.resolve({} as Record<string, PartnerMachineStats>),
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
  }, [canSeeMachineLayer, canSeeMachineStats]);

  const partners: Partner[] = useMemo(() => dealers
    .filter((d) => {
      // Dealer-side users may see all partner accounts (Forhandler, Servicepartner,
      // Importør) so they can find other partners on the map. Demo-locations remain
      // hidden because ownership cannot be reliably proven on the client. Active/
      // inactive status filtering is internal-only; dealer-side users see all active
      // partners (and skip soft-deleted/blocked accounts to avoid stale entries).
      if (isDealerSide) {
        if (normalizeType(d.dealer_type) === 'demo_location') return false;
        if (d.is_deleted || d.is_blocked) return false;
        return true;
      }
      if (!canSeeDemoLocations && normalizeType(d.dealer_type) === 'demo_location') return false;
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
        sellerEmail: d.assigned_seller_email,
        coords: hasCoords ? [d.latitude as number, d.longitude as number] : null,
        users: st?.user_count ?? 0,
        quotes: st?.quote_count ?? 0,
        orders: st?.order_count ?? 0,
        phone: d.primary_contact_phone ?? d.phone ?? null,
        email: d.primary_contact_email ?? d.email ?? null,
        website: d.website ?? null,
        facebook: d.social_facebook ?? null,
      } as Partner;
    }), [dealers, stats, statusFilter, isDealerSide, ownDealerNumber, canSeeDemoLocations]);

  // Machine pins visible to the current user.
  // - Backend / Service: all pins
  // - Sælger: only pins where the linked dealer's assigned_seller_initials
  //   matches the current user's initials (own/assigned dealers).
  // - Other roles: nothing (canSeeMachineStats is false so layer toggle is hidden).
  // Helper: dealers assigned to the previewed/effective seller (AK↔AKR aware).
  const sellerScopedDealers = useMemo(() => {
    const me = (currentSellerInitials ?? '').toUpperCase();
    if (!me) return { ids: new Set<string>(), accountNumbers: new Set<string>(), names: new Set<string>() };
    const ids = new Set<string>();
    const accountNumbers = new Set<string>();
    const names = new Set<string>();
    for (const d of dealers) {
      if (!sellerInitialsMatch(d.assigned_seller_initials, me)) continue;
      ids.add(d.id);
      const acc = (d.account_number ?? '').trim().toUpperCase();
      if (acc) accountNumbers.add(acc);
      const nm = (d.company_name ?? '').trim().toLowerCase();
      if (nm) names.add(nm);
    }
    return { ids, accountNumbers, names };
  }, [dealers, currentSellerInitials]);

  const visibleMachinePins = useMemo(() => {
    if (!canSeeMachineLayer) return [];
    if (portalRole === 'timan_seller') {
      const { ids, accountNumbers, names } = sellerScopedDealers;
      if (ids.size === 0 && accountNumbers.size === 0) return [];
      return machinePinsAll.filter((p) => {
        if (p.dealerAccountId && ids.has(p.dealerAccountId)) return true;
        const acc = (p.dealerAccountNumber ?? '').trim().toUpperCase();
        if (acc && accountNumbers.has(acc)) return true;
        const nm = (p.dealerNameSnapshot ?? '').trim().toLowerCase();
        if (nm && names.has(nm)) return true;
        return false;
      });
    }
    if (!canSeeMachineStats) {
      if (!ownDealerNumber) return [];
      const ownIds = new Set<string>();
      const ownNames = new Set<string>();
      for (const d of dealers) {
        if ((d.account_number ?? '').trim().toUpperCase() === ownDealerNumber) {
          ownIds.add(d.id);
          const nm = (d.company_name ?? '').trim().toLowerCase();
          if (nm) ownNames.add(nm);
        }
      }
      return machinePinsAll.filter((p) => {
        if (p.dealerAccountId && ownIds.has(p.dealerAccountId)) return true;
        if ((p.dealerAccountNumber ?? '').trim().toUpperCase() === ownDealerNumber) return true;
        const nm = (p.dealerNameSnapshot ?? '').trim().toLowerCase();
        if (nm && ownNames.has(nm)) return true;
        return false;
      });
    }
    return machinePinsAll;
  }, [machinePinsAll, canSeeMachineLayer, canSeeMachineStats, portalRole, sellerScopedDealers, ownDealerNumber, dealers]);

  const visibleMachineMissing = useMemo(() => {
    if (!canSeeMachineLayer) return [];
    if (portalRole === 'timan_seller') {
      const { ids, accountNumbers, names } = sellerScopedDealers;
      if (ids.size === 0 && accountNumbers.size === 0) return [];
      return machineMissingAll.filter((r) => {
        if (r.dealerAccountId && ids.has(r.dealerAccountId)) return true;
        const acc = (r.dealerAccountNumber ?? '').trim().toUpperCase();
        if (acc && accountNumbers.has(acc)) return true;
        const nm = (r.dealerNameSnapshot ?? '').trim().toLowerCase();
        if (nm && names.has(nm)) return true;
        return false;
      });
    }
    if (!canSeeMachineStats) {
      if (!ownDealerNumber) return [];
      const ownIds = new Set<string>();
      const ownNames = new Set<string>();
      for (const d of dealers) {
        if ((d.account_number ?? '').trim().toUpperCase() === ownDealerNumber) {
          ownIds.add(d.id);
          const nm = (d.company_name ?? '').trim().toLowerCase();
          if (nm) ownNames.add(nm);
        }
      }
      return machineMissingAll.filter((r) => {
        if (r.dealerAccountId && ownIds.has(r.dealerAccountId)) return true;
        if ((r.dealerAccountNumber ?? '').trim().toUpperCase() === ownDealerNumber) return true;
        const nm = (r.dealerNameSnapshot ?? '').trim().toLowerCase();
        if (nm && ownNames.has(nm)) return true;
        return false;
      });
    }
    return machineMissingAll;
  }, [machineMissingAll, canSeeMachineLayer, canSeeMachineStats, portalRole, sellerScopedDealers, ownDealerNumber, dealers]);

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

  // Fullscreen support for the map area
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const useMapPopupOnly = isFullscreen || isTouchLike;
  const fullscreenSupported = typeof document !== 'undefined' && (
    document.fullscreenEnabled ||
    // @ts-ignore - vendor prefix
    document.webkitFullscreenEnabled
  );
  useEffect(() => {
    const onChange = () => {
      const el = document.fullscreenElement
        // @ts-ignore - vendor prefix
        || document.webkitFullscreenElement;
      setIsFullscreen(!!el && el === mapWrapperRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);
  const toggleFullscreen = () => {
    const el = mapWrapperRef.current;
    if (!el) return;
    const fsEl = document.fullscreenElement
      // @ts-ignore - vendor prefix
      || document.webkitFullscreenElement;
    if (fsEl) {
      (document.exitFullscreen
        // @ts-ignore - vendor prefix
        || document.webkitExitFullscreen)?.call(document);
    } else {
      (el.requestFullscreen
        // @ts-ignore - vendor prefix
        || el.webkitRequestFullscreen)?.call(el);
    }
  };

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
    <MiscPageShell title={T.title[lang]} hideHeader changelogModule="partner_map">
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
        .pm-timan-marker-wrap { background:transparent !important; border:none !important; }
        .pm-timan-marker { position:relative; transform-origin:50% 90%; transition:transform .16s ease; cursor:pointer; }
        .pm-timan-marker:hover { transform:translateY(-1px) scale(1.04); }
        .pm-timan-marker-logo { position:absolute; left:50%; top:0; transform:translateX(-50%); min-height:19px; padding:3px 5px;
          border-radius:999px; background:rgba(255,255,255,.96); border:1px solid rgba(201,162,39,.42); box-shadow:0 7px 18px rgba(15,23,42,.22); }
        .pm-timan-marker-logo img { display:block; width:100% !important; max-width:100% !important; height:auto !important; }
        .pm-timan-marker-pin { position:absolute; left:50%; bottom:0; transform:translateX(-50%); }
        .pm-timan-marker-pin svg { display:block; width:100%; height:100%; }

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
        .pm-tt-cluster-row { display:flex; align-items:center; gap:6px; padding:4px 6px; margin:0 -6px; font-size:11px; color:#111; line-height:1.35;
          width:calc(100% + 12px); background:transparent; border:none; border-radius:6px; cursor:pointer; text-align:left; font-family:inherit; }
        .pm-tt-cluster-row:hover { background:#f3f4f6; }
        .pm-tt-cluster-row:focus-visible { outline:2px solid #2d5a27; outline-offset:1px; }
        .leaflet-tooltip.pm-tooltip-cluster { pointer-events:auto; }
        .leaflet-popup.pm-cluster-popup .leaflet-popup-content-wrapper { border-radius:10px; box-shadow:0 10px 28px rgba(15,23,42,.22); padding:0; overflow:hidden; }
        .leaflet-popup.pm-cluster-popup .leaflet-popup-content { margin:0; width:300px !important; max-width:calc(100vw - 48px); }
        .leaflet-popup.pm-cluster-popup .leaflet-popup-tip { box-shadow:0 10px 28px rgba(15,23,42,.18); }
        .pm-tt-cluster-dot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
        .pm-tt-cluster-name { flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
        .pm-tt-cluster-type { flex:0 0 auto; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; }
        .pm-tt-cluster-more { margin-top:4px; padding-top:4px; border-top:1px dashed #e5e7eb; font-size:10px; color:#6b7280; font-style:italic; }
        .leaflet-popup.pm-marker-popup { margin-bottom:20px; }
        .leaflet-popup.pm-marker-popup .leaflet-popup-content-wrapper { border-radius:10px; box-shadow:0 10px 28px rgba(15,23,42,.22); padding:0; overflow:hidden; }
        .leaflet-popup.pm-marker-popup .leaflet-popup-content { margin:0; width:260px !important; max-width:calc(100vw - 48px); }
        .leaflet-popup.pm-marker-popup .leaflet-popup-tip { box-shadow:0 10px 28px rgba(15,23,42,.18); }
        .pm-popup-card { border-top:5px solid ${TIMAN_GREEN}; background:white; font-family:inherit; }
        .pm-popup-head { display:flex; align-items:center; gap:6px; padding:10px 12px 4px; }
        .pm-popup-type { display:inline-flex; align-items:center; height:18px; padding:0 7px; border-radius:999px; color:white; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
        .pm-popup-account { color:#94a3b8; background:#f1f5f9; border-radius:5px; padding:2px 5px; font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace; }
        .pm-popup-name { padding:0 12px; color:#111827; font-size:14px; font-weight:800; line-height:1.25; }
        .pm-popup-address { padding:7px 12px 0; color:#64748b; font-size:12px; line-height:1.35; }
        .pm-popup-actions { display:flex; flex-wrap:wrap; gap:6px; padding:10px 12px 12px; }
        .pm-popup-actions a { display:inline-flex; align-items:center; justify-content:center; min-height:30px; padding:6px 9px; border:1px solid #e2e8f0; border-radius:8px; color:#334155; background:#fff; font-size:12px; font-weight:700; text-decoration:none; }
        .pm-popup-actions a:hover { border-color:${TIMAN_GREEN}; color:${TIMAN_GREEN}; }
        .leaflet-popup.pm-timan-popup { margin-bottom:24px; }
        .leaflet-popup.pm-timan-popup .leaflet-popup-content-wrapper { border-radius:12px; box-shadow:0 12px 30px rgba(15,23,42,.24); padding:0; overflow:hidden; }
        .leaflet-popup.pm-timan-popup .leaflet-popup-content { margin:0; width:300px !important; max-width:calc(100vw - 48px); }
        .leaflet-popup.pm-timan-popup .leaflet-popup-tip { box-shadow:0 10px 24px rgba(15,23,42,.2); }
        .pm-timan-popup-card { border-top:5px solid ${TIMAN_GOLD}; background:white; font-family:inherit; }
        .pm-timan-popup-head { display:flex; align-items:center; gap:8px; padding:10px 12px 5px; }
        .pm-timan-popup-head img { width:70px; height:auto; display:block; }
        .pm-timan-popup-head span { margin-left:auto; color:#8b6f12; background:#fffbeb; border:1px solid #fde68a; border-radius:999px; padding:2px 7px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
        .pm-timan-popup-name { padding:0 12px; color:#111827; font-size:15px; font-weight:850; line-height:1.25; }
        .pm-timan-popup-address { padding:4px 12px 8px; color:#64748b; font-size:12px; line-height:1.35; }
        .pm-timan-contacts { margin:0 12px; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9; }
        .pm-timan-contact { display:grid; grid-template-columns:1fr auto; gap:8px; padding:8px 0; }
        .pm-timan-contact + .pm-timan-contact { border-top:1px solid #f8fafc; }
        .pm-timan-contact-name { font-size:12px; font-weight:800; color:#111827; line-height:1.2; }
        .pm-timan-contact-role { margin-top:2px; font-size:10px; font-weight:700; color:#8b6f12; text-transform:uppercase; letter-spacing:.03em; }
        .pm-timan-contact-links { display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:11px; font-weight:700; }
        .pm-timan-contact-links a { color:#166534; text-decoration:none; }
        .pm-timan-contact-links a:hover { text-decoration:underline; }
      `}</style>

      <div className="relative left-1/2 right-1/2 w-screen -mx-[50vw] -mt-4 -mb-4 bg-gray-50 px-3 sm:px-5 py-3">
        <h1 className="mb-2 text-lg sm:text-xl font-bold text-slate-900">{T.title[lang]}</h1>
        <div className="flex gap-3">
          {/* Legend */}

          {/* Map area */}
          <section className="flex-1 min-w-0">
            {/* Topbar */}
            <div className="bg-white rounded-t-2xl border border-b-0 border-gray-100 shadow-sm px-3 py-2 flex flex-wrap items-center gap-2">
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
                {(['dealer','service_partner','importer','demo_location'] as PartnerType[])
                  .filter((t) => t !== 'demo_location' || canSeeDemoLocations)
                  .map((t) => {
                  const on = activeTypes.has(t);
                  return (
                    <button key={t} onClick={() => toggleType(t)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${on ? 'bg-gray-50 text-gray-800 border border-gray-200' : 'bg-white text-gray-400 border border-transparent hover:border-gray-200'}`}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? TYPE_COLORS[t] : '#d1d5db' }} />
                      {T[t][lang]}
                    </button>
                  );
                })}
                {canSeeMachineLayer && (
                  <button
                    onClick={() => setShowMachineLayer((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${showMachineLayer ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-white text-gray-400 border-transparent hover:border-gray-200'}`}
                    title="Vis garantiregistreringer"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: showMachineLayer ? MACHINE_PIN_COLOR : '#d1d5db' }} />
                    Garantiregistreringer {showMachineLayer ? <span className="font-bold tabular-nums">({visibleMachinePins.length})</span> : null}
                  </button>
                )}
              </div>
              {canSeeInternalMapFeatures && (
                <>
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
                </>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <button
                  onClick={resetView}
                  className="h-9 px-2.5 flex items-center gap-1.5 text-gray-700 hover:text-[#2d5a27] rounded-md hover:bg-gray-50 text-xs font-medium border border-gray-200 bg-white"
                  title={T.europeView[lang]}
                >
                  <span aria-hidden>🌍</span> Vis Europa
                </button>
                <button
                  onClick={worldView}
                  className="h-9 px-2.5 flex items-center gap-1.5 text-gray-700 hover:text-[#2d5a27] rounded-md hover:bg-gray-50 text-xs font-medium border border-gray-200 bg-white"
                  title={T.worldView[lang]}
                >
                  <span aria-hidden>🌐</span> Global visning
                </button>
                <div className="relative h-9 flex items-center">
                  <select
                    value={mapStyle}
                    onChange={(e) => setMapStyle(e.target.value as MapStyleId)}
                    title="Korttype"
                    className="h-9 pl-2 pr-2 text-xs font-medium bg-white border border-gray-200 rounded-md text-gray-700 hover:text-[#2d5a27] focus:outline-none focus:border-[#2d5a27] cursor-pointer"
                  >
                    <option value="standard">Korttype: Standard</option>
                    <option value="satellite">Korttype: Satellit</option>
                    <option value="terrain">Korttype: Terræn</option>
                    <option value="dark">Korttype: Mørk</option>
                  </select>
                </div>
                {fullscreenSupported && (
                  <button
                    onClick={toggleFullscreen}
                    className="h-9 px-2.5 hidden md:flex items-center gap-1.5 text-gray-700 hover:text-[#2d5a27] rounded-md hover:bg-gray-50 text-xs font-medium border border-gray-200 bg-white"
                    title={isFullscreen ? 'Afslut fuld skærm' : 'Fuld skærm'}
                  >
                    <span aria-hidden>⛶</span> {isFullscreen ? 'Afslut fuld skærm' : 'Fuld skærm'}
                  </button>
                )}
              </div>
            </div>

            {/* Map + results panel */}
            <div ref={mapWrapperRef} className={`relative bg-white border border-gray-100 shadow-sm overflow-hidden ${isFullscreen ? 'rounded-none h-screen w-screen' : 'rounded-b-2xl'}`}>
              <div className={isFullscreen ? 'flex h-screen' : 'flex h-[calc(100vh-15rem)] min-h-[520px]'}>
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

                      {/* Garantiregistreringer panel (vises kun når laget er aktivt) */}
                      {canSeeMachineLayer && showMachineLayer && (
                        <div className="px-3 py-2 border-b border-gray-100 bg-white">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                              <Wrench className="h-3 w-3" /> Garantiregistreringer
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium tabular-nums">
                              {visibleMachinePins.length + visibleMachineMissing.length}
                            </span>
                          </div>
                          {visibleMachinePins.length === 0 ? (
                            <div className="text-[11px] text-gray-400 italic">{isDealerSide ? 'Ingen egne garantiregistreringer med koordinater.' : 'Ingen registreringer med koordinater.'}</div>
                          ) : (
                            <div className="max-h-72 overflow-y-auto -mx-1 divide-y divide-gray-100">
                              {visibleMachinePins.slice(0, 200).map((r) => {
                                const cityLine = [r.customerCity, r.customerCountry ? formatCountry(r.customerCountry) : ''].filter(Boolean).join(', ');
                                return (
                                  <button
                                    key={r.id}
                                    onClick={() => { setFitTo([r.coords]); }}
                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 transition-colors flex items-start gap-2 rounded"
                                  >
                                    <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: MACHINE_PIN_COLOR }} />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[11px] font-semibold text-gray-900 truncate">
                                        {r.machineModel || '—'}
                                        {r.machineSerial && <span className="ml-1.5 text-gray-400 font-mono text-[10px]">{r.machineSerial}</span>}
                                      </div>
                                      <div className="text-[10px] text-gray-500 truncate">
                                        {r.dealerNameSnapshot || '—'}{cityLine && <span> · {cityLine}</span>}
                                      </div>
                                    </div>
                                    {r.spId && <span className="shrink-0 text-[9px] font-mono text-gray-400 mt-0.5">{r.spId}</span>}
                                  </button>
                                );
                              })}
                              {visibleMachinePins.length > 200 && (
                                <div className="px-2 py-1 text-[10px] text-gray-400 italic">+ {visibleMachinePins.length - 200} flere — brug kortet</div>
                              )}
                            </div>
                          )}
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
                      key={mapStyle}
                      attribution={MAP_STYLES[mapStyle].attribution}
                      url={MAP_STYLES[mapStyle].url}
                      subdomains={MAP_STYLES[mapStyle].subdomains ?? ['a','b','c']}
                      maxZoom={MAP_STYLES[mapStyle].maxZoom}
                    />
                    <CtrlWheelZoom />
                    <MapResizer trigger={`${selectedId}-${resultsOpen}-${isFullscreen}`} />
                    <MapView fitTo={fitTo} resetTo={resetTarget} resetTick={resetTick} />
                    <SelectedVisibilityGuard selected={selected} onHidden={() => setSelectedId(null)} />
                    <TimanHeadquartersLayer lang={uiLanguage} partners={partners} />
                    {showPartnerLayer && (
                      <ClusterLayer
                        partners={withCoords}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        lang={lang}
                        formatCountry={formatCountry}
                        canOpenCrm={canOpenCrm}
                      />
                    )}
                    {canSeeMachineLayer && showMachineLayer && (
                      <MachineLayer pins={visibleMachinePins} />
                    )}
                  </MapContainer>

                  <div className="absolute top-3 right-3 z-[500] flex flex-col items-end gap-1.5">
                    <div className="bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-100 px-3 py-1.5 flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TIMAN_GREEN }} />
                      <span className="text-[11px] font-bold tracking-wider text-gray-800">TIMAN <span className="text-gray-400 font-medium">PARTNER MAP</span></span>
                    </div>
                    {isFullscreen && (
                      <button
                        onClick={() => {
                          (document.exitFullscreen
                            // @ts-ignore - vendor prefix
                            || document.webkitExitFullscreen)?.call(document);
                        }}
                        className="bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-100 px-3 py-1.5 text-[11px] font-bold tracking-wider text-gray-700 hover:text-[#2d5a27] hover:border-[#2d5a27] transition-colors flex items-center gap-1.5"
                        title="Afslut fuld skærm"
                      >
                        <span aria-hidden>↙</span> Afslut fuld skærm
                      </button>
                    )}
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
            {!loading && canSeeMachineLayer && showMachineLayer && (
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
      {selected && (!useMapPopupOnly || !selected.coords) && (
        <>
          <div className="fixed inset-0 z-[1000] bg-black/30 lg:hidden" onClick={() => setSelectedId(null)} />
          <aside className="fixed z-[1001] bg-white shadow-2xl border-gray-200
                            inset-x-3 bottom-3 max-h-[78vh] rounded-2xl border
                            sm:inset-auto sm:right-6 sm:top-1/2 sm:-translate-y-1/2 sm:w-[380px] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-8rem)]
                            lg:right-8
                            animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 overflow-y-auto">
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

            <div className="p-4 space-y-3">
              {!selected.coords && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>Denne forhandler mangler koordinater og kan derfor ikke vises som prik på kortet.</div>
                </div>
              )}

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
