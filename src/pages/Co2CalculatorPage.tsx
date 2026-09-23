import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Cloud, Fuel, Leaf } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { isMesseRouteContext } from '@/lib/portalAccess';
import { Language } from '@/types/configurator';

const backT: Record<Language, string> = {
  da: 'Tilbage til ressourcer',
  en: 'Back to resources',
  de: 'Zurück zu Ressourcen',
  it: 'Torna alle risorse',
  hu: 'Vissza a forrásokhoz',
};

type Tx = {
  co2Title: string; co2Subtitle: string;
  parameters: string; hoursLabel: string; yearsLabel: string;
  fuelPriceLabel: string; currency: string; locale: string;
  hoursUnit: string; yearsUnit: string;
  timanBetter: string; timanBetterBody: string;
  comparisonTitle: string;
  savingsTitle: string;
  fuelSaved: string; co2Saved: string; tons: string;
};

// Translations from mockup (DA/EN/DE). IT/HU fall back to DA.
const TR: Record<string, Tx> = {
  da: {
    co2Title: 'Timan CO2 Kalkulator', co2Subtitle: 'Sammenlign Timan 3330 med Egholm 2260',
    parameters: 'Parametre', hoursLabel: 'Timer pr. år', yearsLabel: 'Antal år (Ejerperiode)',
    fuelPriceLabel: 'Brændstofpris pr. liter', currency: 'kr.', locale: 'da-DK',
    hoursUnit: 't.', yearsUnit: 'år',
    timanBetter: 'Timan er det grønne valg',
    timanBetterBody: 'Baseret på testdata: Timan (5,1 l/t) vs Egholm (6,9 l/t). 1L diesel = 2.4kg CO2.',
    comparisonTitle: 'Sammenligning af udledning',
    savingsTitle: 'Din samlede besparelse',
    fuelSaved: 'Liter sparet', co2Saved: 'CO2 sparet (kg)', tons: 'tons',
  },
  en: {
    co2Title: 'Timan CO2 Calculator', co2Subtitle: 'Compare Timan 3330 with Egholm 2260',
    parameters: 'Parameters', hoursLabel: 'Hours per year', yearsLabel: 'Years (Ownership)',
    fuelPriceLabel: 'Fuel price per liter', currency: '€', locale: 'en-GB',
    hoursUnit: 'h', yearsUnit: 'yr',
    timanBetter: 'Timan is the green choice',
    timanBetterBody: 'Based on test data: Timan (5.1 l/h) vs Egholm (6.9 l/h). 1L diesel = 2.4kg CO2.',
    comparisonTitle: 'Emissions comparison',
    savingsTitle: 'Your total savings',
    fuelSaved: 'Liters saved', co2Saved: 'CO2 saved (kg)', tons: 'tons',
  },
  de: {
    co2Title: 'Timan CO2-Rechner', co2Subtitle: 'Timan 3330 vs Egholm 2260',
    parameters: 'Parameter', hoursLabel: 'Stunden pro Jahr', yearsLabel: 'Jahre (Haltedauer)',
    fuelPriceLabel: 'Kraftstoffpreis pro Liter', currency: '€', locale: 'de-DE',
    hoursUnit: 'Std', yearsUnit: 'J',
    timanBetter: 'Timan ist die grüne Wahl',
    timanBetterBody: 'Basierend auf Testdaten: Timan (5,1 l/Std) vs Egholm (6,9 l/Std). 1L Diesel = 2,4kg CO2.',
    comparisonTitle: 'Emissionsvergleich',
    savingsTitle: 'Ihre Gesamtersparnis',
    fuelSaved: 'Liter gespart', co2Saved: 'CO2 gespart (kg)', tons: 'Tonnen',
  },
};

const exchangeRates: Record<string, number> = { da: 1.0, en: 0.134, de: 0.134, it: 0.134, hu: 0.134 };

type Co2State = {
  hours: number;
  years: number;
  baseFuelPriceDKK: number;
  timanCons: number;
  egholmCons: number;
  co2Factor: number;
};

const INITIAL: Co2State = {
  hours: 500,
  years: 10,
  baseFuelPriceDKK: 12.0,
  timanCons: 5.1,
  egholmCons: 6.9,
  co2Factor: 2.4,
};

