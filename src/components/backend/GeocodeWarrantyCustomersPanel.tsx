/**
 * Backend / Service panel: manual geocoder for warranty_registrations
 * customer addresses. Visible only to timan_backend / timan_service.
 *
 * Invokes the `geocode-warranty-customers` edge function which:
 *  - finds warranty rows without customer_latitude/longitude,
 *  - builds the customer address server-side from existing PII fields,
 *  - geocodes via Nominatim,
 *  - writes customer_latitude/longitude + customer_geocoded_at + status,
 *  - never deletes data, never touches PII columns.
 */

import { useState } from "react";
import { Loader2, MapPin, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  errors?: { certificate: string | null; reason: string }[];
}

export default function GeocodeWarrantyCustomersPanel({ onCompleted }: { onCompleted?: () => void } = {}) {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);

  const role = appUser?.portal_role;
  if (!appUser || (role !== "timan_backend" && role !== "timan_service")) return null;

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("Du er ikke logget ind.");
      const { data, error: fnErr } = await supabase.functions.invoke("geocode-warranty-customers", {
        body: { limit: 200, retryFailed },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setResult(data as Summary);
      onCompleted?.();
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
          <Wrench className="h-5 w-5 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Geocode garantiregistreringer</h2>
          <p className="mt-1 text-sm text-slate-700">
            Slår kundeadresser på garantiregistreringer op server-side (OpenStreetMap) og gemmer latitude/longitude. Bruges af machine-laget på partnerkortet. Sletter intet, rører ikke kundens PII-felter.
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
          {busy ? "Geokoder…" : "Geocode garantiregistreringer"}
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
                  <li key={i}>{e.certificate ? `#${e.certificate}` : "—"}: {e.reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
