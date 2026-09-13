import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import DealerDataPage from "@/pages/portal/DealerDataPage";
import CrmMyDealersPage from "@/pages/crm/CrmMyDealersPage";
import AcademyPartnerDataWorkspace, { AcademyPortalBasicsPartnerDataPreview } from "@/pages/portal/AcademyPartnerDataWorkspace";
import { academySandbox } from "@/lib/academySandbox";
import { academyPartnerDataSandbox } from "@/lib/academyPartnerDataSandbox";

/** Keeps Partnerdata list-first with the established dealer-table presentation. */
export default function PartnerDataRoute() {
  const [searchParams] = useSearchParams();
  const accountNumber = searchParams.get("accountNumber");
  const academyPart = searchParams.get("academy_part");

  useEffect(() => {
    if (!accountNumber && academySandbox.isActive()) academySandbox.trackPortalBasicsPartnerData();
  }, [accountNumber]);

  if (academySandbox.isActive() && academyPart === "1") return <AcademyPartnerDataWorkspace part={1} />;
  if (academySandbox.isActive() && academyPart === "2" && !academyPartnerDataSandbox.getProgress().part1Completed) {
    return <Navigate to="/portal/dealer-data?academy_mode=true&academy_part=1" replace />;
  }
  if (academySandbox.isActive() && academyPart === "2") return <AcademyPartnerDataWorkspace part={2} />;
  if (academySandbox.isActive() && !accountNumber) return <AcademyPortalBasicsPartnerDataPreview />;

  return searchParams.get("accountNumber")
    ? <DealerDataPage />
    : <CrmMyDealersPage presentation="partnerdata" />;
}
