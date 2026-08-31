import { beforeEach, describe, expect, it, vi } from "vitest";

const queriedEmails = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, email: string) {
              return {
                async maybeSingle() {
                  queriedEmails.push(`${table}:${email}`);
                  const local = email.split("@")[0] || "unknown";
                  return { data: { id: `user-${local}` }, error: null };
                },
              };
            },
          };
        },
      };
    },
  },
}));

import { setActiveMode } from "@/lib/activeMode";
import { resolveEffectiveCrmSellerScope } from "@/lib/resolveSellerId";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

describe("resolveEffectiveCrmSellerScope", () => {
  beforeEach(() => {
    queriedEmails.length = 0;
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("CustomEvent", class {
      constructor(public type: string, public init?: CustomEventInit) {}
    });
  });

  it("uses the same EM seller scope for real login and backend view-as", async () => {
    setActiveMode("nb@timan.dk", "EM");

    const backendViewingAsEm = await resolveEffectiveCrmSellerScope({ email: "nb@timan.dk" });
    const realEsbenLogin = await resolveEffectiveCrmSellerScope({ email: "em@timan.dk" });

    expect(backendViewingAsEm).toEqual(realEsbenLogin);
    expect(backendViewingAsEm).toEqual({
      ownerUserId: "user-em",
      ownerEmail: "em@timan.dk",
    });
    expect(queriedEmails).toContain("app_users:em@timan.dk");
    expect(queriedEmails).not.toContain("app_users:nb@timan.dk");
  });

  it("also resolves another seller by the selected seller email, not backend email", async () => {
    setActiveMode("nb@timan.dk", "BP");

    await expect(resolveEffectiveCrmSellerScope({ email: "nb@timan.dk" })).resolves.toEqual({
      ownerUserId: "user-bp",
      ownerEmail: "bp@timan.dk",
    });
  });
});
