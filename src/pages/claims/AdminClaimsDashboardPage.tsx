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
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n/translations";

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
  const { uiLanguage } = useLanguage();
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">{t('navDashboard', uiLanguage)}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {t('adminClaimsSubtitle', uiLanguage)}
      </p>
      <LastChangedLine moduleKey="claims" className="mt-2" />
    </div>
  );
}

function DashboardBody() {
  const { uiLanguage } = useLanguage();
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
            {t('claimsActive', uiLanguage)}
          </div>
          <Link
            to="/portal/service/claims?tab=all"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            {t('claimsSeeAllAdmin', uiLanguage)}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {active.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            {t('claimsEmptyAdmin', uiLanguage)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-3">{t('claimsColNumber', uiLanguage)}</th>
                  <th className="px-6 py-3">{t('claimsColWarranty', uiLanguage)}</th>
                  <th className="px-6 py-3">{t('claimsColDealer', uiLanguage)}</th>
                  <th className="px-6 py-3">{t('claimsColCountry', uiLanguage)}</th>
                  <th className="px-6 py-3">{t('claimsColDamageDate', uiLanguage)}</th>
                  <th className="px-6 py-3">{t('claimsColApprovedDate', uiLanguage)}</th>
                  <th className="px-6 py-3 text-right">{t('claimsColTotalPrice', uiLanguage)}</th>
                  <th className="px-6 py-3">{t('claimsColStatus', uiLanguage)}</th>
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
                            {t('claimsGrouped', uiLanguage)}
                          </span>
                        )}
                        {claimNeedsTimanAttention(r) && (
                          <span
                            title={t('claimsPendingComment', uiLanguage)}
                            className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-700"
                          >
                            <MessageSquare className="h-3 w-3" />
                            {t('claimsCommentBadge', uiLanguage)}
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
                        <Eye className="h-3.5 w-3.5" /> {t('open', uiLanguage)}
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

function PendingReviewQueue() {
  const { uiLanguage } = useLanguage();
  const [items, setItems] = useState<ServiceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadPendingReviewClaims();
      setItems(res.claims);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const onApprove = async (id: string) => {
    setApprovingId(id);
    const res = await approveClaim(id);
    setApprovingId(null);
    if (!res.ok) {
      toast.error(res.error || t('claimsApproveFailed', uiLanguage));
      return;
    }
    toast.success(t('claimsApproveSuccess', uiLanguage));
    reload();
  };

  if (!loading && items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
      <div className="flex items-center justify-between border-b border-amber-100 px-6 py-3">
        <div className="text-xs font-black uppercase tracking-widest text-amber-800">
          {t('claimsPendingReview', uiLanguage)} {items.length > 0 && <span className="ml-1 rounded bg-amber-200 px-1.5 py-0.5 text-amber-900">{items.length}</span>}
        </div>
      </div>
      {loading ? (
        <div className="px-6 py-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading', uiLanguage)}
        </div>
      ) : (
        <div className="divide-y divide-amber-100">
          {items.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-black text-slate-700">{c.claim_number}</span>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-800">
                    {claimStatusLabel(c.status)}
                  </span>
                  {c.service_ticket_id && (
                    <Link
                      to={`/portal/service/tickets/${c.service_ticket_id}`}
                      className="text-[10px] font-bold text-slate-500 underline hover:text-slate-800"
                    >
                      {t('claimsFromTicket', uiLanguage)}
                    </Link>
                  )}
                </div>
                <div className="mt-1 truncate text-sm text-slate-700">
                  <span className="font-semibold">{c.dealer_company || "—"}</span>
                  {c.machine_serial && <span className="text-slate-500"> · {c.machine_serial}</span>}
                  {c.customer_name && <span className="text-slate-500"> · {c.customer_name}</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{formatDate(c.created_at)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/portal/service/claims/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" /> {t('open', uiLanguage)}
                </Link>
                <button
                  type="button"
                  onClick={() => onApprove(c.id)}
                  disabled={approvingId === c.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {approvingId === c.id ? t('claimsApproving', uiLanguage) : t('claimsApproveAndOpen', uiLanguage)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
