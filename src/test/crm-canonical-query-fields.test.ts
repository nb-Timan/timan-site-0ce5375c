import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("CRM canonical query fields", () => {
  it("filters CRM activities by the canonical assigned owner", () => {
    const source = read("src/lib/crmActivitiesService.ts");
    expect(source).toContain('q.eq("assigned_owner_user_id", opts.ownerUserId)');
    expect(source).not.toContain('q.eq("seller_user_id", opts.ownerUserId)');
  });

  it("uses dealer_number for configurations and the CRM view", () => {
    const crmSource = read("src/lib/crmConfigurationsService.ts");
    const accountSource = read("src/lib/configurationsService.ts");

    expect(crmSource).toContain("return `dealer_number.in.(${list})`;");
    expect(crmSource).not.toContain("dealer_account_number.in.(${list})");
    expect(accountSource).not.toContain("dealer_number.in.(${nums}),dealer_account_number.in.(${nums})");
  });
});
