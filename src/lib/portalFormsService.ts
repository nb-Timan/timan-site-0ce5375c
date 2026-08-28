// Phase 49 — Portal form submissions service.
// Insert + read access for public.portal_form_submissions (RLS-enforced).

import { supabase } from '@/lib/supabase';

export type PortalFormType =
  | 'budget_feedback'
  | 'dealer_invoice_accept'
  | 'company_contact_info';

export interface PortalFormSubmissionInput {
  form_type: PortalFormType;
  dealer_account_number: string | null;
  dealer_name?: string | null;
  payload: Record<string, unknown>;
}

export interface PortalFormSubmission {
  id: string;
  created_at: string;
  form_type: PortalFormType;
  dealer_account_number: string | null;
  dealer_name: string | null;
  submitted_by_user_id: string | null;
  submitted_by_email: string | null;
  payload: Record<string, unknown>;
}

/**
 * Resolve the caller's internal app_users.id (PK referenced by
 * portal_form_submissions.submitted_by_user_id) from the current
 * auth session. Returns null if not signed in or no row matches.
 */
async function resolveAppUserId(): Promise<{ id: string | null; email: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email ?? null;
  const authId = auth.user?.id ?? null;
  if (!authId) return { id: null, email };

  const { data, error } = await supabase
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authId)
    .maybeSingle();

  if (error) {
    // Not fatal — RLS will still validate; we just won't tag the row with id.
    return { id: null, email };
  }
  return { id: (data?.id as string | undefined) ?? null, email };
}

export async function submitPortalForm(
  input: PortalFormSubmissionInput,
): Promise<PortalFormSubmission> {
  const { id: appUserId, email } = await resolveAppUserId();

  const row = {
    form_type: input.form_type,
    dealer_account_number: input.dealer_account_number,
    dealer_name: input.dealer_name ?? null,
    submitted_by_user_id: appUserId,
    submitted_by_email: email,
    payload: input.payload,
  };

  const { data, error } = await supabase
    .from('portal_form_submissions')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return data as PortalFormSubmission;
}

export async function listPortalFormSubmissions(opts?: {
  formType?: PortalFormType;
  dealerAccountNumber?: string | null;
  limit?: number;
}): Promise<PortalFormSubmission[]> {
  let q = supabase
    .from('portal_form_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.formType) q = q.eq('form_type', opts.formType);
  if (opts?.dealerAccountNumber) q = q.eq('dealer_account_number', opts.dealerAccountNumber);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PortalFormSubmission[];
}
