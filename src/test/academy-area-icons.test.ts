import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Building2, Compass, ShoppingCart, Target } from 'lucide-react';
import { ACADEMY_AREA_ICONS } from '@/lib/academyAreaIcons';

const source = readFileSync('src/pages/AcademyPage.tsx', 'utf8');

describe('Academy area icons', () => {
  it('uses one canonical Lucide icon per subject area', () => {
    expect(ACADEMY_AREA_ICONS.sales).toBe(ShoppingCart);
    expect(ACADEMY_AREA_ICONS.portalBasics).toBe(Compass);
    expect(ACADEMY_AREA_ICONS.partnerData).toBe(Building2);
    expect(ACADEMY_AREA_ICONS.crm).toBe(Target);
  });

  it('keeps subject icons on case rows and removes them from section headers', () => {
    expect(source.match(/icon=\{ACADEMY_AREA_ICONS\.sales\}/g)).toHaveLength(5);
    expect(source.match(/icon=\{ACADEMY_AREA_ICONS\.portalBasics\}/g)).toHaveLength(2);
    expect(source.match(/icon=\{ACADEMY_AREA_ICONS\.partnerData\}/g)).toHaveLength(3);
    expect(source.match(/icon=\{ACADEMY_AREA_ICONS\.crm\}/g)).toHaveLength(2);
    expect(source).toContain('function Module({ title, progress, children }');
    expect(source).not.toContain('<Module icon=');
    expect(source).not.toContain('/messe/machines/rc-1000s-tile.png');
    expect(source).not.toContain('/messe/machines/timan-3330-tile.png');
    expect(source).not.toContain('<img');
    expect(source).toContain('<Status state={state} label={statusLabel} />');
    expect(source).toContain('{action && (');
    expect(source).toContain("disabled={!interactive}");
    expect(source).toContain("state === 'completed' ? tr('academyOpen')");
  });
});
