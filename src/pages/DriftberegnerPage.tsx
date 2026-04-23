import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';

const LANGS: { code: Language; flag: string; label: string }[] = [
  { code: 'da', flag: '🇩🇰', label: 'DA' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'hu', flag: '🇭🇺', label: 'HU' },
];

const T: Record<string, Record<string, string>> = {
  back: {
    da: 'Tilbage til ressourcer',
    en: 'Back to resources',
    de: 'Zurück zu Ressourcen',
    it: 'Torna alle risorse',
    hu: 'Vissza a forrásokhoz',
  },
};

// Calculator translations from mockup (DA/EN/DE). IT/HU fall back to DA.
const calcT: Record<string, {
  title: string; subtitle: string; commonHeader: string;
  fuelPrice: string; daysPerYear: string; hoursPerDay: string;
  totalHour: string; results: string; machine: string;
}> = {
  da: { title: 'Driftberegner', subtitle: 'RC-751, RC-1000s og 3330+T2', commonHeader: 'Forudsætninger', fuelPrice: 'Brændstofpris', daysPerYear: 'Dage/år', hoursPerDay: 'Timer/dag', totalHour: 'Pris/time', results: 'Resultater', machine: 'Maskine' },
  en: { title: 'Cost Calculator', subtitle: 'RC-751, RC-1000s and 3330+T2', commonHeader: 'Assumptions', fuelPrice: 'Fuel Price', daysPerYear: 'Days/year', hoursPerDay: 'Hours/day', totalHour: 'Cost/hr', results: 'Results', machine: 'Machine' },
  de: { title: 'Betriebskosten', subtitle: 'RC-751, RC-1000s und 3330+T2', commonHeader: 'Annahmen', fuelPrice: 'Kraftstoffpreis', daysPerYear: 'Tage/Jahr', hoursPerDay: 'Stunden/Tag', totalHour: 'Preis/Std', results: 'Ergebnisse', machine: 'Maschine' },
};

type Machine = { name: string; purchasePrice: number; fuelConsumption: number; serviceCostYear: number; residualValuePercent: number };
type CalcState = {
  common: { fuelPrice: number; daysPerYear: number; hoursPerDay: number; depreciationYears: number; interestRate: number };
  rc751: Machine;
  rc1000: Machine;
  timan3330: Machine;
};

const INITIAL: CalcState = {
  common: { fuelPrice: 13.50, daysPerYear: 125, hoursPerDay: 6, depreciationYears: 5, interestRate: 4.0 },
  rc751:     { name: 'RC-751',   purchasePrice: 161700, fuelConsumption: 3.5, serviceCostYear: 4500, residualValuePercent: 20 },
  rc1000:    { name: 'RC-1000s', purchasePrice: 269800, fuelConsumption: 5.5, serviceCostYear: 6500, residualValuePercent: 20 },
  timan3330: { name: '3330+T2',  purchasePrice: 586135, fuelConsumption: 6.0, serviceCostYear: 7500, residualValuePercent: 20 },
};

const num = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
};

function calcHourCost(c: CalcState, m: Machine) {
  const totalHours = num(c.common.daysPerYear) * num(c.common.hoursPerDay);
  const fuelYear = totalHours * num(m.fuelConsumption) * num(c.common.fuelPrice);
  const totalYear = fuelYear + num(m.serviceCostYear) + (num(m.purchasePrice) / 5);
  return totalHours > 0 ? totalYear / totalHours : 0;
}

export default function DriftberegnerPage() {
  const { appUser, loading, logout } = useAppUser();
  const { state, setLanguage } = useConfigurator();
  const navigate = useNavigate();
  const lang = state.language;
  const [calc, setCalc] = useState<CalcState>(INITIAL);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const t = calcT[lang] ?? calcT.da;
  const setCommon = (k: keyof CalcState['common'], v: string) =>
    setCalc(s => ({ ...s, common: { ...s.common, [k]: num(v) } }));

  const machines: Array<keyof Pick<CalcState, 'rc751' | 'rc1000' | 'timan3330'>> = ['rc751', 'rc1000', 'timan3330'];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      {/* Calculator sub-header */}
      <header className="bg-white border-b border-gray-200 py-6 no-print">
        <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
          <button
            onClick={() => navigate('/portal/resources')}
            className="flex items-center text-[#2d5a27] font-semibold hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200">
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition ${
                  lang === l.code ? 'bg-white shadow-sm border border-[#2d5a27]/30 text-gray-900' : 'text-gray-600 hover:bg-white'
                }`}
                aria-label={l.code}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col items-center w-full flex-grow">
        <div className="w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{t.title}</h1>
            <p className="text-gray-500">{t.subtitle}</p>
          </div>

          {/* Assumptions card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 font-bold text-gray-700">
              {t.commonHeader}
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t.fuelPrice}</label>
                <input
                  type="number"
                  value={calc.common.fuelPrice}
                  onChange={(e) => setCommon('fuelPrice', e.target.value)}
                  className="w-full bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t.daysPerYear}</label>
                <input
                  type="number"
                  value={calc.common.daysPerYear}
                  onChange={(e) => setCommon('daysPerYear', e.target.value)}
                  className="w-full bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t.hoursPerDay}</label>
                <input
                  type="number"
                  value={calc.common.hoursPerDay}
                  onChange={(e) => setCommon('hoursPerDay', e.target.value)}
                  className="w-full bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                />
              </div>
            </div>
          </div>

          {/* Results card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
              <h2 className="font-bold">{t.results}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase font-black tracking-widest border-b">
                    <th className="px-6 py-4">{t.machine}</th>
                    <th className="px-6 py-4 text-center">{t.totalHour}</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m) => {
                    const hourCost = calcHourCost(calc, calc[m]);
                    return (
                      <tr key={m} className="border-b border-gray-50">
                        <td className="px-6 py-4 font-bold text-gray-700">{calc[m].name}</td>
                        <td className="px-6 py-4 text-center text-lg font-black text-emerald-600">
                          {Math.round(hourCost)} <span className="text-xs text-gray-400">kr.</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
