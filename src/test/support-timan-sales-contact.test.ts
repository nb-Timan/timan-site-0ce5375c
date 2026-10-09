import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalTimanSalesContacts,
  resolveCanonicalTimanQuoteSeller,
  type TimanSalesContactRecord,
  type TimanSalesUserRecord,
} from '../../supabase/functions/_shared/timanSalesContact';

const endpoint = readFileSync(resolve('supabase/functions/support-actions/index.ts'), 'utf8');
const workflow = readFileSync(resolve('src/lib/assistantConfiguratorWorkflow.ts'), 'utf8');
const service = readFileSync(resolve('src/lib/assistantSupportService.ts'), 'utf8');
const actions = readFileSync(resolve('src/lib/assistantCanonicalActions.ts'), 'utf8');

const contacts: TimanSalesContactRecord[] = [
  { id: 'em-contact', contact_area: 'sales', name: 'Esben Madsen', email: 'EM@Timan.dk', phone: '1' },
  { id: 'em-duplicate-contact', contact_area: 'sales', name: 'Esben Madsen', email: 'em@timan.dk', phone: '1' },
  { id: 'jtn-contact', contact_area: 'sales', name: 'Jakob T. Nielsen', email: 'JTN@Timan.dk', phone: '2' },
  { id: 'akr-contact', contact_area: 'sales', name: 'Alexander Kirschner', email: 'Alexander Kirschner (AKR@Timan.dk', phone: '3' },
  { id: 'bp-contact', contact_area: 'sales', name: 'Birger Pedersen', email: 'BP@Timan.dk', phone: '4' },
  { id: 'finance-contact', contact_area: 'finance', name: 'Finance', email: 'finance@timan.dk', phone: '5' },
  { id: 'service-contact', contact_area: 'workshop', name: 'Service', email: 'service@timan.dk', phone: '6' },
  { id: 'parts-contact', contact_area: 'parts', name: 'Purchasing', email: 'parts@timan.dk', phone: '7' },
];

const users: TimanSalesUserRecord[] = [
  { id: 'em-user', email: 'em@timan.dk', display_name: 'Esben Madsen', initials: 'EM', portal_role: 'timan_seller', status: 'active', approved: true },
  { id: 'jtn-user', email: 'jtn@timan.dk', display_name: 'Jakob Nielsen', initials: 'JTN', portal_role: 'timan_seller', status: 'active', approved: true },
  { id: 'akr-user', email: 'akr@timan.dk', display_name: 'Alexander Kirschner', initials: 'AKR', portal_role: 'timan_seller', status: 'active', approved: true },
  { id: 'bp-user', email: 'bp@timan.dk', display_name: 'Birger Pedersen', initials: 'BP', portal_role: 'timan_backend', status: 'active', approved: true },
  { id: 'finance-user', email: 'finance@timan.dk', display_name: 'Finance', initials: 'FIN', portal_role: 'timan_backend', status: 'active', approved: true },
];

const sellers = buildCanonicalTimanSalesContacts(contacts, users);

describe('canonical Timan quote seller resolution', () => {
  it('uses Partnerdata account 100 sales contacts joined to active portal users', () => {
    expect(sellers.map((seller) => seller.initials)).toEqual(['EM', 'JTN', 'AKR', 'BP']);
    expect(sellers.filter((seller) => seller.initials === 'EM')).toHaveLength(1);
    expect(sellers.find((seller) => seller.initials === 'AKR')).toMatchObject({
      contact_id: 'akr-contact',
      email: 'akr@timan.dk',
    });
    expect(endpoint).toContain(".eq('account_number', '100')");
    expect(endpoint).toContain(".eq('contact_area', 'sales')");
  });

  it('routes an unassigned Danish dealer to EM', () => {
    expect(resolveCanonicalTimanQuoteSeller({ country: 'Danmark' }, sellers)).toMatchObject({
      seller: { id: 'em-user', initials: 'EM' },
      reason: 'DENMARK',
    });
  });

  it('preserves canonical north and south Germany account ownership', () => {
    expect(resolveCanonicalTimanQuoteSeller({ country: 'Tyskland', assigned_seller_id: 'jtn-user' }, sellers).seller?.initials).toBe('JTN');
    expect(resolveCanonicalTimanQuoteSeller({ country: 'Tyskland', assigned_seller_id: 'akr-user' }, sellers).seller?.initials).toBe('AKR');
  });

  it('does not invent a German territory boundary when no owner exists', () => {
    const resolution = resolveCanonicalTimanQuoteSeller({ country: 'Tyskland' }, sellers);
    expect(resolution.seller).toBeNull();
    expect(resolution.reason).toBe('GERMANY_AMBIGUOUS');
    expect(resolution.choices.map((seller) => seller.initials)).toEqual(['JTN', 'AKR']);
  });

  it('gives an existing responsible seller precedence, including a valid sales director assignment', () => {
    expect(resolveCanonicalTimanQuoteSeller({ country: 'Danmark', assigned_seller_email: 'bp@timan.dk' }, sellers).seller?.initials).toBe('BP');
  });

  it('limits unassigned manual fallback to EM, JTN and AKR', () => {
    const resolution = resolveCanonicalTimanQuoteSeller({ country: 'France' }, sellers);
    expect(resolution.choices.map((seller) => seller.initials)).toEqual(['EM', 'JTN', 'AKR']);
    expect(resolution.choices.some((seller) => seller.initials === 'BP')).toBe(false);
  });
});

describe('quote workflow seller parity and department safety', () => {
  it('filters customer quote choices to director and sales server-side', () => {
    expect(endpoint).toContain(".in('contact_area', ['director', 'sales'])");
    expect(endpoint).toContain("!['director', 'sales'].includes");
    expect(endpoint).toContain("resolve_timan_sales_contact: { level: 0, permission: 'support' }");
    expect(endpoint).toContain('TIMAN_SELLER_OUT_OF_SCOPE');
  });

  it('keeps the Timan seller separate from the dealer quote recipient', () => {
    expect(workflow).toContain("pendingField: 'timan_seller'");
    expect(service).toContain('preferredQuoteContact');
    expect(service).toContain('timanSeller: seller');
    expect(actions).toContain('applyAssistantCustomer(input.state, input.dealer, input.contact)');
    expect(actions).toContain('input.timanSeller?.email || input.appUser.email');
  });

  it('reuses the seller for quote ownership, CRM lead, PDF state, email audit and handoff context', () => {
    expect(actions).toContain('initials: input.timanSeller?.initials || input.appUser.initials');
    expect(actions).toContain('const ownerId = input.timanSeller?.id');
    expect(actions).toContain('responsible_seller_id: sellerId');
    expect(service).toContain('applyAssistantTimanSeller(applyAssistantCustomer');
    expect(service).toContain('timan_seller_contact_id');
  });
});
