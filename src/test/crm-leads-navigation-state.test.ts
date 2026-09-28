import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCrmLeadsNavigationParams,
  clearCurrentCrmLeadsHistoryState,
  createCrmLeadsDetailNavigationState,
  defaultCrmLeadsNavigationState,
  parseCrmLeadsNavigationState,
  readCurrentCrmLeadsScrollPosition,
  readCrmLeadsReturnTarget,
  rememberCurrentCrmLeadsScrollPosition,
  serializeCrmLeadsNavigationState,
  type CrmLeadsNavigationState,
} from '@/lib/crmLeadsNavigationState';

const leadsPage = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const leadDetailPage = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const portalHeader = readFileSync('src/components/portal/PortalHeader.tsx', 'utf8');
const navigationHelper = readFileSync('src/lib/crmLeadsNavigationState.ts', 'utf8');

const combinedState: CrmLeadsNavigationState = {
  tab: 'open',
  followupFilter: 'soon',
  q: 'G-5054',
  typeFilter: 'demo',
  machineFilter: 'Timan 3330',
  equipmentFilter: 'Weed brush',
  ownerFilter: 'seller:akr-user-id',
  stage: 'demo_booked',
  sort: 'date_desc',
  page: 2,
};

describe('CRM Leads navigation state', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/portal/crm/leads');
  });

  it.each([
    ['machineFilter', 'machine', 'Timan 3330'],
    ['typeFilter', 'type', 'demo'],
    ['equipmentFilter', 'equipment', 'Weed brush'],
    ['stage', 'status', 'demo_booked'],
    ['ownerFilter', 'owner', 'seller:akr-user-id'],
    ['q', 'q', 'G-5054'],
    ['sort', 'sort', 'date_desc'],
  ] as const)('round-trips %s through the URL', (stateKey, queryKey, value) => {
    const state = { ...defaultCrmLeadsNavigationState('open'), [stateKey]: value };
    const params = serializeCrmLeadsNavigationState(new URLSearchParams(), state, { isAdmin: true });
    expect(params.get(queryKey)).toBe(value);
    expect(parseCrmLeadsNavigationState(params, { isAdmin: true })[stateKey]).toBe(value);
  });

  it('round-trips combined filters, cohort and pagination together', () => {
    const params = serializeCrmLeadsNavigationState(
      new URLSearchParams('academy_mode=true&academy_part=2'),
      combinedState,
      { isAdmin: true },
    );
    expect(params.get('academy_mode')).toBe('true');
    expect(params.get('academy_part')).toBe('2');
    expect(parseCrmLeadsNavigationState(params, { isAdmin: true })).toEqual(combinedState);
  });

  it('carries the exact filtered list URL into lead detail navigation', () => {
    const search = `?${serializeCrmLeadsNavigationState(
      new URLSearchParams(),
      combinedState,
      { isAdmin: true },
    ).toString()}`;
    const detailState = createCrmLeadsDetailNavigationState('/portal/crm/leads', search);

    expect(readCrmLeadsReturnTarget(detailState)).toBe(`/portal/crm/leads${search}`);
    expect(parseCrmLeadsNavigationState(
      new URLSearchParams(readCrmLeadsReturnTarget(detailState)?.split('?')[1]),
      { isAdmin: true },
    )).toEqual(combinedState);
  });

  it('accepts only local canonical Leads return targets', () => {
    expect(readCrmLeadsReturnTarget({ timanCrmLeadsReturnTo: '/portal/crm/leads?type=demo' }))
      .toBe('/portal/crm/leads?type=demo');
    expect(readCrmLeadsReturnTarget({ timanCrmLeadsReturnTo: 'https://example.com/portal/crm/leads' }))
      .toBeNull();
    expect(readCrmLeadsReturnTarget({ timanCrmLeadsReturnTo: '/portal/backend?type=demo' }))
      .toBeNull();
  });

  it('keeps the selected status card/cohort in the URL', () => {
    const params = serializeCrmLeadsNavigationState(
      new URLSearchParams(),
      { ...defaultCrmLeadsNavigationState('open'), followupFilter: 'overdue' },
      { isAdmin: true },
    );
    expect(params.toString()).toBe('followup=overdue');
    expect(parseCrmLeadsNavigationState(params, { isAdmin: true })).toMatchObject({
      tab: 'open',
      followupFilter: 'overdue',
    });
  });

  it('keeps dealer links canonical without duplicating the dealer search', () => {
    const params = new URLSearchParams('dealer=Timan+Nord');
    const parsed = parseCrmLeadsNavigationState(params, { isAdmin: true });
    expect(parsed).toMatchObject({ tab: 'all', q: 'Timan Nord' });
    expect(serializeCrmLeadsNavigationState(params, parsed, { isAdmin: true }).toString())
      .toBe('dealer=Timan+Nord');
  });

  it('keeps an explicitly cleared dealer search empty', () => {
    const params = serializeCrmLeadsNavigationState(
      new URLSearchParams('dealer=Timan+Nord'),
      { ...defaultCrmLeadsNavigationState('all'), q: '' },
      { isAdmin: true },
    );
    expect(params.has('q')).toBe(true);
    expect(parseCrmLeadsNavigationState(params, { isAdmin: true }).q).toBe('');
  });

  it('explicit All leads clears filters and pagination', () => {
    const current = serializeCrmLeadsNavigationState(
      new URLSearchParams('dealer=Timan+Nord'),
      combinedState,
      { isAdmin: true },
    );
    const reset = serializeCrmLeadsNavigationState(
      current,
      defaultCrmLeadsNavigationState('all'),
      { isAdmin: true, clearDealer: true },
    );
    expect(reset.toString()).toBe('view=all');
    expect(parseCrmLeadsNavigationState(reset, { isAdmin: true }))
      .toEqual(defaultCrmLeadsNavigationState('all'));
  });

  it('Timan-logo reset removes only Leads navigation state', () => {
    const cleared = clearCrmLeadsNavigationParams(
      '?academy_mode=true&dealer=Timan+Nord&type=demo&machine=Timan+3330&owner=seller%3Aakr&page=3',
    );
    expect(cleared).toBe('?academy_mode=true');
  });

  it('clears the current filtered Leads history entry before leaving', () => {
    window.history.replaceState(
      { key: 'lead-list', timanCrmLeadsScrollY: 864 },
      '',
      '/portal/crm/leads?type=demo&machine=Timan+3330',
    );
    expect(clearCurrentCrmLeadsHistoryState()).toBe(true);
    expect(window.location.pathname).toBe('/portal/crm/leads');
    expect(window.location.search).toBe('');
    expect(window.history.state).toMatchObject({ key: 'lead-list' });
    expect(window.history.state).not.toHaveProperty('timanCrmLeadsScrollY');
  });

  it('opens a fresh Leads URL with the normal default view', () => {
    expect(parseCrmLeadsNavigationState(new URLSearchParams(), { isAdmin: true }))
      .toEqual(defaultCrmLeadsNavigationState('open'));
  });

  it('drops an admin-only owner filter outside Backend scope', () => {
    const params = new URLSearchParams('type=demo&owner=seller%3Aakr-user-id');
    expect(parseCrmLeadsNavigationState(params, { isAdmin: false })).toMatchObject({
      typeFilter: 'demo',
      ownerFilter: '',
    });
    const sellerParams = serializeCrmLeadsNavigationState(
      params,
      parseCrmLeadsNavigationState(params, { isAdmin: false }),
      { isAdmin: false },
    );
    expect(sellerParams.has('owner')).toBe(false);
  });

  it('stores scroll only in the current browser history entry', () => {
    window.history.replaceState({ key: 'lead-list' }, '', '/portal/crm/leads?type=demo');
    rememberCurrentCrmLeadsScrollPosition(864);
    expect(readCurrentCrmLeadsScrollPosition()).toBe(864);
    expect(window.history.state).toMatchObject({ key: 'lead-list', timanCrmLeadsScrollY: 864 });
  });

  it('restores filter state but never caches lead rows or counters', () => {
    expect(navigationHelper).not.toContain('localStorage');
    expect(navigationHelper).not.toContain('sessionStorage');
    expect(navigationHelper).not.toContain('pageResult');
    expect(leadsPage).toContain('repository.listLeadsPage({');
    expect(leadsPage).toContain('setPageResult(result)');
  });

  it('wires detail navigation, scroll restoration and URL replacement', () => {
    expect(leadsPage).toContain('rememberCurrentCrmLeadsScrollPosition();');
    expect(leadsPage).toContain('state: createCrmLeadsDetailNavigationState(location.pathname, location.search)');
    expect(leadsPage).toContain("window.scrollTo({ top: y, behavior: 'auto' })");
    expect(leadsPage).toContain("setSearchParams((currentParams)");
    expect(leadsPage).toContain('{ replace: true }');
  });

  it('uses the exact filtered return target in both visible detail exits', () => {
    expect(portalHeader).toContain('readCrmLeadsReturnTarget(location.state)');
    expect(portalHeader).toMatch(/const portalBackTarget = crmLeadsReturnTarget\s*\?\?/);
    expect(leadDetailPage).toContain('const leadsReturnTarget = readCrmLeadsReturnTarget(location.state)');
    expect(leadDetailPage).toContain('<Link to={leadsReturnTarget}');
  });

  it('keeps Quick Note local to the current filtered list', () => {
    expect(leadsPage).toContain('setNoteTarget(r);');
    expect(leadsPage).toContain('if (!open) setNoteTarget(null);');
    expect(leadsPage).toContain('[noteTarget.id]: sortCrmLeadNotes(notes)');
  });

  it('clears Leads history on both Timan logo and View-as changes', () => {
    expect(portalHeader.match(/clearCurrentCrmLeadsHistoryState\(\);/g)).toHaveLength(2);
    expect(portalHeader).toMatch(/clearCurrentCrmLeadsHistoryState\(\);\s+navigate\(homeTarget\(\)\)/);
    expect(portalHeader).toMatch(/function chooseMode[\s\S]*?clearCurrentCrmLeadsHistoryState\(\);[\s\S]*?setActiveMode/);
  });
});
