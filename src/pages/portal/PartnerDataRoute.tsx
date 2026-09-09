import { useSearchParams } from "react-router-dom";

import DealerDataPage from "@/pages/portal/DealerDataPage";
import PartnerDataListPage from "@/pages/portal/PartnerDataListPage";

/** Keeps Partnerdata list-first while preserving existing detail links. */
export default function PartnerDataRoute() {
  const [searchParams] = useSearchParams();
  return searchParams.get("accountNumber") ? <DealerDataPage /> : <PartnerDataListPage />;
}
