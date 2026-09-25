import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CRM_LEAD_MACHINE_FAMILIES,
  getCrmLeadEquipmentOptions,
  matchesCrmLeadEquipmentFilter,
  matchesCrmLeadMachineFilter,
  resolveCrmLeadMachineFamilies,
} from '@/lib/crmLeadMachineFilter';

describe('CRM lead canonical machine filtering', () => {
  it('exposes only the canonical machine options in the required order', () => {
    expect(CRM_LEAD_MACHINE_FAMILIES).toEqual([
      'RC-751', 'RC-1000s', 'Timan 2620', 'Timan 3330',
      'CS-200 til traktor', 'Loader-Line', 'Kun redskab',
    ]);
  });

  it.each(['RC-1000', 'RC1000', 'RC-1000s', 'RC-1000S'])(
    'normalizes %s to RC-1000s',
    (value) => expect(resolveCrmLeadMachineFamilies(value)).toEqual(['RC-1000s']),
  );

  it('matches every canonical family in a multi-machine lead', () => {
    const value = 'RC-1000s, Timan 3330, Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt';
    expect(matchesCrmLeadMachineFilter(value, null, 'RC-1000s')).toBe(true);
    expect(matchesCrmLeadMachineFilter(value, null, 'Timan 3330')).toBe(true);
  });

  it('keeps RC-1000s plus equipment in the RC family rather than equipment-only', () => {
    const value = 'RC-1000s, Equipment: RC-1000s - Stubfræser m/hydraulisk sving';
    expect(resolveCrmLeadMachineFamilies(value)).toEqual(['RC-1000s']);
    expect(matchesCrmLeadMachineFilter(value, null, 'Kun redskab')).toBe(false);
  });

  it.each(['Equipment', 'Stump grinder', 'Cutter bar - RC-1000s', 'Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt'])(
    'classifies attachment-only value %s as equipment-only',
    (value) => expect(resolveCrmLeadMachineFamilies(value)).toEqual(['Kun redskab']),
  );

  it('matches only verified tractor-specific CS-200 contexts', () => {
    expect(resolveCrmLeadMachineFamilies('CS-200 Tractor')).toEqual(['CS-200 til traktor']);
    expect(resolveCrmLeadMachineFamilies('Equipment: Loader line / Tractor Equipment - Tractor - CS-200 Combi, El. reg.')).toEqual(['CS-200 til traktor']);
    expect(resolveCrmLeadMachineFamilies('Timan 3330, Equipment: Timan 3330 - CS-200 Combi')).toEqual(['Timan 3330']);
  });

  it.each(['Loader line / Tractor Equipment', 'Full Line', 'Tool-Trac 5740', 'Third-Party Equipment'])(
    'normalizes verified Loader-Line alias %s',
    (value) => expect(resolveCrmLeadMachineFamilies(value)).toEqual(['Loader-Line']),
  );

  it('keeps equipment out of machine options and available to the equipment filter', () => {
    const raw = [
      'RC-1000s, Timan 3330, Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt',
      'Stump grinder',
      'Full Line',
    ];
    const options = getCrmLeadEquipmentOptions(raw, []);
    expect(options).toContain('Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt');
    expect(options).toContain('Stump grinder');
    expect(options).not.toContain('RC-1000s');
    expect(options).not.toContain('Full Line');
  });

  it('combines machine and equipment matching with AND semantics', () => {
    const value = 'RC-1000s, Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt';
    const equipment = 'Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt';
    expect(matchesCrmLeadMachineFilter(value, null, 'RC-1000s') && matchesCrmLeadEquipmentFilter(value, null, equipment)).toBe(true);
    expect(matchesCrmLeadMachineFilter(value, null, 'Timan 3330') && matchesCrmLeadEquipmentFilter(value, null, equipment)).toBe(false);
  });

  it('uses the canonical resolver in both the production query and Academy repository', () => {
    const page = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
    const academy = readFileSync('src/lib/academyCrmSandbox.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260925133012_canonical_crm_lead_machine_filter.sql', 'utf8');
    expect(page).toContain('CRM_LEAD_MACHINE_FAMILIES');
    expect(academy).toContain('matchesCrmLeadMachineFilter');
    expect(migration).toContain('crm_lead_machine_families(r.machine, r.equipment)');
    expect(migration).toContain('crm_lead_equipment_values(r.machine, r.equipment)');
  });

  it('keeps the master reset wired to the machine and equipment filters', () => {
    const page = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
    const reset = page.slice(page.indexOf('const resetAllLeadFilters'), page.indexOf('const selectLeadTab'));
    expect(reset).toContain("setMachineFilter('')");
    expect(reset).toContain("setEquipmentFilter('')");
  });
});
