import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RegistryMachineRow } from "@/lib/machineRegistryPageService";
import {
  isPortalWarrantyEligibleMachine,
  resolvePortalWarrantyMachine,
  toPortalWarrantyMachineOption,
} from "@/lib/portalWarrantyMachineSelector";

function machine(overrides: Partial<RegistryMachineRow> = {}): RegistryMachineRow {
  return {
    serial: "411000-04-1577",
    normalizedSerial: "411000041577",
    machineModel: "RC-1000s",
    machineType: "RC-1000s",
    dealerName: "Dealer A",
    dealerNumber: "1001",
    deliveryDate: null,
    operatingHours: null,
    latestActivityDate: null,
    latestActivityLabel: null,
    sources: ["warranty"],
    openTickets: 0,
    openClaims: 0,
    openTsb: 0,
    health: "healthy",
    warrantyId: null,
    warrantyType: "historical",
    ...overrides,
  };
}

describe("portal warranty machine selector", () => {
  it("keeps MO and unregistered machines eligible but excludes approved SP machines", () => {
    expect(isPortalWarrantyEligibleMachine(machine())).toBe(true);
    expect(isPortalWarrantyEligibleMachine(machine({ warrantyId: "SP-222" }))).toBe(false);
  });

  it("resolves a manual serial to the same canonical option as the dropdown", () => {
    const option = toPortalWarrantyMachineOption(machine({ isDemo: true, machineOrderNumber: "MO-1979" }));
    expect(resolvePortalWarrantyMachine("411000 04 1577", [option])).toEqual(option);
    expect(option.isDemo).toBe(true);
    expect(option.machineModel).toBe("RC-1000s");
  });

  it("uses the scoped registry, not a separate machine list", () => {
    const service = readFileSync(resolve(process.cwd(), "src/lib/portalWarrantyMachineSelector.ts"), "utf8");
    expect(service).toContain("fetchMachineRegistryPage");
    expect(service).toContain("allowedDealers: [dealer]");
    expect(service).toContain("dealer,");
    expect(service).toContain("!row.warrantyId");
  });

  it("enforces demo hours, dealer ownership, and approved-SP safety in the submission RPC", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260915095728_warranty_demo_hours_and_scoped_machine_selection.sql"),
      "utf8",
    );
    expect(migration).toContain("demo_hours_at_sale integer");
    expect(migration).toContain("v_existing.is_demo");
    expect(migration).toContain("Demo machine operating hours at sale are required");
    expect(migration).toContain("This serial already has an approved SP warranty");
    expect(migration).toContain("The machine is not available for this dealer");
    expect(migration).toContain("trg_sync_approved_warranty_demo_hours");
  });
});
