import { useState, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Calculator, RotateCw, Info, Printer } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import {
  servicePartsData,
  calculateYearlyServiceCost,
  computeRelevantInterval,
  type ServiceMachineKey,
} from '@/lib/serviceBasisData';

// ---------------- Locales (from mockup) ----------------
type LangKey = 'da' | 'de' | 'en';

type Texts = {
  title: string; subtitle: string; commonHeader: string;
  fuelPrice: string; days: string; hours: string;
  depreciation: string; interest: string; reset: string;
  machineData: string; purchasePrice: string; fuelConsumption: string;
  serviceCost: string; residualValue: string; calcData: string;
  totalHours: string; fuelCost: string; capitalCost: string;
  totalYear: string; totalHour: string; guidanceHeader: string;
  guidancePoints: string[]; print: string; disclaimer: string;
  useCalculated: string; seeBasis: string; modalInterval: string;
  modalPartId: string; modalDescription: string; modalPrice: string;
  modalCount: string; modalSum: string; modalNoData: string;
  modalStepTotal: string; modalTotalAccumulated: string;
  modalTotalExclVat: string; modalClose: string;
  back: string;
};

type Locale = {
  label: string; currency: string; currencyLocale: string;
  currencySymbol: string; rate: number; texts: Texts;
};

const locales: Record<LangKey, Locale> = {
  da: {
    label: 'DK', currency: 'DKK', currencyLocale: 'da-DK', currencySymbol: 'kr.', rate: 1,
    texts: {
      title: 'Driftberegner', subtitle: 'RC-751, RC-1000s og 3330+T2',
      commonHeader: 'Forudsætninger', fuelPrice: 'Brændstofpris', days: 'Antal dage',
      hours: 'Timer/dag', depreciation: 'Afskrivning (år)', interest: 'Rente (%)',
      reset: 'Nulstil', machineData: 'MASKIN DATA', purchasePrice: 'Pris',
      fuelConsumption: 'Forbrug (l/t)', serviceCost: 'Service (år)', residualValue: 'Restværdi',
      calcData: 'BEREGNEDE RESULTATER', totalHours: 'Timer/år', fuelCost: 'Brændstof/år',
      capitalCost: 'Afskr./Renter', totalYear: 'Total/år', totalHour: 'Pris/time',
      guidanceHeader: 'Vejledning',
      guidancePoints: [
        'Gule felter kan redigeres.',
        'Husk dagsaktuel brændstofpris.',
        'Service er estimater baseret på reservedele.',
        'Afskrivning påvirker timeprisen.'
      ],
      print: 'Udskriv rapport', disclaimer: 'Vejledende beregning. Forbehold for fejl.',
      useCalculated: 'Brug beregnet', seeBasis: 'Se grundlag',
      modalInterval: 'Vælg interval:', modalPartId: 'Varenr', modalDescription: 'Beskrivelse',
      modalPrice: 'Stk pris', modalCount: 'Antal', modalSum: 'Sum', modalNoData: 'Ingen data.',
      modalStepTotal: 'Service ved {0} timer:', modalTotalAccumulated: 'Total akkumuleret:',
      modalTotalExclVat: 'Total ekskl. moms:', modalClose: 'Luk',
      back: 'Tilbage til ressourcer',
    },
  },
  de: {
    label: 'DE', currency: 'EUR', currencyLocale: 'de-DE', currencySymbol: '€', rate: 0.1341,
    texts: {
      title: 'Betriebskosten', subtitle: 'RC-751, RC-1000s und 3330+T2',
      commonHeader: 'Annahmen', fuelPrice: 'Kraftstoffpreis', days: 'Tage/Jahr',
      hours: 'Std/Tag', depreciation: 'Abschreibung', interest: 'Zins (%)',
      reset: 'Reset', machineData: 'MASCHINENDATEN', purchasePrice: 'Preis',
      fuelConsumption: 'Verbrauch (l/h)', serviceCost: 'Service', residualValue: 'Restwert',
      calcData: 'BERECHNET', totalHours: 'Std/Jahr', fuelCost: 'Kraftstoff/Jahr',
      capitalCost: 'Abschr./Zins', totalYear: 'Gesamt/Jahr', totalHour: 'Preis/Std',
      guidanceHeader: 'Anleitung',
      guidancePoints: ['Gelbe Felder bearbeitbar.', 'Kraftstoffpreis anpassen.'],
      print: 'Drucken', disclaimer: 'Unverbindliche Berechnung.',
      useCalculated: 'Auto', seeBasis: 'Details',
      modalInterval: 'Intervall:', modalPartId: 'Art.Nr.', modalDescription: 'Beschreibung',
      modalPrice: 'Preis', modalCount: 'Menge', modalSum: 'Summe', modalNoData: 'Keine Daten.',
      modalStepTotal: 'Service bei {0} Std:', modalTotalAccumulated: 'Gesamt:',
      modalTotalExclVat: 'Gesamt exkl. MwSt:', modalClose: 'Schließen',
      back: 'Zurück zu Ressourcen',
    },
  },
  en: {
    label: 'EN', currency: 'EUR', currencyLocale: 'en-GB', currencySymbol: '€', rate: 0.1341,
    texts: {
      title: 'Cost Calculator', subtitle: 'RC-751, RC-1000s and 3330+T2',
      commonHeader: 'Assumptions', fuelPrice: 'Fuel Price', days: 'Days/yr',
      hours: 'Hours/day', depreciation: 'Depreciation', interest: 'Interest (%)',
      reset: 'Reset', machineData: 'INPUT DATA', purchasePrice: 'Price',
      fuelConsumption: 'Fuel (l/h)', serviceCost: 'Service (yr)', residualValue: 'Residual Val',
      calcData: 'CALCULATED', totalHours: 'Hours/yr', fuelCost: 'Fuel/yr',
      capitalCost: 'Depr./Int.', totalYear: 'Total/yr', totalHour: 'Cost/hr',
      guidanceHeader: 'Guidance',
      guidancePoints: ['Yellow fields editable.'],
      print: 'Print', disclaimer: 'Indicative calculation.',
      useCalculated: 'Auto', seeBasis: 'See basis',
      modalInterval: 'Select interval:', modalPartId: 'Part No.', modalDescription: 'Description',
      modalPrice: 'Price', modalCount: 'Qty', modalSum: 'Sum', modalNoData: 'No data.',
      modalStepTotal: 'Service at {0} hours:', modalTotalAccumulated: 'Total (accumulated):',
      modalTotalExclVat: 'Total excl. VAT:', modalClose: 'Close',
      back: 'Back to resources',
    },
  },
};

