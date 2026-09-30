import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const assistant = readFileSync('src/lib/assistantSupportService.ts', 'utf8');
const service = readFileSync('src/lib/supportService.ts', 'utf8');
const endpoint = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');

describe('Support portal-help runtime boundary', () => {
  it('routes canonical portal help before product discovery and generic RAG', () => {
    expect(assistant.indexOf('buildSupportPortalHelpContext(request.content'))
      .toBeLessThan(assistant.indexOf('isProductDiscoveryQuestion(request.content)'));
    expect(assistant).toContain("intent: 'portal-help'");
    expect(service).toContain('portal_help: request.portalHelp');
  });

  it('validates structured navigation and preserves permission-aware guidance', () => {
    expect(endpoint).toContain("value.domain !== 'PORTAL_HELP'");
    expect(endpoint).toContain("'CANONICAL_PORTAL_NAVIGATION'");
    expect(endpoint).toContain('If accessible is false');
    expect(endpoint).toContain('If clarification_required is true');
    expect(endpoint).toContain('Do not use retrieved knowledge to alter canonical portal navigation.');
    expect(endpoint).toContain('findPortalCapabilityContract(featureKey)');
    expect(endpoint).toContain('actorCanAccess(actor, contract.access)');
    expect(endpoint).toContain("return actorCanUseCrm(actor)");
    expect(endpoint).toContain("actorHasModule(actor, 'sales_tools')");
    expect(endpoint).toContain("actorHasModule(actor, 'warranty')");
    expect(endpoint).toContain("type: 'PORTAL_NAVIGATION'");
    expect(endpoint).toContain('portal_navigation: navigationAction');
    expect(endpoint).not.toContain('accessible: raw.accessible === true');
  });
});
