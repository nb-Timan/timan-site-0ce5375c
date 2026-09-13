import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import DealerDataPage from "@/pages/portal/DealerDataPage";
import CrmMyDealersPage from "@/pages/crm/CrmMyDealersPage";
import { academySandbox } from "@/lib/academySandbox";

/** Keeps Partnerdata list-first with the established dealer-table presentation. */
export default function PartnerDataRoute() {
  const [searchParams] = useSearchParams();
  const accountNumber = searchParams.get("accountNumber");

  useEffect(() => {
    if (!accountNumber && academySandbox.isActive()) academySandbox.trackPortalBasicsPartnerData();
  }, [accountNumber]);

  return searchParams.get("accountNumber")
    ? <DealerDataPage />
    : <CrmMyDealersPage presentation="partnerdata" />;
}
