/**
 * Dealer Claims — Mine claims (1:1 from old src/routes/dealer.claims.mine.tsx).
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Pencil, PlusCircle, Search } from "lucide-react";
import { ClaimsAdminSidebarLayout } from "@/components/claims/ClaimsAdminSidebarLayout";
import {
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_PILL,
  claimDisplayId,
  getDealerClaims,
  isClaimEditable,
  isClaimGrouped,
  type ClaimStatus,
} from "@/lib/claims-store";
import { formatDate } from "@/lib/format-date";

const STATUS_OPTIONS: { value: "" | ClaimStatus; label: string }[] = [
  { value: "", label: "Alle statusser" },
  { value: "open", label: CLAIM_STATUS_LABEL.open },
  { value: "waiting", label: CLAIM_STATUS_LABEL.waiting },
  { value: "in_progress", label: CLAIM_STATUS_LABEL.in_progress },
  { value: "approved", label: CLAIM_STATUS_LABEL.approved },
  { value: "rejected", label: CLAIM_STATUS_LABEL.rejected },
  { value: "closed", label: CLAIM_STATUS_LABEL.closed },
];

interface Props {
  readOnly?: boolean;
  dealerName: string;
}

export default function DealerClaimsMinePage({ readOnly = false, dealerName }: Props) {
  return (
    <ClaimsAdminSidebarLayout intro={<MineIntro readOnly={readOnly} />}>
      <MineBody dealerName={dealerName} readOnly={readOnly} />
    </ClaimsAdminSidebarLayout>
  );
}

function MineIntro({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Mine claims</h1>
        <p className="mt-1 text-sm text-slate-500">Søg og filtrér i dine reklamationssager.</p>
      </div>
      {!readOnly && (
        <Link
          to="/portal/service/claims/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <PlusCircle className="h-4 w-4" /> Ny claim
        </Link>
      )}
    </div>
  );
}

function MineBody({ dealerName, readOnly }: { dealerName: string; readOnly: boolean }) {
  const records = useMemo(() => getDealerClaims(dealerName), [dealerName]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ClaimStatus>("");
  const [machine, setMachine] = useState("");

  const machines = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => set.add(r.machineType));
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return records.filter((r) => {
      if (status && r.status !== status) return false;
      if (machine && r.machineType !== machine) return false;
      if (!ql) return true;
      return (
        r.id.toLowerCase().includes(ql) ||
        r.title.toLowerCase().includes(ql) ||
        r.customer.toLowerCase().includes(ql) ||
        r.serial.toLowerCase().includes(ql)
      );
    });
  }, [records, q, status, machine]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Søg claim-nr, titel, kunde, serienr …"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | ClaimStatus)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          >
            <option value="">Alle maskintyper</option>
            {machines.map((m) => (
              <option key={m} value={m}>{m}</option>
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
                  <th className="px-6 py-3">Claim</th>
                  <th className="px-6 py-3">Titel</th>
                  <th className="px-6 py-3">Kunde</th>
                  <th className="px-6 py-3">Maskintype</th>
                  <th className="px-6 py-3">Serienr</th>
                  <th className="px-6 py-3">Oprettet</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Handlinger</th>
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
                      </div>
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-900">{r.title}</td>
                    <td className="px-6 py-3">{r.customer}</td>
                    <td className="px-6 py-3">{r.machineType}</td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs">{r.serial}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{formatDate(r.createdAt)}</td>
                    <td className="px-6 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/portal/service/claims/${r.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" /> Åbn
                        </Link>
                        {!readOnly && isClaimEditable(r.status) && (
                          <Link
                            to={`/portal/service/claims/${r.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Rediger
                          </Link>
                        )}
                      </div>
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
