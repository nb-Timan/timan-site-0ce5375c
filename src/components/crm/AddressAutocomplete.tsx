/**
 * Address input with optional Google Places autocomplete.
 *
 * Loads the Google Maps Places library on first focus if
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
 * (DK, DE, SE, FR, IT, HU, PL, CZ, CH, AT, GB). Pass
 * `countries={[...]}` to override.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ADDRESS_AUTOCOMPLETE_COUNTRIES,
  resolveAddressFromGooglePlace,
  type GooglePlaceResult as PlaceResult,
  type ResolvedAddress,
} from '@/lib/addressAutocomplete';

export type { ResolvedAddress } from '@/lib/addressAutocomplete';

const LOVABLE_KEY = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) || '';
const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
const GOOGLE_PLACES_KEY = (import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined) || '';

const API_KEY = LOVABLE_KEY || GOOGLE_MAPS_KEY || GOOGLE_PLACES_KEY || '';
const KEY_SOURCE: string | null = LOVABLE_KEY ? 'VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'
  : GOOGLE_MAPS_KEY ? 'VITE_GOOGLE_MAPS_API_KEY'
  : GOOGLE_PLACES_KEY ? 'VITE_GOOGLE_PLACES_API_KEY'
  : null;

let warnedMissingKey = false;
let warnedAuthFailure = false;
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
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places&v=weekly`;
    s.async = true;
    s.defer = true;
    s.dataset.googleMapsLoader = '1';
    s.onload = () => {
      const ww = window as unknown as { google?: { maps?: { places?: unknown } } };
      finish(!!ww.google?.maps?.places);
    };
    s.onerror = () => finish(false);
    document.head.appendChild(s);
    window.setTimeout(() => {
      const ww = window as unknown as { google?: { maps?: { places?: unknown } } };
      finish(!!ww.google?.maps?.places);
    }, 8000);
    // Surface Google's auth failure callback (invalid key, referer not allowed, etc.)
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      if (!warnedAuthFailure && typeof console !== 'undefined') {
        warnedAuthFailure = true;
        console.warn(`Google Places autocomplete disabled: ${KEY_SOURCE ?? 'browser key'} failed auth/referrer/billing validation`);
      }
      finish(false);
    };
  });
  return loaderPromise;
}

export interface AddressParts {
  address_line_1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Called when the user picks a Places suggestion. */
  onResolve?: (r: ResolvedAddress) => void;
  /** Called when the "Find koordinater" fallback geocoder resolves. Defaults to onResolve. */
  onGeocodeResolved?: (r: ResolvedAddress) => void;
  /** ISO-2 country codes to restrict suggestions (lowercase). */
  countries?: string[];
  /** Show "Adresse valideret ✓" / manual-edit warning below the input. */
  showValidationState?: boolean;
  /**
   * Additional fields used to build a fallback geocode query when the user
   * clicks "Find koordinater" without picking a Google suggestion.
   * When omitted the button is hidden.
   */
  addressParts?: AddressParts;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

type ValidationStatus = 'idle' | 'validated' | 'manual' | 'error';

function reverseGeocode(query: string): Promise<PlaceResult | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const w = window as unknown as { google?: { maps?: { Geocoder?: new () => { geocode: (req: object, cb: (results: PlaceResult[] | null, status: string) => void) => void } } } };
  const Geocoder = w.google?.maps?.Geocoder;
  if (!Geocoder) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const gc = new Geocoder();
      gc.geocode({ address: query }, (results, status) => {
        if (status === 'OK' && results && results[0]) resolve(results[0]);
        else resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

export default function AddressAutocomplete({
  value, onChange, onResolve, onGeocodeResolved, countries, className, placeholder, id,
  showValidationState, addressParts, disabled,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onResolveRef = useRef(onResolve);
  const onGeocodeRef = useRef(onGeocodeResolved);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onResolveRef.current = onResolve; }, [onResolve]);
  useEffect(() => { onGeocodeRef.current = onGeocodeResolved; }, [onGeocodeResolved]);

  const [status, setStatus] = useState<ValidationStatus>('idle');
  const [geocoding, setGeocoding] = useState(false);
  const lastResolvedRef = useRef<string | null>(null);
  const autocompleteInitializedRef = useRef(false);

  const ensureAutocomplete = useCallback(() => {
    if (disabled || autocompleteInitializedRef.current || !ref.current) return;
    if (!API_KEY) {
      void loadPlaces();
      return;
    }
    const restrict = (countries && countries.length > 0 ? countries : DEFAULT_ADDRESS_AUTOCOMPLETE_COUNTRIES).map((c) => c.toLowerCase());
    loadPlaces().then((ok) => {
      if (!ok || !ref.current || autocompleteInitializedRef.current) return;
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
        autocompleteInitializedRef.current = true;
        ac.addListener('place_changed', () => {
          const p = ac.getPlace();
          const resolved = resolveAddressFromGooglePlace(p);
          const v = resolved.formatted || resolved.address_line_1 || '';
          if (v) onChangeRef.current(v);
          lastResolvedRef.current = v || null;
          setStatus('validated');
          if (onResolveRef.current) onResolveRef.current(resolved);
        });
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('Google Places autocomplete could not initialize; manual address entry remains available.', err);
        }
      }
    });
  }, [countries, disabled]);

  const handleInputChange = (next: string) => {
    if (status === 'validated' && next !== lastResolvedRef.current) {
      setStatus('manual');
    } else if (status === 'error') {
      setStatus('idle');
    }
    onChange(next);
  };

  const handleGeocodeClick = async () => {
    await loadPlaces();
    const parts = addressParts ?? {};
    const query = [value || parts.address_line_1, parts.postal_code, parts.city, parts.country]
      .map((s) => (s ?? '').toString().trim())
      .filter(Boolean)
      .join(', ');
    if (!query) {
      setStatus('error');
      return;
    }
    setGeocoding(true);
    const result = await reverseGeocode(query);
    setGeocoding(false);
    if (!result) {
      setStatus('error');
      return;
    }
    const resolved = resolveAddressFromGooglePlace(result);
    const v = resolved.formatted || value;
    if (v && v !== value) onChange(v);
    lastResolvedRef.current = v || null;
    setStatus('validated');
    const cb = onGeocodeRef.current || onResolveRef.current;
    if (cb) cb(resolved);
  };

  const showButton = showValidationState && !disabled && !!addressParts;

  return (
    <div>
      <input
        id={id}
        ref={ref}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        disabled={disabled}
        onFocus={ensureAutocomplete}
        onChange={(e) => handleInputChange(e.target.value)}
      />
      {showValidationState && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {status === 'validated' && (
            <span className="text-emerald-600">Adresse valideret ✓</span>
          )}
          {status === 'manual' && (
            <span className="text-amber-600">Adressen er ændret manuelt – koordinater bør opdateres</span>
          )}
          {status === 'error' && (
            <span className="text-rose-600">Kunne ikke finde koordinater for adressen.</span>
          )}
          {showButton && (
            <button
              type="button"
              onClick={handleGeocodeClick}
              disabled={geocoding}
              className="ml-auto rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {geocoding ? 'Søger…' : 'Find koordinater'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

