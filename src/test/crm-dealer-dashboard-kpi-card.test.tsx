import { cleanup, render, screen } from "@testing-library/react";
import { Truck, Trophy } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { DealerDashboardKpiCard } from "@/components/crm/DealerDashboardKpiCard";
import { t } from "@/lib/i18n/translations";
import type { PortalUiLanguage } from "@/lib/portalLanguages";

const languages: PortalUiLanguage[] = ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"];
const labels = ["TotalRevenue", "OrderCount", "MachinesSold", "AverageDiscount", "ExtraDiscountTotal", "PaymentDeliveryDiscount", "TopCountry", "TopDealer"];

afterEach(cleanup);

describe("dealer dashboard shared KPI cards", () => {
  it.each(languages)("renders all eight translated labels and unchanged values in %s", (language) => {
    render(<>{labels.map((key) => (
      <DealerDashboardKpiCard key={key} icon={Truck} label={t(`crmDealerDash${key}`, language)} value="102.622 kr." note="Frozen order snapshot" />
    ))}</>);

    expect(screen.getAllByTestId("dealer-dashboard-kpi")).toHaveLength(8);
    for (const key of labels) {
      expect(screen.getByRole("heading", { name: t(`crmDealerDash${key}`, language) })).toBeInTheDocument();
    }
    expect(screen.getAllByText("102.622 kr.")).toHaveLength(8);
    expect(screen.getAllByText("Frozen order snapshot")).toHaveLength(8);
  });

  it("keeps long dealer names complete with controlled text-value typography", () => {
    const dealer = "H.Tiedemann Wersvertretungen Kommunaltechnik";
    render(<DealerDashboardKpiCard icon={Trophy} label="Top forhandler" value={dealer} note="102.622 kr." valueStyle="text" />);
    const value = screen.getByTestId("dealer-dashboard-kpi-value");
    expect(value).toHaveTextContent(dealer);
    expect(value).toHaveClass("text-lg", "leading-6", "[overflow-wrap:anywhere]");
    expect(value).not.toHaveClass("truncate", "line-clamp-2", "overflow-hidden");
    expect(screen.getByTestId("dealer-dashboard-kpi-header")).toHaveClass("items-center", "min-w-0");
  });

  it("preserves zero and unavailable discount presentation without deriving values", () => {
    render(<>
      <DealerDashboardKpiCard icon={Truck} label="Discount" value="0 kr." note="DKK" tone="amber" />
      <DealerDashboardKpiCard icon={Truck} label="Legacy discount" value="Unavailable" note="Historical components missing" />
    </>);
    expect(screen.getByText("0 kr.")).toHaveClass("tabular-nums");
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Historical components missing")).toBeInTheDocument();
    expect(screen.getAllByTestId("dealer-dashboard-kpi")[0]).toHaveClass("h-full", "min-w-0", "rounded-lg", "p-4");
  });
});
