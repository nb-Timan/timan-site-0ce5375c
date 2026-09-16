import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
const step3Source = source.slice(
  source.indexOf('{/* Step 3: Accessories */}'),
  source.indexOf('/* Step 3 validation:'),
);

describe('Configurator Step 3 accessory card layout', () => {
  it('restores the pre-16.09 content flow as one left product-information block', () => {
    expect(source).toContain('flex items-start w-full min-w-0');
    expect(source).toContain('flex-grow min-w-0');
    expect(source).toContain('flex justify-between items-start');
    expect(source).not.toContain('grid-cols-[1.5rem_minmax(0,1fr)]');
  });

  it('keeps text, item number, and media actions in their original left information block', () => {
    const detailsStart = step3Source.indexOf('<div className="flex-grow min-w-0">');
    const detailsEnd = step3Source.indexOf('<div className="flex shrink-0 items-center justify-end gap-2 text-right">');
    const details = step3Source.slice(detailsStart, detailsEnd);

    expect(details).toContain('{itemNoLabel(uiLanguage)}: {a.varenr}');
    // Description remains optional legacy content; it must not become a new mandatory card row.
    expect(details).toContain('{marketingContent?.description &&');
    expect(details).toContain('{renderActionLinks(a, machineType)}');
    expect(details.indexOf('{itemNoLabel(uiLanguage)}: {a.varenr}')).toBeLessThan(details.indexOf('{renderActionLinks(a, machineType)}'));
    expect(source).toContain('mt-1 flex gap-2 whitespace-nowrap');
  });

  it('keeps campaign presentation and price in the original separate right block', () => {
    expect(source).toContain("renderMarketingBadge(marketingContent, 'compact') || renderNewBadge(a.isNew)");
    expect(source).toContain('font-bold text-base text-emerald-700 price-col');
    expect(source).toContain('flex shrink-0 items-center justify-end gap-2 text-right');
  });
});
