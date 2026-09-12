import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { organizationAccessPatchForRole } from "@/lib/backendUsersService";

const editorSource = readFileSync("src/pages/backend/BackendUsersPage.tsx", "utf8");
const serviceSource = readFileSync("src/lib/backendUsersService.ts", "utf8");
const edgeFunctionSource = readFileSync("supabase/functions/admin-user-actions/index.ts", "utf8");

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
    expect(serviceSource).toContain("organizationAccessPatchForRole");
    expect(serviceSource).toContain("sanitizeAccessForRole");
  });

  it("omits organization access for internal saves and keeps it for eligible external users", () => {
    expect(organizationAccessPatchForRole("timan_backend", "collaboration_manager")).toEqual({});
    expect(organizationAccessPatchForRole("timan_seller", "collaboration_manager")).toEqual({});
    expect(organizationAccessPatchForRole("timan_dealer", "collaboration_manager")).toEqual({
      organization_access_role: "collaboration_manager",
    });
    expect(organizationAccessPatchForRole("timan_dealer", null)).toEqual({
      organization_access_role: null,
    });
  });

  it("does not create a local preview save when Supabase rejects a user update", () => {
    const saveSource = serviceSource.slice(serviceSource.indexOf("export async function saveBackendUser"));
    expect(saveSource).not.toContain("updateFallbackUser(id, draft)");
    expect(saveSource).not.toContain("Ændringen blev gemt lokalt i preview");
  });

  it("keeps the server-side eligibility guard and audit coverage", () => {
    expect(edgeFunctionSource).toContain('"organization_access_role",');
    expect(edgeFunctionSource).toContain('Samarbejdsansvarlig kan kun sættes på eksterne partnerbrugere.');
    expect(edgeFunctionSource).toContain('"organization_access_role" in patch');
  });
});
