import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@/context/AppUserContext';
import {
  PORTAL_CAPABILITY_COVERAGE_SOURCES,
  PORTAL_CAPABILITY_REGISTRY,
  buildSupportPortalHelpContext,
  findPortalCapabilities,
  isPortalHelpQuestion,
} from '@/lib/supportPortalHelp';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    email: 'backend@timan.dk', role: 'timan_backend', portal_role: 'timan_backend', partner_type: null,
    approved: true, is_active: true, start_step: 1, max_step: 4,
    can_view_prices: true, can_submit_order: true, can_edit_discount: true, can_switch_customer_mode: true,
    allowed_areas: null, allowed_modules: ['academy'], module_access: ['academy'],
    permissions: { support_access: true }, quick_actions: null,
    ...overrides,
  } as SessionUser;
}

const dealer = user({
  email: 'dealer@example.com', role: 'partner', portal_role: 'timan_dealer', partner_type: 'forhandler',
  dealer_number: 'D-100', allowed_areas: ['dealer_data', 'timan_crm', 'salg_marketing', 'teknik_service'],
  allowed_modules: ['dealer_data', 'timan_crm', 'byg_din_timan', 'contracts', 'warranty', 'claims'],
  module_access: ['dealer_data', 'timan_crm', 'byg_din_timan', 'contracts', 'warranty', 'claims'],
  permissions: { support_access: false },
});

