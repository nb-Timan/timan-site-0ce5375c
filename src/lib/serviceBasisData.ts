/**
 * Single source of truth for the service-basis data used by the
 * Driftberegner TCO comparison ("Se grundlag" modal) and the yearly
 * service cost calculation.
 *
 * Supported machines:
 *   - rc751      → RC-751
 *   - rc1000     → RC-1000s
 *   - timan3330  → 3330+T2
 *
 * Keep this file pure data + helpers. Do NOT add UI here.
 * Do NOT duplicate this data elsewhere — import from this module.
 */

export type ServiceMachineKey = 'rc751' | 'rc1000' | 'timan3330';

export interface ServicePartRow {
  id: string;
  name: string;
  price: number;
  count: number;
  sum: number;
}

export interface ServiceStep {
  rows: ServicePartRow[];
  stepTotal: number;
}

export interface MachineService {
  intervals: number[];
  accumulatedTotals: Record<number, number>;
  steps: Record<number, ServiceStep>;
}

export const servicePartsData: Record<ServiceMachineKey, MachineService> = {
  rc751: {
    intervals: [5, 100, 200, 300, 400, 500],
    accumulatedTotals: {
      5: 210.40,
      100: 741.50,
      200: 1272.60,
      300: 3436.50,
      400: 3967.60,
      500: 4486.70,
    },
    steps: {
      5: {
        rows: [
          { id: '22101006', name: 'Returfilter', price: 135.30, count: 1, sum: 135.30 },
          { id: '13101012', name: 'Motorolie 10W30', price: 75.10, count: 1, sum: 75.10 },
        ],
        stepTotal: 210.40,
      },
      100: {
        rows: [
          { id: '22601016', name: 'Luftfilter', price: 456.00, count: 1, sum: 456.00 },
          { id: '13101012', name: 'Motorolie 10W30', price: 75.10, count: 1, sum: 75.10 },
        ],
        stepTotal: 531.10,
      },
      200: {
        rows: [
          { id: '22601016', name: 'Luftfilter', price: 456.00, count: 1, sum: 456.00 },
          { id: '13101012', name: 'Motorolie 10W30', price: 75.10, count: 1, sum: 75.10 },
        ],
        stepTotal: 531.10,
      },
      300: {
        rows: [
          { id: '22601016', name: 'Luftfilter', price: 456.00, count: 1, sum: 456.00 },
          { id: '15901099', name: 'Tændrør', price: 80.80, count: 1, sum: 80.80 },
          { id: '22101006', name: 'Returfilter', price: 135.30, count: 1, sum: 135.30 },
          { id: '13101012', name: 'Motorolie 10W30', price: 75.10, count: 1, sum: 75.10 },
          { id: '52101006', name: 'Rem for kobling', price: 519.80, count: 1, sum: 519.80 },
          { id: '52301002', name: 'Rem for pumpe', price: 160.90, count: 1, sum: 160.90 },
          { id: '52101007', name: 'Rem for klipper', price: 736.00, count: 1, sum: 736.00 },
        ],
        stepTotal: 2163.90,
      },
      400: {
        rows: [
          { id: '22601016', name: 'Luftfilter', price: 456.00, count: 1, sum: 456.00 },
          { id: '13101012', name: 'Motorolie 10W30', price: 75.10, count: 1, sum: 75.10 },
        ],
        stepTotal: 531.10,
      },
      500: {
        rows: [
          { id: '22601016', name: 'Luftfilter', price: 453.60, count: 1, sum: 453.60 },
          { id: '13101012', name: 'Motorolie 10W30', price: 75.10, count: 1, sum: 75.10 },
        ],
        stepTotal: 528.70,
      },
    },
  },
  rc1000: {
    intervals: [10, 100, 200, 300, 400, 500],
    accumulatedTotals: {
      10: 1505.63,
      100: 2496.96,
      200: 3488.29,
      300: 4479.62,
      400: 5470.95,
      500: 7616.28,
    },
    steps: {
      10: {
        rows: [
          { id: '15901064', name: 'Oliefilter Vanguard', price: 206.00, count: 1, sum: 206.00 },
          { id: 'VHY-00114', name: 'Hydraulikolie returfilter', price: 1202.00, count: 1, sum: 1202.00 },
          { id: '13101012', name: 'Motorolie Texaco Delo', price: 97.63, count: 1, sum: 97.63 },
        ],
        stepTotal: 1505.63,
      },
      100: {
        rows: [
          { id: '15901064', name: 'Oliefilter Vanguard', price: 206.00, count: 1, sum: 206.00 },
          { id: '13101012', name: 'Motorolie Texaco Delo', price: 97.63, count: 1, sum: 97.63 },
          { id: '22601012', name: 'Luftfilter Vanguard', price: 385.30, count: 1, sum: 385.30 },
          { id: '22601013', name: 'Forfilter Vanguard', price: 137.40, count: 1, sum: 137.40 },
          { id: '15901063', name: 'Tændrør (2 stk)', price: 165.00, count: 1, sum: 165.00 },
        ],
        stepTotal: 991.33,
      },
      200: {
        rows: [
          { id: '15901064', name: 'Oliefilter Vanguard', price: 206.00, count: 1, sum: 206.00 },
          { id: '13101012', name: 'Motorolie Texaco Delo', price: 97.63, count: 1, sum: 97.63 },
          { id: '22601012', name: 'Luftfilter Vanguard', price: 385.30, count: 1, sum: 385.30 },
          { id: '22601013', name: 'Forfilter Vanguard', price: 137.40, count: 1, sum: 137.40 },
          { id: '15901063', name: 'Tændrør (2 stk)', price: 165.00, count: 1, sum: 165.00 },
        ],
        stepTotal: 991.33,
      },
      300: {
        rows: [
          { id: '15901064', name: 'Oliefilter Vanguard', price: 206.00, count: 1, sum: 206.00 },
          { id: '13101012', name: 'Motorolie Texaco Delo', price: 97.63, count: 1, sum: 97.63 },
          { id: '22601012', name: 'Luftfilter Vanguard', price: 385.30, count: 1, sum: 385.30 },
          { id: '22601013', name: 'Forfilter Vanguard', price: 137.40, count: 1, sum: 137.40 },
          { id: '15901063', name: 'Tændrør (2 stk)', price: 165.00, count: 1, sum: 165.00 },
        ],
        stepTotal: 991.33,
      },
      400: {
        rows: [
          { id: '15901064', name: 'Oliefilter Vanguard', price: 206.00, count: 1, sum: 206.00 },
          { id: '13101012', name: 'Motorolie Texaco Delo', price: 97.63, count: 1, sum: 97.63 },
          { id: '22601012', name: 'Luftfilter Vanguard', price: 385.30, count: 1, sum: 385.30 },
          { id: '22601013', name: 'Forfilter Vanguard', price: 137.40, count: 1, sum: 137.40 },
          { id: '15901063', name: 'Tændrør (2 stk)', price: 165.00, count: 1, sum: 165.00 },
        ],
        stepTotal: 991.33,
      },
      500: {
        rows: [
          { id: '15901064', name: 'Oliefilter Vanguard', price: 206.00, count: 1, sum: 206.00 },
          { id: '13101012', name: 'Motorolie Texaco Delo', price: 97.63, count: 1, sum: 97.63 },
          { id: '22601012', name: 'Luftfilter Vanguard', price: 385.30, count: 1, sum: 385.30 },
          { id: '22601013', name: 'Forfilter Vanguard', price: 137.40, count: 1, sum: 137.40 },
          { id: '15901063', name: 'Tændrør (2 stk)', price: 155.40, count: 1, sum: 155.40 },
          { id: 'VHY-00114', name: 'Hydraulikolie returfilter', price: 1202.00, count: 1, sum: 1202.00 },
        ],
        stepTotal: 2183.73,
      },
    },
  },
  timan3330: {
    intervals: [50, 250, 450, 650, 850, 1050, 1250],
    accumulatedTotals: {
      50: 1455.00,
      250: 1920.00,
      450: 3125.00,
      650: 3590.00,
      850: 6650.00,
      1050: 7205.00,
      1250: 8885.00,
    },
    steps: {
      50: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: 'VHY-00114', name: 'Hydraulikolie returfilter', price: 1200.00, count: 1, sum: 1200.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
        ],
        stepTotal: 1455.00,
      },
      250: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
          { id: 'VMO-00054', name: 'Kabinefilter', price: 210.00, count: 1, sum: 210.00 },
        ],
        stepTotal: 465.00,
      },
      450: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
          { id: 'VMO-00054', name: 'Kabinefilter', price: 210.00, count: 1, sum: 210.00 },
          { id: 'VMO-00052', name: 'Yderste luftfilter', price: 325.00, count: 1, sum: 325.00 },
          { id: 'VMO-00053', name: 'Inderste luftfilter', price: 270.00, count: 1, sum: 270.00 },
          { id: '22201083', name: 'Forfilter brændstof', price: 145.00, count: 1, sum: 145.00 },
        ],
        stepTotal: 1205.00,
      },
      650: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
          { id: 'VMO-00054', name: 'Kabinefilter', price: 210.00, count: 1, sum: 210.00 },
        ],
        stepTotal: 465.00,
      },
      850: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: 'VHY-00114', name: 'Hydraulikolie returfilter', price: 1200.00, count: 1, sum: 1200.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
          { id: 'VMO-00054', name: 'Kabinefilter', price: 210.00, count: 1, sum: 210.00 },
          { id: 'VMO-00052', name: 'Yderste luftfilter', price: 325.00, count: 1, sum: 325.00 },
          { id: 'VMO-00053', name: 'Inderste luftfilter', price: 270.00, count: 1, sum: 270.00 },
          { id: '22201083', name: 'Forfilter brændstof', price: 145.00, count: 1, sum: 145.00 },
          { id: 'VTN-000722', name: 'Viskerblad 900 mm 15 mm ryg', price: 655.00, count: 1, sum: 655.00 },
        ],
        stepTotal: 3060.00,
      },
      1050: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
          { id: 'VMO-00054', name: 'Kabinefilter', price: 210.00, count: 1, sum: 210.00 },
          { id: '15901130', name: 'Tændrør', price: 90.00, count: 1, sum: 90.00 },
        ],
        stepTotal: 555.00,
      },
      1250: {
        rows: [
          { id: '15901121', name: 'Motoroliefilter', price: 230.00, count: 1, sum: 230.00 },
          { id: '13101001', name: 'Motorolie Texaco Havoline Extra 10W-', price: 25.00, count: 1, sum: 25.00 },
          { id: 'VMO-00054', name: 'Kabinefilter', price: 210.00, count: 1, sum: 210.00 },
          { id: 'VMO-00052', name: 'Yderste luftfilter', price: 325.00, count: 1, sum: 325.00 },
          { id: 'VMO-00053', name: 'Inderste luftfilter', price: 270.00, count: 1, sum: 270.00 },
          { id: '22201083', name: 'Forfilter brændstof', price: 145.00, count: 1, sum: 145.00 },
          { id: 'VTR-00008', name: 'Kileren pumpe', price: 160.00, count: 1, sum: 160.00 },
          { id: '15901122', name: 'Ventilatorrem', price: 135.00, count: 1, sum: 135.00 },
          { id: '52101009', name: 'Kileren AC', price: 180.00, count: 1, sum: 180.00 },
        ],
        stepTotal: 1680.00,
      },
    },
  },
};

