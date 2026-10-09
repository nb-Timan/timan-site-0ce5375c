import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CRM lead budget-reference cleanup', () => {
  it('cascades only direct budget references when the canonical lead delete flow runs', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260913075452_cascade_budget_references_on_crm_lead_delete.sql'),
      'utf8',
    );

    expect(migration).toMatch(/alter table public\.budget_references/i);
    expect(migration).toMatch(/foreign key \(lead_id\)/i);
    expect(migration).toMatch(/references public\.crm_leads\(id\)/i);
    expect(migration).toMatch(/on delete cascade/i);
    expect(migration).toMatch(/not valid[\s\S]*validate constraint/i);
  });
});
