import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260918092857_configurator_sent_pdf_storage_access.sql',
  'utf8',
);

describe('Configurator sent PDF storage access', () => {
  it('limits archive and read access to the sender-owned sent-pdfs folder', () => {
    expect(migration).toContain("bucket_id = 'sent-pdfs'");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
    expect(migration).toContain('create policy sent_pdfs_insert_submitters');
    expect(migration).toContain('create policy sent_pdfs_select_submitters');
  });

  it('requires an active approved user with canonical Configurator submit capability', () => {
    expect(migration).toContain('au.is_active = true');
    expect(migration).toContain('au.approved = true');
    expect(migration).toContain('au.can_submit_order');
    expect(migration).toContain("'timan_seller'");
    expect(migration).toContain("'timan_dealer'");
  });
});
