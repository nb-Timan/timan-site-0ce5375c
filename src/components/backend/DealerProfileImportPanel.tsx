/**
 * Backend → Forhandlere → "Importér firma- og kontaktinformation".
 *
 * FASE 1 (denne komponent): upload Excel-fil, parse, vis kolonnemapping,
 * kør dry-run mod public.dealer_accounts og vis match-resultatet.
 *
 * INGEN database-writes herfra. Knappen "Bekræft import" er disabled
 * og forklarer at backend-import implementeres i fase 2.
 *
 * SharePoint-styret stamdata (firmanavn, kontonr, kundetype, land,
 * adresse, postnr, by) bruges KUN til match — aldrig som update-target.
 */

import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, HelpCircle, Lock, Upload, X } from "lucide-react";
import {
  TARGET_FIELDS, SKIP_KEY,
  autoMapHeaders, parseWorkbookFile, runDryRun, executeImport,
  type ColumnMapping, type DryRunResult, type ParsedSheet, type ImportSummary,
} from "@/lib/dealerProfileImportService";
import type { DealerAccount } from "@/lib/dealerAccountsService";

interface Props {
  dealers: DealerAccount[];
  onReload?: () => void | Promise<void>;
}

export default function DealerProfileImportPanel({ dealers, onReload }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const sheet = sheets[sheetIdx];

  const dryRun: DryRunResult | null = useMemo(() => {
    if (!sheet) return null;
    return runDryRun(sheet.rows, mapping, dealers, overrides);
  }, [sheet, mapping, dealers, overrides]);

  function reset() {
    setFileName(null); setSheets([]); setSheetIdx(0);
    setMapping({}); setOverrides({}); setParseError(null);
    setSummary(null); setShowConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const profileMappedCount = useMemo(() => {
    if (!dryRun) return 0;
    return dryRun.usedTargetKeys.filter((k) => {
      const f = TARGET_FIELDS.find((x) => x.key === k);
      return f && f.role === "profile" && k !== "__comment";
    }).length;
  }, [dryRun]);

  const canConfirm =
    !!dryRun &&
    dryRun.totalRows > 0 &&
    dryRun.matched === dryRun.totalRows &&
    dryRun.uncertain === 0 &&
    dryRun.unmatched === 0 &&
    profileMappedCount > 0 &&
    !importing;

  async function doImport() {
    if (!dryRun) return;
    setImporting(true);
    try {
      const res = await executeImport(dryRun);
      setSummary(res);
      setShowConfirm(false);
      if (onReload) await onReload();
    } finally {
      setImporting(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setParseError(null);
    try {
      const parsed = await parseWorkbookFile(f);
      setFileName(f.name);
      setSheets(parsed);
      const first = parsed.find((s) => s.rowCount > 0) ?? parsed[0];
      const firstIdx = parsed.indexOf(first);
      setSheetIdx(firstIdx >= 0 ? firstIdx : 0);
      setMapping(first ? autoMapHeaders(first.headers) : {});
      setOverrides({});
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function changeSheet(idx: number) {
    setSheetIdx(idx);
    const s = sheets[idx];
    setMapping(s ? autoMapHeaders(s.headers) : {});
    setOverrides({});
  }

  if (!open) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Importér firma- og kontaktinformation</div>
            <div className="text-xs text-slate-500">Upload Excel → kør dry-run → kontrollér match og felter før import.</div>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
          <Upload className="h-3.5 w-3.5" /> Åbn importpanel
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <div className="text-sm font-bold text-slate-900">Importér firma- og kontaktinformation (dry-run)</div>
        </div>
        <button type="button" onClick={() => { reset(); setOpen(false); }}
          className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* Step 1 — upload */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">1. Vælg Excel-fil</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileInputRef} type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-slate-800" />
            {fileName && (
              <span className="text-xs text-slate-600">{fileName} · {sheet?.rowCount ?? 0} rækker</span>
            )}
            {fileName && (
              <button type="button" onClick={reset}
                className="text-xs text-rose-700 hover:underline">Fjern</button>
            )}
          </div>
          {busy && <div className="mt-2 text-xs text-slate-500">Parser fil…</div>}
          {parseError && (
            <div className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
              {parseError}
            </div>
          )}
        </section>

        {sheets.length > 1 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Ark</h3>
            <div className="flex gap-1 flex-wrap">
              {sheets.map((s, i) => (
                <button key={s.sheetName} type="button" onClick={() => changeSheet(i)}
                  className={`text-xs px-2 py-1 rounded border ${i === sheetIdx ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
                  {s.sheetName} ({s.rowCount})
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 2 — column mapping */}
        {sheet && sheet.headers.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">2. Kolonnemapping</h3>
              <button type="button" onClick={() => setMapping(autoMapHeaders(sheet.headers))}
                className="text-xs text-emerald-700 hover:underline">Auto-detektér igen</button>
            </div>
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-auto">
              {sheet.headers.map((h) => {
                const mapped = mapping[h] ?? SKIP_KEY;
                const target = TARGET_FIELDS.find((f) => f.key === mapped);
                return (
                  <div key={h} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center">
                    <div className="col-span-5 font-mono text-slate-700 truncate" title={h}>{h}</div>
                    <div className="col-span-1 text-slate-400 text-center">→</div>
                    <div className="col-span-5">
                      <select value={mapped} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white">
                        <option value={SKIP_KEY}>— Spring over —</option>
                        <optgroup label="Match (SharePoint master — overskrives ikke)">
                          {TARGET_FIELDS.filter((f) => f.sharepointMaster).map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Profil-felter (må opdateres)">
                          {TARGET_FIELDS.filter((f) => !f.sharepointMaster).map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {target?.sharepointMaster
                        ? <Lock className="h-3.5 w-3.5 text-amber-600" aria-label="SharePoint-master" />
                        : mapped === SKIP_KEY
                          ? <HelpCircle className="h-3.5 w-3.5 text-slate-300" />
                          : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </div>
                );
              })}
            </div>
            {dryRun && dryRun.mappedSharepointMasterKeys.length > 0 && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <Lock className="h-3.5 w-3.5 mt-0.5" />
                <div>
                  SharePoint-master felter er kun brugt til match (ikke overskrevet):
                  {" "}<span className="font-mono">{dryRun.mappedSharepointMasterKeys.join(", ")}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Step 3 — dry-run summary */}
        {dryRun && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">3. Dry-run resultat</h3>
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Læste rækker" value={dryRun.totalRows} color="slate" />
              <Stat label="Sikker match" value={dryRun.matched} color="emerald" />
              <Stat label="Usikker match" value={dryRun.uncertain} color="amber" />
              <Stat label="Ikke fundet" value={dryRun.unmatched} color="rose" />
            </div>
          </section>
        )}

        {/* Step 4 — row-level review */}
        {dryRun && dryRun.rows.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">4. Gennemgang pr. række</h3>
              <label className="text-xs text-slate-600 flex items-center gap-1">
                <input type="checkbox" checked={showAllRows} onChange={(e) => setShowAllRows(e.target.checked)} />
                Vis også sikre matches
              </label>
            </div>
            <div className="rounded-md border border-slate-200 max-h-[480px] overflow-auto divide-y divide-slate-100">
              {dryRun.rows
                .filter((r) => showAllRows || r.status !== "matched")
                .map((r) => {
                  const selected = r.selectedDealerId ? dealers.find((d) => d.id === r.selectedDealerId) : null;
                  return (
                    <div key={r.rowIndex} className="px-3 py-3 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusBadge status={r.status} />
                          <span className="font-semibold text-slate-900 truncate">{r.excelCompany || <em className="text-slate-400">(uden firmanavn)</em>}</span>
                          {r.excelAccountNumber && <span className="text-slate-500">· #{r.excelAccountNumber}</span>}
                          {r.excelCountry && <span className="text-slate-400">· {r.excelCountry}</span>}
                          {r.excelEmailDomain && <span className="text-slate-400">· @{r.excelEmailDomain}</span>}
                        </div>
                        <span className="text-slate-400">række {r.rowIndex + 2}</span>
                      </div>

                      {r.warnings.length > 0 && (
                        <div className="mb-1.5 text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />{r.warnings.join(" · ")}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-slate-500">Match:</span>
                        <select
                          value={r.selectedDealerId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setOverrides({ ...overrides, [r.rowIndex]: v === "" ? null : v });
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-xs bg-white max-w-md">
                          <option value="">— Ingen forhandler —</option>
                          {r.topCandidates.map((c) => (
                            <option key={c.dealer.id} value={c.dealer.id}>
                              {c.dealer.company_name} · #{c.dealer.account_number} (score {c.score})
                            </option>
                          ))}
                          {/* Alle dealers som fallback til manuel valg */}
                          <optgroup label="Vælg manuelt">
                            {dealers.slice(0, 500).map((d) => (
                              <option key={`m-${d.id}`} value={d.id}>
                                {d.company_name} · #{d.account_number}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {selected && (
                          <span className="text-slate-500">
                            → <span className="font-semibold text-slate-800">{selected.company_name}</span>
                          </span>
                        )}
                      </div>

                      {r.changes.length > 0 ? (
                        <div className="ml-1 mt-1 rounded bg-slate-50 border border-slate-200 px-2 py-1.5">
                          <div className="font-semibold text-slate-600 mb-0.5">Felter der vil blive opdateret ({r.changes.length}):</div>
                          <div className="space-y-0.5">
                            {r.changes.map((c) => (
                              <div key={c.key} className="grid grid-cols-12 gap-1">
                                <div className="col-span-3 text-slate-500 truncate">{c.label}</div>
                                <div className="col-span-4 text-slate-400 truncate line-through">{c.current || <em>(tom)</em>}</div>
                                <div className="col-span-1 text-slate-400 text-center">→</div>
                                <div className="col-span-4 text-emerald-700 truncate font-medium">{c.next}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : selected ? (
                        <div className="ml-1 text-slate-400 italic">Ingen ændringer — alle felter er allerede ens.</div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* Step 5 — confirm + execute */}
        {dryRun && !summary && (
          <section className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-slate-600 flex items-start gap-2 max-w-xl">
              <Lock className="h-3.5 w-3.5 mt-0.5 text-slate-400" />
              <span>
                Importen opdaterer KUN profil-felter (kontakter, CVR, telefon, mail, sociale medier).
                SharePoint-masterdata (firmanavn, kontonr., adresse, land, kundetype) røres ikke.
                Ingen forhandlere slettes.
                {!canConfirm && (
                  <span className="block mt-1 text-amber-700">
                    Bekræft kan først bruges når alle rækker har sikker match og mindst ét profilfelt er mappet.
                  </span>
                )}
              </span>
            </div>
            <button type="button" disabled={!canConfirm}
              onClick={() => setShowConfirm(true)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white ${canConfirm ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300 cursor-not-allowed"}`}>
              Bekræft import ({dryRun.matched} {dryRun.matched === 1 ? "række" : "rækker"})
            </button>
          </section>
        )}

        {/* Confirm modal */}
        {showConfirm && dryRun && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !importing && setShowConfirm(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-base font-bold text-slate-900 mb-2">Bekræft import</h4>
              <p className="text-sm text-slate-700 mb-3">
                {dryRun.matched} forhandlerprofiler vil blive opdateret.
              </p>
              <ul className="text-xs text-slate-600 space-y-1 mb-4 list-disc pl-4">
                <li>SharePoint-masterdata overskrives ikke.</li>
                <li>Ingen forhandlere slettes.</li>
                <li>Kun profilfelter (kontakter, CVR, telefon, e-mail, sociale medier) opdateres.</li>
              </ul>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={importing} onClick={() => setShowConfirm(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Annullér
                </button>
                <button type="button" disabled={importing} onClick={() => void doImport()}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  {importing ? "Importerer…" : "Ja, opdatér profiler"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Post-import summary */}
        {summary && (
          <section className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Import gennemført</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat label="Opdateret" value={summary.updated} color="emerald" />
              <Stat label="Sprunget over" value={summary.skipped} color="slate" />
              <Stat label="Fejl" value={summary.errors} color="rose" />
            </div>
            {summary.errors > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 mb-3">
                <div className="text-xs font-semibold text-rose-800 mb-1">Fejl pr. række:</div>
                <ul className="text-xs text-rose-800 space-y-1">
                  {summary.rows.filter((r) => r.status === "error").map((r) => (
                    <li key={r.rowIndex}>række {r.rowIndex + 2} · {r.company}: {r.error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-md border border-slate-200 max-h-72 overflow-auto divide-y divide-slate-100">
              {summary.rows.map((r) => (
                <div key={r.rowIndex} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      r.status === "updated" ? "bg-emerald-100 text-emerald-800" :
                      r.status === "error"   ? "bg-rose-100 text-rose-800" :
                                               "bg-slate-100 text-slate-700"}`}>
                      {r.status === "updated" ? "OK" : r.status === "error" ? "Fejl" : "Sprunget"}
                    </span>
                    <span className="font-semibold text-slate-900 truncate">{r.company}</span>
                  </div>
                  <span className="text-slate-500">
                    {r.changedKeys.length > 0 ? `${r.changedKeys.length} felt${r.changedKeys.length === 1 ? "" : "er"}` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3 gap-2">
              <button type="button" onClick={() => { reset(); }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Importér en ny fil
              </button>
              <button type="button" onClick={() => { reset(); setOpen(false); }}
                className="rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">
                Luk
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "slate" | "emerald" | "amber" | "rose" }) {
  const cls = {
    slate:   "bg-slate-50  border-slate-200  text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber:   "bg-amber-50   border-amber-200   text-amber-800",
    rose:    "bg-rose-50    border-rose-200    text-rose-800",
  }[color];
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: "matched" | "uncertain" | "unmatched" }) {
  if (status === "matched") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase">Match</span>;
  if (status === "uncertain") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold uppercase">Usikker</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold uppercase">Ingen</span>;
}
