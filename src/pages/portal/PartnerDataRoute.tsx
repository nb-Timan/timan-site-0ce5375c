import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import DealerDataPage from "@/pages/portal/DealerDataPage";
import CrmMyDealersPage from "@/pages/crm/CrmMyDealersPage";
import { academySandbox } from "@/lib/academySandbox";
import { academyPartnerDataSandbox } from "@/lib/academyPartnerDataSandbox";

/** Keeps Partnerdata list-first with the established dealer-table presentation. */
export default function PartnerDataRoute() {
  const [searchParams] = useSearchParams();
  const accountNumber = searchParams.get("accountNumber");
  const academyPart = searchParams.get("academy_part");

  useEffect(() => {
    if (!accountNumber && academySandbox.isActive()) academySandbox.trackPortalBasicsPartnerData();
    if (academySandbox.isActive() && (academyPart === '1' || (academyPart === '2' && academyPartnerDataSandbox.getProgress().part1Completed))) {
      academyPartnerDataSandbox.start(academyPart === '1' ? 1 : 2);
    }
  }, [accountNumber, academyPart]);

  if (academySandbox.isActive() && academyPart === "2" && !academyPartnerDataSandbox.getProgress().part1Completed) {
    return <Navigate to="/portal/dealer-data?academy_mode=true&academy_part=1" replace />;
  }

  return searchParams.get("accountNumber")
    ? <DealerDataPage />
    : <CrmMyDealersPage presentation="partnerdata" />;
}
