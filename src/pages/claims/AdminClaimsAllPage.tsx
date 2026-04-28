/**
 * Admin Claims — Alle claims (1:1 from old src/routes/admin.claims.all.tsx).
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, MessageSquare, Search } from "lucide-react";
import { ClaimsAdminSidebarLayout } from "@/components/claims/ClaimsAdminSidebarLayout";
import {
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_PILL,
  claimDisplayId,
  claimNeedsTimanAttention,
  formatDkk,
  getAllClaims,
  isClaimGrouped,
  type ClaimStatus,
} from "@/lib/claims-store";

const STATUS_OPTIONS: { value: "" | ClaimStatus; label: string }[] = [
  { value: "", label: "Alle statusser" },
  { value: "in_progress", label: CLAIM_STATUS_LABEL.in_progress },
  { value: "waiting", label: CLAIM_STATUS_LABEL.waiting },
  { value: "approved", label: CLAIM_STATUS_LABEL.approved },
  { value: "dealer_in_progress", label: CLAIM_STATUS_LABEL.dealer_in_progress },
  { value: "awaiting_timan_close", label: CLAIM_STATUS_LABEL.awaiting_timan_close },
  { value: "awaiting_timan_comment", label: CLAIM_STATUS_LABEL.awaiting_timan_comment },
  { value: "rejected", label: CLAIM_STATUS_LABEL.rejected },
  { value: "closed", label: CLAIM_STATUS_LABEL.closed },
];

export default function AdminClaimsAllPage() {
  return (
    <ClaimsAdminSidebarLayout scope="admin" intro={<Intro />}>
      <Body />
    </ClaimsAdminSidebarLayout>
  );
}

function Intro() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Alle claims</h1>
      <p className="mt-1 text-sm text-slate-500">
        Komplet arkiv over registrerede claims på tværs af forhandlere og statusser.
      </p>
    </div>
  );
}

function Body() {
  const records = useMemo(
    () => [...getAllClaims()].sort((a, b) => b.damageDate.localeCompare(a.damageDate)),
    [],
  );
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ClaimStatus>("");
  const [dealer, setDealer] = useState("");
  const [country, setCountry] = useState("");

  const dealers = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => set.add(r.dealer));
    return Array.from(set).sort();
  }, [records]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => set.add(r.country));
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return records.filter((r) => {
      if (status && r.status !== status) return false;
      if (dealer && r.dealer !== dealer) return false;
      if (country && r.country !== country) return false;
      if (!ql) return true;
      return (
        r.id.toLowerCase().includes(ql) ||
        r.warrantyNo.toLowerCase().includes(ql) ||
        r.dealer.toLowerCase().includes(ql) ||
        r.customer.toLowerCase().includes(ql) ||
        r.serial.toLowerCase().includes(ql)
      );
    });
  }, [records, q, status, dealer, country]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Søg claim-nr, garantinr, kunde, serienr …"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <select
            value={dealer}
            onChange={(e) => setDealer(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          >
            <option value="">Alle forhandlere</option>
            {dealers.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          >
            <option value="">Alle lande</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | ClaimStatus)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
          {filtered.length} af {records.length} claims
        </div>
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Ingen claims matcher din søgning.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-3">Claim nr.</th>
                  <th className="px-6 py-3">Garantinr.</th>
                  <th className="px-6 py-3">Forhandler</th>
                  <th className="px-6 py-3">Land</th>
                  <th className="px-6 py-3">Skadedato</th>
                  <th className="px-6 py-3">Godkendt dato</th>
                  <th className="px-6 py-3 text-right">Samlet pris</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs font-black text-slate-700">
                      <div className="flex items-center gap-2">
                        <span>{claimDisplayId(r)}</span>
                        {isClaimGrouped(r) && (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                            Samlet sag
                          </span>
                        )}
                        {claimNeedsTimanAttention(r) && (
                          <span
                            title="Forhandler-kommentar afventer Timan"
                            className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-700"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Kommentar
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-slate-600">{r.warrantyNo}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{r.dealer}</td>
                    <td className="px-6 py-3">{r.country}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{r.damageDate}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{r.approvedDate ?? "—"}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right font-mono text-xs">{formatDkk(r.totalPrice)}</td>
                    <td className="px-6 py-3"><StatusPill status={r.status} /></td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      <Link
                        to={`/portal/service/claims/${r.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        <Eye className="h-3.5 w-3.5" /> Åbn
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ClaimStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${CLAIM_STATUS_PILL[status]}`}>
      {CLAIM_STATUS_LABEL[status]}
    </span>
  );
}
