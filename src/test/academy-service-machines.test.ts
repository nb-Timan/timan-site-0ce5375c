import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAcademyMachines, scopedAcademyMachines, getAcademyMachineJournal, getAcademyMachinePage, canOpenAcademyService } from '@/lib/academyMachineSandbox';
import { ACADEMY_CASE_IDS, getLocalAcademyUser, getAssignedAcademyCurriculum, getAcademyCaseState, canAccessAcademyCase, getAcademyRouteTrack } from '@/lib/academyCurriculum';
import { academySandbox, ACADEMY_MACHINE_TARGET_SERIAL as target, ACADEMY_CASE_COMPLETED } from '@/lib/academySandbox';
import { setAcademyCycleStorageScope } from '@/lib/academyCycleStorage';
import { PORTAL_WARRANTY_MACHINE_TYPES } from '@/lib/portalWarrantyRegistrationForm';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { fetchMachineRegistryPage } from '@/lib/machineRegistryPageService';

const service = () => ({ ...getLocalAcademyUser(), portal_role: 'timan_service', permissions: { academy_track_sales: false, academy_track_service: true } });
const basic = [ACADEMY_CASE_IDS.partnerDataPart1, ACADEMY_CASE_IDS.partnerDataPart2, ACADEMY_CASE_IDS.portalBasics, ACADEMY_CASE_IDS.partnerMap];
const input: Parameters<typeof fetchMachineRegistryPage>[0] = { allowedDealers: null, query: '', dealer: '', model: 'all', warrantyType: 'all', warrantyMatch: 'all', health: 'all', dateFrom: '', dateTo: '', sort: 'serial', direction: 'asc', page: 1, pageSize: 50 };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setAcademyCycleStorageScope('qa-service', 0, 'active', basic); academySandbox.startServiceCase1(); });

