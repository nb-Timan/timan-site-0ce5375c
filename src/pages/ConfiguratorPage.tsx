import { useConfigurator } from '@/hooks/useConfigurator';
import { PRODUCTS, ACCESSORIES, getLocalizedName, getPrice, formatMoney, getAccessoriesFlat } from '@/data/machines';
import { t } from '@/data/translations';
import { Language } from '@/types/configurator';
import { Button } from '@/components/ui/button';

const LANGUAGES: { code: Language; flag: string }[] = [
  { code: 'da', flag: '🇩🇰' },
  { code: 'en', flag: '🇬🇧' },
  { code: 'de', flag: '🇩🇪' },
  { code: 'it', flag: '🇮🇹' },
  { code: 'hu', flag: '🇭🇺' },
];

const MACHINE_KEYS = ['RC-1000S', 'RC-751', 'Timan 3330', 'LOOSE_TOOL'];

export default function ConfiguratorPage() {
  const {
    state, setStep, setLanguage, setFlowType, setMachineQty, setConfigMode,
    setDate, setDeliveryMethod, setCustomerField, toggleAcc, calcResult,
    getGlobalMachineUnits, getDisplayMachineUnits, setState,
  } = useConfigurator();

  const lang = state.language;
  const T = (key: string) => t(key, lang);

  const totalQty = state.machineConfigs.reduce((sum, c) => sum + c.qty, 0);
  const flowSelected = !!state.flowType;

  return (
    <div className="p-4 md:p-8" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#f4f7f9' }}>
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-8 no-print flex justify-between items-center">
        <div className="flex space-x-1 p-1 rounded-lg bg-white shadow-md border">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={`flag-button ${state.language === l.code ? 'active' : ''}`}
            >
              <span className="text-lg">{l.flag}</span>
            </button>
          ))}
        </div>
        <div className="header-title-container">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">Timan Maskinkonfigurator</h1>
          <p className="text-gray-500 font-medium mt-1 text-lg">{T('subtitle')}</p>
        </div>
        <div className="hidden lg:block w-[116px]" />
      </header>

      {/* Main layout: 3/5 grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Main content */}
        <main className="lg:col-span-3">
          <div className="space-y-6">
            {/* Step 1 */}
            {state.step === 1 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-xl font-bold mb-4">{T('step1Title')}</h2>

                {/* Flow type selection */}
                <div className="flex gap-3 mb-6">
                  {(['quote', 'order'] as const).map(ft => (
                    <button
                      key={ft}
                      onClick={() => setFlowType(ft)}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition ${
                        state.flowType === ft ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {T(ft)}
                    </button>
                  ))}
                </div>

                {/* Machine cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {MACHINE_KEYS.map(key => {
                    const p = PRODUCTS[key];
                    if (!p) return null;
                    const config = state.machineConfigs.find(c => c.type === key);
                    const currentQty = config?.qty || 0;
                    const isSelected = currentQty > 0;

                    return (
                      <div key={key} className={`border-2 rounded-xl p-5 flex flex-col gap-4 transition ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-white shadow-sm hover:border-gray-300'}`}>
                        <h3 className="font-bold text-lg text-gray-900">{getLocalizedName(p.name, lang)}</h3>
                        <div className="text-3xl font-extrabold text-emerald-600">{formatMoney(getPrice(p, lang), lang)}</div>
                        <p className="text-sm text-gray-500">Varenr: {p.varenr}</p>

                        {p.techSpecs.length > 0 && (
                          <div className="space-y-1 py-3 border-t border-b border-gray-200">
                            {p.techSpecs.map((spec, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className="text-gray-600">{spec.label}:</span>
                                <span className="font-semibold text-gray-900">{typeof spec.value === 'string' ? spec.value : (spec.value as any)[lang] || (spec.value as any).da}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Qty controls */}
                        <div className={`mt-auto pt-4 flex justify-between items-center w-full py-2 px-3 rounded-lg border-t ${isSelected ? 'border-emerald-200 bg-white' : 'border-gray-200 bg-gray-100'}`}>
                          <span className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-gray-700'}`}>{T('quantity')}</span>
                          <div className="flex items-center qty-selector">
                            <button
                              onClick={() => setMachineQty(key, -1)}
                              disabled={!flowSelected || currentQty === 0}
                              className={flowSelected && currentQty > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                            >-</button>
                            <div className={`qty-display ${isSelected ? 'border-emerald-500' : 'border-gray-300'}`}>{currentQty}</div>
                            <button
                              onClick={() => setMachineQty(key, 1)}
                              disabled={!flowSelected}
                              className={flowSelected ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                            >+</button>
                          </div>
                        </div>

                        {/* Config mode selection */}
                        {currentQty > 1 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <span className="block text-sm font-medium text-gray-700 mb-2">{T('configMethod')}</span>
                            <div className="radio-tile-group">
                              <div>
                                <input type="radio" id={`config-ind-${key}`} name={`config-${key}`} value="individual" className="radio-tile-input"
                                  checked={config?.configMode === 'individual'} onChange={() => setConfigMode(key, 'individual')} />
                                <label htmlFor={`config-ind-${key}`} className="radio-tile-label">{T('configIndividual')}</label>
                              </div>
                              <div>
                                <input type="radio" id={`config-sh-${key}`} name={`config-${key}`} value="shared" className="radio-tile-input"
                                  checked={config?.configMode === 'shared'} onChange={() => setConfigMode(key, 'shared')} />
                                <label htmlFor={`config-sh-${key}`} className="radio-tile-label">{T('configShared')}</label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-center pt-6 border-t mt-8">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!flowSelected || totalQty === 0}
                    className={`px-6 py-3 rounded-lg text-base font-semibold transition ${
                      flowSelected && totalQty > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-400 text-white cursor-not-allowed'
                    }`}
                  >{T('goToDelivery')}</button>
                </div>
              </div>
            )}

            {/* Step 2: Delivery */}
            {state.step === 2 && (
              <div className="bg-white rounded-2xl shadow p-6 text-center">
                <h2 className="text-xl font-bold mb-4">{T('step2Title')}</h2>
                <div className="mb-8 mx-auto max-w-sm">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{T('deliveryDate')}</label>
                  <input type="date" value={state.date} onChange={e => setDate(e.target.value)}
                    className="mt-1 w-40 p-1 border rounded-lg text-base text-center mx-auto block" />
                </div>

                <div className="mt-3 space-y-3 w-full flex flex-col items-center max-w-2xl mx-auto">
                  {(['pickup', 'send', 'deliver'] as const).map(method => (
                    <label key={method} className="w-full max-w-2xl cursor-pointer">
                      <input type="radio" name="delivery-method" value={method} className="sr-only peer"
                        checked={state.deliveryMethod === method} onChange={() => setDeliveryMethod(method)} />
                      <div className="w-full p-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 transition peer-checked:bg-emerald-50 peer-checked:border-emerald-500 peer-checked:shadow-sm">
                        {T(method)}
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-between max-w-md mx-auto mt-8">
                  <button onClick={() => setStep(1)} className="text-gray-600">{T('back')}</button>
                  <button onClick={() => { setState(s => ({ ...s, currentMachineIndex: 0 })); setStep(3); }}
                    className="px-4 py-2 bg-emerald-600 rounded-lg font-medium text-white shadow-lg text-sm">{T('goToEquipment')}</button>
                </div>
              </div>
            )}

            {/* Step 3: Accessories */}
            {state.step === 3 && (() => {
              const allUnits = getGlobalMachineUnits();
              const currentUnit = allUnits[state.currentMachineIndex];
              if (!currentUnit) return <div>No machine selected</div>;
              const machineType = currentUnit.modelType;
              const accs = ACCESSORIES[machineType] || [];
              const displayUnits = getDisplayMachineUnits();

              // Get selected acc ids for this unit
              let selectedIds: string[] = [];
              if (currentUnit.isSharedUnit) {
                const mc = state.machineConfigs.find(c => c.id === currentUnit.modelId);
                selectedIds = mc?.acc || [];
              } else {
                selectedIds = state.individualUnitConfigs[currentUnit.configKey]?.acc || [];
              }

              const currentDisplayIdx = displayUnits.findIndex(u => u.globalIndex === state.currentMachineIndex);

              return (
                <div className="bg-white rounded-2xl shadow p-6">
                  <h2 className="text-xl font-bold mb-4 text-center">{T('step3Title')}</h2>

                  {/* Tabs */}
                  {displayUnits.length > 1 && (
                    <div className="flex space-x-2 border-b border-gray-200 overflow-x-auto mb-4">
                      {displayUnits.map(du => (
                        <button key={du.globalIndex}
                          onClick={() => setState(s => ({ ...s, currentMachineIndex: du.globalIndex }))}
                          className={`px-4 py-2 text-sm rounded-t-lg whitespace-nowrap ${du.globalIndex === state.currentMachineIndex ? 'tab-active bg-white border-x border-t' : 'tab-inactive hover:bg-gray-100'}`}>
                          {du.isSharedUnit ? `Alle ${getLocalizedName(PRODUCTS[du.modelType]?.name || '', lang)}` : `Maskine ${du.unitNumber}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Accessory list */}
                  <div className="space-y-2 mb-8 max-h-[60vh] overflow-y-auto pr-2 text-left">
                    {accs.map((a, idx) => {
                      if (a.isHeader) {
                        return <div key={idx} className="pt-4 pb-2 text-sm font-bold text-gray-800 border-t border-gray-200 mt-3">{getLocalizedName(a.name, lang)}</div>;
                      }
                      if (a.hidden) return null;
                      if (a.requires && !selectedIds.includes(a.requires)) return null;

                      const isSelected = selectedIds.includes(a.id);
                      const indentClass = a.requires ? 'ml-4 bg-gray-50' : '';

                      return (
                        <div key={a.id} onClick={() => toggleAcc(a.id)}
                          className={`p-3 border rounded-lg cursor-pointer transition hover:bg-gray-50 accessory-card ${isSelected ? 'btn-active border-emerald-500' : ''} ${indentClass}`}>
                          <div className="flex items-start w-full min-w-0">
                            <div className={`selection-indicator flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 mr-3 rounded ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-400'}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-transparent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <div className="flex-grow min-w-0">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-medium text-sm text-gray-800">{getLocalizedName(a.name, lang)}</span>
                                  <div className="text-gray-500 text-xs">Varenr: {a.varenr}</div>
                                </div>
                                <span className="font-bold text-base text-emerald-700 price-col">{formatMoney(getPrice(a, lang), lang)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Sub items */}
                          {isSelected && a.subItems && a.subItems.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-emerald-200 space-y-2">
                              <div className="text-xs font-semibold text-gray-600">Tilvalg:</div>
                              {a.subItems.map(sub => (
                                <div key={sub.id} onClick={e => { e.stopPropagation(); toggleAcc(sub.id); }}
                                  className={`p-2 border rounded-lg cursor-pointer transition flex items-start gap-3 ${selectedIds.includes(sub.id) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                                  <div className={`selection-indicator flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 rounded border ${selectedIds.includes(sub.id) ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-400'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${selectedIds.includes(sub.id) ? 'text-white' : 'text-transparent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                  <div className="flex justify-between items-start gap-3 w-full min-w-0">
                                    <div className="text-sm text-gray-800">{getLocalizedName(sub.name, lang)}</div>
                                    <div className="font-bold text-emerald-700 whitespace-nowrap">{formatMoney(getPrice(sub, lang), lang)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between pt-4 border-t">
                    <button onClick={() => setStep(2)} className="text-gray-600">{T('back')}</button>
                    <button onClick={() => {
                      if (currentDisplayIdx < displayUnits.length - 1) {
                        setState(s => ({ ...s, currentMachineIndex: displayUnits[currentDisplayIdx + 1].globalIndex }));
                      } else {
                        setStep(4);
                      }
                    }} className="px-4 py-2 bg-emerald-600 rounded-lg font-medium text-white shadow-lg text-sm">
                      {currentDisplayIdx < displayUnits.length - 1 ? T('nextMachine') : T('goToContact')}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Step 4: Customer info */}
            {state.step === 4 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-xl font-bold mb-4">{T('step4Title')}</h2>
                <div className="space-y-4 max-w-lg mx-auto">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('companyName')}</label>
                    <input type="text" value={state.firmanavn} onChange={e => setCustomerField('firmanavn', e.target.value)}
                      className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('contactPerson')}</label>
                    <input type="text" value={state.kontaktperson} onChange={e => setCustomerField('kontaktperson', e.target.value)}
                      className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('phone')}</label>
                    <input type="text" value={state.telefon} onChange={e => setCustomerField('telefon', e.target.value)}
                      className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('email')}</label>
                    <input type="email" value={state.email} onChange={e => setCustomerField('email', e.target.value)}
                      className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('comment')}</label>
                    <textarea value={state.comment} onChange={e => setCustomerField('comment', e.target.value)}
                      className="w-full p-2 border rounded-lg" rows={3} />
                  </div>
                </div>
                <div className="flex justify-between mt-8 pt-4 border-t">
                  <button onClick={() => setStep(3)} className="text-gray-600">{T('back')}</button>
                  <button onClick={() => alert('PDF download — integration kommer snart')}
                    className="px-6 py-3 bg-emerald-600 rounded-lg font-medium text-white shadow-lg">{T('sendOrder')}</button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar */}
        <aside className="lg:col-span-2 no-print">
          <div className="bg-white rounded-2xl p-6 lg:sticky lg:top-8 bg-emerald-50 border-2 border-emerald-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4 border-b border-emerald-200 pb-2">{T('summaryTitle')}</h2>

            {!calcResult ? (
              <p className="text-gray-400 italic text-center">{T('cartEmpty')}</p>
            ) : (
              <>
                <div className="space-y-1 text-sm mb-6 max-h-[60vh] overflow-y-auto">
                  {calcResult.lineItems.map((item, idx) => {
                    if (item.subtotal) {
                      return (
                        <div key={idx} className="flex justify-between items-end text-sm font-semibold text-gray-800 pt-3 border-t border-dashed border-emerald-200 mt-2 mb-2">
                          <span>{item.txt}</span>
                          <span className="price-col">{formatMoney(item.price, lang)}</span>
                        </div>
                      );
                    }
                    const lineClasses = item.bold ? 'font-bold text-gray-900 mt-4' : 'text-gray-600 text-xs';
                    const indent = item.sub ? 'pl-4' : 'pl-0';
                    return (
                      <div key={idx} className={`flex justify-between items-start ${lineClasses} ${indent}`}>
                        <span>{item.txt}</span>
                        <span className="font-medium text-right price-col ml-3 whitespace-nowrap">{formatMoney(item.price, lang)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-emerald-200 space-y-2">
                  <div className="flex justify-between text-gray-600">
                    <span>{T('subtotal')}</span>
                    <span className="font-medium price-col">{formatMoney(calcResult.subtotal, lang)}</span>
                  </div>
                  <div className="text-red-600 text-sm space-y-1">
                    {calcResult.discountDetails.filter(d => d.amount > 0).map((d, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{d.txt}</span>
                        <span className="price-col">-{formatMoney(d.amount, lang)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold">
                      <span>{T('totalDiscount')} ({calcResult.totalPct.toFixed(2).replace('.', ',')}%)</span>
                      <span className="price-col">-{formatMoney(calcResult.totalDiscount, lang)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-end text-lg text-gray-800 pt-4 border-t border-emerald-300 mt-2">
                    <span className="text-sm sm:text-base whitespace-nowrap font-medium">{T('finalPrice')}</span>
                    <span className="text-xl text-emerald-700 price-col ml-2">{formatMoney(calcResult.currentPrice, lang)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
