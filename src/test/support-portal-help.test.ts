import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@/context/AppUserContext';
import { CRM_NAV_ITEMS } from '@/lib/crmNavigation';
import { PORTAL_MODULES } from '@/lib/portalModules';
import {
  buildSupportPortalHelpContext,
  isPortalHelpQuestion,
} from '@/lib/supportPortalHelp';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    email: 'backend@timan.dk',
    role: 'timan_backend',
    portal_role: 'timan_backend',
    partner_type: null,
    approved: true,
    is_active: true,
    start_step: 1,
    max_step: 4,
    can_view_prices: true,
    can_submit_order: true,
    can_edit_discount: true,
    can_switch_customer_mode: true,
    allowed_areas: null,
    allowed_modules: ['academy'],
    module_access: ['academy'],
    permissions: { support_access: true },
    ...overrides,
  };
}

describe('Support portal help', () => {
  it('routes navigation questions before generic product discovery', () => {
    expect(isPortalHelpQuestion('Hvor finder jeg en forhandler kontrakt?')).toBe(true);
    expect(isPortalHelpQuestion('Hvor finder jeg Leads?')).toBe(true);
    expect(isPortalHelpQuestion('Hvilke vinterredskaber passer til RC-1000s?')).toBe(false);
  });

  it('grounds dealer-contract ambiguity in both canonical contract locations', () => {
    const result = buildSupportPortalHelpContext('Hvor finder jeg en forhandler kontrakt?', 'da', user());
    const contractRoute = PORTAL_MODULES.find((entry) => entry.id === 'contracts')!.href;

    expect(result).toMatchObject({
      domain: 'PORTAL_HELP',
      navigation_source: 'canonical_portal_navigation',
      topic: 'dealer-contract',
      clarification_required: true,
    });
    expect(result?.locations.map((entry) => entry.route)).toEqual([
      contractRoute,
      '/portal/backend/contracts',
    ]);
    expect(result?.locations.every((entry) => entry.accessible)).toBe(true);
  });

  it.each([
    ['Hvor finder jeg Leads?', '/portal/crm/leads'],
    ['Hvor finder jeg Configurator?', '/configurator'],
    ['Hvor finder jeg Partnerdata?', '/portal/dealer-data'],
    ['Hvor finder jeg Brugerstyring?', '/portal/backend/brugerstyring'],
    ['Hvor finder jeg AI Support?', '/portal/backend/ai-support'],
    ['Hvor finder jeg Teknik og Service?', '/portal/teknik-service'],
    ['Hvor finder jeg Academy?', '/academy'],
  ])('resolves %s from canonical navigation', (question, route) => {
    expect(buildSupportPortalHelpContext(question, 'da', user())?.locations[0].route).toBe(route);
  });

  it('uses the same canonical CRM lead route as the CRM shell', () => {
    const canonicalLeadRoute = CRM_NAV_ITEMS.find((entry) => entry.tKey === 'crmLeads')!.to;
    expect(buildSupportPortalHelpContext('Hvor finder jeg Leads?', 'da', user())?.locations[0].route)
      .toBe(canonicalLeadRoute);
  });

  it('localizes labels while keeping routes stable', () => {
    const result = buildSupportPortalHelpContext('Wo finde ich den Konfigurator?', 'de', user());
    expect(result?.locations[0]).toMatchObject({
      label: 'Bauen Sie Ihren Timan',
      route: '/configurator',
    });
  });

  it('states location availability without granting restricted access', () => {
    const seller = user({
      role: 'timan_saelger',
      portal_role: 'timan_seller',
      allowed_areas: ['salg_marketing'],
      allowed_modules: ['byg_din_timan'],
      module_access: ['byg_din_timan'],
      permissions: null,
    });
    const result = buildSupportPortalHelpContext('Hvor finder jeg Brugerstyring?', 'da', seller);
    expect(result?.locations[0]).toMatchObject({
      route: '/portal/backend/brugerstyring',
      accessible: false,
    });
  });
});