/** Get the service plan for a machine, or null if unknown. */
export function getServicePlan(machineKey: ServiceMachineKey): MachineService | null {
  return servicePartsData[machineKey] ?? null;
}

/**
 * Yearly service cost based on intervals and operating hours per year.
 * Service plan repeats in cycles of length = max defined interval.
 */
export function calculateYearlyServiceCost(
  machineKey: ServiceMachineKey,
  yearlyHours: number,
): number {
  const svc = servicePartsData[machineKey];
  if (!svc || yearlyHours <= 0) return 0;
  const intervals = svc.intervals;
  if (intervals.length === 0) return 0;
  const cycleLength = Math.max(...intervals);
  if (cycleLength <= 0) return 0;

  const cycleTotal = intervals.reduce(
    (sum, h) => sum + (svc.steps[h]?.stepTotal ?? 0),
    0,
  );
  const fullCycles = Math.floor(yearlyHours / cycleLength);
  const remainder = yearlyHours - fullCycles * cycleLength;
  const remainderTotal = intervals.reduce(
    (sum, h) => (h <= remainder ? sum + (svc.steps[h]?.stepTotal ?? 0) : sum),
    0,
  );
  return fullCycles * cycleTotal + remainderTotal;
}

/**
 * Interval that represents the "current step" in the service cycle for
 * the given yearly hours. Returns null if the machine has no data.
 */
export function computeRelevantInterval(
  machineKey: ServiceMachineKey,
  yearlyHours: number,
): number | null {
  const svc = servicePartsData[machineKey];
  if (!svc || svc.intervals.length === 0) return null;
  const sorted = [...svc.intervals].sort((a, b) => a - b);
  const cycleLength = sorted[sorted.length - 1];
  if (cycleLength <= 0 || yearlyHours <= 0) return sorted[0];
  const remainder = yearlyHours % cycleLength;
  if (remainder === 0) return cycleLength;
  let candidate = sorted[0];
  for (const h of sorted) {
    if (h <= remainder) candidate = h;
    else break;
  }
  return candidate;
}
