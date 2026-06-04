/**
 * Admin-only button — READ-ONLY SharePoint Warranty probe.
 *
 * Calls Edge Function `sharepoint-warranty-probe`. Shows site, list, columns,
 * first 10 raw rows and a suggested mapping draft in a modal.
 *
 * NO sync, NO writes, NO database changes, NO dealer matching.
 * Visible only to portal_role === 'timan_backend'.
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import { Loader2, AlertTriangle, X, FlaskConical, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";

interface ProbeColumn {
  displayName: string | null;
  name: string | null;
  id: string | null;
  type: string;
  readOnly: boolean | null;
  hidden: boolean | null;
}

interface ProbeRow {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  webUrl?: string;
  fields: Record<string, unknown>;
}

interface ProbeResult {
  mode: string;
  writes_performed: boolean;
  site: { id: string; webUrl: string; hostname: string; path: string };
  list: { id: string; name: string; displayName: string; webUrl: string };
  column_count: number;
  columns: ProbeColumn[];
  sample_row_count: number;
  sample_rows: ProbeRow[];
  suggested_mapping_draft: Record<string, string>;
  notes: string[];
  durationMs: number;
}

export interface SharePointWarrantyProbeHandle {
  start: () => void;
}

interface Props {
  hideTrigger?: boolean;
}

const SharePointWarrantyProbeButton = forwardRef<SharePointWarrantyProbeHandle, Props>(
  function SharePointWarrantyProbeButton({ hideTrigger }: Props, ref) {
    const { appUser } = useAppUser();
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ProbeResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    useImperativeHandle(ref, () => ({ start: () => void run() }), []);

    if (!appUser || appUser.portal_role !== "timan_backend") return null;

    async function run() {
      setBusy(true);
      setError(null);
      setResult(null);
      setOpen(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          setError("Du er ikke logget ind med Supabase Auth. Log ind igen som Timan Backend.");
          return;
        }
        const { data, error: fnErr } = await supabase.functions.invoke(
          "sharepoint-warranty-probe",
          { body: {} },
        );
        if (fnErr) {
          let serverMsg: string | null = null;
          try {
            const ctx = (fnErr as { context?: Response }).context;
            if (ctx && typeof ctx.json === "function") {
              const body = await ctx.json();
              serverMsg = body?.error ?? null;
            }
          } catch { /* ignore */ }
          const raw = serverMsg ?? fnErr.message ?? "Ukendt fejl";
          let friendly = raw;
          if (/Missing Microsoft secrets/i.test(raw)) {
            friendly = "Manglende secrets (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET).";
          } else if (/Forbidden/i.test(raw)) {
            friendly = "Adgang nægtet — kun Timan Backend.";
          } else if (/Unauthorized/i.test(raw)) {
            friendly = "Ugyldig session. Log ud og ind igen.";
          } else if (/not found|404/i.test(raw)) {
            friendly = "Edge Function 'sharepoint-warranty-probe' blev ikke fundet eller listen mangler.";
          }
          setError(friendly);
          return;
        }
        if ((data as { error?: string })?.error) {
          setError(String((data as { error?: string }).error));
          return;
        }
        setResult(data as ProbeResult);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }

    function close() {
      setOpen(false);
      setResult(null);
      setError(null);
    }

    return (
      <>
        {!hideTrigger && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-5 py-2.5 h-10 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-60 flex-shrink-0"
            title="Read-only test af SharePoint Warranty registration listen."
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Test SharePoint Warranty
          </button>
        )}

        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-violet-600" /> SharePoint Warranty — read-only test
                </h2>
                <button type="button" onClick={close} className="text-slate-400 hover:text-slate-700" aria-label="Luk">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4 text-sm text-slate-800">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <strong>Read-only test. Der skrives ingen data til Supabase.</strong>
                </div>

                {busy && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Henter SharePoint-listen…
                  </div>
                )}

                {error && !busy && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
                    <div>
                      <p className="font-bold">Probe fejlede</p>
                      <p className="mt-1 whitespace-pre-line">{error}</p>
                    </div>
                  </div>
                )}

                {result && !busy && !error && (
                  <>
                    {/* Site */}
                    <section>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5">1. Site</h3>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono break-all space-y-0.5">
                        <div><span className="text-slate-500">displayName:</span> {result.site.path}</div>
                        <div><span className="text-slate-500">id:</span> {result.site.id}</div>
                        <div><span className="text-slate-500">webUrl:</span> {result.site.webUrl}</div>
                      </div>
                    </section>

                    {/* List */}
                    <section>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5">2. Liste</h3>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono break-all space-y-0.5">
                        <div><span className="text-slate-500">displayName:</span> {result.list.displayName}</div>
                        <div><span className="text-slate-500">name:</span> {result.list.name}</div>
                        <div><span className="text-slate-500">id:</span> {result.list.id}</div>
                      </div>
                    </section>

                    {/* Columns */}
                    <section>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5">
                        3. Kolonner ({result.column_count})
                      </h3>
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-bold">displayName</th>
                              <th className="px-2 py-1.5 text-left font-bold">internal name</th>
                              <th className="px-2 py-1.5 text-left font-bold">type</th>
                              <th className="px-2 py-1.5 text-left font-bold">readOnly</th>
                              <th className="px-2 py-1.5 text-left font-bold">hidden</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {result.columns.map((c) => (
                              <tr key={c.id ?? c.name ?? c.displayName ?? Math.random()}>
                                <td className="px-2 py-1.5">{c.displayName ?? "—"}</td>
                                <td className="px-2 py-1.5 font-mono text-violet-700">{c.name ?? "—"}</td>
                                <td className="px-2 py-1.5 text-slate-600">{c.type}</td>
                                <td className="px-2 py-1.5 text-slate-600">{c.readOnly ? "ja" : "nej"}</td>
                                <td className="px-2 py-1.5 text-slate-600">{c.hidden ? "ja" : "nej"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* Rows */}
                    <section>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5">
                        4. Første {result.sample_row_count} rækker (rå fields)
                      </h3>
                      <div className="space-y-2">
                        {result.sample_rows.map((r) => (
                          <details key={r.id} className="rounded-lg border border-slate-200 bg-slate-50">
                            <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-800">
                              Item id: <span className="font-mono">{r.id}</span>
                              {r.lastModifiedDateTime && (
                                <span className="ml-2 text-slate-500 font-normal">
                                  · ændret {new Date(r.lastModifiedDateTime).toLocaleString("da-DK")}
                                </span>
                              )}
                            </summary>
                            <pre className="px-3 pb-3 text-[11px] font-mono text-slate-800 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(r.fields, null, 2)}
                            </pre>
                          </details>
                        ))}
                      </div>
                    </section>

                    {/* Mapping draft */}
                    <section>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5">
                        5. Foreslået mapping → warranty_registrations
                      </h3>
                      <p className="text-xs text-slate-600 mb-2">
                        Udkast til manuel gennemgang. Intet anvendes automatisk.
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-bold">SharePoint kolonne</th>
                              <th className="px-2 py-1.5 text-left font-bold">→ warranty_registrations</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Object.entries(result.suggested_mapping_draft).map(([sp, target]) => (
                              <tr key={sp}>
                                <td className="px-2 py-1.5">{sp}</td>
                                <td className="px-2 py-1.5 font-mono text-emerald-700">{target}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {result.notes?.length > 0 && (
                      <section>
                        <ul className="text-xs text-slate-600 list-disc pl-5 space-y-1">
                          {result.notes.map((n, i) => <li key={i}>{n}</li>)}
                        </ul>
                      </section>
                    )}

                    <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                      Probe-resultat gemmes ikke. Lukkes vinduet, forsvinder data.
                      Varighed: {result.durationMs} ms.
                    </p>
                  </>
                )}
              </div>

              <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end flex-shrink-0">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Luk
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
);

export default SharePointWarrantyProbeButton;
