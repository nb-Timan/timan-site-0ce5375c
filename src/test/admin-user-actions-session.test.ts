import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
    functions: { invoke: mocks.invoke },
  },
}));

import { callAdminUserAction } from "@/lib/adminUserActions";

function session(token: string, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return { access_token: token, expires_at: expiresAt, user: { email: "nb@timan.dk" } };
}

describe("admin-user-actions session flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: session("current-token") }, error: null });
    mocks.invoke.mockResolvedValue({ data: { ok: true, action: "invite" }, error: null });
  });

  it("sends the current authenticated JWT explicitly", async () => {
    await expect(callAdminUserAction("invite", "partner@example.com")).resolves.toMatchObject({ ok: true });

    expect(mocks.invoke).toHaveBeenCalledWith("admin-user-actions", expect.objectContaining({
      headers: { Authorization: "Bearer current-token" },
      body: expect.objectContaining({ action: "invite", email: "partner@example.com" }),
    }));
  });

  it("refreshes a token close to expiry before the first request", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session("near-expiry", Math.floor(Date.now() / 1000) + 5) }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: session("refreshed-token") }, error: null });

    await callAdminUserAction("invite", "partner@example.com");

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("admin-user-actions", expect.objectContaining({
      headers: { Authorization: "Bearer refreshed-token" },
    }));
  });

  it("refreshes once and retries when the function rejects a stale JWT", async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Edge function returned 401", context: new Response(JSON.stringify({ error: "Ugyldig eller udløbet session." }), { status: 401 }) },
      })
      .mockResolvedValueOnce({ data: { ok: true, action: "invite" }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: session("retry-token") }, error: null });

    await expect(callAdminUserAction("invite", "partner@example.com")).resolves.toMatchObject({ ok: true });

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "admin-user-actions", expect.objectContaining({
      headers: { Authorization: "Bearer retry-token" },
    }));
  });

  it("returns a clear re-login message when refresh cannot restore the session", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge function returned 401", context: new Response(null, { status: 401 }) },
    });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("refresh token expired") });

    await expect(callAdminUserAction("invite", "partner@example.com")).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: "Din session er udløbet. Log ind igen for at fortsætte.",
    }));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or retry non-authentication failures", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: "Forbidden", context: new Response(JSON.stringify({ error: "Adgang nægtet." }), { status: 403 }) },
    });

    await expect(callAdminUserAction("invite", "partner@example.com")).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: "Adgang nægtet.",
    }));
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
