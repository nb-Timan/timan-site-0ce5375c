import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/machines';

const assetPath = 'public/images/rc-751/rc-751-dimensions-overview.png';
const assetUrl = '/images/rc-751/rc-751-dimensions-overview.png';

describe('RC-751 dimensions image', () => {
  it('uses the exact uploaded image only for RC-751', () => {
    expect(PRODUCTS['RC-751'].machineDetails?.overviewImageUrls).toEqual([assetUrl]);

    for (const [productKey, product] of Object.entries(PRODUCTS)) {
      if (productKey === 'RC-751') continue;
      expect(product.machineDetails?.overviewImageUrls ?? []).not.toContain(assetUrl);
    }

    const checksum = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
    expect(checksum).toBe('e9adc42a8a6f9a2b992b1b8b32382775104c75f7f38cdbb011fc439a68be36fc');
  });

  it('renders overview images after specifications and before the close action', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(source.match(/image\.src === '\/images\/rc-751\/rc-751-dimensions-overview\.png'/g)).toHaveLength(2);

    const modalStart = source.indexOf('{marketingInformation && (');
    const modalEnd = source.indexOf('{/* Oil Modal */}', modalStart);
    const modal = source.slice(modalStart, modalEnd);

    const specs = modal.indexOf('marketingInformation.specs.length');
    const image = modal.indexOf('marketingInformation.overviewImages?.length');
    const close = modal.indexOf("setMarketingInformation(null)", image);

    expect(specs).toBeGreaterThanOrEqual(0);
    expect(image).toBeGreaterThan(specs);
    expect(close).toBeGreaterThan(image);
    expect(modal).toContain('max-h-[90vh]');
    expect(modal).toContain('overflow-y-auto');
    expect(modal).toContain("image.src === '/images/rc-751/rc-751-dimensions-overview.png'");
    expect(modal).toContain('mx-auto block h-auto w-full max-w-[720px] object-contain');
    expect(modal).toContain("'block h-auto max-h-[60vh] w-full max-w-full object-contain'");
  });
});
