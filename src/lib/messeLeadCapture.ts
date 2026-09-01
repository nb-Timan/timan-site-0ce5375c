/**
 * Future lead-capture for Messe (exhibition mode).
 *
 * Architecture-only stub. No UI, no Supabase writes yet. A later phase will
 * wire a popup such as: "Vil du have konfigurationen sendt til din e-mail?"
 */

export interface MesseLeadDraft {
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  country?: string | null;
  machineInterest?: string | null;
  configurationSnapshot?: unknown;
  createdAt?: string;
}

export async function submitMesseLead(draft: MesseLeadDraft): Promise<{ ok: boolean }> {
  // Intentionally a no-op placeholder.
  console.warn('[messeLeadCapture] submitMesseLead not implemented yet', draft);
  return { ok: false };
}
