import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921135656_crm_demo_held_transition_guard.sql'), 'utf8');
const previous = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921085622_lead_demo_held_status_history.sql'), 'utf8');
const fixed = previous.replace("if new.demo_has_run is not distinct from 'yes'", "if new.demo_has_run is distinct from 'yes'");

describe('demo-held history transition', () => {
  it('only changes the new-value guard and preserves existing completion/history writes', () => {
    expect(migration).toContain("'if new.demo_has_run is distinct from ''yes'''");
    expect(fixed.replaceAll('\r\n', '\n')).toContain("if new.demo_has_run is distinct from 'yes'\n     or old.demo_has_run is not distinct from 'yes'");
    expect(fixed).toContain("set status = 'completed'");
    expect(fixed).toContain("'demo_held', new.id");
    expect(migration).not.toMatch(/create policy|alter policy|grant |revoke |update public\.|delete from/i);
  });
});
