import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261008083347_improve_loan_case_ux_and_history.sql', 'utf8');
const casePage = readFileSync('src/pages/loans/LoanCasePage.tsx', 'utf8');
const overview = readFileSync('src/pages/loans/LoansPage.tsx', 'utf8');
const service = readFileSync('src/lib/loanService.ts', 'utf8');

describe('Loans operational improvements', () => {
  it('allocates immutable U-numbers atomically and backfills existing UUID cases deterministically', () => {
    expect(migration).toContain('create sequence if not exists public.loan_number_seq');
    expect(migration).toContain('start with 6601');
    expect(migration).toContain("'U-' || nextval('public.loan_number_seq')::text");
    expect(migration).toContain('order by created_at, id');
    expect(migration).toContain('loan_cases_loan_number_unique');
    expect(migration).toContain('loan_number_immutable');
    expect(migration).not.toMatch(/max\s*\([^)]*loan_number[^)]*\)\s*\+\s*1/i);
  });

  it('keeps one case with relational child rows for any number of machines and attachments', () => {
    expect(casePage).toContain('items.map((item)');
    expect(casePage).toContain('addFabricLoanAsset(id, asset.asset_id)');
    expect(casePage).toContain('item.item_type === \'machine\'');
    expect(migration).not.toContain('loan_number text not null references');
  });

  it('authorizes quick return edits only for Backend or the assigned responsible user', () => {
    expect(migration).toContain("v_actor.portal_role::text <> 'timan_backend' and v_actor.id <> v_case.responsible_user_id");
    expect(migration).toContain("raise exception 'Expected return update denied'");
    expect(migration).toContain("nullif(btrim(p_note),'') is null");
    expect(migration).toContain("'EXPECTED_RETURN_CHANGED'");
    expect(migration).toContain("'old_value',v_case.expected_return_date");
    expect(migration).toContain("'new_value',p_expected_return_date");
    expect(migration).toContain("'note',btrim(p_note)");
    expect(service).toContain("supabase.rpc('loan_update_expected_return'");
  });

  it('allows only Backend to reopen business-safe pre-handover states', () => {
    expect(migration).toContain('not public.can_administer_loans()');
    expect(migration).toContain("v_status not in ('READY_FOR_REVIEW','AWAITING_ACCEPTANCE','ACCEPTED')");
    expect(migration).toContain("'CASE_REOPENED_FOR_EDIT'");
    expect(casePage).toContain("role === 'timan_backend'");
    expect(casePage).toContain("['READY_FOR_REVIEW','AWAITING_ACCEPTANCE','ACCEPTED']");
  });

  it('records case and item material changes with actor, field, old and new values', () => {
    expect(migration).toContain('public.loan_record_field_change');
    expect(migration).toContain("'field',p_field_name");
    expect(migration).toContain("'old_value',p_old_value");
    expect(migration).toContain("'new_value',p_new_value");
    expect(migration).toContain("'usage_reading_value'");
    expect(migration).toContain("'dealer_account_id'");
    expect(migration).toContain("'expected_return_date'");
    expect(migration).toContain('order by e.created_at desc,e.id desc');
  });

  it('uses responsive date and overview layouts with exact-field validation', () => {
    expect(casePage).toContain('data-testid="loan-date-row"');
    expect(casePage).toContain('sm:grid-cols-2');
    expect(casePage).toContain('border-red-500 bg-red-50');
    expect(casePage).toContain('border-red-400 bg-red-50');
    expect(overview).toContain('md:hidden');
    expect(overview).toContain('hidden overflow-x-auto');
    expect(overview).toContain('loanDerivedTimingStatus');
  });
});
