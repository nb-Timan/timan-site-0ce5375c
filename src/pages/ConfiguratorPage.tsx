import { useState, useCallback } from 'react';
import { useConfigurator } from '@/hooks/useConfigurator';
import { PRODUCTS, ACCESSORIES, getLocalizedName, getPrice, formatMoney, getAccessoriesFlat, ACC_ID_WIRE_HARNESS, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_FLASH_LIGHT, ACC_ID_WORK_LIGHT, ACC_ID_OIL_NORMAL, ACC_ID_OIL_BIO, ACC_ID_RAL_COLOR, DEMO_ELIGIBLE_VARENR, DEMO_FEE_DKK, DEMO_FEE_EUR, LOOSE_TOOL_KEY } from '@/data/machines';
import { t } from '@/data/translations';
import { Language, Accessory, SubItem } from '@/types/configurator';

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

// Check if an accessory has sub-options (subItems or dependents)
function hasSubOptions(acc: Accessory, allAccs: Accessory[]): boolean {
  if (acc.subItems && acc.subItems.length > 0) return true;
  return allAccs.some(a => a.requires === acc.id);
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

  // Wire harness auto-add tracking
  const [wireHarnessJustAdded, setWireHarnessJustAdded] = useState(false);

  const isEURCurrency = useCallback(() => ['en', 'de', 'it', 'hu'].includes(lang), [lang]);

  // Show auto-add modal for wire harness
  const showAutoAddModal = useCallback((item: Accessory) => {
    const itemName = getLocalizedName(item.name, lang);
    const itemVarenr = `Varenr: ${item.varenr}`;
    const price = isEURCurrency()
      ? `${item.priceEUR} €`
      : `${item.priceDKK} kr.`;

    let msg = '';
    if (lang === 'da') {
      msg = `Bemærk: <strong>${itemName}</strong> er automatisk lagt i kurven, da det er påkrævet ved kombination af lys og redskab.<br><br>${itemVarenr}<br>Pris: ${price}`;
    } else if (lang === 'en') {
      msg = `Note: <strong>${itemName}</strong> has been automatically added to the cart as it is required when combining lights and attachment.<br><br>${itemVarenr}<br>Price: ${price}`;
    } else if (lang === 'de') {
      msg = `Hinweis: <strong>${itemName}</strong> wurde automatisch in den Warenkorb gelegt, da es bei der Kombination von Licht und Anbaugerät erforderlich ist.<br><br>${itemVarenr}<br>Preis: ${price}`;
    } else if (lang === 'it') {
      msg = `Nota: <strong>${itemName}</strong> è stato aggiunto automaticamente al carrello in quanto richiesto in combinazione con luci e attrezzi.<br><br>${itemVarenr}<br>Prezzo: ${price}`;
    } else if (lang === 'hu') {
      msg = `Megjegyzés: <strong>${itemName}</strong> automatikusan hozzáadásra került a kosárhoz, mivel a lámpák és a tartozékok kombinációjához szükséges.<br><br>${itemVarenr}<br>Ár: ${price}`;
    } else {
      msg = `Note: <strong>${itemName}</strong> has been automatically added.<br><br>${itemVarenr}<br>Price: ${price}`;
    }

    setInfoModal({ title: lang === 'da' ? 'Tekniske Specifikationer' : 'Technical Specifications', content: msg });
  }, [lang, isEURCurrency]);

  // Wrapped toggleAcc that detects wire harness addition
  const handleToggleAcc = useCallback((accId: string) => {
    // Get current state to check before
    const allUnits = getGlobalMachineUnits();
    const currentUnit = allUnits[state.currentMachineIndex];
    if (!currentUnit) return;

    let currentAccIds: string[] = [];
    if (currentUnit.isSharedUnit) {
      const mc = state.machineConfigs.find(c => c.id === currentUnit.modelId);
      currentAccIds = mc?.acc || [];
    } else {
      currentAccIds = state.individualUnitConfigs[currentUnit.configKey]?.acc || [];
    }

    const hadWireHarness = currentAccIds.includes(ACC_ID_WIRE_HARNESS);

    toggleAcc(accId);

    // Check after toggle (use timeout to let state update)
    setTimeout(() => {
      // We need to check the updated state - since toggleAcc uses setState, 
      // we detect via the wire harness logic conditions
      if (currentUnit.modelType === 'RC-1000S' && !hadWireHarness) {
        const newAccIds = [...currentAccIds];
        // Simulate the toggle
        const idx = newAccIds.indexOf(accId);
        if (idx === -1) newAccIds.push(accId);
        else newAccIds.splice(idx, 1);

        const hasLight = newAccIds.includes(ACC_ID_FLASH_LIGHT) || newAccIds.includes(ACC_ID_WORK_LIGHT);
        const hasAttach = newAccIds.includes(ACC_ID_VPLOW) || newAccIds.includes(ACC_ID_WEEDBRUSH) || newAccIds.includes('418000');
        const needWire = hasLight && hasAttach;

        if (needWire && !hadWireHarness) {
          const flatAccs = getAccessoriesFlat(currentUnit.modelType);
          const wireItem = flatAccs.find(a => a.id === ACC_ID_WIRE_HARNESS);
          if (wireItem) {
            showAutoAddModal(wireItem as Accessory);
          }
        }
      }
    }, 50);
  }, [state, toggleAcc, getGlobalMachineUnits, showAutoAddModal]);

  const showMachineDetails = (key: string) => {
    const p = PRODUCTS[key];
    if (!p?.machineDetails) return;
    const md = p.machineDetails;
    const mainText = typeof md.main === 'string' ? md.main : (md.main[lang] || md.main.da);
    const bullets = md.bullets[lang] || md.bullets.da || [];
    const dims = md.dimensions || [];
    let html = `<div class="p-3 bg-gray-50 rounded-lg"><h4 class="font-bold text-gray-800 mb-2">${lang === 'da' ? 'Hovedinformation' : 'Main Information'}</h4><p class="text-sm text-gray-700 whitespace-pre-line">${mainText}</p></div>`;
    if (bullets.length > 0) {
      html += `<div class="mt-4 pt-4 border-t border-gray-200"><h4 class="font-bold text-gray-800 mb-2">${lang === 'da' ? 'Nøglefunktioner' : 'Key Features'}</h4><ul class="list-disc list-inside space-y-1 text-sm text-gray-700">`;
      bullets.forEach(b => { html += `<li>${b}</li>`; });
      html += '</ul></div>';
    }
    if (dims.length > 0) {
      html += `<div class="mt-4 pt-4 border-t border-gray-200"><h4 class="font-bold text-gray-800 mb-2">${lang === 'da' ? 'Dimensioner & Tekniske Specifikationer' : 'Dimensions & Technical Specifications'}</h4>`;
      dims.forEach(d => {
        if (d.isHeader) {
          html += `<h5 class="font-extrabold text-sm text-gray-900 mt-4 mb-1">${d.label}</h5>`;
        } else {
          const val = typeof d.value === 'string' ? d.value : ((d.value as any)?.[lang] || (d.value as any)?.da || '');
          if (val) {
            html += `<div class="flex justify-between py-0.5 text-xs"><span class="font-medium text-gray-700">${d.label}:</span><span class="font-semibold text-gray-900 text-right">${val}</span></div>`;
          }
        }
      });
      html += '</div>';
    }
    setInfoModal({ title: `${lang === 'da' ? 'Maskine Information' : 'Machine Information'}: ${getLocalizedName(p.name, lang)}`, content: html });
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
        const val = typeof s.value === 'string' ? s.value : ((s.value as any)?.[lang] || (s.value as any)?.da || '');
        html += `<div class="font-medium text-gray-700">${s.label}:</div><div class="font-semibold text-gray-900">${val}</div>`;
      });
      html += '</div>';
    }
    if (descEntry) {
      const val = typeof descEntry.value === 'string' ? descEntry.value : ((descEntry.value as any)?.[lang] || (descEntry.value as any)?.da || '');
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

  // Demo machine logic
  const getDemoFee = () => isEURCurrency() ? DEMO_FEE_EUR : DEMO_FEE_DKK;
  const getDemoKey = (varenr: string, unitNumber: number) => `${varenr}_${unitNumber}`;
  const isDemoSelected = (varenr: string, unitNumber: number) => !!state.demoMachines[getDemoKey(varenr, unitNumber)];

  const toggleDemoMachine = (varenr: string, unitNumber: number, machineLabel: string) => {
    const key = getDemoKey(varenr, unitNumber);
    const next = !state.demoMachines[key];
    setState(s => ({ ...s, demoMachines: { ...s.demoMachines, [key]: next } }));

    if (next) {
      const fee = getDemoFee();
      const feeText = isEURCurrency() ? `${fee.toFixed(2)} €` : `${fee.toFixed(2)} kr.`;
      const title = lang === 'da' ? 'Demo maskine valgt' : 'Demo machine selected';
      const msg = lang === 'da'
        ? `Du har afkrydset <strong>Demo maskine</strong> for <strong>${machineLabel}</strong> (varenr. ${varenr}).<br><br>Der er tilføjet en ekstra omkostning på <strong>${feeText}</strong>.<br><br><strong>Vilkår:</strong><br>- Forhandleren kan erhverve 1 stk. af hver maskine pr. år til demonstrations-brug.<br><br>- Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.<br><br>- Overholdes dette ikke vil Timan opkræve differencen til den almindelige maskinrabat.`
        : `You have checked <strong>Demo machine</strong> for <strong>${machineLabel}</strong> (item no. ${varenr}).<br><br>An extra cost of <strong>${feeText}</strong> has been added.<br><br><strong>Terms:</strong><br>The dealer may purchase 1 unit of each machine per year for demonstration use.<br>- Demo machines may not be resold before 9 months after delivery from Timan A/S.<br><br>- If not complied with, Timan will charge the difference to the standard machine discount.`;
      setInfoModal({ title, content: msg });
    }
  };

  // Render action links for an item
  const renderActionLinks = (item: { videoUrl?: string; imageUrl?: string; images?: { url: string | null }[]; videos?: { url: string | null }[]; specs?: any[]; id?: string }, machineType: string) => {
    const videoUrl = getVideoUrl(item);
    const imageUrl = getImageUrlForItem(item);
    const hasSpecs = !!(item.specs && item.specs.length > 0);
    const showVideoIcon = !!(item.videoUrl || (item.videos && item.videos.length > 0));
    const showImageIcon = !!(item.imageUrl || (item.images && item.images.length > 0) || item.videoUrl || (item.videos && item.videos.length > 0));

    if (!showVideoIcon && !showImageIcon && !hasSpecs) return null;

    return (
      <div className="mt-1 flex gap-2 whitespace-nowrap">
        {showVideoIcon && (
          videoUrl ? (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>🎥 {T('videoLink')}</a>
          ) : (
            <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">🎥 {T('videoLink')}</span>
          )
        )}
        {showImageIcon && (
          imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>📸 {T('imageLink')}</a>
          ) : (
            <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">📸 {T('imageLink')}</span>
          )
        )}
        {hasSpecs && (
          <button onClick={e => { e.stopPropagation(); showSpecs(item.id!, machineType); }} className="text-blue-600 text-xs font-medium p-0 bg-transparent flex items-center gap-0.5 hover:text-blue-800 transition">📄 {T('specsLink')}</button>
        )}
      </div>
    );
  };

  // Render a sub-item card (level 2 or 3)
  const renderSubItem = (sub: SubItem, selectedIds: string[], machineType: string, level: number = 1) => {
    const isSelected = selectedIds.includes(sub.id);
    const hasNestedSubs = sub.subItems && sub.subItems.length > 0;

    return (
      <div key={sub.id}>
        <div
          onClick={e => { e.stopPropagation(); handleToggleAcc(sub.id); }}
          className={`p-2 border rounded-lg cursor-pointer transition flex items-start gap-3 ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
        >
          {/* Checkbox indicator with sub-option arrow */}
          <div className="selection-indicator relative flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 rounded border-2"
            style={{ backgroundColor: isSelected ? '#059669' : 'white', borderColor: isSelected ? '#059669' : '#9ca3af' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-transparent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {hasNestedSubs && (
              <span className="absolute left-1/2 -translate-x-1/2 top-[20px] text-[10px] text-gray-400 leading-none">↳</span>
            )}
          </div>

          <div className="flex justify-between items-start gap-3 w-full min-w-0">
            <div className="min-w-0">
              <div className="text-sm text-gray-800">{getLocalizedName(sub.name, lang)}</div>
              <div className="text-xs text-gray-500">Varenr: {sub.varenr}</div>
              {renderActionLinks(sub as any, machineType)}
            </div>
            <div className="font-bold text-emerald-700 whitespace-nowrap">{formatMoney(getPrice(sub, lang), lang)}</div>
          </div>
        </div>

        {/* Nested sub-items (level 3) */}
        {isSelected && hasNestedSubs && (
          <div className="ml-8 mt-2 space-y-2">
            {sub.subItems!.map(sub2 => renderSubItem(sub2 as SubItem, selectedIds, machineType, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#f4f7f9' }}>
      {/* Info Modal */}
      {infoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-[620px] w-[95%] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-gray-900">{infoModal.title}</h3>
            <div dangerouslySetInnerHTML={{ __html: infoModal.content }} />
            <div className="mt-6 text-center">
              <button onClick={() => setInfoModal(null)} className="px-6 py-3 bg-gray-200 border border-gray-300 rounded-lg hover:bg-gray-300 font-medium text-gray-700">{T('close')}</button>
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

      {/* Step Tabs */}
      <div className="max-w-6xl mx-auto mb-4">
        <div className="flex space-x-1 border-b border-gray-200">
          {[1, 2, 3, 4].map(step => (
            <button key={step}
              onClick={() => { if (step <= state.step) setStep(step); }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${state.step === step ? 'tab-active bg-white border-x border-t' : step <= state.step ? 'tab-inactive hover:bg-gray-100 cursor-pointer' : 'text-gray-400 cursor-not-allowed'}`}>
              {T(`step${step}Tab`) !== `step${step}Tab` ? T(`step${step}Tab`) : `${lang === 'da' ? 'Trin' : 'Step'} ${step}`}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
        <main className="lg:col-span-3">
          <div className="space-y-6">
            {/* Step 1 */}
            {state.step === 1 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-xl font-bold mb-4 text-center">{T('step1Title')}</h2>
                <p className="text-gray-600 font-medium mb-6 text-center">{T('step1Desc')}</p>

                {/* Flow type selector */}
                <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 max-w-3xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['quote', 'order'] as const).map(ft => (
                      <button key={ft} onClick={() => setFlowType(ft)}
                        className={`rounded-xl border-2 px-4 py-4 text-left transition ${state.flowType === ft ? 'border-emerald-500 bg-white shadow-sm' : 'border-transparent bg-white/80 hover:border-emerald-300'}`}>
                        <div className="font-bold text-gray-900">{T(ft)}</div>
                      </button>
                    ))}
                  </div>
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
                                <span className="font-semibold text-gray-900">{typeof spec.value === 'string' ? spec.value : ((spec.value as any)?.[lang] || (spec.value as any)?.da || '')}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Machine action links */}
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
                              className={flowSelected && currentQty > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                              style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>-</button>
                            <div className={`flex items-center justify-center border-2 ${isSelected ? 'border-emerald-500' : 'border-gray-300'}`}
                              style={{ width: 32, height: 32, margin: '0 4px', borderRadius: 6, fontWeight: 700 }}>{currentQty}</div>
                            <button onClick={() => setMachineQty(key, 1)} disabled={!flowSelected}
                              className={flowSelected ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                              style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>+</button>
                          </div>
                        </div>

                        {currentQty > 1 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <span className="block text-sm font-medium text-gray-700 mb-2">{T('configMethod')}</span>
                            <div className="radio-tile-group flex gap-2">
                              <label className={`flex-1 p-2 rounded-lg border-2 cursor-pointer text-center text-sm ${config?.configMode === 'individual' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                                <input type="radio" name={`config-${key}`} value="individual" className="sr-only"
                                  checked={config?.configMode === 'individual'} onChange={() => setConfigMode(key, 'individual')} />
                                {T('configIndividual')}
                              </label>
                              <label className={`flex-1 p-2 rounded-lg border-2 cursor-pointer text-center text-sm ${config?.configMode === 'shared' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                                <input type="radio" name={`config-${key}`} value="shared" className="sr-only"
                                  checked={config?.configMode === 'shared'} onChange={() => setConfigMode(key, 'shared')} />
                                {T('configShared')}
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Qty discount status */}
                {totalQty >= 1 && (
                  <div className={`mt-4 text-center text-sm ${totalQty >= 2 ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>
                    {totalQty >= 4 ? `✅ ${T('qtyStatus4')}` : totalQty >= 2 ? `✅ ${T('qtyStatus2')}` : T('qtyStatus1')}
                  </div>
                )}

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
                <p className="text-gray-600 font-medium mb-6">{T('step2Desc')}</p>
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

              const groupHasSelection: Record<string, boolean> = {};
              const flatAccs = getAccessoriesFlat(machineType);
              mandatoryGroups.forEach(g => {
                groupHasSelection[g] = flatAccs.some(a => a.group === g && selectedIds.includes(a.id));
              });

              const renderAccessories = () => {
                const elements: JSX.Element[] = [];
                let openMandatoryGroup: string | null = null;
                let mandatoryGroupItems: JSX.Element[] = [];

                const flushMandatoryGroup = () => {
                  if (openMandatoryGroup && mandatoryGroupItems.length > 0) {
                    const ok = groupHasSelection[openMandatoryGroup];
                    if (!ok) {
                      elements.push(
                        <div key={`mg-${openMandatoryGroup}`} className="mandatory-group-error space-y-2 mb-4" style={{ border: '2px solid #ef4444', borderRadius: 8, padding: 8 }}>
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

                  if (openMandatoryGroup && (!a.group || a.group !== openMandatoryGroup)) {
                    flushMandatoryGroup();
                  }

                  // Section header (from sectionStart)
                  if (a.sectionStart) {
                    const prev = accs.slice(0, idx).reverse().find(x => x && !x.hidden);
                    if (!prev || prev.sectionStart !== a.sectionStart) {
                      let headerClass = 'text-gray-800';
                      if (isMandatoryGroupItem && !groupHasSelection[a.group!]) {
                        headerClass = 'text-red-600';
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
                  const hasSubs = hasSubOptions(a, accs);

                  // Qty input items
                  if (a.isQtyInput) {
                    const qtyKey = `${currentUnit.configKey}_${a.id}`;
                    const currentQtyVal = state.accQty[qtyKey] ?? 0;

                    const card = (
                      <div key={a.id} className={`p-2 border rounded-lg bg-white flex items-center justify-between gap-3 ${indentClass} ${currentQtyVal > 0 ? 'btn-active border-emerald-500' : ''}`}>
                        <div className="min-w-0">
                          <div className="text-sm text-gray-800">{getLocalizedName(a.name, lang)}</div>
                          <div className="text-xs text-gray-500">Varenr: {a.varenr}</div>
                          {renderActionLinks(a, machineType)}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <input type="number" min="0" max="99" value={currentQtyVal}
                            onChange={e => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setState(s => ({ ...s, accQty: { ...s.accQty, [`${currentUnit.configKey}_${a.id}`]: val } }));
                            }}
                            onClick={e => e.stopPropagation()}
                            className="w-16 p-1.5 border rounded-md text-center" />
                          <div className="font-bold text-emerald-700 whitespace-nowrap w-24 text-right">
                            {formatMoney(getPrice(a, lang), lang)}
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
                      <div className="ral-input-wrapper text-sm mt-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <div className="font-medium text-gray-700 whitespace-nowrap">{T('ralLabel')}</div>
                          <input type="text" inputMode="numeric" maxLength={4} placeholder={T('ralPlaceholder')} value={state.ralCodes[ralKey] || ''}
                            onChange={e => {
                              const filtered = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setState(s => ({ ...s, ralCodes: { ...s.ralCodes, [ralKey]: filtered } }));
                            }}
                            className="ral-input w-24 text-center px-2 py-1 border border-gray-300 rounded-md" />
                        </div>
                        <div className="text-xs italic text-gray-500 mt-2">{T('ralHelp')}</div>
                      </div>
                    );
                  }

                  const card = (
                    <div key={a.id} onClick={() => handleToggleAcc(a.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition hover:bg-gray-50 accessory-card ${isSelected ? 'btn-active border-emerald-500' : ''} ${indentClass}`}>
                      <div className="flex items-start w-full min-w-0">
                        {/* Checkbox indicator with sub-option arrow */}
                        <div className="selection-indicator relative flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 mr-3 rounded border-2"
                          style={{ backgroundColor: isSelected ? '#059669' : 'white', borderColor: isSelected ? '#059669' : '#9ca3af' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-transparent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {hasSubs && (
                            <span className="absolute left-1/2 -translate-x-1/2 top-[20px] text-[10px] text-gray-400 leading-none">↳</span>
                          )}
                        </div>

                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-grow min-w-0">
                              <span className="font-medium text-sm text-gray-800">{getLocalizedName(a.name, lang)}</span>
                              <div className="text-gray-500 text-xs">Varenr: {a.varenr}</div>
                              {renderActionLinks(a, machineType)}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <span className="font-bold text-base text-emerald-700 price-col">{formatMoney(getPrice(a, lang), lang)}</span>
                            </div>
                          </div>

                          {ralInput}
                        </div>
                      </div>

                      {/* Sub items with full rendering */}
                      {isSelected && a.subItems && a.subItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-2">
                          <div className="text-xs font-semibold text-gray-600">{T('tilvalg') || 'Tilvalg:'}</div>
                          {a.subItems.map(sub => renderSubItem(sub, selectedIds, machineType))}
                        </div>
                      )}
                    </div>
                  );

                  if (isMandatoryGroupItem) mandatoryGroupItems.push(card);
                  else elements.push(card);
                });

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
                <p className="text-gray-600 text-sm mb-6">{T('step4Desc')}</p>
                <div className="space-y-4 max-w-lg mx-auto">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('companyName')} *</label>
                    <input type="text" value={state.firmanavn} onChange={e => setCustomerField('firmanavn', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('contactPerson')} *</label>
                    <input type="text" value={state.kontaktperson} onChange={e => setCustomerField('kontaktperson', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('phone')}</label>
                    <input type="text" value={state.telefon} onChange={e => setCustomerField('telefon', e.target.value)} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('emailSender')} *</label>
                    <input type="email" value={state.email} onChange={e => setCustomerField('email', e.target.value)} className="w-full p-2 border rounded-lg" placeholder={T('emailSenderPlaceholder')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('emailRecipientLabel')}</label>
                    <input type="email" value={state.emailRecipient} onChange={e => setCustomerField('emailRecipient', e.target.value)} className="w-full p-2 border rounded-lg" placeholder={T('emailRecipientPlaceholder')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('comment')}</label>
                    <textarea value={state.comment} onChange={e => setCustomerField('comment', e.target.value)} className="w-full p-2 border rounded-lg" rows={3} />
                    <p className="text-xs text-gray-500 mt-1">{T('altDeliveryInfo')}</p>
                  </div>

                  {/* Manual dealer discount */}
                  <div className="border-t pt-4 mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {lang === 'da' ? 'Ekstra forhandlerrabat (%)' : 'Extra dealer discount (%)'}
                    </label>
                    <input type="number" min="0" max="100" step="0.1"
                      value={state.manualDealerDiscountPct || ''}
                      onChange={e => {
                        const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                        setState(s => ({ ...s, manualDealerDiscountPct: v }));
                      }}
                      placeholder="0"
                      className="w-24 p-2 border rounded-lg text-center" />
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

                    if (item.isSectionHeader) {
                      return (
                        <div key={idx} className="pt-3 pb-1 text-sm font-semibold text-gray-800 border-t border-gray-200 mt-2">
                          {item.txt}
                        </div>
                      );
                    }

                    const lineClasses = item.bold ? 'font-bold text-gray-900 mt-4' : 'text-gray-600 text-xs';
                    // Indentation matching original HTML
                    let indent = 'pl-0';
                    if (item.sub) {
                      if (item.isDependentAccessory) indent = 'pl-10';
                      else if (item.isPrimaryAccessory) indent = 'pl-6';
                      else indent = 'pl-4';
                    }

                    return (
                      <div key={idx}>
                        <div className={`flex justify-between items-start ${lineClasses} ${indent}`}>
                          <div className="min-w-0 flex-1">
                            <div>{item.txt}</div>
                            {item.subText && <div className="mt-1">{item.subText}</div>}
                          </div>
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
                        {/* Demo machine checkbox (Step 4 only) */}
                        {state.step === 4 && item.isMachine && item.index && DEMO_ELIGIBLE_VARENR.has(item.varenr) && (
                          <div className={`flex justify-between items-center text-xs ${indent} mt-1`}>
                            <label className="flex items-center gap-2 text-gray-700 cursor-pointer select-none">
                              <input type="checkbox"
                                checked={isDemoSelected(item.varenr, item.index)}
                                onChange={() => toggleDemoMachine(item.varenr, item.index!, item.txt)} />
                              <span>{lang === 'da' ? 'Demo maskine' : 'Demo machine'} <span className="text-gray-500">(+{formatMoney(getDemoFee(), lang)})</span></span>
                            </label>
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
                        <span className="text-red-500">{d.txt}</span>
                        <span className="text-red-500 price-col">-{formatMoney(d.amount, lang)}</span>
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
