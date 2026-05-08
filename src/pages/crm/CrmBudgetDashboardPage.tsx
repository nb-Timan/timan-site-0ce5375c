import { useEffect, useMemo, useState } from "react";
import CrmLayout from "@/components/crm/CrmLayout";
import { useAppUser } from "@/context/AppUserContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin } from "@/lib/crmScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { getEffectiveSellerEmail, getActiveSellerView } from "@/lib/activeMode";
import { availableYears } from "@/lib/crmBudgetService";
import SellerBlock from "@/components/crm/budget-dashboard/SellerBlock";
import CellDetailDialog from "@/components/crm/budget-dashboard/CellDetailDialog";
import {
  useBudgetDashboardData,
  type MachineKey,
  type Quarter,
  type SellerDisplay,
} from "@/components/crm/budget-dashboard/useBudgetDashboardData";

export default function CrmBudgetDashboardPage() {
  const { appUser } = useAppUser();
  const role = appUser ? derivePortalRole(appUser) : null;
  const admin = isCrmAdmin(role);

  const view = appUser ? getActiveSellerView(appUser.email || null) : null;
  const effectiveEmail = appUser ? getEffectiveSellerEmail(appUser) : null;
  const initials = view?.initials || (appUser as { initials?: string | null } | null)?.initials || null;

  const [sellerId, setSellerId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await resolveSellerId(effectiveEmail);
      if (!cancelled) setSellerId(id);
    })();
    return () => { cancelled = true; };
  }, [effectiveEmail]);

  const years = useMemo(() => availableYears(), []);
  const [year, setYear] = useState<number>(() => {
    const cur = new Date().getFullYear();
    return years.includes(cur) ? cur : years[0];
  });

  const { data, loading, error, sellers } = useBudgetDashboardData({
    year,
    role,
    sellerId,
    sellerEmail: effectiveEmail,
    sellerInitials: initials,
    showAllSellers: admin,
  });

  const [openCell, setOpenCell] = useState<{
    seller: SellerDisplay;
    dealerKey: string;
    quarter: Quarter;
    machine: MachineKey;
  } | null>(null);
  const items = openCell
    ? data[openCell.seller.email]?.cells?.[openCell.dealerKey]?.[openCell.quarter]?.[openCell.machine]?.items ?? []
    : [];

  return (
    <CrmLayout pageTitle="Budget Dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-slate-600">
            Read-only matrix over budget, ordrer og arbejdsbudget pr. forhandler, kvartal og maskine. Klik en sælger for at åbne.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="bd-year" className="text-sm text-slate-600">År</label>
          <select
            id="bd-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/40"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Indlæser…</div>
      ) : sellers.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">Ingen sælger-blok at vise.</div>
      ) : (
        <div className="space-y-4">
          {sellers.map((s) => {
            const section = data[s.email];
            if (!section) return null;
            return (
              <SellerBlock
                key={s.email}
                seller={s}
                section={section}
                defaultOpen={!admin || sellers.length === 1}
                onCellClick={(dealerKey, quarter, machine) =>
                  setOpenCell({ seller: s, dealerKey, quarter, machine })
                }
              />
            );
          })}
        </div>
      )}

      <CellDetailDialog
        open={!!openCell}
        onClose={() => setOpenCell(null)}
        seller={openCell?.seller || null}
        quarter={openCell?.quarter || null}
        machine={openCell?.machine || null}
        items={items}
      />
    </CrmLayout>
  );
}
