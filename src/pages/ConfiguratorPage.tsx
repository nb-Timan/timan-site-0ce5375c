import { useState } from 'react';
import { useConfigurator } from '@/hooks/useConfigurator';
import { PRODUCTS, ACCESSORIES, getLocalizedName, getPrice, formatMoney, getAccessoriesFlat } from '@/data/machines';
import { t } from '@/data/translations';
import { Language, Accessory } from '@/types/configurator';

const LANGUAGES: { code: Language; flag: string }[] = [
  { code: 'da', flag: '🇩🇰' },
  { code: 'en', flag: '🇬🇧' },
  { code: 'de', flag: '🇩🇪' },
  { code: 'it', flag: '🇮🇹' },
  { code: 'hu', flag: '🇭🇺' },
];

const MACHINE_KEYS = ['RC-1000S', 'RC-751', 'Timan 3330', 'LOOSE_TOOL'];

const REQUIRED_GROUPS_3330 = ['aircon', 'doors', 'seats', 'roof'];
const REQUIRED_GROUPS_RC1000 = ['oil_1000'];

function getYoutubeThumbnail(url: string | undefined | null, quality: 'hqdefault' | 'maxresdefault' = 'hqdefault'): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|\/embed\/|\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/${quality}` : null;
}

function getImageUrlForItem(item: { videoUrl?: string; imageUrl?: string; images?: { url: string | null }[]; videos?: { url: string | null }[] }): string | null {
  const realImage = item.images?.[0]?.url || item.imageUrl || null;
  if (realImage) return realImage;
  const videoUrl = item.videoUrl || item.videos?.[0]?.url || null;
  return getYoutubeThumbnail(videoUrl, 'maxresdefault') || getYoutubeThumbnail(videoUrl, 'hqdefault');
}

function getVideoUrl(item: { videoUrl?: string; videos?: { url: string | null }[] }): string | null {
  return item.videoUrl || item.videos?.[0]?.url || null;
}

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

  // Modal state
  const [infoModal, setInfoModal] = useState<{ title: string; content: string } | null>(null);
  const [deliveryInfoOpen, setDeliveryInfoOpen] = useState(false);

  const showMachineDetails = (key: string) => {
    const p = PRODUCTS[key];
    if (!p?.machineDetails) return;
    const md = p.machineDetails;
    const mainText = typeof md.main === 'string' ? md.main : (md.main[lang] || md.main.da);
    const bullets = md.bullets[lang] || md.bullets.da || [];
    const dims = md.dimensions || [];
    let html = `<p class="text-sm text-gray-700 mb-4">${mainText}</p>`;
    if (bullets.length > 0) {
      html += '<ul class="list-disc pl-5 text-sm text-gray-700 space-y-1 mb-4">';
      bullets.forEach(b => { html += `<li>${b}</li>`; });
      html += '</ul>';
    }
    if (dims.length > 0) {
      html += '<div class="p-3 bg-gray-50 rounded-lg text-sm">';
      dims.forEach(d => {
        if (d.isHeader) {
          html += `<div class="col-span-2 font-bold text-gray-900 mt-3 mb-1 pt-2 border-t border-gray-200 first:mt-0 first:pt-0 first:border-0">${d.label}</div>`;
        } else {
          const val = typeof d.value === 'string' ? d.value : ((d.value as any)?.[lang] || (d.value as any)?.da || '');
          html += `<div class="grid grid-cols-2 gap-x-4 py-0.5"><div class="font-medium text-gray-700">${d.label}:</div><div class="font-semibold text-gray-900">${val}</div></div>`;
        }
      });
      html += '</div>';
    }
    setInfoModal({ title: getLocalizedName(p.name, lang), content: html });
  };

  const showSpecs = (accId: string, machineType: string) => {
    const flatAccs = getAccessoriesFlat(machineType);
    const acc = flatAccs.find(a => String(a.id) === String(accId));
    if (!acc?.specs) return;
    const descEntry = acc.specs.find(s => s.label === 'Beskrivelse');
    const techSpecs = acc.specs.filter(s => s.label !== 'Beskrivelse');
    let html = '';
    if (techSpecs.length > 0) {
      html += '<div class="p-3 bg-gray-50 rounded-lg grid grid-cols-2 gap-x-4 gap-y-2 text-sm">';
      techSpecs.forEach(s => {
        const val = typeof s.value === 'string' ? s.value : ((s.value as any)[lang] || (s.value as any).da);
        html += `<div class="font-medium text-gray-700">${s.label}:</div><div class="font-semibold text-gray-900">${val}</div>`;
      });
      html += '</div>';
    }
    if (descEntry) {
      const val = typeof descEntry.value === 'string' ? descEntry.value : ((descEntry.value as any)[lang] || (descEntry.value as any).da);
      html += `<div class="mt-4 pt-4 border-t border-gray-200"><h4 class="font-bold text-gray-800 mb-2">${T('specsDetails')}</h4><p class="text-sm text-gray-700 whitespace-pre-line">${val}</p></div>`;
    }
    setInfoModal({ title: getLocalizedName(acc.name, lang), content: html });
  };

  // Requisition number handler
  const setReqNumber = (unitNumber: number, value: string) => {
    setState(s => ({
      ...s,
      reqNumbers: { ...s.reqNumbers, [`machine_${unitNumber}`]: value.slice(0, 20) }
    }));
  };

  return (
    <div className="p-4 md:p-8" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#f4f7f9' }}>
      {/* Info Modal */}
      {infoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-gray-900">{infoModal.title}</h3>
            <div dangerouslySetInnerHTML={{ __html: infoModal.content }} />
            <div className="mt-6 text-center">
              <button onClick={() => setInfoModal(null)} className="px-6 py-3 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium text-gray-700">{T('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Info Modal */}
      {deliveryInfoOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeliveryInfoOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-gray-900">{T('delivery_info_title')}</h3>
            <div className="space-y-4 text-sm text-gray-700">
              <div><h4 className="font-bold text-gray-800 mb-1">{T('delivery_info_pickup_title')}</h4><p className="whitespace-pre-line">{T('delivery_info_pickup_body')}</p></div>
              <div><h4 className="font-bold text-gray-800 mb-1">{T('delivery_info_send_title')}</h4><p className="whitespace-pre-line">{T('delivery_info_send_body')}</p></div>
              <div><h4 className="font-bold text-gray-800 mb-1">{T('delivery_info_deliver_title')}</h4><p className="whitespace-pre-line">{T('delivery_info_deliver_body')}</p></div>
              <div className="border-t pt-3"><h4 className="font-bold text-gray-800 mb-1">{T('delivery_info_extra_title')}</h4><p className="whitespace-pre-line">{T('delivery_info_extra_body')}</p></div>
            </div>
            <div className="mt-6 text-center">
              <button onClick={() => setDeliveryInfoOpen(false)} className="px-6 py-3 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium text-gray-700">{T('delivery_info_close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="max-w-6xl mx-auto mb-8 no-print flex justify-between items-center">
        <div className="flex space-x-1 p-1 rounded-lg bg-white shadow-md border">
          {LANGUAGES.map(l => (
            <button key={l.code} onClick={() => setLanguage(l.code)}
              className={`flag-button ${state.language === l.code ? 'active' : ''}`}>
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

      {/* Main layout */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
        <main className="lg:col-span-3">
          <div className="space-y-6">
            {/* Step 1 */}
            {state.step === 1 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-xl font-bold mb-4">{T('step1Title')}</h2>
                <div className="flex gap-3 mb-6">
                  {(['quote', 'order'] as const).map(ft => (
                    <button key={ft} onClick={() => setFlowType(ft)}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition ${state.flowType === ft ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                      {T(ft)}
                    </button>
                  ))}
                </div>

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
                                <span className="font-semibold text-gray-900">{typeof spec.value === 'string' ? spec.value : ((spec.value as any)[lang] || (spec.value as any).da)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Machine action links: Video / Image / Info */}
                        <div className="mt-1 mb-1 flex flex-wrap justify-center gap-3 items-center">
                          {getVideoUrl(p) && (
                            <a href={getVideoUrl(p)!} target="_blank" rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1 font-medium">
                              🎥 {T('videoLink')}
                            </a>
                          )}
                          {getImageUrlForItem(p) && (
                            <a href={getImageUrlForItem(p)!} target="_blank" rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1 font-medium">
                              📸 {T('imageLink')}
                            </a>
                          )}
                          {p.machineDetails && (
                            <button onClick={(e) => { e.stopPropagation(); showMachineDetails(key); }}
                              className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 font-medium p-0 bg-transparent">
                              📄 {T('infoSpecs')}
                            </button>
                          )}
                        </div>

                        {/* Qty controls */}
                        <div className={`mt-auto pt-4 flex justify-between items-center w-full py-2 px-3 rounded-lg border-t ${isSelected ? 'border-emerald-200 bg-white' : 'border-gray-200 bg-gray-100'}`}>
                          <span className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-gray-700'}`}>{T('quantity')}</span>
                          <div className="flex items-center qty-selector">
                            <button onClick={() => setMachineQty(key, -1)} disabled={!flowSelected || currentQty === 0}
                              className={flowSelected && currentQty > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}>-</button>
                            <div className={`qty-display ${isSelected ? 'border-emerald-500' : 'border-gray-300'}`}>{currentQty}</div>
                            <button onClick={() => setMachineQty(key, 1)} disabled={!flowSelected}
                              className={flowSelected ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}>+</button>
                          </div>
                        </div>

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
                  <button onClick={() => setStep(2)} disabled={!flowSelected || totalQty === 0}
                    className={`px-6 py-3 rounded-lg text-base font-semibold transition ${flowSelected && totalQty > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
                    {T('goToDelivery')}
                  </button>
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
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex-1 min-w-0 text-[13px] md:text-sm whitespace-nowrap">{T(method)}</span>
                          <button type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeliveryInfoOpen(true); }}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-400 text-[11px] font-bold text-gray-600 hover:bg-gray-100 flex-shrink-0"
                            title={T('delivery_info_link')}>
                            i
                          </button>
                        </div>
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

              let selectedIds: string[] = [];
              if (currentUnit.isSharedUnit) {
                const mc = state.machineConfigs.find(c => c.id === currentUnit.modelId);
                selectedIds = mc?.acc || [];
              } else {
                selectedIds = state.individualUnitConfigs[currentUnit.configKey]?.acc || [];
              }

              const currentDisplayIdx = displayUnits.findIndex(u => u.globalIndex === state.currentMachineIndex);

              // Determine required groups
              const mandatoryGroups = machineType === 'Timan 3330' ? REQUIRED_GROUPS_3330
                : machineType === 'RC-1000S' ? REQUIRED_GROUPS_RC1000 : [];

              // Check which groups have a selection
              const groupHasSelection: Record<string, boolean> = {};
              const flatAccs = getAccessoriesFlat(machineType);
              mandatoryGroups.forEach(g => {
                groupHasSelection[g] = flatAccs.some(a => a.group === g && selectedIds.includes(a.id));
              });

              // Build rendered accessory list with group wrappers
              const renderAccessories = () => {
                const elements: JSX.Element[] = [];
                let openMandatoryGroup: string | null = null;
                let mandatoryGroupItems: JSX.Element[] = [];

                const flushMandatoryGroup = () => {
                  if (openMandatoryGroup && mandatoryGroupItems.length > 0) {
                    const ok = groupHasSelection[openMandatoryGroup];
                    if (!ok) {
                      elements.push(
                        <div key={`mg-${openMandatoryGroup}`} className="mandatory-group-error space-y-2 mb-4">
                          {mandatoryGroupItems}
                        </div>
                      );
                    } else {
                      mandatoryGroupItems.forEach(el => elements.push(el));
                    }
                    mandatoryGroupItems = [];
                    openMandatoryGroup = null;
                  }
                };

                accs.forEach((a, idx) => {
                  if (a.hidden || (a.requires && !selectedIds.includes(a.requires))) return;

                  const isMandatoryGroupItem = !!(a.group && mandatoryGroups.includes(a.group));

                  // If we were in a mandatory group and now we're not, flush
                  if (openMandatoryGroup && (!a.group || a.group !== openMandatoryGroup)) {
                    flushMandatoryGroup();
                  }

                  // Section header (from sectionStart)
                  if (a.sectionStart) {
                    const prev = accs.slice(0, idx).reverse().find(x => x && !x.hidden);
                    if (!prev || prev.sectionStart !== a.sectionStart) {
                      let headerClass = 'text-gray-800';
                      if (isMandatoryGroupItem) {
                        if (!groupHasSelection[a.group!]) headerClass = 'text-red-600';
                      }
                      const sectionTitle = T(a.sectionStart) !== a.sectionStart ? T(a.sectionStart) : a.sectionStart;
                      elements.push(
                        <h3 key={`section-${idx}`} className={`font-bold ${headerClass} mt-10 mb-2 border-b pb-1 text-lg sticky top-0 bg-white z-10`}>
                          {sectionTitle}
                        </h3>
                      );
                    }
                  }

                  // isHeader items
                  if (a.isHeader) {
                    elements.push(
                      <h3 key={`header-${idx}`} className="font-bold text-gray-800 mt-10 mb-2 border-b pb-1 text-lg sticky top-0 bg-white z-10">
                        {getLocalizedName(a.name, lang)}
                      </h3>
                    );
                    return;
                  }

                  // Start mandatory group wrapper
                  if (isMandatoryGroupItem && openMandatoryGroup !== a.group) {
                    flushMandatoryGroup();
                    openMandatoryGroup = a.group!;
                  }

                  const isSelected = selectedIds.includes(a.id);
                  const indentClass = a.requires ? 'ml-4 bg-gray-50' : '';

                  // Action links
                  const videoUrl = getVideoUrl(a);
                  const imageUrl = getImageUrlForItem(a);
                  const hasSpecs = !!a.specs;
                  const showActions = videoUrl || imageUrl || hasSpecs || a.videos || a.images;

                  // Qty input items
                  if (a.isQtyInput) {
                    const qtyKey = `${currentUnit.configKey}_${a.id}`;
                    const currentQtyVal = state.accQty[qtyKey] ?? 0;

                    const card = (
                      <div key={a.id} className={`p-3 border rounded-lg transition ${indentClass} ${currentQtyVal > 0 ? 'btn-active border-emerald-500' : ''}`}>
                        <div className="flex items-start w-full min-w-0">
                          <div className="flex-grow min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-medium text-sm text-gray-800">{getLocalizedName(a.name, lang)}</span>
                                <div className="text-gray-500 text-xs">Varenr: {a.varenr}</div>
                              </div>
                              <span className="font-bold text-base text-emerald-700 price-col">{formatMoney(getPrice(a, lang), lang)}</span>
                            </div>
                            {showActions && (
                              <div className="mt-1 flex gap-2 whitespace-nowrap">
                                {videoUrl ? <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>🎥 {T('videoLink')}</a>
                                  : (a.videos && <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">🎥 {T('videoLink')}</span>)}
                                {imageUrl ? <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>📸 {T('imageLink')}</a>
                                  : (a.images && <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">📸 {T('imageLink')}</span>)}
                                {hasSpecs && <button onClick={e => { e.stopPropagation(); showSpecs(a.id, machineType); }} className="text-blue-600 text-xs font-medium p-0 bg-transparent flex items-center gap-0.5 hover:text-blue-800 transition">📄 {T('specsLink')}</button>}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <button onClick={() => setState(s => {
                                const key = `${currentUnit.configKey}_${a.id}`;
                                const cur = s.accQty[key] ?? 0;
                                if (cur <= 0) return s;
                                return { ...s, accQty: { ...s.accQty, [key]: cur - 1 } };
                              })} className="w-7 h-7 rounded bg-red-500 text-white font-bold text-sm hover:bg-red-600">-</button>
                              <span className="w-8 text-center font-bold">{currentQtyVal}</span>
                              <button onClick={() => setState(s => {
                                const key = `${currentUnit.configKey}_${a.id}`;
                                const cur = s.accQty[key] ?? 0;
                                return { ...s, accQty: { ...s.accQty, [key]: cur + 1 } };
                              })} className="w-7 h-7 rounded bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600">+</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );

                    if (isMandatoryGroupItem) mandatoryGroupItems.push(card);
                    else elements.push(card);
                    return;
                  }

                  // RAL input
                  let ralInput: JSX.Element | null = null;
                  if (a.isRAL && isSelected) {
                    const ralKey = `${currentUnit.configKey}_${a.id}`;
                    ralInput = (
                      <div className="mt-2 pl-2" onClick={e => e.stopPropagation()}>
                        <input type="text" maxLength={10} placeholder="RAL kode..." value={state.ralCodes[ralKey] || ''}
                          onChange={e => setState(s => ({ ...s, ralCodes: { ...s.ralCodes, [ralKey]: e.target.value } }))}
                          className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 placeholder-gray-400" />
                      </div>
                    );
                  }

                  const card = (
                    <div key={a.id} onClick={() => toggleAcc(a.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition hover:bg-gray-50 accessory-card ${isSelected ? 'btn-active border-emerald-500' : ''} ${indentClass}`}>
                      <div className="flex items-start w-full min-w-0">
                        <div className={`selection-indicator flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 mr-3 rounded border-2 ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-400'}`}>
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
                          {/* Action links */}
                          {showActions && (
                            <div className="mt-1 flex gap-2 whitespace-nowrap">
                              {videoUrl ? <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>🎥 {T('videoLink')}</a>
                                : (a.videos && <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">🎥 {T('videoLink')}</span>)}
                              {imageUrl ? <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>📸 {T('imageLink')}</a>
                                : (a.images && <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">📸 {T('imageLink')}</span>)}
                              {hasSpecs && <button onClick={e => { e.stopPropagation(); showSpecs(a.id, machineType); }} className="text-blue-600 text-xs font-medium p-0 bg-transparent flex items-center gap-0.5 hover:text-blue-800 transition">📄 {T('specsLink')}</button>}
                            </div>
                          )}
                        </div>
                      </div>

                      {ralInput}

                      {/* Sub items */}
                      {isSelected && a.subItems && a.subItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-2">
                          <div className="text-xs font-semibold text-gray-600">Tilvalg:</div>
                          {a.subItems.map(sub => (
                            <div key={sub.id} onClick={e => { e.stopPropagation(); toggleAcc(sub.id); }}
                              className={`p-2 border rounded-lg cursor-pointer transition flex items-start gap-3 ${selectedIds.includes(sub.id) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                              <div className={`selection-indicator flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 rounded border-2 ${selectedIds.includes(sub.id) ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-400'}`}>
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

                  if (isMandatoryGroupItem) mandatoryGroupItems.push(card);
                  else elements.push(card);
                });

                // Flush any remaining mandatory group
                flushMandatoryGroup();

                return elements;
              };

              return (
                <div className="bg-white rounded-2xl shadow p-6">
                  <h2 className="text-xl font-bold mb-4 text-center">{T('step3Title')}</h2>

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

                  <div className="space-y-2 mb-8 max-h-[60vh] overflow-y-auto pr-2 text-left">
                    {renderAccessories()}
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
                    <input type="text" value={state.firmanavn} onChange={e => setCustomerField('firmanavn', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('contactPerson')}</label>
                    <input type="text" value={state.kontaktperson} onChange={e => setCustomerField('kontaktperson', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('phone')}</label>
                    <input type="text" value={state.telefon} onChange={e => setCustomerField('telefon', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('email')}</label>
                    <input type="email" value={state.email} onChange={e => setCustomerField('email', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('comment')}</label>
                    <textarea value={state.comment} onChange={e => setCustomerField('comment', e.target.value)} className="w-full p-2 border rounded-lg" rows={3} />
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
                      <div key={idx}>
                        <div className={`flex justify-between items-start ${lineClasses} ${indent}`}>
                          <span>{item.txt}</span>
                          <span className="font-medium text-right price-col ml-3 whitespace-nowrap">{formatMoney(item.price, lang)}</span>
                        </div>
                        {/* Requisition number field after machine line */}
                        {item.isMachine && item.index && (
                          <div className="mt-2 mb-3 pl-2">
                            <input type="text" maxLength={20}
                              value={state.reqNumbers[`machine_${item.index}`] || ''}
                              onChange={e => setReqNumber(item.index!, e.target.value)}
                              placeholder="Rekv. nr. / Req. no. / Po. nr."
                              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 placeholder-gray-400" />
                          </div>
                        )}
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
