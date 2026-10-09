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
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260917142804_site_change_publication_trigger_security.sql'), 'utf8');

    expect(migration).toContain('create or replace function public.sync_site_change_public_entry()');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public');
    expect(migration).toContain('insert into public.site_change_public_entries');
    expect(migration).toContain('delete from public.site_change_public_entries');
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

  it('keeps technical history read-only and preserves manual public copy during GitHub resync', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/backend/BackendChangelogPage.tsx'), 'utf8');
    const importer = readFileSync(join(process.cwd(), 'supabase/functions/import-site-changes-from-github/index.ts'), 'utf8');
    const updateStart = importer.indexOf('} else {\n      const { error: groupUpdateError }');
    const updateEnd = importer.indexOf('    const priorAutomaticGroupIds', updateStart);
    const groupUpdate = importer.slice(updateStart, updateEnd);

    expect(page).toContain('siteFeaturesTechnicalDescription');
    expect(page).not.toContain('onChange={(event) => setDraft({ ...draft, technical_description: event.target.value })}');
    expect(groupUpdate).not.toContain('title_public: suggestion.group.title_public');
    expect(groupUpdate).not.toContain('description_public: suggestion.group.description_public');
    expect(groupUpdate).not.toContain('localized_content: suggestion.group.localized_content');
    expect(groupUpdate).not.toContain('status: "published"');
  });

  it('keeps publishing scoped to Backend or explicitly Marketing-capable internal users', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260917143553_site_change_marketing_publish_permission.sql'), 'utf8');

    expect(migration).toContain("au.portal_role in ('timan_seller', 'timan_service')");
    expect(migration).toContain("'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))");
    expect(migration).toContain("au.permissions ->> 'news_manage'");
    expect(migration).not.toContain("'timan_dealer'");
  });
});
