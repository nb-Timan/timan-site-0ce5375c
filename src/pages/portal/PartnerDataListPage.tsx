import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Building2, ChevronRight, Users } from "lucide-react";

import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalFooter from "@/components/portal/PortalFooter";
import PortalHeader from "@/components/portal/PortalHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCountry } from "@/lib/formatCountry";
import { listPartnerDataDealers, type PartnerDataScopeSource } from "@/lib/partnerDataScope";
import { derivePortalRole } from "@/lib/portalAccess";
import { resolvePartnerAccountType } from "@/lib/partnerAccountTypes";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import type { DealerAccount } from "@/lib/dealerAccountsService";

const scopeCopy: Record<PartnerDataScopeSource, string> = {
  global: "Alle partnerkonti",
  seller: "Partnerkonti tildelt dig",
  partner: "Dine partnerkonti og samarbejdsrelationer",
  none: "Partnerkonti",
};

function partnerTypeLabel(dealer: DealerAccount): string {
  switch (resolvePartnerAccountType(dealer)) {
    case "dealer": return "Forhandler";
    case "importer": return "Importør";
    case "service_partner": return "Servicepartner";
    case "dealer_customer": return "Forhandlerkunde";
    default: return dealer.customer_type_label || dealer.customer_type || "Partner";
  }
}

export default function PartnerDataListPage() {
  const { appUser, loading, logout } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const role = useMemo(() => derivePortalRole(effectiveUser), [effectiveUser]);
  const [rows, setRows] = useState<DealerAccount[]>([]);
  const [source, setSource] = useState<PartnerDataScopeSource>("none");
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!effectiveUser || !role) {
      setLoadingRows(false);
      return;
    }

    void listPartnerDataDealers(effectiveUser, role).then((result) => {
      if (cancelled) return;
      setRows(result.rows);
      setSource(result.source);
      setError(result.error ?? null);
      setLoadingRows(false);
    });
    return () => { cancelled = true; };
  }, [effectiveUser, role]);

  if (loading) return <div className="min-h-screen bg-gray-50" />;
  if (!appUser) return <Navigate to="/portal" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-8 flex-grow space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Partnerdata</h1>
            <p className="text-sm text-slate-600">{scopeCopy[source]}. Vælg en virksomhed for at se virksomheds- og persondata.</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadingRows && <div className="py-10 text-center text-sm text-slate-500">Indlæser partnerkonti…</div>}
            {!loadingRows && error && <div className="p-5 text-sm text-rose-700">{error}</div>}
            {!loadingRows && !error && rows.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-500">Der er ingen partnerkonti i dit aktuelle scope.</div>
            )}
            {!loadingRows && !error && rows.length > 0 && (
              <div className="divide-y divide-slate-100">
                {rows.map((dealer) => (
                  <Link
                    key={dealer.id}
                    to={`/portal/dealer-data?accountNumber=${encodeURIComponent(dealer.account_number)}`}
                    className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Users className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 truncate">{dealer.company_name}</div>
                      <div className="mt-0.5 text-sm text-slate-500">Konto {dealer.account_number}{dealer.city ? ` · ${dealer.city}` : ""}</div>
                    </div>
                    <Badge variant="secondary" className="hidden sm:inline-flex shrink-0">{partnerTypeLabel(dealer)}</Badge>
                    <span className="hidden md:block min-w-28 text-right text-sm text-slate-500">{formatCountry(dealer.country, language) || "—"}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <PortalFooter language={language} />
    </div>
  );
}
