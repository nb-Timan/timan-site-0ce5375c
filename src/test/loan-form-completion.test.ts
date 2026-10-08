import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLoanPreparationIssues, isLoanDateRangeValid } from '@/lib/loanDomain';
import { LOAN_TRANSLATIONS } from '@/lib/i18n/loanTranslations';

const migration = readFileSync('supabase/migrations/20261006153119_complete_loan_form.sql', 'utf8');
const reviewMigration = readFileSync('supabase/migrations/20261007052127_loan_checkout_review_gate.sql', 'utf8');
const finalMigration = readFileSync('supabase/migrations/20261007190634_finalize_loans_fabric_checkout.sql', 'utf8');
const itemTypeMigration = readFileSync('supabase/migrations/20261008070522_resolve_fabric_loan_item_type.sql', 'utf8');
const page = readFileSync('src/pages/loans/LoanCasePage.tsx', 'utf8');
const service = readFileSync('src/lib/loanService.ts', 'utf8');

describe('complete Loan preparation form', () => {
  it('validates the loan and return date without treating acceptance as checkout', () => {
    expect(isLoanDateRangeValid('2026-10-06', '2026-10-06')).toBe(true);
    expect(isLoanDateRangeValid('2026-10-06', '2026-10-07')).toBe(true);
    expect(isLoanDateRangeValid('2026-10-07', '2026-10-06')).toBe(false);
    expect(migration).toContain('add column if not exists loan_date date');
    expect(migration).toContain('Expected return must be on or after loan date');
    expect(migration).not.toMatch(/loan_date\s*=\s*accepted_at/);
  });

  it('requires machine checkout documentation but no hour meter for equipment', () => {
    const shared = { serial_snapshot: 'SERIAL-1', planning_supply_unit_id: 'unit-1', photoKinds: ['serial_plate'] };
    expect(getLoanPreparationIssues({
      loanDate: '2026-10-06', expectedReturnDate: '2026-10-07', serialNumbersConfirmed: true,
      items: [{ ...shared, item_type: 'machine', usage_reading_value: null, usage_reading_unit: null }],
    })).toEqual(['usage_reading_value', 'usage_reading_unit']);
    expect(getLoanPreparationIssues({
      loanDate: '2026-10-06', expectedReturnDate: '2026-10-07', serialNumbersConfirmed: true,
      items: [{ ...shared, item_type: 'equipment', usage_reading_value: null, usage_reading_unit: null }],
    })).toEqual([]);
    expect(page).toContain("item.item_type === 'machine' && <div");
    expect(page).toContain('<option value="hours">h</option><option value="km">km</option>');
  });

  it('uses canonical serialized Planning inventory and classification', () => {
    expect(migration).toContain('from public.planning_supply_units u');
    expect(migration).toContain('public.planning_machine_products');
    expect(migration).toContain('public.planning_accessory_products');
    expect(migration).toContain('public.list_published_product_master()');
    expect(migration).toContain('u.timan_owned is true');
    expect(migration).toContain('u.loan_eligible is true');
    expect(migration).not.toMatch(/update\s+public\.planning_supply_units[\s\S]*loan_eligible\s*=\s*true/i);
  });

  it('resolves Fabric revision suffixes through one canonical server helper', () => {
    expect(itemTypeMigration).toContain('public.loan_resolve_fabric_item_type');
    expect(itemTypeMigration).toContain("regexp_replace(v_item, '-[0-9]{2}$', '')");
    expect(itemTypeMigration).toContain('public.planning_machine_products');
    expect(itemTypeMigration).toContain('public.planning_accessory_products');
    expect(itemTypeMigration).toContain('public.price_list_published');
    expect(itemTypeMigration.match(/public\.loan_resolve_fabric_item_type\(f\.item_number\)/g)).toHaveLength(2);
  });

  it('keeps one physical asset per item and protects concurrent allocation server-side', () => {
    expect(migration).toContain('insert into public.loan_case_items');
    expect(migration).toContain('insert into public.loan_asset_allocations');
    expect(migration).toContain("raise exception 'Asset is already allocated'");
    expect(migration).toContain('when unique_violation');
  });

  it('uses private scoped Storage with dedicated evidence kinds and replacement/removal', () => {
    expect(migration).toContain("photo_kind in ('serial_plate','hour_meter','overview')");
    expect(finalMigration).toContain("p_photo_kind not in ('serial_plate','overview')");
    expect(finalMigration).toContain('Maximum two photos per loan item');
    expect(migration).toContain('public.loan_can_manage_case(p_case_id)');
    expect(service).toContain("const LOAN_MEDIA_BUCKET = 'loan-case-media'");
    expect(service).toContain("new Set(['image/jpeg', 'image/png', 'image/webp'])");
    expect(service).toContain('10 * 1024 * 1024');
    expect(service).toContain("createSignedUrl(photo.storage_path, 15 * 60)");
    expect(service).toContain("supabase.rpc('loan_remove_item_photo'");
    expect(page).toContain('capture="environment"');
    expect(page).toContain("copy('loansTakePhoto')");
    expect(page).toContain("copy('loansUploadPhoto')");
    expect(page).toContain("copy('loansPhotoUploaded')");
  });

  it('audits the case-wide serial confirmation and gates review server-side', () => {
    expect(migration).toContain('serial_numbers_confirmed_by uuid references public.app_users(id)');
    expect(migration).toContain('serial_numbers_confirmed_at timestamptz');
    expect(migration).toContain("raise exception 'Serial number confirmation is required'");
    expect(migration).toContain("p.photo_kind='serial_plate'");
    expect(reviewMigration).not.toContain("p.photo_kind = 'hour_meter'");
    expect(reviewMigration).toContain("coalesce(i.usage_reading_unit not in ('km','hours'),true)");
    expect(page).toContain("label('loansContinueReview')");
    expect(service).toContain("supabase.rpc('loan_submit_for_review'");
    expect(reviewMigration).toMatch(/status\s*=\s*'READY_FOR_REVIEW'/);
    expect(reviewMigration).toContain("v_case.status <> 'READY_FOR_REVIEW'");
    expect(reviewMigration.match(/p_serial_numbers_confirmed is distinct from true/g)).toHaveLength(2);
    expect(page).not.toContain('createLoanCaseVersion(caseId, true)');
  });

  it('keeps warehouse filters and alternative delivery address in the same form', () => {
    expect(page).toContain('<LoanStockPanel');
    expect(page).not.toContain("label('loansSaveDraftFirst')");
    expect(page).toContain("label('loansAlternativeAddress')");
    expect(page).toContain("label('loansAssets')");
  });

  it('snapshots Fabric context and version history without making order numbers mandatory', () => {
    expect(finalMigration).toContain('fabric_account_number_snapshot');
    expect(finalMigration).toContain('fabric_order_number_snapshot');
    expect(finalMigration).toContain('warehouse_location_code_snapshot');
    expect(finalMigration).toContain('i.fabric_asset_id');
    expect(finalMigration).not.toMatch(/fabric_order_number_snapshot\s+text\s+not null/i);
    expect(page).toContain("item.fabric_account_number_snapshot ?? '—'");
    expect(page).toContain('item.fabric_order_number_snapshot &&');
  });

  it('renders every new label through all nine portal dictionaries', () => {
    const required = ['loansLoanDate','loansAssets','loansHourMeterCheckout','loansHourMeterPhoto','loansTypePlatePhoto',
      'loansSerialConfirmation','loansContinueReview','loansWarehouse2','loansWarehouse4','loansTakePhoto','loansUploadPhoto',
      'loansReplacePhoto','loansRemovePhoto','loansPhotoUploaded'];
    expect(Object.keys(LOAN_TRANSLATIONS).sort()).toEqual(['cs','da','de','en','fr','hu','it','pl','sv']);
    for (const [code, dictionary] of Object.entries(LOAN_TRANSLATIONS)) {
      for (const key of required) expect(dictionary[key]?.trim().length).toBeGreaterThan(0);
      if (code !== 'en') {
        for (const key of required) expect(dictionary[key]).not.toBe(LOAN_TRANSLATIONS.en[key]);
      }
    }
  });
});
