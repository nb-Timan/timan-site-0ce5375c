import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasAreaAccess, type PortalAccessUser } from '@/lib/portalAccess';
import { sanitizeAccessForRole } from '@/lib/backendUsersService';
import type { BackendUser } from '@/lib/backend-users-store';
import { PORTAL_AREA_ROUTES } from '@/lib/portalNavigation';
import { LOAN_TRANSLATIONS } from '@/lib/i18n/loanTranslations';
import { t } from '@/lib/i18n/translations';
import { canAddLoanPhoto, loanChangeRequiresNewAcceptance, loanDerivedTimingStatus } from '@/lib/loanDomain';
import { getPortalBackTarget } from '@/lib/portalBackNav';
import { findPortalCapabilityContract } from '../../supabase/functions/_shared/portalCapabilityContract';
import { SALES_CARD_ORDER } from '@/lib/portalAreas';

const migration = readFileSync('supabase/migrations/20261006130704_loans_phase1_foundation.sql', 'utf8');

const baseUser: PortalAccessUser = {
  role: 'timan_saelger', partner_type: null, portal_role: 'timan_backend', approved: true, is_active: true,
};

describe('Loans Phase 1 capability and domain', () => {
  it('is opt-in for Backend, Seller, Service, Dealer and Servicepartner only', () => {
    for (const role of ['timan_backend', 'timan_seller', 'timan_service', 'timan_dealer', 'timan_service_partner'] as const) {
      expect(hasAreaAccess({ ...baseUser, portal_role: role }, 'loans')).toBe(false);
      expect(hasAreaAccess({ ...baseUser, portal_role: role, allowed_areas: ['loans'] }, 'loans')).toBe(true);
    }
    for (const role of ['timan_importer', 'dealer_customer', 'dealer_user', 'private_end_user'] as const) {
      expect(hasAreaAccess({ ...baseUser, portal_role: role, allowed_areas: ['loans'] }, 'loans')).toBe(false);
    }
  });

  it('uses the shared route contract without adding Loans to role defaults', () => {
    expect(PORTAL_AREA_ROUTES.loans).toBe('/portal/loans');
    expect(findPortalCapabilityContract('area.loans')?.access).toEqual({ kind: 'area', key: 'loans' });
  });

  it('nests Loans navigation under Sales without changing Loans routes', () => {
    expect(getPortalBackTarget('/portal/loans')).toBe('/portal/salg-marketing');
    expect(getPortalBackTarget('/portal/loans/new')).toBe('/portal/salg-marketing');
    expect(getPortalBackTarget('/portal/loans/case-1/accept')).toBe('/portal/salg-marketing');

    const portalHome = readFileSync('src/pages/PortalPage.tsx', 'utf8');
    const salesArea = readFileSync('src/pages/PortalAreaPage.tsx', 'utf8');
    const loanShell = readFileSync('src/pages/loans/LoanShell.tsx', 'utf8');

    expect(portalHome).toContain(".filter((area) => area.id !== 'loans')");
    expect(salesArea).toContain("return hasAreaAccess(effectiveUser, 'loans')");
    expect(salesArea).toContain('to={PORTAL_AREA_ROUTES.loans}');
    expect(loanShell).toContain('to={PORTAL_AREA_ROUTES.salg_marketing}');
  });

  it('keeps the canonical Sales cards in the intended source order', () => {
    expect(SALES_CARD_ORDER).toEqual([
      'configurator',
      'videos',
      'loans',
      'resources',
      'misc',
      'contracts',
    ]);
  });

  it('strips forged Loans access from unsupported external roles', () => {
    const draft = { role: 'timan_importer', allowed_areas: ['loans', 'dealer_data'], allowed_modules: [], backend_modules: [] } as unknown as BackendUser;
    expect(sanitizeAccessForRole(draft).allowed_areas).toEqual(['dealer_data']);
    expect(sanitizeAccessForRole({ ...draft, role: 'timan_dealer' }).allowed_areas).toContain('loans');
  });

  it('keeps due states derived and requires reacceptance after a draft', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    expect(loanDerivedTimingStatus('ON_LOAN', '2026-10-05', now)).toBe('OVERDUE');
    expect(loanDerivedTimingStatus('ACCEPTED', '2026-10-10', now)).toBe('DUE_SOON');
    expect(loanDerivedTimingStatus('DRAFT', '2026-10-05', now)).toBeNull();
    expect(loanChangeRequiresNewAcceptance('DRAFT')).toBe(false);
    expect(loanChangeRequiresNewAcceptance('ACCEPTED')).toBe(true);
    expect(canAddLoanPhoto(1)).toBe(true);
    expect(canAddLoanPhoto(2)).toBe(false);
  });

  it('has non-empty Loans UI labels for all nine portal languages', () => {
    expect(Object.keys(LOAN_TRANSLATIONS).sort()).toEqual(['cs', 'da', 'de', 'en', 'fr', 'hu', 'it', 'pl', 'sv']);
    const keys = Object.keys(LOAN_TRANSLATIONS.da).sort();
    for (const dictionary of Object.values(LOAN_TRANSLATIONS)) {
      expect(Object.keys(dictionary).sort()).toEqual(keys);
      expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it('keeps localized Loans labels after the English fallback is merged', () => {
    expect(t('area_loans_title', 'de')).toBe('Leihmaschinen von Timan');
    expect(t('area_loans_title', 'sv')).toBe('Lån av maskiner från Timan');
    expect(t('area_loans_title', 'cs')).toBe('Zápůjčky strojů Timan');
  });
});

describe('Loans additive migration safety', () => {
  it('creates the required normalized Phase 1 tables', () => {
    for (const table of ['loan_cases','loan_case_items','loan_asset_allocations','loan_case_versions','loan_case_version_items',
      'loan_term_versions','loan_term_translations','loan_acceptances','loan_return_inspections','loan_return_item_inspections',
      'loan_deviations','loan_case_events']) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
  });

  it('uses canonical IDs and narrow seller, partner, contact and machine RPCs', () => {
    expect(migration).toContain('responsible_user_id uuid not null references public.app_users(id)');
    expect(migration).toContain('dealer_account_id uuid not null references public.dealer_accounts(id)');
    expect(migration).toContain('dealer_contact_id uuid not null references public.dealer_contacts(id)');
    expect(migration).toContain('d.assigned_seller_id = p_seller_id');
    expect(migration).toContain('c.dealer_account_id = p_dealer_account_id');
    expect(migration).not.toMatch(/customer_name\s*=|company_name\s*=/);
    expect(migration).toContain("a.portal_role::text in ('timan_backend','timan_seller','timan_service')");
    expect(migration).toContain("then raise exception 'Loan case creation denied'");
  });

  it('does not mark any existing Planning unit eligible or fabricate warehouse/equipment data', () => {
    expect(migration).toContain('loan_eligible boolean not null default false');
    expect(migration).not.toMatch(/update\s+public\.planning_supply_units[\s\S]*loan_eligible\s*=\s*true/i);
    expect(migration).not.toContain("'Lager 2'");
    expect(migration).not.toContain("'Lager 4'");
    expect(migration).toContain("item_type in ('machine','equipment')");
  });

  it('keeps version snapshots and audit events append-only for clients', () => {
    expect(migration).toContain('unique (case_id, version_number)');
    expect(migration).toContain('revoke insert, update, delete, truncate on public.loan_case_versions');
    expect(migration).toContain('public.loan_case_events from authenticated, anon');
    expect(migration).not.toContain('create policy loan_events_update');
    expect(migration).toContain('public.loan_can_accept_case(p_case_id)');
    expect(migration).toContain('Current approved terms and version are required');
    expect(migration).toContain("p.photo_kind = 'serial_plate'");
  });

  it('uses a private scoped bucket with two-photo enforcement', () => {
    expect(migration).toContain("values('loan-case-media','loan-case-media',false");
    expect(migration).toContain('public.loan_can_view_case(public.loan_storage_case_id(name))');
    expect(migration).toContain('public.loan_can_manage_case(public.loan_storage_case_id(name))');
    expect(migration).toContain('Maximum two photos per loan item');
    expect(migration).toContain("photo_kind in ('serial_plate','overview')");
  });
});
