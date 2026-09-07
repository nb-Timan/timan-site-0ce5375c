import { describe, expect, it } from "vitest";
import { resolveMachineHealth } from "@/lib/machineHealth";

const healthy = {
  openClaims: 0, pendingTsb: 0, openTickets: 0, serviceDays: 20,
  hasHoursRegression: false, hasImporter: true, hasServicePartner: true,
};

describe("resolveMachineHealth", () => {
  it.each([
    ["open claim", { openClaims: 1 }],
    ["pending TSB", { pendingTsb: 1 }],
    ["overdue service", { serviceDays: 366 }],
    ["operating-hours conflict", { hasHoursRegression: true }],
  ])("marks %s critical", (_name, change) => {
    expect(resolveMachineHealth({ ...healthy, ...change }).level).toBe("critical");
  });

  it.each([
    ["open ticket", { openTickets: 1 }],
    ["service approaching", { serviceDays: 301 }],
    ["missing importer", { hasImporter: false }],
    ["missing service partner", { hasServicePartner: false }],
  ])("marks %s needs attention", (_name, change) => {
    expect(resolveMachineHealth({ ...healthy, ...change }).level).toBe("needs_attention");
  });

  it("is healthy only when no rule applies", () => {
    expect(resolveMachineHealth(healthy).level).toBe("healthy");
  });

  it("gives critical precedence over an attention condition", () => {
    expect(resolveMachineHealth({ ...healthy, openClaims: 1, openTickets: 1 }).level).toBe("critical");
  });
});
