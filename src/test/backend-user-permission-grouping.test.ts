import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const editor = readFileSync('src/pages/backend/BackendUsersPage.tsx', 'utf8');

describe('backend user permission grouping', () => {
  it('groups canonical permissions and quick actions by domain', () => {
    expect(editor).toContain('const ACCESS_DOMAINS');
    expect(editor).toContain('label: "Salg"');
    expect(editor).toContain('label: "Marketing"');
    expect(editor).toContain('label: "Teknik & Service"');
    expect(editor).toContain('label: "Timan Backend"');
    expect(editor).toContain('data-access-domain={group.label}');
    expect(editor).not.toContain('<Section title="Permissions">');
    expect(editor).not.toContain('<Section title="Hurtige handlinger / Quick actions">');
  });

  it('keeps every existing canonical permission key represented once', () => {
    const keys = [
      'can_view_prices',
      'can_submit_order',
      'can_manage_payment_terms',
      'can_apply_extra_dealer_discount',
      'can_save_configurator_as_lead',
      'marketing_videos_manage',
      'marketing_configurator_manage',
      'news_manage',
      'can_create_claims',
      'can_approve_claims',
      'can_create_tsb',
      'can_manage_users',
    ];

    for (const key of keys) {
      expect(editor.match(new RegExp(`value: "${key}"`, 'g'))).toHaveLength(1);
    }
  });

  it('keeps quick actions independent of their visual domain', () => {
    expect(editor).toContain('quickActions: ["create_lead", "create_demo", "company_contact_info", "dealer_invoice_accept", "partner_map"]');
    expect(editor).toContain('quickActions: ["create_warranty_registration", "warranty_registrations"]');
    expect(editor).toContain('configurableQuickActionsForRole(draft.role)');
    expect(editor).toContain('setDraft({ ...draft, quick_actions: next })');
    expect(editor).not.toContain('allowed_areas.includes("salg_marketing")');
  });

  it('preserves role reset and manual override indicators', () => {
    expect(editor).toContain('Nulstil til rolle');
    expect(editor).toContain('Manuelt til');
    expect(editor).toContain('Manuelt fra');
    expect(editor).toContain('has_manual_module_override: true');
  });

  it('shows every canonical top-level area without duplicating Messe or Academy as modules', () => {
    expect(editor).toContain('PORTAL_TOP_LEVEL_ACCESS.map');
    expect(editor).toContain('messe: "Messe"');
    expect(editor).toContain('academy: "Timan Academy"');
    expect(editor).toContain('calendar: "Kalender"');
    expect(editor).toContain('!moduleBackedAreaKeys.has(m)');
    expect(editor.match(/Nulstil til rolle/g)).toHaveLength(1);
    expect(editor).toContain('allowed_areas: roleDefaultAreas, allowed_modules: roleDefaultModules');
    expect(editor).not.toContain('modules: ["messe_portal"');
  });
});
