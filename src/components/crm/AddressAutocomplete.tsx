/**
 * Address input with optional Google Places autocomplete.
 *
 * Loads the Google Maps Places library on demand if
 * VITE_GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_PLACES_API_KEY) is configured.
 * Falls back to a plain text input when no key is available, so the form
 * keeps working without any API dependency.
 */
import { useEffect, useRef } from 'react';

const API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  (import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined) ||
  '';

let loaderPromise: Promise<boolean> | null = null;
function loadPlaces(): Promise<boolean> {
  if (!API_KEY) return Promise.resolve(false);
  if (typeof window === 'undefined') return Promise.resolve(false);
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve(true);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places&v=weekly`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loaderPromise;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}

export default function AddressAutocomplete({ value, onChange, className, placeholder, id }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!API_KEY || !ref.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    loadPlaces().then((ok) => {
      if (!ok || cancelled || !ref.current) return;
      const g = (window as unknown as { google: { maps: { places: { Autocomplete: new (el: HTMLInputElement, opts: object) => { addListener: (e: string, cb: () => void) => void; getPlace: () => { formatted_address?: string; name?: string } } } } } }).google;
      const ac = new g.maps.places.Autocomplete(ref.current, { types: ['address'], fields: ['formatted_address', 'name', 'address_components'] });
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        const v = p.formatted_address || p.name || '';
        if (v) onChange(v);
      });
      cleanup = () => { /* google does not expose a clean remove for Autocomplete */ };
    });
    return () => { cancelled = true; cleanup?.(); };
  }, [onChange]);

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
