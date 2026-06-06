/**
 * Dealer Claims — Dashboard.
 * Local claims-store powers the existing KPIs + "Seneste claims" list.
 * Supabase-backed `service_claims` powers the new "Mine claim-ansøgninger"
 * section (dealer-side ticket→claim requests awaiting service approval),
 * scoped by dealer_company text match.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2, ClipboardList, Eye, Loader2, Pencil, PlusCircle, Wrench, XCircle,
  type LucideIcon,
} from "lucide-react";
import { ClaimsAdminSidebarLayout } from "@/components/claims/ClaimsAdminSidebarLayout";
import LastChangedLine from "@/components/portal/LastChangedLine";
import {
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_PILL,
  claimDisplayId,
  getDealerClaims,
  isClaimEditable,
  isClaimGrouped,
  summarizeDealerClaims,
  type ClaimStatus,
} from "@/lib/claims-store";
import {
  loadClaimsForDealer,
  claimStatusLabel,
  type ServiceClaim,
} from "@/lib/claimsService";
import { formatDate } from "@/lib/format-date";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n/translations";

interface Props {
  /** When true (Dealer User), hides the "Ny claim" / "Rediger" actions. */
  readOnly?: boolean;
  /** Dealer name used to scope claims to the current user's company. */
  dealerName: string;
}

export default function DealerClaimsDashboardPage({ readOnly = false, dealerName }: Props) {
  return (
    <ClaimsAdminSidebarLayout intro={<DashboardIntro readOnly={readOnly} />}>
      <DashboardBody dealerName={dealerName} readOnly={readOnly} />
    </ClaimsAdminSidebarLayout>
  );
}

function DashboardIntro({ readOnly }: { readOnly: boolean }) {
  const { uiLanguage } = useLanguage();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{t('navDashboard', uiLanguage)}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('dealerClaimsSubtitle', uiLanguage)}
        </p>
        <LastChangedLine moduleKey="claims" className="mt-2" />
      </div>
      {!readOnly && (
        <Link
          to="/portal/service/claims/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <PlusCircle className="h-4 w-4" /> {t('claimsNew', uiLanguage)}
        </Link>
      )}
    </div>
  );
}

function DashboardBody({ dealerName, readOnly }: { dealerName: string; readOnly: boolean }) {
  const { uiLanguage } = useLanguage();
  const records = useMemo(() => getDealerClaims(dealerName), [dealerName]);
  const stats = useMemo(() => summarizeDealerClaims(records), [records]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('claimsTotalMine', uiLanguage)} value={stats.total} icon={ClipboardList} accent="text-indigo-600" />
        <Kpi label={t('claimsOpen', uiLanguage)} value={stats.open} icon={Wrench} accent="text-amber-600" />
        <Kpi label={t('claimsApproved', uiLanguage)} value={stats.approved} icon={CheckCircle2} accent="text-emerald-600" />
        <Kpi label={t('claimsRejected', uiLanguage)} value={stats.rejected} icon={XCircle} accent="text-red-600" />
      </div>

      <DealerSupabaseClaims dealerName={dealerName} />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-black">{t('claimsLatest', uiLanguage)}</h2>
          <Link
            to="/portal/service/claims?tab=mine"
            className="text-sm font-bold text-indigo-600 hover:text-indigo-700"
          >
            {t('claimsSeeAll', uiLanguage)}
          </Link>
        </div>
        {stats.latest.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {t('claimsEmptyDealer', uiLanguage)}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {stats.latest.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-black tracking-widest text-slate-500">
                      {claimDisplayId(r)}
                    </span>
                    {isClaimGrouped(r) && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                        {t('claimsGrouped', uiLanguage)}
                      </span>
                    )}
                    <span className="truncate font-bold">{r.title}</span>
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">
                    {r.customer} • {r.machineType} • {r.serial}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <StatusPill status={r.status} />
                    <div className="mt-1 text-xs text-slate-500">{formatDate(r.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/portal/service/claims/${r.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Eye className="h-3.5 w-3.5" /> {t('open', uiLanguage)}
                    </Link>
                    {!readOnly && isClaimEditable(r.status) && (
                      <Link
                        to={`/portal/service/claims/${r.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        <Pencil className="h-3.5 w-3.5" /> {t('claimsActionEdit', uiLanguage)}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: LucideIcon; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
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

function DealerSupabaseClaims({ dealerName }: { dealerName: string }) {
  const { uiLanguage } = useLanguage();
  const [items, setItems] = useState<ServiceClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadClaimsForDealer(dealerName)
      .then((res) => { if (!cancelled) setItems(res.claims); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dealerName]);

  const pending = useMemo(() => items.filter(c => c.status === "pending_service_review"), [items]);
  const otherSupabase = useMemo(() => items.filter(c => c.status !== "pending_service_review"), [items]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('claimsLoadingApplications', uiLanguage)}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
          <div className="border-b border-amber-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-amber-800">
            {t('claimsMyApplicationsPending', uiLanguage)}
          </div>
          <div className="divide-y divide-amber-100">
            {pending.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-700">{c.claim_number}</span>
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-800">
                      {claimStatusLabel(c.status)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-700">
                    {c.machine_serial && <span className="font-mono">{c.machine_serial}</span>}
                    {c.customer_name && <span className="text-slate-500"> · {c.customer_name}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatDate(c.created_at)}</div>
                </div>
                <Link
                  to={`/portal/service/claims/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" /> {t('open', uiLanguage)}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
      {otherSupabase.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
            {t('claimsMyFromTickets', uiLanguage)}
          </div>
          <div className="divide-y divide-slate-100">
            {otherSupabase.slice(0, 5).map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-700">{c.claim_number}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700">
                      {claimStatusLabel(c.status)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-700">
                    {c.machine_serial && <span className="font-mono">{c.machine_serial}</span>}
                    {c.customer_name && <span className="text-slate-500"> · {c.customer_name}</span>}
                  </div>
                </div>
                <Link
                  to={`/portal/service/claims/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" /> {t('open', uiLanguage)}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
