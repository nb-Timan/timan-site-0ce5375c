import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildWarrantyReviewGroups,
  formatWarrantyMatchScore,
  type WarrantyReviewEntry,
} from "@/lib/warrantyDealerReview";

const candidate = (id: string, name: string, score: number) => ({
  dealer_account_id: id,
  company_name: name,
  account_number: id,
  score,
});

describe("warranty dealer review explainability", () => {
  it("preserves exact SharePoint spellings and exposes every affected warranty row", () => {
    const entries: WarrantyReviewEntry[] = [
      {
        sharepoint_item_id: "101",
        dealer_name_snapshot: "Nabert Forst & Gartentechnik",
        source_dealer_name_raw: "Nabert Forst & Gartentechnik",
        normalized_dealer_name: "nabert-forst",
        warranty_row: {
          sharepoint_item_id: "101",
          dealer_name_snapshot: "Nabert Forst & Gartentechnik",
          source_dealer_name_raw: "Nabert Forst & Gartentechnik",
          machine_serial_raw: " RC-001 ",
          machine_serial_number: "RC-001",
          machine_model: "RC-751",
        },
        candidates: [candidate("10952", "Nabert Forst- und Gartentechnik", 0.877)],
      },
      {
        sharepoint_item_id: "102",
        dealer_name_snapshot: "Nabert Forst + Gartentechnik",
        source_dealer_name_raw: "Nabert Forst + Gartentechnik",
        normalized_dealer_name: "nabert-forst",
        warranty_row: {
          sharepoint_item_id: "102",
          dealer_name_snapshot: "Nabert Forst + Gartentechnik",
          source_dealer_name_raw: "Nabert Forst + Gartentechnik",
          machine_serial_raw: "RC-002",
          machine_serial_number: "RC-002",
          machine_model: "RC-1000s",
        },
        candidates: [candidate("10952", "Nabert Forst- und Gartentechnik", 0.926)],
      },
    ];

    const [group] = buildWarrantyReviewGroups(entries, []);

    expect(group.row_count).toBe(2);
    expect(group.rows.map((row) => row.sharepoint_item_id)).toEqual(["101", "102"]);
    expect(group.rows[0].machine_serial_raw).toBe(" RC-001 ");
    expect(group.raw_source_values).toEqual([
      { value: "Nabert Forst & Gartentechnik", count: 1 },
      { value: "Nabert Forst + Gartentechnik", count: 1 },
    ]);
  });

  it("keeps the server-ranked best candidate first without recalculating scores", () => {
    const [group] = buildWarrantyReviewGroups([
      {
        sharepoint_item_id: "201",
        dealer_name_snapshot: "KTB Kommunaltechnik GmbH",
        normalized_dealer_name: "ktb kommunaltechnik gmbh",
        candidates: [
          candidate("11881", "Wilmers Kommunaltechnik GmbH", 0.8),
          candidate("10472", "KTB KommunalTechnik Vertriebs GmbH & Co. KG", 0.708),
        ],
      },
    ], []);

    expect(group.candidates.map((item) => [item.dealer_account_id, item.score])).toEqual([
      ["11881", 0.8],
      ["10472", 0.708],
    ]);
    expect(group.approval_source_name).toBe("KTB Kommunaltechnik GmbH");
    expect(formatWarrantyMatchScore(group.candidates[0].score)).toBe("80,0 %");
  });

  it("separates the source, best proposal, selected match, reason, and row details in the UI", () => {
    const panel = readFileSync("src/components/warranty/WarrantySharePointSyncPanel.tsx", "utf8");

    expect(panel).toContain("Skrevet i SharePoint");
    expect(panel).toContain("Bedste forslag");
    expect(panel).toContain("Valgt match");
    expect(panel).toContain("Årsag: {selectionReason}");
    expect(panel).toContain("Berører {group.row_count} garantiregistreringer");
    expect(panel).toContain("Rå SharePoint-værdi");
    expect(panel).toContain("Matchscore: {formatWarrantyMatchScore(topCandidate.score)}");
  });

  it("keeps approval alias-only and does not create dealer accounts", () => {
    const endpoint = readFileSync("supabase/functions/sharepoint-warranty-approve-alias/index.ts", "utf8");
    const dealerAccountBlock = endpoint.slice(
      endpoint.indexOf('.from("dealer_accounts")'),
      endpoint.indexOf('.from("dealer_account_aliases")'),
    );

    expect(endpoint).toContain('.from("dealer_account_aliases")');
    expect(endpoint).toContain("normalized_alias: normalized");
    expect(dealerAccountBlock).not.toContain(".insert(");
    expect(dealerAccountBlock).not.toContain(".upsert(");
  });

  it("adds explanation data without changing the established matching thresholds", () => {
    const dryRun = readFileSync("supabase/functions/sharepoint-warranty-dryrun/index.ts", "utf8");

    expect(dryRun).toContain("const FUZZY_ACCEPT = 0.8;");
    expect(dryRun).toContain("const MAX_FUZZY_CANDIDATES = 3;");
    expect(dryRun).toContain("normalized_dealer_name: norm");
    expect(dryRun).toContain("warranty_row: reviewRow(m)");
    expect(dryRun).toContain("source_dealer_name_raw: sourceDealerName");
  });
});
