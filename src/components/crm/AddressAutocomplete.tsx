/**
 * Address input with optional Google Places autocomplete.
 *
 * Loads the Google Maps Places library on demand if
 * VITE_GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_PLACES_API_KEY) is configured.
 * Falls back to a plain text input when no key is available, so the form
 * keeps working without any API dependency.
 *
 * Backward compatible: existing callers pass only `value` + `onChange` and
 * get the same text-input behaviour. New callers can pass `onResolve` to
 * receive structured fields (street, postal_code, city, country, lat/lng,
 * place_id) when the user picks a suggestion.
 *
 * Country bias: by default restricted to Timan's markets
 * (DK, DE, AT, CH, IT, HU, GB). Pass `countries={[...]}` to override.
 */
import { useEffect, useRef } from 'react';

const LOVABLE_KEY = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) || '';
const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
const GOOGLE_PLACES_KEY = (import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined) || '';

const API_KEY = LOVABLE_KEY || GOOGLE_MAPS_KEY || GOOGLE_PLACES_KEY || '';
const KEY_SOURCE: string | null = LOVABLE_KEY ? 'VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'
  : GOOGLE_MAPS_KEY ? 'VITE_GOOGLE_MAPS_API_KEY'
  : GOOGLE_PLACES_KEY ? 'VITE_GOOGLE_PLACES_API_KEY'
  : null;

const DEFAULT_COUNTRIES = ['dk', 'de', 'at', 'ch', 'it', 'hu', 'gb'];

