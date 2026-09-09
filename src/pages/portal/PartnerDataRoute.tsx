import { useSearchParams } from "react-router-dom";

import DealerDataPage from "@/pages/portal/DealerDataPage";
import CrmMyDealersPage from "@/pages/crm/CrmMyDealersPage";

/** Keeps Partnerdata list-first with the established dealer-table presentation. */
export default function PartnerDataRoute() {
  const [searchParams] = useSearchParams();
  return searchParams.get("accountNumber")
    ? <DealerDataPage />
    : <CrmMyDealersPage presentation="partnerdata" />;
}
