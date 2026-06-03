/**
 * Backend-only manual geocoder for dealer_accounts.
 * Visible only to portal_role = 'timan_backend'.
 *
 * Invokes the geocode-dealers edge function which:
 *  - finds dealer_accounts without latitude/longitude,
 *  - builds the address server-side,
 *  - geocodes via Nominatim,
 *  - writes latitude/longitude + geocoded_at + status,
 *  - never deletes data.
 */

import { useState } from "react";
import { Loader2, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  errors?: { account: string | null; reason: string }[];
}

export default function GeocodeDealersPanel() {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("Du er ikke logget ind.");
      const { data, error: fnErr } = await supabase.functions.invoke("geocode-dealers", {
        body: { limit: 200, retryFailed },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setResult(data as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <MapPin className="h-5 w-5 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Geocode forhandlere</h2>
          <p className="mt-1 text-sm text-slate-700">
            Slår forhandleradresser op server-side (OpenStreetMap) og gemmer latitude/longitude. Kører kun for forhandlere uden koordinater. Sletter intet.
          </p>
        </div>
      </div>
      <div className="px-5 py-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={retryFailed} onChange={(e) => setRetryFailed(e.target.checked)} />
          Prøv også tidligere fejlede igen
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 h-10 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {busy ? "Geokoder…" : "Geocode forhandlere"}
        </button>
      </div>
      {error && (
        <div className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
          <div className="flex-1 whitespace-pre-line">{error}</div>
        </div>
      )}
      {result && (
        <div className="mx-5 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <strong>{result.geocoded}</strong> geokodet ·{" "}
            <strong>{result.skipped}</strong> sprunget over ·{" "}
            <strong>{result.failed}</strong> fejlede (af {result.found} forsøgt).
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-auto list-disc pl-5">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>#{e.account ?? "—"}: {e.reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
