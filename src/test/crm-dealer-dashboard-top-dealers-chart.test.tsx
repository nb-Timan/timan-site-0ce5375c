import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DealerBarShape } from "@/components/crm/TopDealersBarShape";

describe("CRM dealer dashboard Top 10 chart", () => {
  it("keeps short dealer names intact and truncates long names inside the available track", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <DealerBarShape
          width={150}
          height={18}
          value={100}
          payload={{ name: "H. Tiedemann Wersvertretungen Kommunaltechnik", value: 100 }}
          background={{ width: 150 }}
          valueFormatter={(value) => `${value} DKK`}
        />
      </svg>,
    );

    expect(markup).toContain("…</text>");
    expect(markup).toContain('aria-label="H. Tiedemann Wersvertretungen Kommunaltechnik: 100 DKK"');
  });

  it("renders a label-safe track while preserving the actual value-bar width", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <DealerBarShape
          x={0}
          y={0}
          width={14}
          height={18}
          value={75}
          payload={{ name: "Tiefel Garten + Forstgeräte GmbH", value: 75 }}
          background={{ width: 280 }}
          valueFormatter={(value) => `${value} DKK`}
        />
      </svg>,
    );

    expect(markup).toContain('width="280"');
    expect(markup).toContain('width="14"');
    expect(markup).toContain('aria-label="Tiefel Garten + Forstgeräte GmbH: 75 DKK"');
    expect(markup).toContain("Tiefel Garten + Forstgeräte GmbH");
  });
});
