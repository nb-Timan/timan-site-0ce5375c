import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
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
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !(portalRole && dealerSideRoles.has(portalRole))) {
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

      {/* CO2 sub-header */}
      <header className="bg-white border-b border-gray-200 py-6 no-print">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t.co2Title}</h1>
            <p className="text-gray-500">{t.co2Subtitle}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex-grow w-full no-print">
        <div className="w-full">

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column: parameters + info */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-6 uppercase tracking-wider">{t.parameters}</h3>
                <div className="space-y-8">
                  {/* Hours per year */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.hoursLabel}</label>
                      <span className="text-sm font-black text-[#E30613]">
                        {co2.hours} <span className="text-[10px] text-gray-400">{t.hoursUnit}</span>
                      </span>
                    </div>
                    <input
                      type="range" min={100} max={2000} step={50}
                      value={co2.hours}
                      onChange={(e) => setCo2(s => ({ ...s, hours: Number(e.target.value) }))}
                      className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#E30613' }}
                    />
                  </div>

                  {/* Years */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.yearsLabel}</label>
                      <span className="text-sm font-black text-[#E30613]">
                        {co2.years} <span className="text-[10px] text-gray-400">{t.yearsUnit}</span>
                      </span>
                    </div>
                    <input
                      type="range" min={1} max={15} step={1}
                      value={co2.years}
                      onChange={(e) => setCo2(s => ({ ...s, years: Number(e.target.value) }))}
                      className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#E30613' }}
                    />
                  </div>

                  {/* Fuel price */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.fuelPriceLabel}</label>
                      <span className="text-sm font-black text-[#E30613]">
                        {displayedPrice} <span className="text-[10px] text-gray-400">{t.currency}</span>
                      </span>
                    </div>
                    <input
                      type="range" min={5} max={25} step={0.5}
                      value={co2.baseFuelPriceDKK}
                      onChange={(e) => setCo2(s => ({ ...s, baseFuelPriceDKK: Number(e.target.value) }))}
                      className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#E30613' }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex gap-4">
                <div className="text-xs text-emerald-800 leading-relaxed font-medium">
                  <strong>{t.timanBetter}</strong>
                  <br />
                  {t.timanBetterBody}
                </div>
              </div>
            </div>

            {/* Right column: comparison + savings */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <h3 className="text-sm font-bold text-gray-900 mb-8 uppercase tracking-wider text-center">
                  {t.comparisonTitle}
                </h3>
                <div className="space-y-10">
                  {/* Timan bar */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Timan 3330</span>
                      <span className="text-lg font-black text-emerald-600">
                        {fmt(timanCo2)} <span className="text-xs font-bold opacity-50">kg CO2</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-700 ease-out"
                        style={{ width: `${(timanCo2 / visualMax) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Egholm bar */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Egholm 2260</span>
                      <span className="text-lg font-black text-gray-400">
                        {fmt(egholmCo2)} <span className="text-xs font-bold opacity-50">kg CO2</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="bg-gray-400 h-full transition-all duration-700 ease-out"
                        style={{ width: `${(egholmCo2 / visualMax) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Savings panel */}
              <div className="bg-gray-900 rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl">
                <div className="relative z-10">
                  <h2 className="text-gray-400 uppercase text-[10px] font-black mb-8 tracking-[0.2em] text-center">
                    {t.savingsTitle}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="text-center">
                      <p className="text-[9px] text-gray-500 uppercase font-black mb-1">{t.fuelSaved}</p>
                      <p className="text-4xl font-black text-white">
                        {fmt(fuelSavedVal)} <span className="text-xl text-gray-500">L</span>
                      </p>
                      <p className="text-emerald-400 text-sm font-bold mt-2">
                        {fmt(moneySaved)} {t.currency}
                      </p>
                    </div>

                    <div className="text-center md:border-l md:border-white/10">
                      <p className="text-[9px] text-emerald-400 uppercase font-black mb-1">{t.co2Saved}</p>
                      <p className="text-5xl font-black text-emerald-400 tracking-tighter">
                        {fmt(co2SavedVal)} <span className="text-2xl text-emerald-600/50">kg</span>
                      </p>
                      <div className="mt-3 inline-block bg-emerald-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black">
                        ≈ {(co2SavedVal / 1000).toLocaleString(t.locale, { minimumFractionDigits: 1 })} {t.tons.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
