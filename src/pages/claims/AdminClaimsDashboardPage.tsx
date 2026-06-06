/**
 * Admin Claims — Dashboard view.
 * Shown to internal roles: Timan Backend, Timan Service, Timan Sælger.
 * Adds a "Afventer servicegodkendelse" queue for dealer-submitted claim
 * requests sourced from Supabase `service_claims`.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, MessageSquare, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ClaimsAdminSidebarLayout } from "@/components/claims/ClaimsAdminSidebarLayout";
import LastChangedLine from "@/components/portal/LastChangedLine";
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
import {
  approveClaim,
  loadPendingReviewClaims,
  claimStatusLabel,
  type ServiceClaim,
} from "@/lib/claimsService";
import { formatDate } from "@/lib/format-date";

const ACTIVE_STATUSES: ClaimStatus[] = [
  "waiting",
  "approved",
  "dealer_in_progress",
  "awaiting_timan_close",
  "awaiting_timan_comment",
];

export default function AdminClaimsDashboardPage() {
  return (
    <ClaimsAdminSidebarLayout scope="admin" intro={<DashboardIntro />}>
      <DashboardBody />
    </ClaimsAdminSidebarLayout>
  );
}

function DashboardIntro() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Aktuelle claims på tværs af forhandlere — kun aktive sager.
      </p>
      <LastChangedLine moduleKey="claims" className="mt-2" />
    </div>
  );
}

function DashboardBody() {
  const active = useMemo(() => {
    return [...getAllClaims()]
      .filter((r) => ACTIVE_STATUSES.includes(r.status))
      .sort((a, b) => b.damageDate.localeCompare(a.damageDate))
      .slice(0, 8);
  }, []);

  return (
    <div className="space-y-6">
      <PendingReviewQueue />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">
            Aktuelle claims
          </div>
          <Link
            to="/portal/service/claims?tab=all"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            Se alle claims
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {active.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Ingen aktive claims i øjeblikket.
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
                {active.map((r) => (
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
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-slate-600">
                      {r.warrantyNo}
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-900">{r.dealer}</td>
                    <td className="px-6 py-3">{r.country}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{r.damageDate}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{r.approvedDate ?? "—"}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right font-mono text-xs">{formatDkk(r.totalPrice)}</td>
                    <td className="px-6 py-3">
                      <StatusPill status={r.status} />
                    </td>
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
