import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync("src/pages/backend/BackendUsersPage.tsx", "utf8");
const serviceSource = readFileSync("src/lib/backendUsersService.ts", "utf8");

describe("Backend user editor organization access", () => {
  it("keeps organization access separate from the portal role", () => {
    expect(editorSource).toContain('<Section title="Organisationsadgang">');
    expect(editorSource).toContain('label="Organisationsadgang"');
    expect(editorSource).toContain('{ value: "", label: "Standard adgang" }');
    expect(editorSource).toContain('{ value: "collaboration_manager", label: "Samarbejdsansvarlig" }');
  });

  it("uses only the canonical collaboration_manager value and preserves module ownership", () => {
    expect(editorSource).toContain('organization_access_role: v === "collaboration_manager" ? "collaboration_manager" : null');
    expect(editorSource).toContain("Rollen giver ikke adgang til andre forhandlere eller ekstra portalmoduler.");
    expect(serviceSource).toContain("organization_access_role: organizationAccessRole");
    expect(serviceSource).toContain("sanitizeAccessForRole");
  });
});
