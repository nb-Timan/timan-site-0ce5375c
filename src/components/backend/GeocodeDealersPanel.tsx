/**
 * Backend-only manual geocoder for dealer_accounts.
 * Visible only to portal_role = 'timan_backend'.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface GeocodeError {
  account: string | null;
  name?: string | null;
  address?: string;
  reason: string;
}

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  errors?: GeocodeError[];
}

export default function GeocodeDealersPanel() {
  const { appUser } = useAppUser();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);
  const [showFailed, setShowFailed] = useState(false);

  if (!appUser || appUser.portal_role !== "timan_backend") return null;

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setShowFailed(false);
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

  const failedRows = result?.errors ?? [];

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <MapPin className="h-5 w-5 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Geocode forhandlere</h2>
          <p className="mt-1 text-sm text-slate-700">
            Slår forhandleradresser op server-side (OpenStreetMap) og gemmer latitude/longitude.
            Kører for forhandlere uden koordinater eller med afventende geokodning. Sletter intet.
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
          {busy ? "Geokoder..." : "Geocode forhandlere"}
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

            {failedRows.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowFailed((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFailed ? "rotate-180" : ""}`} />
                  {showFailed ? "Skjul uden match" : `Vis uden match (${failedRows.length})`}
                </button>

                {showFailed && (
                  <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-emerald-200 bg-white">
                    {failedRows.map((row, i) => (
                      <div key={`${row.account ?? "x"}-${i}`} className="border-b border-emerald-100 px-3 py-2 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900">{row.name || "Ukendt navn"}</span>
                          <span className="font-mono text-[11px] text-slate-500">#{row.account ?? "-"}</span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{row.reason}</span>
                        </div>
                        {row.address && <div className="mt-1 text-[11px] text-slate-600">{row.address}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
