import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('site change publishing security', () => {
  it('keeps browser writes on the internal table and public projection read-only', () => {
    const service = readFileSync(join(process.cwd(), 'src/lib/portalChangelogService.ts'), 'utf8');
    const updateStart = service.indexOf('export async function adminUpdateChangelog');
    const deleteStart = service.indexOf('export async function adminDeleteChangelog');
    const updateFlow = service.slice(updateStart, deleteStart);

    expect(updateFlow).toContain(".from('site_change_entries')");
    expect(updateFlow).not.toContain(".from('site_change_public_entries')");
  });

  it('restores the public projection trigger as a security definer function', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260830124201_fix_site_change_public_sync_trigger_timing.sql'), 'utf8');

    expect(migration).toContain('create or replace function public.sync_site_change_public_entry()');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public');
    expect(migration).toContain('insert into public.site_change_public_entries');
    expect(migration).toContain('delete from public.site_change_public_entries');
    expect(migration).toContain('create trigger site_change_prepare_publication_metadata');
    expect(migration).toContain('before insert or update on public.site_change_entries');
    expect(migration).toContain('create trigger sync_site_change_public_entry');
    expect(migration).toContain('after insert or update or delete on public.site_change_entries');
    expect(migration).toContain('new.published_at = now()');
    expect(migration).toContain('revoke all on function public.sync_site_change_public_entry() from public, anon, authenticated');
    expect(migration).not.toContain('grant insert');
    expect(migration).not.toContain('grant update');
  });

  it('documents that direct public projection writes remain revoked from browser roles', () => {
    const initialMigration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260826203041_site_change_entries.sql'),
      'utf8',
    );

    expect(initialMigration).toContain('revoke all on table public.site_change_public_entries from anon, authenticated');
    expect(initialMigration).toContain('grant select on table public.site_change_public_entries to anon, authenticated');
    expect(initialMigration).not.toMatch(/grant\s+.*\b(insert|update|delete)\b.*on table public\.site_change_public_entries/i);
  });
});