describe('Academy deterministic machine adapter', () => {
  it('contains 28 stable synthetic identities and canonical model names', () => {
    const rows = createAcademyMachines();
    expect(rows).toHaveLength(28);
    expect(rows).toEqual(createAcademyMachines());
    expect(new Set(rows.map((row) => row.serial)).size).toBe(28);
    expect(new Set(rows.map((row) => row.machineModel)).size).toBe(4);
    for (const row of rows) {
      expect(row.serial).toMatch(/^ACA-/);
      expect(PORTAL_WARRANTY_MACHINE_TYPES).toContain(row.machineModel);
      for (const id of [row.warrantyId, row.machineOrderNumber, row.erpOrderNumber, row.portalOrderNumber, row.invoiceNumber]) if (id) expect(id).toMatch(/^ACA-/);
      if (row.dealerName) expect(row.dealerName).toMatch(/^Academy /);
    }
    expect(rows.find((row) => row.serial === target)?.machineModel).toBe('RC-1000s');
  });
  it('has varied canonical statuses, hours, missing links and service activity', () => {
    const rows = createAcademyMachines();
    expect(new Set(rows.map((row) => row.health)).size).toBe(3);
    expect(new Set(rows.map((row) => row.warrantyMatchStatus)).size).toBe(3);
    expect(rows.some((row) => !row.dealerNumber)).toBe(true);
    expect(rows.some((row) => !row.latestActivityDate)).toBe(true);
    expect(rows.some((row) => row.warrantyType === 'historical')).toBe(true);
  });
  it('internal service sees 28; effective external users only see their synthetic company', () => {
    expect(scopedAcademyMachines(service())).toHaveLength(28);
    const dealer = { ...service(), portal_role: 'timan_dealer', dealer_number: 'ACADEMY-100' };
    const rows = scopedAcademyMachines(dealer);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(28);
    expect(rows.every((row) => row.dealerNumber === 'ACADEMY-100')).toBe(true);
    expect(new Set(rows.map((row) => row.machineModel)).size).toBe(4);
    const other = { ...dealer, dealer_number: 'ACADEMY-102' };
    expect(getAcademyMachineJournal(other, target, 'da')).toBeNull();
    expect(scopedAcademyMachines(other).every((row) => row.dealerNumber === 'ACADEMY-102')).toBe(true);
    expect(scopedAcademyMachines(null)).toEqual([]);
    expect(scopedAcademyMachines(getLocalAcademyUser())).toEqual([]);
  });
  it('supports search, dealer/model/date/warranty filters and pagination', () => {
    expect(getAcademyMachinePage(service(), input).total).toBe(28);
    expect(getAcademyMachinePage(service(), { ...input, query: 'aca 411000 26 1017' }).rows[0]?.serial).toBe(target);
    expect(getAcademyMachinePage(service(), { ...input, query: 'ACA-MO-1017' }).total).toBe(1);
    expect(getAcademyMachinePage(service(), { ...input, model: 'RC-751', dealer: 'ACADEMY-100' }).rows.every((row) => row.machineModel === 'RC-751' && row.dealerNumber === 'ACADEMY-100')).toBe(true);
    expect(getAcademyMachinePage(service(), { ...input, dateFrom: '2026-01-17', dateTo: '2026-01-17' }).total).toBe(1);
    expect(getAcademyMachinePage(service(), { ...input, warrantyMatch: 'missing_warranty_and_dealer' }).rows.every((row) => !row.dealerNumber)).toBe(true);
    expect(getAcademyMachinePage(service(), { ...input, pageSize: 5, page: 2 }).rows).toHaveLength(5);
  });
  it('uses the existing journal model, with all target history kinds and no production links', () => {
    const journal = getAcademyMachineJournal(service(), target, 'da')!;
    expect(journal.found).toBe(true);
    expect(journal.summary.registryRecord?.serial).toBe(target);
    expect(journal.timeline).toHaveLength(6);
    for (const event of journal.timeline) { expect(event.id).toMatch(/^ACA-/); expect(event.href).toBeUndefined(); }
    for (const entries of Object.values(journal.related)) expect(entries.length).toBeGreaterThan(0);
    expect(journal.documents).toEqual([]);
    expect(getAcademyMachineJournal(service(), 'PRODUCTION-SERIAL', 'da')).toBeNull();
  });
  it('does not call production data services or fetch for fixtures', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    getAcademyMachinePage(service(), input);
    getAcademyMachineJournal(service(), target, 'da');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('Service track and semantic completion', () => {
  it('requires assigned Service and Basic, never Sales prerequisites', () => {
    expect(canAccessAcademyCase(getLocalAcademyUser(), ACADEMY_CASE_IDS.serviceCase1)).toBe(false);
    for (const user of [service(), { ...service(), permissions: { academy_track_sales: true, academy_track_service: true } }]) {
      const curriculum = getAssignedAcademyCurriculum(user);
      expect(getAcademyCaseState(ACADEMY_CASE_IDS.serviceCase1, [], [], true, curriculum)).toBe('locked');
      expect(getAcademyCaseState(ACADEMY_CASE_IDS.serviceCase1, basic, [], true, curriculum)).toBe('ready');
      expect(canOpenAcademyService(user)).toBe(true);
    }
    expect(getAcademyRouteTrack('/portal/service/machines', '?track=sales')).toBe('service');
    expect(getAcademyRouteTrack('/portal/service/machines/basic-target', '', ACADEMY_CASE_IDS.partnerMap)).toBe('basic');
  });
  it('does not complete for wrong search, wrong machine, or detail render alone', () => {
    academySandbox.trackMachineAction('search-open');
    academySandbox.trackMachineAction('search', 'WRONG');
    academySandbox.trackMachineAction('machine-open', 'WRONG');
    academySandbox.trackMachineAction('history-open', 'WRONG');
    expect(academySandbox.getServiceCase1()).toMatchObject({ searchOpened: true, targetSearched: false, targetOpened: false, historyOpened: false, completed: false });
    academySandbox.trackMachineAction('search', target.toLowerCase().replaceAll('-', ' '));
    academySandbox.trackMachineAction('machine-open', target);
    getAcademyMachineJournal(service(), target, 'da');
    expect(academySandbox.getServiceCase1()).toMatchObject({ targetSearched: true, targetOpened: true, historyOpened: false, completed: false });
  });
  it('requires ordered actual actions and emits completion once, persists per cycle', () => {
    const completed = vi.fn();
    window.addEventListener(ACADEMY_CASE_COMPLETED, completed);
    academySandbox.trackMachineAction('machine-open', target);
    expect(academySandbox.getServiceCase1().targetOpened).toBe(false);
    academySandbox.trackMachineAction('search-open');
    academySandbox.trackMachineAction('search', target);
    academySandbox.trackMachineAction('machine-open', target);
    academySandbox.trackMachineAction('history-open', target);
    academySandbox.trackMachineAction('history-open', target);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(academySandbox.getCompletedCaseIds()).toContain(ACADEMY_CASE_IDS.serviceCase1);
    academySandbox.leaveSession();
    academySandbox.startServiceCase1();
    expect(academySandbox.getServiceCase1().completed).toBe(true);
    setAcademyCycleStorageScope('next-cycle');
    expect(academySandbox.getServiceCase1().completed).toBe(false);
    expect(createAcademyMachines().find((row) => row.serial === target)).toBeTruthy();
    window.removeEventListener(ACADEMY_CASE_COMPLETED, completed);
  });
  it('ignores events in other cases and outside Academy', () => {
    academySandbox.startPartnerMap();
    academySandbox.trackMachineAction('search-open');
    expect(academySandbox.getServiceCase1().searchOpened).toBe(false);
    academySandbox.leaveSession();
    academySandbox.trackMachineAction('search-open');
    expect(academySandbox.getServiceCase1().searchOpened).toBe(false);
  });
  it.each(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as PortalUiLanguage[])('has translated guidance and history in %s', (language) => {
    for (const key of ['academyServiceCase1Title', 'academyMachineDescription', 'academyMachineOpenSearch', 'academyMachineSearchTarget', 'academyMachineOpenTarget', 'academyMachineReadHistory', 'academyMachineLocalHistory']) {
      expect(t(key, language)).not.toBe(key);
      if (language !== 'da' && !(language === 'sv' && key === 'academyMachineLocalHistory')) expect(t(key, language)).not.toBe(t(key, 'da'));
    }
    expect(t('academyMachineSearchTarget', language)).toContain('{serial}');
  });
  it('migration changes curriculum metadata only, preserving existing grants and historical cycles', () => {
    const sql = readFileSync('supabase/migrations/20260924075028_academy_service_machine_case.sql', 'utf8');
    expect(sql).toContain("p_permissions->'academy_track_service' = 'true'::jsonb");
    expect(sql).toContain('security invoker');
    expect(sql).not.toMatch(/\b(insert into|update public|delete from|create policy|alter table)\b/i);
  });
});
