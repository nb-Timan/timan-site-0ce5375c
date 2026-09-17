import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel pilot deployment configuration', () => {
  it('declares the Vite build, dist output, Node 22, and a SPA fallback', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      framework?: string;
      buildCommand?: string;
      outputDirectory?: string;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      engines?: { node?: string };
    };

    expect(vercel.framework).toBe('vite');
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
    expect(packageJson.engines?.node).toBe('22.x');
    expect(readFileSync('.nvmrc', 'utf8').trim()).toBe('22');
  });

  it('keeps the preview site origin dynamic while retaining Lovable only as a named pilot fallback', () => {
    const helper = readFileSync('src/lib/portalSiteUrl.ts', 'utf8');
    const messe = readFileSync('src/lib/exhibitionMode.ts', 'utf8');

    expect(helper).toContain('getCurrentPortalOrigin');
    expect(helper).toContain('window.location.origin');
    expect(helper).toContain("const LOVABLE_PILOT_FALLBACK_URL = 'https://timan-site.lovable.app'");
    expect(messe).toContain("portalUrl('/portal?redirect=/messe', { configured: true })");
  });

  it('passes the active portal URL into user and contract invite/reset flows', () => {
    const client = readFileSync('src/lib/adminUserActions.ts', 'utf8');
    const edgeFunction = readFileSync('supabase/functions/admin-user-actions/index.ts', 'utf8');

    expect(client).toContain('portalUrl(`/portal/contracts/${opts.contractId}`)');
    expect(client).toContain("portalUrl('/reset-password')");
    expect(edgeFunction).toContain('const redirectTo = isHttpsUrl(body.redirect_to)');
    expect(edgeFunction).toContain('function isHttpsUrl');
    expect(edgeFunction).toContain('PORTAL_SITE_URL');
  });

  it('documents public Vercel variables without placing server secrets in browser configuration', () => {
    const example = readFileSync('.env.example', 'utf8');
    const guide = readFileSync('docs/vercel-pilot-deployment.md', 'utf8');

    expect(example).toContain('VITE_SUPABASE_URL=');
    expect(example).toContain('VITE_SUPABASE_ANON_KEY=');
    expect(example).not.toContain('SUPABASE_SERVICE_ROLE_KEY=');
    expect(guide).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(guide).toMatch(/Additional\s+Redirect URLs/);
    expect(guide).toContain('Lovable remains untouched during this pilot');
  });
});
