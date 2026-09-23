import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateCosts } from '@/pages/DriftberegnerPage';
import { calculateYearlyServiceCost } from '@/lib/serviceBasisData';

const source = readFileSync('src/pages/DriftberegnerPage.tsx', 'utf8');
const common = {
  fuelPrice: 13.5,
  daysPerYear: 125,
  hoursPerDay: 6,
  depreciationYears: 5,
  interestRate: 4,
};

const machines = {
  rc751: { name: 'RC-751', purchasePrice: 161700, fuelConsumption: 3.5, serviceCostYear: 4500, residualValuePercent: 20, isServiceManual: false },
  rc1000: { name: 'RC-1000s', purchasePrice: 269800, fuelConsumption: 5.5, serviceCostYear: 6500, residualValuePercent: 20, isServiceManual: false },
  timan3330: { name: '3330+T2', purchasePrice: 586135, fuelConsumption: 6, serviceCostYear: 7500, residualValuePercent: 20, isServiceManual: false },
} as const;

describe('Driftsberegner portal redesign', () => {
  it.each([
    ['rc751', 5768.9, [750, 35437.5, 29752.8, 70959.2, 94.6122666667]],
    ['rc1000', 11142.97, [750, 55687.5, 49643.2, 116473.67, 155.2982266667]],
    ['timan3330', 3590, [750, 60750, 107848.84, 172188.84, 229.58512]],
  ] as const)('preserves the canonical %s outputs', (key, expectedService, expected) => {
    const service = calculateYearlyServiceCost(key, 750);
    const result = calculateCosts(common, machines[key], service);

    expect(service).toBeCloseTo(expectedService, 8);
    [result.totalHours, result.fuel, result.capital, result.totalYear, result.hourCost]
      .forEach((value, index) => expect(value).toBeCloseTo(expected[index], 8));
  });

  it('uses one result calculation for both responsive presentations', () => {
    expect(source.match(/const results = useMemo/g)).toHaveLength(1);
    expect(source).toContain('drift-desktop-table hidden md:block');
    expect(source).toContain('drift-mobile-cards divide-y divide-slate-200 md:hidden');
    expect(source).toContain("useState<MachineKey | null>('rc751')");
    expect(source).not.toContain('<img');
  });

  it('preserves reset, service provenance and report actions', () => {
    expect(source).toContain('onClick={resetCalculator}');
    expect(source.match(/onClick=\{\(\) => openServiceModal\(m\)\}/g)).toHaveLength(2);
    expect(source).toContain('servicePartsData[modalMachine]');
    expect(source).toContain('onClick={() => window.print()}');
    expect(source).toContain('.drift-desktop-table { display: block !important; }');
  });
});