type MachineKey = ServiceMachineKey;

const formatPriceDK = (amount: number) =>
  new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' kr.';

type Common = {
  fuelPrice: number; daysPerYear: number; hoursPerDay: number;
  depreciationYears: number; interestRate: number;
};
type Machine = {
  name: string; purchasePrice: number; fuelConsumption: number;
  serviceCostYear: number; residualValuePercent: number; isServiceManual: boolean;
};

const baseCommon: Common = {
  fuelPrice: 13.50, daysPerYear: 125, hoursPerDay: 6,
  depreciationYears: 5, interestRate: 4.0,
};
const baseMachines: Record<MachineKey, Omit<Machine, 'isServiceManual'>> = {
  rc751:     { name: 'RC-751',   purchasePrice: 161700, fuelConsumption: 3.5, serviceCostYear: 4500, residualValuePercent: 20 },
  rc1000:    { name: 'RC-1000s', purchasePrice: 269800, fuelConsumption: 5.5, serviceCostYear: 6500, residualValuePercent: 20 },
  timan3330: { name: '3330+T2',  purchasePrice: 586135, fuelConsumption: 6.0, serviceCostYear: 7500, residualValuePercent: 20 },
};

const num = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};


function calculateCosts(common: Common, machine: Machine, serviceCostYear: number) {
  const totalHours = num(common.daysPerYear) * num(common.hoursPerDay);
  const residualVal = num(machine.purchasePrice) * (num(machine.residualValuePercent) / 100);
  const deprYear = num(common.depreciationYears) > 0
    ? (num(machine.purchasePrice) - residualVal) / num(common.depreciationYears)
    : 0;
  const interestYear = ((num(machine.purchasePrice) + residualVal) / 2) * (num(common.interestRate) / 100);
  const fuelYear = totalHours * num(machine.fuelConsumption) * num(common.fuelPrice);
  const totalYear = deprYear + interestYear + fuelYear + serviceCostYear;
  return {
    totalHours, totalYear,
    hourCost: totalHours > 0 ? totalYear / totalHours : 0,
    capital: deprYear + interestYear,
    fuel: fuelYear,
    serviceCostYear,
  };
}

const MACHINE_KEYS: MachineKey[] = ['rc751', 'rc1000', 'timan3330'];

