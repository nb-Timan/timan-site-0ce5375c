import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
const step3Source = source.slice(
  source.indexOf('{/* Step 3: Accessories */}'),
  source.indexOf('/* Step 3 validation:'),
);

describe('Configurator Step 3 accessory card layout', () => {
  it('keeps the mobile description independent of badge and price width', () => {
    expect(source).toContain('grid-cols-[1.5rem_minmax(0,1fr)]');
    expect(source).toContain('col-span-2 mt-1 text-xs leading-5 text-gray-600');
    expect(source).toContain('col-span-2 mt-2 flex min-w-0 items-center justify-between gap-2');
  });

  it('keeps the compact badge, price, item number, and media actions in the shared card', () => {
    expect(source).toContain("renderMarketingBadge(marketingContent, 'compact') || renderNewBadge(a.isNew)");
    expect(source).toContain('font-bold text-base text-emerald-700 price-col');
    expect(source).toContain('{itemNoLabel(uiLanguage)}: {a.varenr}');
    expect(source).toContain('{renderActionLinks(a, machineType)}');
  });

  it('does not clamp the description text', () => {
    expect(step3Source).not.toContain('line-clamp-2 mt-1 text-xs text-gray-600');
  });
});
