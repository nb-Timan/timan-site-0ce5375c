import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getWarrantySidebarItems } from '@/components/warranty/WarrantyAdminSidebarLayout';
import { WARRANTY_CREATE_ROUTE } from '@/lib/warrantyRoutes';

const pageSource = readFileSync('src/pages/WarrantyPage.tsx', 'utf8');

describe('Warranty shared shell sidebar', () => {
  it('uses one admin sidebar on dashboard, registrations, sync, and create', () => {
    expect(getWarrantySidebarItems('admin', true).map((item) => item.label)).toEqual([
      'Dashboard',
      'Registrerede garantibeviser',
      'Synkronisering',
      'Opret garantiregistrering',
    ]);
    expect(getWarrantySidebarItems('admin', true).at(-1)?.to).toBe(WARRANTY_CREATE_ROUTE);
  });

  it('keeps the dealer sidebar role-aware without backend-only links', () => {
    expect(getWarrantySidebarItems('dealer', true).map((item) => item.label)).toEqual([
      'Dashboard',
      'Mine registreringer',
      'Opret garantiregistrering',
    ]);
    expect(getWarrantySidebarItems('dealer', false).map((item) => item.label)).toEqual([
      'Dashboard',
      'Mine registreringer',
    ]);
  });

  it('renders the canonical create form inside the effective role shell', () => {
    expect(pageSource).toContain('const effectiveUser = useEffectivePortalUser(appUser);');
    expect(pageSource).toContain('scope={variant}');
    expect(pageSource).toContain('canCreate={canCreate}');
    expect(pageSource).not.toContain('scope="dealer"');
    expect(pageSource).toContain('<WarrantyNewForm');
  });

  it('keeps active-route matching on the single canonical create route', () => {
    const shellSource = readFileSync('src/components/warranty/WarrantyAdminSidebarLayout.tsx', 'utf8');
    expect(shellSource).toContain('match: WARRANTY_CREATE_ROUTE');
    expect(shellSource).toContain('location.pathname === item.match');
    expect(shellSource).toContain('location.pathname.startsWith(item.match + "/")');
  });
});