describe('Portal capability registry', () => {
  it.each([
    ['Kan jeg som forhandler ændre mine adresser og kontaktoplysninger, hvis ja hvor?', 'partner.company_person_data', '/portal/dealer-data?accountNumber=D-100'],
    ['Hvor finder jeg mine leads?', 'crm.leads', '/portal/crm/leads'],
    ['Hvor finder jeg mine tilbud?', 'crm.quotes', '/portal/crm/quotes'],
    ['Hvor finder jeg konfiguratoren?', 'sales.configurator', '/configurator'],
    ['Hvor ændrer jeg virksomhedens kontaktoplysninger?', 'partner.company_person_data', '/portal/dealer-data?accountNumber=D-100'],
    ['Hvor opretter jeg et nyt lead?', 'quick.create_lead', '/portal/crm/leads/new'],
    ['Hvor laver jeg en demo-registrering?', 'quick.create_demo', '/portal/crm/demo-leads/new'],
    ['Hvor finder jeg Partnerdata?', 'area.partner_data', '/portal/dealer-data'],
    ['Hvor finder jeg brugerstyring?', 'backend.user_management', '/portal/backend/brugerstyring'],
    ['Hvor finder jeg AI Support?', 'backend.ai_support', '/portal/backend/ai-support'],
    ['Hvor finder jeg Teknik & Service?', 'area.technical_service', '/portal/teknik-service'],
    ['Hvor ændrer jeg en kontaktperson?', 'partner.company_person_data', '/portal/dealer-data?accountNumber=D-100'],
    ['Hvor finder jeg aktiviteter?', 'crm.activities', '/portal/crm/activities'],
    ['Hvor finder jeg kalenderen?', 'crm.calendar', '/portal/crm/calendar'],
  ])('resolves representative question: %s', (question, featureKey, route) => {
    const result = buildSupportPortalHelpContext(question, 'da', dealer);
    expect(result?.locations[0]).toMatchObject({ feature_key: featureKey, route });
  });

  it('keeps dealer-contract alternatives canonical and asks for clarification', () => {
    const result = buildSupportPortalHelpContext('Hvor finder jeg en forhandler kontrakt?', 'da', user());
    expect(result?.clarification_required).toBe(true);
    expect(result?.locations.map((location) => location.feature_key)).toEqual([
      'sales.contracts', 'backend.contract_approval',
    ]);
  });

  it('uses canonical role and permission fixtures without enabling production Support', () => {
    const fixtures = [
      { name: 'Backend', actor: user(), question: 'Hvor finder jeg brugerstyring?', accessible: true },
      { name: 'Sales', actor: user({ role: 'timan_saelger', portal_role: 'timan_seller', allowed_areas: ['timan_crm'], allowed_modules: ['timan_crm'] }), question: 'Hvor finder jeg mine leads?', accessible: true },
      { name: 'Dealer', actor: dealer, question: 'Hvor ændrer jeg kontaktoplysninger?', accessible: true },
      { name: 'Importer', actor: user({ role: 'partner', portal_role: 'timan_importer', partner_type: 'importoer', allowed_areas: ['dealer_data'], allowed_modules: ['dealer_data'] }), question: 'Hvor finder jeg Partnerdata?', accessible: true },
      { name: 'Service Partner', actor: user({ role: 'partner', portal_role: 'timan_service_partner', partner_type: 'service_partner', allowed_areas: ['teknik_service'], allowed_modules: ['machine_search'] }), question: 'Hvor finder jeg Teknik & Service?', accessible: true },
    ];
    for (const fixture of fixtures) {
      expect(buildSupportPortalHelpContext(fixture.question, 'da', fixture.actor)?.locations[0].accessible, fixture.name)
        .toBe(fixture.accessible);
    }
    expect(buildSupportPortalHelpContext('Hvor finder jeg AI Support?', 'da', dealer)?.locations[0].accessible).toBe(false);
    expect(dealer.permissions?.support_access).toBe(false);
  });

  it.each([
    ['da', 'Hvor ændrer jeg kontaktoplysninger?', 'Virksomheds- og persondata'],
    ['en', 'Where can I change contact details?', 'Company and personal data'],
    ['de', 'Wo kann ich Kontaktdaten ändern?', 'Unternehmens- und Personendaten'],
    ['it', 'Dove posso modificare i dati di contatto?', 'Dati aziendali e personali'],
    ['hu', 'Hol tudom módosítani a kapcsolati adatokat?', 'Cég- és személyes adatok'],
    ['sv', 'Var kan jag ändra kontaktuppgifter?', 'Företags- och personuppgifter'],
    ['fr', 'Où puis-je modifier les coordonnées?', 'Données d’entreprise et personnelles'],
    ['pl', 'Gdzie mogę zmienić dane kontaktowe?', 'Dane firmy i osób'],
    ['cs', 'Kde mohu změnit kontaktní údaje?', 'Firemní a osobní údaje'],
  ] as Array<[PortalUiLanguage, string, string]>)('supports %s capability lookup', (language, question, label) => {
    expect(isPortalHelpQuestion(question)).toBe(true);
    expect(buildSupportPortalHelpContext(question, language, dealer)?.locations[0].label).toBe(label);
  });

  it('covers every canonical area, module, CRM item and navigable Backend item', () => {
    const routes = new Set(PORTAL_CAPABILITY_REGISTRY.map((entry) => entry.canonicalRoute.split('?')[0]));
    const areaKeys = new Set(PORTAL_CAPABILITY_REGISTRY.map((entry) => entry.areaKey));
    for (const areaId of PORTAL_CAPABILITY_COVERAGE_SOURCES.areaIds) expect(areaKeys.has(areaId), areaId).toBe(true);
    for (const route of PORTAL_CAPABILITY_COVERAGE_SOURCES.moduleRoutes) expect(routes.has(route), route).toBe(true);
    for (const route of PORTAL_CAPABILITY_COVERAGE_SOURCES.crmRoutes) expect(routes.has(route), route).toBe(true);
    for (const route of PORTAL_CAPABILITY_COVERAGE_SOURCES.backendRoutes) expect(routes.has(route.split('?')[0]), route).toBe(true);
  });

  it('does not route product discovery to Portal Help', () => {
    expect(findPortalCapabilities('Hvilke vinterredskaber passer til RC-1000s?')).toEqual([]);
    expect(isPortalHelpQuestion('Hvilke vinterredskaber passer til RC-1000s?')).toBe(false);
  });
});
