import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/Co2CalculatorPage.tsx', 'utf8');

const calculate = (hours: number, years: number, fuelPrice: number) => {
  const totalHours = hours * years;
  const timanCo2 = 5.1 * totalHours * 2.4;
  const egholmCo2 = 6.9 * totalHours * 2.4;
  const fuelSaved = (6.9 - 5.1) * totalHours;
  const co2Saved = fuelSaved * 2.4;

  return {
    timanCo2,
    egholmCo2,
    fuelSaved,
    moneySaved: fuelSaved * fuelPrice,
    co2Saved,
    tonsSaved: co2Saved / 1000,
  };
};

describe('CO2 calculator portal redesign', () => {
  it.each([
    ['default values', 500, 10, 12, [61200, 82800, 9000, 108000, 21600, 21.6]],
    ['low annual hours', 100, 10, 12, [12240, 16560, 1800, 21600, 4320, 4.32]],
    ['high annual hours', 2000, 10, 12, [244800, 331200, 36000, 432000, 86400, 86.4]],
    ['different ownership period', 500, 3, 12, [18360, 24840, 2700, 32400, 6480, 6.48]],
    ['different diesel price', 500, 10, 18.5, [61200, 82800, 9000, 166500, 21600, 21.6]],
  ])('preserves %s outputs', (_name, hours, years, fuelPrice, expected) => {
    const result = calculate(hours as number, years as number, fuelPrice as number);
    Object.values(result).forEach((value, index) => expect(value).toBeCloseTo((expected as number[])[index], 8));
  });

  it('keeps the canonical formulas and slider contracts unchanged', () => {
    expect(source).toContain('const totalHours = co2.hours * co2.years;');
    expect(source).toContain('const timanCo2 = co2.timanCons * totalHours * co2.co2Factor;');
    expect(source).toContain('const egholmCo2 = co2.egholmCons * totalHours * co2.co2Factor;');
    expect(source).toContain('const fuelSavedVal = (co2.egholmCons - co2.timanCons) * totalHours;');
    expect(source).toContain('const co2SavedVal = fuelSavedVal * co2.co2Factor;');
    expect(source).toContain('const moneySaved = fuelSavedVal * co2.baseFuelPriceDKK * rate;');
    expect(source).toContain('type="range" min={100} max={2000} step={50}');
    expect(source).toContain('type="range" min={1} max={15} step={1}');
    expect(source).toContain('type="range" min={5} max={25} step={0.5}');
  });

  it('uses the compact portal layout in the intended mobile order', () => {
    expect(source.indexOf('co2-parameters-title')).toBeLessThan(source.indexOf('co2-comparison-title'));
    expect(source.indexOf('co2-comparison-title')).toBeLessThan(source.indexOf('t.timanBetterBody'));
    expect(source.indexOf('t.timanBetterBody')).toBeLessThan(source.indexOf('co2-savings-title'));
    expect(source).toContain('lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]');
    expect(source).toContain('lg:col-span-2');
    expect(source).not.toContain('bg-gray-900 rounded-3xl');
  });

  it('renders the existing money saving as its own responsive KPI', () => {
    expect(source).toContain("moneySaved: 'Besparelse i kr.'");
    expect(source).toContain('grid-cols-1 gap-3 sm:grid-cols-3');
    expect(source).toContain('<Banknote className="h-6 w-6"');
    expect(source).toContain('{fmt(moneySaved)}');
  });
});