export default function DriftberegnerPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: appLanguage, setLanguage: setAppLang } = useLanguage();
  const navigate = useNavigate();

  // Calculator only ships DA/DE/EN translations. Map other portal languages
  // (it/hu) to Danish as the requested fallback.
  const currentLang: LangKey = (['da', 'de', 'en'] as LangKey[]).includes(appLanguage as LangKey)
    ? (appLanguage as LangKey)
    : 'da';

  const [common, setCommon] = useState<Common>({ ...baseCommon });
  const [rc751, setRc751] = useState<Machine>({ ...baseMachines.rc751, isServiceManual: false });
  const [rc1000, setRc1000] = useState<Machine>({ ...baseMachines.rc1000, isServiceManual: false });
  const [timan3330, setTiman3330] = useState<Machine>({ ...baseMachines.timan3330, isServiceManual: false });
  const [modalMachine, setModalMachine] = useState<MachineKey | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);




  const openServiceModal = (m: MachineKey) => {
    const svc = servicePartsData[m];
    const yearlyHours = num(common.daysPerYear) * num(common.hoursPerDay);
    const relevant = computeRelevantInterval(m, yearlyHours);
    // Fallback chain: relevant → first interval with data → last interval
    const withData = svc.intervals.find(i => svc.steps[i]);
    setSelectedInterval(relevant ?? withData ?? svc.intervals[svc.intervals.length - 1]);
    setModalMachine(m);
  };

  const closeServiceModal = () => {
    setModalMachine(null);
    setSelectedInterval(null);
  };

  // All hooks must be called before any early returns
  const results = useMemo(() => {
    const yearlyHours = num(common.daysPerYear) * num(common.hoursPerDay);
    return {
      rc751: calculateCosts(common, rc751, calculateYearlyServiceCost('rc751', yearlyHours)),
      rc1000: calculateCosts(common, rc1000, calculateYearlyServiceCost('rc1000', yearlyHours)),
      timan3330: calculateCosts(common, timan3330, calculateYearlyServiceCost('timan3330', yearlyHours)),
    };
  }, [common, rc751, rc1000, timan3330]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  {
    const portalRole = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','private_end_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !(portalRole && dealerSideRoles.has(portalRole))) {
      return <Navigate to="/configurator" replace />;
    }
  }

  const loc = locales[currentLang];
  const t = loc.texts;

  const machinesState: Record<MachineKey, Machine> = { rc751, rc1000, timan3330 };
  const setMachineState: Record<MachineKey, (m: Machine) => void> = {
    rc751: setRc751, rc1000: setRc1000, timan3330: setTiman3330,
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(loc.currencyLocale, {
      style: 'currency', currency: loc.currency, maximumFractionDigits: 0,
    }).format(amount);

  const formatThousands = (val: number | string) =>
    new Intl.NumberFormat('da-DK').format(num(val));

  const updateCommon = (f: keyof Common, v: string) =>
    setCommon(s => ({ ...s, [f]: num(v) }));

  const updateMachineField = (m: MachineKey, f: keyof Machine, v: string | number | boolean) =>
    setMachineState[m]({ ...machinesState[m], [f]: v as never });

  const updateMachinePrice = (m: MachineKey, v: string) =>
    setMachineState[m]({ ...machinesState[m], purchasePrice: num(v) });

  const updateMachineServiceManual = (m: MachineKey, v: string) =>
    setMachineState[m]({ ...machinesState[m], serviceCostYear: num(v), isServiceManual: true });

  const resetCalculator = () => {
    setCommon({ ...baseCommon });
    setRc751({ ...baseMachines.rc751, isServiceManual: false });
    setRc1000({ ...baseMachines.rc1000, isServiceManual: false });
    setTiman3330({ ...baseMachines.timan3330, isServiceManual: false });
  };

  // (Language is controlled by the global PortalHeader selector.)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-area {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
        .drift-num-input::-webkit-inner-spin-button,
        .drift-num-input::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }
      `}</style>

      <div className="no-print">
        <PortalHeader
          hideMesseHomeShortcut
          user={appUser}
          language={appLanguage}
          onLanguageChange={setAppLang}
          onLogout={async () => {
            await logout();
            navigate('/portal', { replace: true });
          }}
        />
      </div>

      {/* Calculator sub-header */}
      <header className="bg-white border-b border-gray-200 py-6 no-print">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t.title}</h1>
            <p className="text-gray-500">{t.subtitle}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col items-center w-full flex-grow">
        <div className="w-full space-y-6 print-area">

          {/* Assumptions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-700">
              {t.commonHeader}
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="min-w-0">
                <label
                  className="block text-[10px] font-bold text-gray-400 uppercase mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                  title={`${t.fuelPrice} (${loc.currency})`}
                >
                  {t.fuelPrice} ({loc.currency})
                </label>
                <input
                  type="number"
                  value={common.fuelPrice}
                  onChange={(e) => updateCommon('fuelPrice', e.target.value)}
                  className="drift-num-input w-full bg-yellow-50 border border-yellow-200 rounded-md px-2 py-1 text-sm font-bold focus:ring-2 focus:ring-[#2d5a27] outline-none"
                />
              </div>
              {([
                { key: 'daysPerYear', label: t.days },
                { key: 'hoursPerDay', label: t.hours },
                { key: 'depreciationYears', label: t.depreciation },
                { key: 'interestRate', label: t.interest },
              ] as { key: keyof Common; label: string }[]).map(({ key, label }) => (
                <div key={key} className="min-w-0">
                  <label
                    className="block text-[10px] font-bold text-gray-400 uppercase mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                    title={label}
                  >
                    {label}
                  </label>
                  <input
                    type="number"
                    value={common[key]}
                    onChange={(e) => updateCommon(key, e.target.value)}
                    className="drift-num-input w-full bg-yellow-50 border border-yellow-200 rounded-md px-2 py-1 text-sm font-bold focus:ring-2 focus:ring-[#2d5a27] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* TCO comparison table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-[#2d5a27] text-white px-6 py-4 flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2">
                <Calculator className="h-4 w-4" /> TCO Sammenligning
              </h2>
              <button
                onClick={resetCalculator}
                className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full flex items-center gap-1 transition-all uppercase font-bold"
              >
                <RotateCw className="h-3 w-3" /> {t.reset}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="px-6 py-4 font-bold">Parameter</th>
                    {MACHINE_KEYS.map(m => (
                      <th key={m} className="px-6 py-4 text-center text-gray-900 font-black">
                        {machinesState[m].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {/* Purchase price */}
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-500">{t.purchasePrice} ({loc.currency})</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4">
                        <input
                          type="text"
                          value={formatThousands(machinesState[m].purchasePrice)}
                          onChange={(e) => updateMachinePrice(m, e.target.value)}
                          className="w-full bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-center font-bold text-sm outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                  {/* Fuel consumption */}
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-500">{t.fuelConsumption}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4">
                        <input
                          type="number"
                          value={machinesState[m].fuelConsumption}
                          onChange={(e) => updateMachineField(m, 'fuelConsumption', num(e.target.value))}
                          className="drift-num-input w-full bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-center font-bold text-sm outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                  {/* Service cost */}
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-500">{t.serviceCost}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4 text-center">
                        <input
                          type="text"
                          value={formatThousands(Math.round(results[m].serviceCostYear))}
                          readOnly
                          tabIndex={-1}
                          className="w-full bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-center font-bold text-sm outline-none mb-1 cursor-default"
                        />
                        <button
                          onClick={() => openServiceModal(m)}
                          className="text-[9px] text-[#2d5a27] font-bold hover:underline uppercase tracking-tighter"
                        >
                          {t.seeBasis}
                        </button>
                      </td>
                    ))}
                  </tr>
                  {/* Residual value (%) - editable */}
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-500">{t.residualValue} (%)</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4">
                        <input
                          type="number"
                          value={machinesState[m].residualValuePercent}
                          onChange={(e) => updateMachineField(m, 'residualValuePercent', num(e.target.value))}
                          className="drift-num-input w-full bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-center font-bold text-sm outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                  {/* Calculated header */}
                  <tr className="bg-gray-50/50">
                    <td colSpan={4} className="px-6 py-2 text-[10px] font-black text-gray-300 uppercase">
                      {t.calcData}
                    </td>
                  </tr>
                  {/* Hours per year */}
                  <tr>
                    <td className="px-6 py-4 text-gray-500">{t.totalHours}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4 text-center font-bold">
                        {formatThousands(results[m].totalHours)}
                      </td>
                    ))}
                  </tr>
                  {/* Fuel cost */}
                  <tr>
                    <td className="px-6 py-4 text-gray-500">{t.fuelCost}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4 text-center font-bold">
                        {formatCurrency(results[m].fuel)}
                      </td>
                    ))}
                  </tr>
                  {/* Capital cost (depreciation + interest) */}
                  <tr>
                    <td className="px-6 py-4 text-gray-500">{t.capitalCost}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4 text-center font-bold">
                        {formatCurrency(results[m].capital)}
                      </td>
                    ))}
                  </tr>
                  {/* Total per year */}
                  <tr>
                    <td className="px-6 py-4 text-gray-500">{t.totalYear}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4 text-center font-bold">
                        {formatCurrency(results[m].totalYear)}
                      </td>
                    ))}
                  </tr>
                  {/* Total per hour */}
                  <tr className="bg-gray-900 text-white font-black">
                    <td className="px-6 py-4">{t.totalHour}</td>
                    {MACHINE_KEYS.map(m => (
                      <td key={m} className="px-6 py-4 text-center text-lg text-green-400">
                        {formatCurrency(results[m].hourCost)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Guidance + Print */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex gap-4">
              <span className="text-[#2d5a27] mt-1"><Info className="h-4 w-4" /></span>
              <div>
                <h4 className="font-bold mb-1">{t.guidanceHeader}</h4>
                <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
                  {t.guidancePoints.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="bg-gray-900 text-white p-6 rounded-2xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-3 font-bold"
            >
              <Printer className="h-4 w-4" /> {t.print}
            </button>
          </div>

          <p className="text-[10px] text-center text-gray-400 italic">{t.disclaimer}</p>
        </div>
      </main>

      <div className="no-print">
        <PortalFooter language={appLanguage} />
      </div>

      {/* Service basis modal */}
      {modalMachine && selectedInterval !== null && (() => {
        const svc = servicePartsData[modalMachine];
        const step = svc.steps[selectedInterval];
        const stepRows = step?.rows ?? [];
        const stepTotal = step?.stepTotal ?? 0;
        const accumulated = svc.accumulatedTotals[selectedInterval] ?? stepTotal;
        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 no-print"
            onClick={closeServiceModal}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Red header bar */}
              <div className="bg-red-600 px-6 py-5 text-white flex justify-between items-center">
                <h3 className="text-2xl font-bold">
                  Servicegrundlag – {machinesState[modalMachine].name}
                </h3>
                <button
                  onClick={closeServiceModal}
                  className="text-white/90 hover:text-white text-4xl leading-none"
                  aria-label={t.modalClose}
                >
                  ×
                </button>
              </div>

              <div className="p-5 bg-gray-50 max-h-[75vh] overflow-y-auto">
                {/* Interval selector */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xl font-semibold text-gray-700 mr-2">Vælg interval:</div>
                    {svc.intervals.map(h => {
                      const active = selectedInterval === h;
                      return (
                        <button
                          key={h}
                          onClick={() => setSelectedInterval(h)}
                          className={`px-5 py-2 rounded-md border text-base font-semibold transition ${
                            active
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {h} Timer
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-xs text-gray-500">
                    Beregnet ud fra: {formatThousands(num(common.daysPerYear) * num(common.hoursPerDay))} timer/år
                  </div>
                </div>

                {/* Parts table */}
                <div className="mt-5 bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-4 py-3 font-bold">Varenr</th>
                        <th className="px-4 py-3 font-bold">Beskrivelse</th>
                        <th className="px-4 py-3 font-bold text-right">Stk pris</th>
                        <th className="px-4 py-3 font-bold text-center">Antal</th>
                        <th className="px-4 py-3 font-bold text-right">Sum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stepRows.length > 0 ? (
                        stepRows.map((row, i) => (
                          <tr key={i} className="border-t border-gray-200 text-gray-700">
                            <td className="px-4 py-3">{row.id}</td>
                            <td className="px-4 py-3">{row.name}</td>
                            <td className="px-4 py-3 text-right">{formatPriceDK(row.price)}</td>
                            <td className="px-4 py-3 text-center">{row.count}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatPriceDK(row.sum)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">
                            Intervaldata mangler endnu for {selectedInterval} timer.
                          </td>
                        </tr>
                      )}

                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={4} className="px-4 py-2 text-right text-gray-500">
                          Service ved {selectedInterval} timer (kun dette trin):
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {formatPriceDK(stepTotal)}
                        </td>
                      </tr>

                      <tr className="border-t border-gray-200">
                        <td colSpan={4} className="px-4 py-3 text-right text-lg font-bold text-gray-700">
                          Total samlet (akkumuleret):
                        </td>
                        <td className="px-4 py-3 text-right text-lg font-bold text-red-600">
                          {formatPriceDK(accumulated)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm italic text-gray-500">
                  * Priser er vejledende listepriser ekskl. moms. Arbejdsløn er ikke inkluderet i reservedelsprisen.
                </p>
              </div>

              {/* Dark close button footer */}
              <div className="px-5 py-4 bg-gray-100 flex justify-end">
                <button
                  onClick={closeServiceModal}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-3 rounded-lg"
                >
                  {t.modalClose}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
