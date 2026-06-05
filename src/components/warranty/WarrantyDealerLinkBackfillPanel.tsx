/**
 * One-shot dealer-link backfill panel for warranty_registrations.
 *
 * Purpose:
 *   Find rows where dealer_match_status='matched' but dealer_account_id or
 *   dealer_account_number is missing, and fill the link using the same alias
 *   table the SharePoint sync uses (dealer_account_aliases) plus an exact
 *   normalized match against dealer_accounts.company_name.
 *
 * Safety rails:
 *   • Dry-run first — never writes without explicit confirmation.
 *   • Writes go through the existing warranty_update_registration RPC, so
 *     every change is captured in warranty_registration_history.
 *   • Never creates dealer_accounts. Never hard-deletes.
 *   • Only timan_backend / timan_service see this panel (caller gates).
 */
import { useState } from "react";
import { Loader2, Link2, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

function normalizeDealer(raw: string): string {
  let n = (raw ?? "").toLowerCase().trim();
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  n = n.replace(/\b(a\/s|aps|ivs|p\/s|i\/s|k\/s|holding|maskiner?|service)\b/g, " ");
  n = n.replace(/&/g, " og ");
  n = n.replace(/[^a-z0-9]+/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

interface Candidate {
  id: string;
  certificate: string;
  dealer_name_snapshot: string;
  current_account_id: string | null;
  current_account_number: string | null;
  target_account_id: string;
  target_account_number: string;
  target_company_name: string;
  via: "alias" | "exact_name";
}

interface MissRow {
  id: string;
  certificate: string;
  dealer_name_snapshot: string;
  reason: string;
}

interface DryRunResult {
  candidates: Candidate[];
  misses: MissRow[];
  scanned: number;
}

export function WarrantyDealerLinkBackfillPanel() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: number; failed: number; errors: string[] } | null>(null);

  async function runDryRun() {
    setRunning(true);
    setError(null);
    setDry(null);
    setApplyResult(null);
    try {
      // 1) Pull matched rows missing link columns.
      const { data: regs, error: regsErr } = await supabase
        .from("warranty_registrations")
        .select("id, sharepoint_form_id, sharepoint_item_id, dealer_name_snapshot, dealer_account_id, dealer_account_number, dealer_match_status, is_active_in_source")
        .eq("dealer_match_status", "matched")
        .eq("is_active_in_source", true)
        .or("dealer_account_id.is.null,dealer_account_number.is.null")
        .limit(5000);
      if (regsErr) throw regsErr;

      // 2) Pull dealer_accounts (active only).
      const { data: dealers, error: dealersErr } = await supabase
        .from("dealer_accounts")
        .select("id, account_number, company_name, is_deleted, is_blocked")
        .or("is_deleted.is.null,is_deleted.eq.false");
      if (dealersErr) throw dealersErr;

      // 3) Pull aliases (RLS allows backend/service).
      const { data: aliases, error: aliasErr } = await supabase
        .from("dealer_account_aliases")
        .select("normalized_alias, dealer_account_id, dealer_account_number");
      if (aliasErr) throw aliasErr;

      const dealerById = new Map<string, { id: string; account_number: string; company_name: string }>();
      const dealerByNorm = new Map<string, { id: string; account_number: string; company_name: string }>();
      for (const d of dealers ?? []) {
        if (!d.account_number) continue;
        dealerById.set(String(d.id), { id: String(d.id), account_number: String(d.account_number), company_name: String(d.company_name ?? "") });
        const norm = normalizeDealer(String(d.company_name ?? ""));
        if (norm && !dealerByNorm.has(norm)) {
          dealerByNorm.set(norm, { id: String(d.id), account_number: String(d.account_number), company_name: String(d.company_name ?? "") });
        }
      }

      const aliasByNorm = new Map<string, { dealer_account_id: string; dealer_account_number: string }>();
      for (const a of aliases ?? []) {
        if (a.normalized_alias && a.dealer_account_id && a.dealer_account_number) {
          aliasByNorm.set(String(a.normalized_alias), {
            dealer_account_id: String(a.dealer_account_id),
            dealer_account_number: String(a.dealer_account_number),
          });
        }
      }

      const candidates: Candidate[] = [];
      const misses: MissRow[] = [];

      for (const r of regs ?? []) {
        const cert = r.sharepoint_form_id != null
          ? `SP-${r.sharepoint_form_id}`
          : r.sharepoint_item_id
            ? `SP-${r.sharepoint_item_id}`
            : String(r.id).slice(0, 8).toUpperCase();
        const snapshot = String(r.dealer_name_snapshot ?? "");
        const norm = normalizeDealer(snapshot);
        if (!norm) {
          misses.push({ id: String(r.id), certificate: cert, dealer_name_snapshot: snapshot, reason: "Mangler dealer_name_snapshot" });
          continue;
        }
        const aliasHit = aliasByNorm.get(norm);
        if (aliasHit) {
          const d = dealerById.get(aliasHit.dealer_account_id);
          if (d) {
            candidates.push({
              id: String(r.id),
              certificate: cert,
              dealer_name_snapshot: snapshot,
              current_account_id: r.dealer_account_id as string | null,
              current_account_number: r.dealer_account_number as string | null,
              target_account_id: d.id,
              target_account_number: d.account_number,
              target_company_name: d.company_name,
              via: "alias",
            });
            continue;
          }
        }
        const exact = dealerByNorm.get(norm);
        if (exact) {
          candidates.push({
            id: String(r.id),
            certificate: cert,
            dealer_name_snapshot: snapshot,
            current_account_id: r.dealer_account_id as string | null,
            current_account_number: r.dealer_account_number as string | null,
            target_account_id: exact.id,
            target_account_number: exact.account_number,
            target_company_name: exact.company_name,
            via: "exact_name",
          });
          continue;
        }
        misses.push({ id: String(r.id), certificate: cert, dealer_name_snapshot: snapshot, reason: "Intet alias eller eksakt navnematch" });
      }

      setDry({ candidates, misses, scanned: (regs ?? []).length });
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  async function applyBackfill() {
    if (!dry || dry.candidates.length === 0) return;
    setApplying(true);
    setApplyResult(null);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const c of dry.candidates) {
      const { error: rpcErr } = await supabase.rpc("warranty_update_registration", {
        p_id: c.id,
        p_changes: {
          dealer_account_id: c.target_account_id,
          dealer_account_number: c.target_account_number,
        },
      });
      if (rpcErr) {
        failed += 1;
        if (errors.length < 5) errors.push(`${c.certificate}: ${rpcErr.message}`);
      } else {
        ok += 1;
      }
    }
    setApplying(false);
    setApplyResult({ ok, failed, errors });
    setDry(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700">
            <Link2 className="h-4 w-4" />
            Kobl godkendte warranty matches til dealer_accounts
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Engangsoperation: finder registreringer hvor matchstatus er
            <code className="mx-1 rounded bg-slate-100 px-1">matched</code>
            men hvor <code className="mx-1 rounded bg-slate-100 px-1">dealer_account_id</code>
            eller <code className="mx-1 rounded bg-slate-100 px-1">dealer_account_number</code>
            mangler, og udfylder dem via godkendte aliasser eller eksakt
            navnematch. Skriv går gennem audit-RPC'en, ingen sletning, ingen
            oprettelse af forhandlere.
          </p>
        </div>
        <button
          type="button"
          onClick={runDryRun}
          disabled={running || applying}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Dry-run
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {applyResult && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Check className="mr-1 inline h-3.5 w-3.5" />
          Færdig: {applyResult.ok} koblet, {applyResult.failed} fejlede.
          {applyResult.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {applyResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dry && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-slate-600">
            Scannet {dry.scanned}. Kan kobles: <b>{dry.candidates.length}</b>. Kan ikke kobles: <b>{dry.misses.length}</b>.
          </div>
          {dry.candidates.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Cert</th>
                    <th className="px-3 py-2">SharePoint-navn</th>
                    <th className="px-3 py-2">Forhandler (target)</th>
                    <th className="px-3 py-2">Kontonr.</th>
                    <th className="px-3 py-2">Via</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dry.candidates.slice(0, 100).map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-1.5 font-mono">{c.certificate}</td>
                      <td className="px-3 py-1.5">{c.dealer_name_snapshot}</td>
                      <td className="px-3 py-1.5">{c.target_company_name}</td>
                      <td className="px-3 py-1.5 font-mono">{c.target_account_number}</td>
                      <td className="px-3 py-1.5 text-slate-500">{c.via}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dry.candidates.length > 100 && (
                <div className="border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-500">
                  Viser de første 100 af {dry.candidates.length}.
                </div>
              )}
            </div>
          )}
          {dry.misses.length > 0 && (
            <details className="rounded-lg border border-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-600">
                Vis {dry.misses.length} der ikke kan kobles
              </summary>
              <ul className="max-h-56 overflow-y-auto px-3 py-2 text-xs">
                {dry.misses.slice(0, 200).map((m) => (
                  <li key={m.id} className="py-0.5">
                    <span className="font-mono">{m.certificate}</span> — {m.dealer_name_snapshot || "—"} <span className="text-slate-400">({m.reason})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDry(null)}
              disabled={applying}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Annuller
            </button>
            <button
              type="button"
              onClick={applyBackfill}
              disabled={applying || dry.candidates.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Bekræft og udfør ({dry.candidates.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
