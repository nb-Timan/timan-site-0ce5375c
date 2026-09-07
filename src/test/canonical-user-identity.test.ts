import { describe, expect, it } from "vitest";
import { canonicalDisplayName, canonicalInitials } from "@/lib/canonicalUserIdentity";

describe("canonical portal user identity", () => {
  it("prioritizes app_users.display_name over the legacy full_name", () => {
    const row = { email: "sales@timan.dk", display_name: "Tilman Sales", full_name: "Timan Sales", initials: "TS" };
    expect(canonicalDisplayName(row)).toBe("Tilman Sales");
    expect(canonicalInitials(row)).toBe("TS");
  });

  it("uses full_name and email only when the canonical display name is absent", () => {
    expect(canonicalDisplayName({ email: "sales@timan.dk", full_name: "Timan Sales" })).toBe("Timan Sales");
    expect(canonicalDisplayName({ email: "sales@timan.dk" })).toBe("sales");
  });
});