export default function Co2CalculatorPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [co2, setCo2] = useState<Co2State>(INITIAL);

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
    const isMesseCalculatorSession = isMesseRouteContext(location.pathname);
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !isMesseCalculatorSession && !(portalRole && dealerSideRoles.has(portalRole))) {
      return <Navigate to="/configurator" replace />;
    }
  }

  const t = TR[lang] ?? TR.da;
  const rate = exchangeRates[lang] ?? 0.134;

  // Calculations from mockup
  const totalHours = co2.hours * co2.years;
  const timanCo2 = co2.timanCons * totalHours * co2.co2Factor;
  const egholmCo2 = co2.egholmCons * totalHours * co2.co2Factor;
  const fuelSavedVal = (co2.egholmCons - co2.timanCons) * totalHours;
  const co2SavedVal = fuelSavedVal * co2.co2Factor;
  const moneySaved = fuelSavedVal * co2.baseFuelPriceDKK * rate;
  const visualMax = (2000 * 15 * 6.9 * 2.4) / 2.5;

  const displayedPrice = (co2.baseFuelPriceDKK * rate).toLocaleString(t.locale, { minimumFractionDigits: 2 });
  const fmt = (n: number) => Math.round(n).toLocaleString(t.locale);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        hideMesseHomeShortcut
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      <main className="mx-auto w-full max-w-6xl flex-grow px-4 py-5 no-print sm:px-6 sm:py-7">
        <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">{t.co2Title}</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">{t.co2Subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 sm:pb-1">
            <Leaf className="h-4 w-4" aria-hidden="true" />
            <span>{t.timanBetter}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:row-span-2" aria-labelledby="co2-parameters-title">
            <h2 id="co2-parameters-title" className="text-base font-bold text-slate-950">{t.parameters}</h2>
            <div className="mt-5 space-y-7">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="co2-hours" className="text-sm font-semibold text-slate-600">{t.hoursLabel}</label>
                  <span className="shrink-0 text-base font-bold text-[#E30613]">
                    {co2.hours} <span className="text-xs font-semibold text-slate-500">{t.hoursUnit}</span>
                  </span>
                </div>
                <input
                  id="co2-hours"
                  type="range" min={100} max={2000} step={50}
                  value={co2.hours}
                  onChange={(e) => setCo2(s => ({ ...s, hours: Number(e.target.value) }))}
                  className="h-2 w-full cursor-pointer accent-emerald-600"
                />
                <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>100</span><span>2.000</span></div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="co2-years" className="text-sm font-semibold text-slate-600">{t.yearsLabel}</label>
                  <span className="shrink-0 text-base font-bold text-[#E30613]">
                    {co2.years} <span className="text-xs font-semibold text-slate-500">{t.yearsUnit}</span>
                  </span>
                </div>
                <input
                  id="co2-years"
                  type="range" min={1} max={15} step={1}
                  value={co2.years}
                  onChange={(e) => setCo2(s => ({ ...s, years: Number(e.target.value) }))}
                  className="h-2 w-full cursor-pointer accent-emerald-600"
                />
                <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>1</span><span>15</span></div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="co2-fuel-price" className="text-sm font-semibold text-slate-600">{t.fuelPriceLabel}</label>
                  <span className="shrink-0 text-base font-bold text-[#E30613]">
                    {displayedPrice} <span className="text-xs font-semibold text-slate-500">{t.currency}</span>
                  </span>
                </div>
                <input
                  id="co2-fuel-price"
                  type="range" min={5} max={25} step={0.5}
                  value={co2.baseFuelPriceDKK}
                  onChange={(e) => setCo2(s => ({ ...s, baseFuelPriceDKK: Number(e.target.value) }))}
                  className="h-2 w-full cursor-pointer accent-emerald-600"
                />
                <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>5</span><span>25</span></div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="co2-comparison-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="co2-comparison-title" className="text-base font-bold text-slate-950">{t.comparisonTitle}</h2>
              <span className="text-xs text-slate-400">kg CO2</span>
            </div>
            <div className="mt-6 space-y-7">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-emerald-600">Timan 3330</span>
                  <span className="shrink-0 text-base font-bold text-emerald-600">
                    {fmt(timanCo2)} <span className="text-xs font-semibold opacity-70">kg CO2</span>
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${(timanCo2 / visualMax) * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-500">Egholm 2260</span>
                  <span className="shrink-0 text-base font-bold text-slate-500">
                    {fmt(egholmCo2)} <span className="text-xs font-semibold opacity-70">kg CO2</span>
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-slate-400 transition-all duration-700 ease-out" style={{ width: `${(egholmCo2 / visualMax) * 100}%` }} />
                </div>
              </div>
            </div>
          </section>

          <aside className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 sm:p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 text-xs leading-relaxed sm:text-sm">
              <strong className="block font-bold">{t.timanBetter}</strong>
              <span className="text-emerald-800">{t.timanBetterBody}</span>
            </div>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2" aria-labelledby="co2-savings-title">
            <h2 id="co2-savings-title" className="text-base font-bold text-slate-950">{t.savingsTitle}</h2>
            <div className="mt-5 grid grid-cols-2 divide-x divide-slate-200">
              <div className="flex min-w-0 items-center gap-3 pr-3 sm:gap-5 sm:pr-6">
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:flex">
                  <Fuel className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{t.fuelSaved}</p>
                  <p className="mt-1 whitespace-nowrap text-xl font-bold text-slate-950 sm:text-3xl">
                    {fmt(fuelSavedVal)} <span className="text-sm font-semibold text-slate-600 sm:text-lg">L</span>
                  </p>
                  <p className="mt-1 text-xs font-bold text-emerald-600 sm:text-sm">{fmt(moneySaved)} {t.currency}</p>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-3 pl-3 sm:gap-5 sm:pl-6">
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:flex">
                  <Cloud className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{t.co2Saved}</p>
                  <p className="mt-1 whitespace-nowrap text-xl font-bold text-slate-950 sm:text-3xl">
                    {fmt(co2SavedVal)} <span className="text-sm font-semibold text-slate-600 sm:text-lg">kg</span>
                  </p>
                  <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    ≈ {(co2SavedVal / 1000).toLocaleString(t.locale, { minimumFractionDigits: 1 })} {t.tons}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