export interface ResolvedAddress {
  formatted: string;
  street: string | null;
  house_number: string | null;
  address_line_1: string | null; // street + house_number when both present
  postal_code: string | null;
  city: string | null;
  country: string | null;          // ISO-2 uppercase
  country_name: string | null;     // long name
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface PlaceResult {
  formatted_address?: string;
  name?: string;
  place_id?: string;
  address_components?: AddressComponent[];
  geometry?: { location?: { lat: () => number; lng: () => number } };
}

// TEMP: unconditional logging to debug deployed preview (remove after verification)
let warnedMissingKey = false;
function devLog(...args: unknown[]) {
  console.log('[AddressAutocomplete]', ...args);
}
// Log once at module load so we can see it even before any component mounts.
if (typeof window !== 'undefined') {
  console.log('[AddressAutocomplete] module load — key present:', !!API_KEY, 'key source:', KEY_SOURCE, 'MODE:', import.meta.env.MODE);
}

let loaderPromise: Promise<boolean> | null = null;
function loadPlaces(): Promise<boolean> {
  if (!API_KEY) {
    if (!warnedMissingKey && typeof console !== 'undefined') {
      warnedMissingKey = true;
      console.warn('Google Places autocomplete disabled: missing VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY or VITE_GOOGLE_MAPS_API_KEY');
    }
    return Promise.resolve(false);
  }
  if (typeof window === 'undefined') return Promise.resolve(false);
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) {
    devLog('script already loaded, reusing');
    return Promise.resolve(true);
  }
  if (loaderPromise) return loaderPromise;
  // Reuse an existing tag if another component already injected one.
  const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="1"]');
  if (existing) {
    loaderPromise = new Promise<boolean>((resolve) => {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
    });
    return loaderPromise;
  }
  loaderPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places&v=weekly`;
    s.async = true;
    s.defer = true;
    s.dataset.googleMapsLoader = '1';
    s.onload = () => {
      const ww = window as unknown as { google?: { maps?: { places?: unknown } } };
      devLog('script loaded: true, google.maps.places present:', !!ww.google?.maps?.places);
      resolve(true);
    };
    s.onerror = (e) => { devLog('script loaded: false (error)', e); resolve(false); };
    document.head.appendChild(s);
  });
  // Surface Google's auth failure callback (invalid key, referer not allowed, etc.)
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    devLog('Google Places status: gm_authFailure (InvalidKey/RefererNotAllowed/BillingNotEnabled)');
  };
  return loaderPromise;
}

function pick(components: AddressComponent[] | undefined, type: string, useShort = false): string | null {
  if (!components) return null;
  const c = components.find((x) => x.types.includes(type));
  if (!c) return null;
  return useShort ? c.short_name : c.long_name;
}

function extractResolved(place: PlaceResult): ResolvedAddress {
  const c = place.address_components;
  const street = pick(c, 'route');
  const houseNumber = pick(c, 'street_number');
  const line1 = [street, houseNumber].filter(Boolean).join(' ').trim() || null;
  const postal = pick(c, 'postal_code');
  const city =
    pick(c, 'postal_town') ||
    pick(c, 'locality') ||
    pick(c, 'administrative_area_level_2') ||
    pick(c, 'administrative_area_level_1');
  const countryShort = pick(c, 'country', true);
  const countryLong = pick(c, 'country');
  const lat = place.geometry?.location?.lat?.();
  const lng = place.geometry?.location?.lng?.();
  return {
    formatted: place.formatted_address || place.name || '',
    street,
    house_number: houseNumber,
    address_line_1: line1,
    postal_code: postal,
    city,
    country: countryShort ? countryShort.toUpperCase() : null,
    country_name: countryLong,
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lng === 'number' ? lng : null,
    google_place_id: place.place_id || null,
  };
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Called when the user picks a Places suggestion. */
  onResolve?: (r: ResolvedAddress) => void;
  /** ISO-2 country codes to restrict suggestions (lowercase). */
  countries?: string[];
  className?: string;
  placeholder?: string;
  id?: string;
}

export default function AddressAutocomplete({ value, onChange, onResolve, countries, className, placeholder, id }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onResolveRef = useRef(onResolve);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onResolveRef.current = onResolve; }, [onResolve]);

  useEffect(() => {
    devLog('mount, key present:', !!API_KEY, 'key source:', KEY_SOURCE);
    if (!API_KEY || !ref.current) {
      if (!API_KEY) loadPlaces(); // triggers the missing-key warning once
      return;
    }
    let cancelled = false;
    const restrict = (countries && countries.length > 0 ? countries : DEFAULT_COUNTRIES).map((c) => c.toLowerCase());
    loadPlaces().then((ok) => {
      devLog('loadPlaces resolved:', ok);
      if (!ok || cancelled || !ref.current) {
        devLog('autocomplete initialized: false (loadPlaces ok=' + ok + ', cancelled=' + cancelled + ', ref=' + !!ref.current + ')');
        return;
      }
      try {
        const g = (window as unknown as {
          google: {
            maps: {
              places: {
                Autocomplete: new (el: HTMLInputElement, opts: object) => {
                  addListener: (e: string, cb: () => void) => void;
                  getPlace: () => PlaceResult;
                };
              };
            };
          };
        }).google;
        const ac = new g.maps.places.Autocomplete(ref.current, {
          types: ['address'],
          fields: ['formatted_address', 'name', 'address_components', 'geometry.location', 'place_id'],
          componentRestrictions: { country: restrict },
        });
        devLog('autocomplete initialized: true, countries:', restrict);
        ac.addListener('place_changed', () => {
          const p = ac.getPlace();
          const resolved = extractResolved(p);
          devLog('place selected:', resolved.formatted, resolved.country);
          const v = resolved.formatted || resolved.address_line_1 || '';
          if (v) onChangeRef.current(v);
          if (onResolveRef.current) onResolveRef.current(resolved);
        });
      } catch (err) {
        devLog('autocomplete initialized: false (exception)', err);
      }
    });
    return () => { cancelled = true; };
    // restriction list is stable per mount; recreating Autocomplete on every keystroke would break selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      id={id}
      ref={ref}
      type="text"
      className={className}
      placeholder={placeholder}
      value={value}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
