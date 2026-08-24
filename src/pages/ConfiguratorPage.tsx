import { useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { da, de, enGB, hu, it } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useConfigurator } from '@/hooks/useConfigurator';
import { PRODUCTS, ACCESSORIES, getLocalizedName, getPrice, formatMoney, getAccessoriesFlat, ACC_ID_WIRE_HARNESS, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_FLASH_LIGHT, ACC_ID_WORK_LIGHT, ACC_ID_OIL_NORMAL, ACC_ID_OIL_BIO, ACC_ID_RAL_COLOR, DEMO_ELIGIBLE_VARENR, DEMO_FEE_DKK, DEMO_FEE_EUR, LOOSE_TOOL_KEY, PACKAGING_COST_ID, PACKAGING_TRIGGER_IDS, ACC_ID_OIL_1000_PARENT, getLooseToolAccessories } from '@/data/machines';
import { t, translateSpecLabel, itemNoLabel } from '@/data/translations';
import { t as tPortal } from '@/lib/i18n/translations';
import { Language, Accessory, SubItem } from '@/types/configurator';
import LoginStep from '@/components/configurator/LoginStep';
import { AppUser } from '@/data/appUsers';
import AccountPanel from '@/components/configurator/AccountPanel';
import OwnershipPicker, { OwnershipSelection, deriveInitialOwnership } from '@/components/configurator/OwnershipPicker';
import LeadLinkPicker from '@/components/configurator/LeadLinkPicker';
import { buildConfiguratorOwnership } from '@/lib/configuratorOwnership';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { useLanguage } from '@/context/LanguageContext';
import { PORTAL_LANGUAGES, mapUiLanguageToLegacy, resolveContentUiLanguage, type PortalUiLanguage } from '@/lib/portalLanguages';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { saveConfiguration, updateConfiguration, markPdfDownloaded, markAsOrderSubmitted, ensureReferenceNumbers, updateConfigurationFlowType, uploadSentPdf, loadConfigurationByIdUnscoped, isSavedConfigurationOrderLocked, fetchIsOrderSubmitted, loadConfigurations } from '@/lib/configurationsService';
import { supabase } from '@/lib/supabase';
import { fetchCrmConfigurationVisible } from '@/lib/crmConfigurationsService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { getActiveSellerView } from '@/lib/activeMode';
import { getOrderWebhookUrl, getQuoteWebhookUrl, getWebhookEnv } from '@/lib/webhookUrls';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { buildMainCategories } from '@/lib/mainCategories';
import { logConfigurationEmailSend } from '@/lib/configurationEmailLogService';
import { defaultCanSubmitOrder, defaultCanViewPrices } from '@/lib/sessionPermissionDefaults';
import { resolveBaseDiscountPct, isImporterAppUser, IMPORTER_BASE_DISCOUNT_PCT, DEFAULT_BASE_DISCOUNT_PCT } from '@/lib/importerDiscount';
import { getLead } from '@/lib/crmLeadsService';
import { buildConfiguratorStateFromLead } from '@/lib/leadToConfiguratorDraft';

import { generateSalesArguments, generateRecommendations, SalesArgsStructured, RecommendationStructured } from '@/lib/salesArguments';
import CustomerNeedsPanel from '@/components/configurator/CustomerNeedsPanel';
import { RecommendationInfoPopover } from '@/components/configurator/RecommendationInfoPopover';
import type { CustomerNeeds } from '@/lib/customerNeeds';
import { cn } from '@/lib/utils';
import { derivePortalRole, isMesseVariantUser } from '@/lib/portalAccess';
import { isMessePreviewActive } from '@/lib/messePreview';

import { toast } from 'sonner';
import {
  PAYMENT_TERMS_OPTIONS,
  DEFAULT_PAYMENT_TERMS,
  resolvePaymentTerms,
  getPaymentTermsLabel,
} from '@/lib/paymentTerms';

// Configurator language selector — uses the 9 portal UI languages.
// Selecting sv/fr/pl/cs maps to 'en' for internal state (so existing
// Record<Language, T> tables don't crash) while the portal-wide
// `uiLanguage` keeps the real selection so chrome (header, t() lookups,
// active flag highlight) localises correctly.
const LANGUAGES: { code: PortalUiLanguage; flag: string }[] = PORTAL_LANGUAGES.map(l => ({
  code: l.code, flag: l.emoji,
}));

const MACHINE_KEYS = ['RC-751', 'RC-1000S', 'Timan 2620', 'Timan 3330', 'Loader Line', 'LOOSE_TOOL'];

const REQUIRED_GROUPS_3330 = ['aircon', 'doors', 'seats', 'roof'];
const REQUIRED_GROUPS_2620 = ['cabin_2620'];
const REQUIRED_GROUPS_RC1000 = ['oil_1000'];
const DANISH_ONLY_ITEM_IDS = new Set(['712527', '712528', 'S900205', 'S900025']);
const EUR_ONLY_ITEM_IDS = new Set(['712188']);

type MesseProfileAppUser = AppUser & {
  dealer_number?: string | null;
  portal_variant?: string | null;
  portal_role?: string | null;
};

type ConfiguratorSubmitFlowType = 'quote' | 'order';

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

function hasSubOptions(acc: Accessory, allAccs: Accessory[]): boolean {
  if (acc.subItems && acc.subItems.length > 0) return true;
  return allAccs.some(a => a.requires === acc.id);
}

export default function ConfiguratorPage() {
  const {
    state, setStep, setLanguage: setConfigLanguage, setFlowType, setMachineQty, setConfigMode,
    setDate, setDeliveryMethod, setCustomerField, toggleAcc, calcResult,
    getGlobalMachineUnits, getDisplayMachineUnits, setState, resetState,
  } = useConfigurator();

  const { appUser, setAppUser: setAppUserCtx, logout: ctxLogout } = useAppUser();
  const { language: globalLanguage, uiLanguage, setLanguage: setGlobalLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const setAppUser = (user: (AppUser & { email: string }) | null) => setAppUserCtx(user);
  // Timan Messe / exhibition demo session — hide save/send/account UI and
  // short-circuit any persistence handler that may still be invoked.
  // Treat ANY render of the configurator under /messe/* as Messe mode too,
  // so the back button + demo guards work even before context resolves.
  const isMessePath = location.pathname.startsWith('/messe');
  const currentAppUser = appUser as MesseProfileAppUser | null;
  const currentDealerNumber = String(currentAppUser?.dealer_number ?? '').trim();
  const isTimanMesseUser = isMesseVariantUser(appUser) && currentDealerNumber === '100';
  const isExhibition = isMessePath || isTimanMesseUser || isMesseVariantUser(appUser) || isMessePreviewActive(appUser?.email);


  // Keep the configurator's internal language in sync with the global portal
  // language so the top-bar selector controls every page consistently.
  // `globalLanguage` is the legacy `Language` (sv/fr/pl/cs map to 'en'), which
  // matches the keys used by the inline T objects throughout the configurator.
  useEffect(() => {
    if (state.language !== globalLanguage) {
      setConfigLanguage(globalLanguage);
    }
  }, [globalLanguage, state.language, setConfigLanguage]);

  // Wrap setLanguage so the in-page flag buttons push BOTH:
  //  - the global portal selection (preserves the real chosen code, e.g. 'fr')
  //  - the configurator state (mapped to a legacy Language so inline T objects
  //    keep working without crashes)
  const setLanguage = useCallback((next: PortalUiLanguage) => {
    setGlobalLanguage(next);
    setConfigLanguage(mapUiLanguageToLegacy(next));
  }, [setConfigLanguage, setGlobalLanguage]);
  // Phase 38/40 — "Ekstra forhandlerrabat (%)" gated by an explicit per-user
  // permission stored in app_users.permissions.can_apply_extra_dealer_discount.
  // We read from the EFFECTIVE portal user so that:
  //   - direct login uses the logged-in user's app_users row, and
  //   - Backend "Vis som <bruger>" uses the previewed user's row,
  // both via the same code path. Falls back to logged-in user when no view-as.
  const effectiveUser = useEffectivePortalUser(appUser) ?? appUser;
  const activePortalRole = derivePortalRole(effectiveUser ?? appUser);
  const canApplyExtraDealerDiscount = (() => {
    const flag = effectiveUser?.permissions?.can_apply_extra_dealer_discount;
    if (flag === true) return true;
    if (flag === false) return false;
    // No explicit override → role default. Backend = true, others = false.
    // Preserve legacy: respect the older top-level can_edit_discount flag
    // when an admin already enabled it for a non-backend user.
    if (activePortalRole === 'timan_backend') return true;
    return !!effectiveUser?.can_edit_discount;
  })();
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[extra-dealer-discount]', {
      loggedInEmail: appUser?.email,
      effectiveEmail: effectiveUser?.email,
      permission: effectiveUser?.permissions?.can_apply_extra_dealer_discount,
      resolved: canApplyExtraDealerDiscount,
    });
  }
  const permissions = {
    canSeePrices: isExhibition || defaultCanViewPrices(
      effectiveUser?.can_view_prices,
      effectiveUser?.portal_role,
      effectiveUser?.role,
      effectiveUser?.partner_type,
    ),
    canSubmitOrder: defaultCanSubmitOrder(
      effectiveUser?.can_submit_order,
      effectiveUser?.portal_role,
      effectiveUser?.role,
      effectiveUser?.partner_type,
    ),
    canSetDiscount: (isExhibition || canApplyExtraDealerDiscount) && activePortalRole !== 'dealer_user',
    canChooseWorkingFor: appUser?.can_switch_customer_mode ?? false,
  };

  // Dealer User + Messe pricing rule: see gross list price. Messe may add
  // one manual discount in step 4, but no base/quantity/delivery/demo discounts.
  const isDealerUserPricing = activePortalRole === 'dealer_user';
  const isGrossPriceMode = isDealerUserPricing || isExhibition;
  const displayCalc = calcResult && isGrossPriceMode
    ? (() => {
        const manualPct = isExhibition ? (state.manualDealerDiscountPct || 0) : 0;
        const manualAmount = calcResult.subtotal * (manualPct / 100);
        return {
          ...calcResult,
          discountDetails: manualAmount > 0
            ? [{ txt: `Ekstra rabat (${manualPct}%)`, amount: manualAmount, varenr: '795042' }]
            : [],
          totalDiscount: manualAmount,
          totalPct: manualPct,
          currentPrice: calcResult.subtotal - manualAmount,
        };
      })()
    : calcResult;

  // Phase 38 — security: when the user is not allowed to apply an extra
  // dealer discount, force the stored value to 0 so calcConfiguration, the
  // PDF, the order/quote payload, the email and any persisted state cannot
  // include it. Runs on every change to permission or state.
  useEffect(() => {
    if (!isExhibition && !canApplyExtraDealerDiscount && (state.manualDealerDiscountPct || 0) !== 0) {
      setState((s) => ({ ...s, manualDealerDiscountPct: 0 }));
    }
  }, [isExhibition, canApplyExtraDealerDiscount, state.manualDealerDiscountPct, setState]);

  // Phase 27 — Payment terms: visible only when the ACTIVE mode/role is
  // Backend or Timan Sælger AND the user has `can_manage_payment_terms`.
  // derivePortalRole() respects the "Vis som rolle" / seller view-as mode,
  // so a Backend user previewing as Timan Forhandler will be hidden.
  const canManagePaymentTerms = (() => {
    const isBackend = activePortalRole === 'timan_backend';
    const isSeller = activePortalRole === 'timan_seller';
    if (!isBackend && !isSeller) return false;
    const flag = appUser?.permissions?.can_manage_payment_terms;
    if (flag === false) return false;
    return true;
  })();


  // ── Phase 23 r2: in-configurator Sælger / Forhandler picker ────────
  // Single source of truth for both the Step 4 form picker and the basket
  // panel picker. Re-derived whenever the logged-in user (or their active
  // "view as" mode) changes.
  const [ownership, setOwnership] = useState<OwnershipSelection>(() => deriveInitialOwnership(appUser));

  // Step 3 reminder for Timan 3330 → varenr 721122 (centerslange).
  // Acknowledged set is keyed by unit configKey so it does not repeat for the
  // same configuration once the user has chosen "Fortsæt uden 721122".
  const [acknowledged721122, setAcknowledged721122] = useState<Set<string>>(new Set());
  const [reminder721122, setReminder721122] = useState<{ open: boolean; pendingNext: (() => void) | null }>({ open: false, pendingNext: null });

  // Step 3 reminder for Løs redskab → varenr 721059 (centerslange eftermontering).
  // Only triggered when one of the T2/T3 collection tanks (720125/720130/720132/720133)
  // is selected under the LOOSE_TOOL flow and 721059 is not selected.
  const [acknowledged721059, setAcknowledged721059] = useState<Set<string>>(new Set());
  const [reminder721059, setReminder721059] = useState<{ open: boolean; pendingNext: (() => void) | null }>({ open: false, pendingNext: null });
  useEffect(() => {
    setOwnership(deriveInitialOwnership(appUser));
  }, [appUser?.email, appUser?.dealer_number, appUser?.portal_role]);

  // Phase 63 — Importør standard-rabat (30%).
  // Slår op på den valgte forhandler (eller den auto-låste dealer for
  // eksterne brugere) og afgør basisrabatten:
  //   • 30% når effektiv bruger ELLER valgt forhandler er importør
  //   • 25% ellers
  // Skriver resultatet ind i state.baseDiscountPct, så calc, PDF, payload,
  // gemte cases og CRM-synkronisering alle bruger samme værdi.
  const [selectedDealerCustomerType, setSelectedDealerCustomerType] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const dealerId = ownership.dealerAccountId;
    if (!dealerId) {
      setSelectedDealerCustomerType(null);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('dealer_accounts')
          .select('customer_type, customer_type_label, dealer_type')
          .eq('id', dealerId)
          .maybeSingle();
        if (cancelled) return;
        const ct =
          (data?.customer_type as string | null) ??
          (data?.customer_type_label as string | null) ??
          (data?.dealer_type as string | null) ??
          null;
        setSelectedDealerCustomerType(ct);
      } catch {
        if (!cancelled) setSelectedDealerCustomerType(null);
      }
    })();
    return () => { cancelled = true; };
  }, [ownership.dealerAccountId]);

  useEffect(() => {
    const userIsImporter = isImporterAppUser(effectiveUser);
    const dealerCt = selectedDealerCustomerType;
    const pct = resolveBaseDiscountPct({
      appUser: effectiveUser,
      dealer: dealerCt ? { customer_type: dealerCt } : null,
    });
    const target = userIsImporter ? IMPORTER_BASE_DISCOUNT_PCT : pct;
    const current = typeof state.baseDiscountPct === 'number' ? state.baseDiscountPct : DEFAULT_BASE_DISCOUNT_PCT;
    if (Math.abs(target - current) > 1e-6) {
      setState((s) => ({ ...s, baseDiscountPct: target }));
    }
  }, [effectiveUser?.portal_role, effectiveUser?.partner_type, selectedDealerCustomerType, state.baseDiscountPct, setState]);

  // Build the ownership payload sent to saveConfiguration / order webhook.
  // Picker selections override active "view as" mode when the internal
  // user explicitly chose a different seller / dealer.
  const buildOwnershipPayload = useCallback(async () => {
    return buildConfiguratorOwnership(appUser, {
      seller: ownership.sellerInitials
        ? { initials: ownership.sellerInitials, email: ownership.sellerEmail, name: ownership.sellerName }
        : null,
      dealer: ownership.dealerAccountId || ownership.dealerNumber
        ? {
            account_id: ownership.dealerAccountId,
            account_number: ownership.dealerNumber,
            company_name: ownership.dealerCompanyName,
          }
        : null,
    });
  }, [appUser, ownership]);

  const getRequiredOwnershipPayload = useCallback(async () => {
    if (isExhibition) {
      if (!ownership.sellerInitials || !ownership.sellerEmail) {
        toast.error('Vælg Timan-sælger før du gemmer lead.');
        return null;
      }
      return {
        seller_initials: ownership.sellerInitials,
        seller_email: ownership.sellerEmail.toLowerCase(),
        seller_name: ownership.sellerName,
        assigned_seller_id: await resolveSellerId(ownership.sellerEmail),
        dealer_number: null,
        dealer_name: null,
        dealer_account_id: null,
        created_by_email: appUser?.email?.toLowerCase() ?? null,
        created_by_role: activePortalRole ?? null,
        active_mode: 'role:exhibition_user',
        owner_status: 'aktiv',
      };
    }
    try {
      return await buildOwnershipPayload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Vælg sælger og forhandler før gem.');
      return null;
    }
  }, [isExhibition, ownership, appUser?.email, activePortalRole, buildOwnershipPayload]);

  const [savingChanges, setSavingChanges] = useState(false);

  const lang = state.language;
  // Use uiLanguage (9-locale) for translation lookups so PL/SE/FR/CZ resolve
  // to their own strings. `lang` (5-locale state.language) still drives
  // legacy inline `{ da, en, de, it, hu }[lang]` lookups and product-data
  // localisation, which only have 5-language coverage.
  const T = (key: string) => t(key, uiLanguage);
  // Modal/HTML "content language" — collapses sv/fr/pl/cs to 'en' so chrome
  // inside modals matches the product/accessory data (which is only available
  // in da/en/de/it/hu). Prevents mixed-language modals.
  const contentUiLang = resolveContentUiLanguage(uiLanguage);
  const TC = (key: string) => t(key, contentUiLang);
  const dateLocale = { da, en: enGB, de, it, hu }[lang] || da;
  const selectedDeliveryDate = state.date ? new Date(`${state.date}T00:00:00`) : undefined;

  const totalQty = state.machineConfigs.reduce((sum, c) => sum + c.qty, 0);
  const discountEligibleQty = state.machineConfigs.reduce((sum, c) => sum + (PRODUCTS[c.type]?.isDiscountEligible ? c.qty : 0), 0);
  const flowSelected = !!state.flowType;

  // Modal states
  const [infoModal, setInfoModal] = useState<{ title: string; content: string } | null>(null);
  const [deliveryInfoOpen, setDeliveryInfoOpen] = useState(false);
  const [oilModalOpen, setOilModalOpen] = useState(false);
  const [oilChoice, setOilChoice] = useState<'normal' | 'bio' | null>(null);
  const [oilError, setOilError] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successModal, setSuccessModal] = useState<{ flowType: 'quote' | 'order'; orderNumber: string; quoteNumber: string; recipients: string[] } | null>(null);
  const [newConfigModalOpen, setNewConfigModalOpen] = useState(false);
  const [isSavedCurrent, setIsSavedCurrent] = useState(false);
  const [showLeavePortalConfirm, setShowLeavePortalConfirm] = useState(false);
  const [savedConfigurationId, setSavedConfigurationId] = useState<string | null>(null);
  const savedConfigurationIdRef = useRef<string | null>(null);
  const [savedQuoteNumber, setSavedQuoteNumber] = useState<string | null>(null);
  const [savedOrderNumber, setSavedOrderNumber] = useState<string | null>(null);
  const [savedSourceQuoteNumber, setSavedSourceQuoteNumber] = useState<string | null>(null);
  // Duplicate-send protection: when the currently-open saved case is an
  // already-submitted order, lock the UI (read-only, hide send button).
  // Set on resume / AccountPanel restore, and verified server-side just
  // before the order webhook fires.
  const [orderLocked, setOrderLocked] = useState(false);
  const [savingBeforeReset, setSavingBeforeReset] = useState(false);
  const confirmContentRef = useRef<HTMLDivElement>(null);
  const [salesArgsModalOpen, setSalesArgsModalOpen] = useState(false);
  const [salesArgsData, setSalesArgsData] = useState<SalesArgsStructured | null>(null);
  const [selectedSalesBullets, setSelectedSalesBullets] = useState<Set<string>>(new Set());
  const [includeSalesArgs, setIncludeSalesArgs] = useState(false);
  const [recommendationData, setRecommendationData] = useState<RecommendationStructured | null>(null);
  const [selectedRecBullets, setSelectedRecBullets] = useState<Set<string>>(new Set());
  const [includeRecommendation, setIncludeRecommendation] = useState(false);
  const [wantRecommendation, setWantRecommendation] = useState(false);
  // Phase 33 — optional CRM lead link saved with the configuration.
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(null);
  // Phase 40 — bump to force LeadLinkPicker to refetch after we create
  // a new lead via the "Gem som lead" shortcut, so the new lead shows up
  // and is selected automatically.
  const [leadPickerKey, setLeadPickerKey] = useState(0);
  const [savingAsLead, setSavingAsLead] = useState(false);
  const [savingLeadAndOrder, setSavingLeadAndOrder] = useState(false);
  // When the user picks "Opret nyt lead" in LeadLinkPicker, we defer the
  // actual CRM lead creation until the configuration is saved or the
  // quote is sent — at that moment ensurePendingLeadCreated() runs and
  // links the new lead to the row.
  const [pendingNewLead, setPendingNewLead] = useState(false);

  useEffect(() => {
    savedConfigurationIdRef.current = savedConfigurationId;
  }, [savedConfigurationId]);

  const canSaveConfiguratorAsLead = (() => {
    const flag = effectiveUser?.permissions?.can_save_configurator_as_lead;
    if (flag === true) return true;
    if (flag === false) return false;
    return activePortalRole === 'timan_backend' || activePortalRole === 'timan_seller';
  })();

  // "Gem ændringer / Save changes" — writes the current edits back to the
  // SAME saved case (no new row, no new quote/order number). Only enabled
  // when a saved case has been reopened (savedConfigurationId is set).
  // Resolve the "already submitted order" lock whenever the loaded case
  // changes. Re-reads the row from Supabase so we never trust stale local
  // state. When no case is loaded, the lock is cleared.
  useEffect(() => {
    let cancelled = false;
    if (!savedConfigurationId) {
      setOrderLocked(false);
      return;
    }
    (async () => {
      const res = await fetchIsOrderSubmitted(savedConfigurationId);
      if (!cancelled) setOrderLocked(res.locked);
    })();
    return () => { cancelled = true; };
  }, [savedConfigurationId]);

  /**
   * Create a CRM lead from the current configurator state. Used by both
   * the "Gem som lead" button (handleSaveAsLead) and by the new
   * "Opret nyt lead" picker option (ensurePendingLeadCreated). The lead
   * inherits company, contact, dealer, seller, machines, accessories,
   * comment and the running quote/order numbers + sent-PDF link when
   * available. Returns the created lead id, or null on failure.
   */
  const createLeadFromCurrentState = useCallback(async (): Promise<string | null> => {
    try {
      const { createLead } = await import('@/lib/crmLeadsService');
      const { calcConfigurationTotals } = await import('@/lib/calcConfiguration');
      const { resolveSellerId: resolveSid } = await import('@/lib/resolveSellerId');
      const totals = calcConfigurationTotals(state);
      const estimatedValue = isExhibition && displayCalc
        ? displayCalc.currentPrice
        : totals.finalPrice;

      let notes = '';
      try {
        const summary = buildQuoteContentSummary(state);
        const lines: string[] = [];
        for (const g of summary.machines) {
          lines.push(`${g.qty} × ${g.model_name}`);
          const accNames = new Set<string>();
          for (const u of g.units) for (const a of u.accessories) accNames.add(a.name);
          if (accNames.size > 0) lines.push('  • ' + Array.from(accNames).join(', '));
        }
        notes = lines.join('\n');
      } catch { /* */ }
      if (state.comment) notes = (notes ? notes + '\n\n' : '') + state.comment;
      const quoteRef = savedQuoteNumber || savedOrderNumber;
      if (quoteRef) notes = (notes ? notes + '\n\n' : '') + `Tilbud: ${quoteRef}`;

      const sellerId = ownership.sellerEmail
        ? await resolveSid(ownership.sellerEmail)
        : await resolveSid(appUser?.email);

      const machineTypes = Array.from(new Set(state.machineConfigs.map(m => m.type)));
      const title = state.firmanavn || ownership.dealerCompanyName || (machineTypes.join(', ') || 'Konfigurator');
      const contactInfo = [state.kontaktperson, state.email || state.emailRecipient, state.telefon]
        .filter(Boolean).join(' · ') || null;

      const created = await createLead({
        title,
        owner_user_id: sellerId,
        owner_name: ownership.sellerName || appUser?.display_name || null,
        owner_email: ownership.sellerEmail || appUser?.email || null,
        linked_dealer_id: ownership.dealerNumber || null,
        first_contact_date: new Date().toISOString().slice(0, 10),
        expected_close_date: null,
        next_followup_date: null,
        machine_types: machineTypes,
        next_activity: 'Konfigurator-lead',
        demo_has_run: null,
        contact_type: null,
        customer_type: null,
        contact_information: contactInfo,
        trade_fair: null,
        country: null,
        notes: notes || null,
        estimated_value: Math.round(estimatedValue || 0),
        probability: 10,
        pipeline_stage: 'Lead',
        lost_competitor: null,
        lost_reason: null,
        lost_comment: null,
        attachments: [],
        status: 'open',
        incomplete_from_configurator: true,
      });
      return created.id;
    } catch (err) {
      console.error('[createLeadFromCurrentState] failed:', err);
      return null;
    }
  }, [state, ownership, appUser, savedQuoteNumber, savedOrderNumber, isExhibition, displayCalc]);

  /**
   * If the user selected "Opret nyt lead" in the picker, create the lead
   * now and link it to the active configuration. Returns the effective
   * lead id (newly created OR the previously linked one OR null).
   * Idempotent — clears pendingNewLead after a successful create so
   * subsequent save/send calls don't spawn duplicate leads.
   */
  const ensurePendingLeadCreated = useCallback(async (): Promise<string | null> => {
    if (linkedLeadId) return linkedLeadId;
    if (!pendingNewLead) return null;
    const newId = await createLeadFromCurrentState();
    if (!newId) {
      toast.error({ da: 'Kunne ikke oprette lead', en: 'Failed to create lead', de: 'Lead konnte nicht erstellt werden', it: 'Impossibile creare il lead', hu: 'A lead létrehozása sikertelen' }[lang]);
      return null;
    }
    setLinkedLeadId(newId);
    setPendingNewLead(false);
    setLeadPickerKey(k => k + 1);
    toast.success({ da: 'Nyt lead oprettet i CRM', en: 'New lead created in CRM', de: 'Neuer Lead im CRM erstellt', it: 'Nuovo lead creato nel CRM', hu: 'Új lead létrehozva a CRM-ben' }[lang]);
    return newId;
  }, [linkedLeadId, pendingNewLead, createLeadFromCurrentState, lang]);


  const handleSaveChanges = useCallback(async () => {
    if (isExhibition) { toast.info('Demo mode — gemning er deaktiveret.'); return; }
    if (savingChanges) return;
    // Block saving on already-submitted orders (local + server re-check).
    if (orderLocked) {
      toast.error(T('orderAlreadySubmittedToast'));
      return;
    }
    setSavingChanges(true);
    try {
      const ownershipPayload = await getRequiredOwnershipPayload();
      if (!ownershipPayload) return;
      // If the user picked "Opret nyt lead" in the picker, create the
      // lead now so the saved row carries the lead_id link from the start.
      const effectiveLeadId = await ensurePendingLeadCreated() ?? linkedLeadId;

      if (savedConfigurationId) {
        const serverCheck = await fetchIsOrderSubmitted(savedConfigurationId);
        if (serverCheck.locked) {
          setOrderLocked(true);
          toast.error(T('orderAlreadySubmittedToast'));
          return;
        }
        const res = await updateConfiguration(savedConfigurationId, state, { ownership: ownershipPayload, pricingMode: isExhibition ? 'messe' : undefined });
        if (res.error) {
          toast.error(state.language === 'da' ? 'Kunne ikke gemme ændringer' : 'Failed to save changes', {
            description: res.error,
          });
          return;
        }
        if (res.itemsError) {
          toast.error(state.language === 'da' ? 'Ændringer gemt, men linjer fejlede' : 'Changes saved, but line items failed', {
            description: res.itemsError,
          });
          return;
        }
        toast.success(state.language === 'da' ? 'Ændringer gemt' : 'Changes saved', {
          description: `${state.language === 'da' ? 'Sag ID' : 'Case ID'}: ${savedConfigurationId}`,
        });
        // Readback verification — confirm the row is visible in current Min konto scope.
        try {
          const items = await loadConfigurations(appUser!.email.toLowerCase());
          if (!items.some(i => i.id === savedConfigurationId)) {
            toast.error('Sagen blev gemt, men kan ikke vises i Min konto. Tjek ejer/sælger-tilknytning.');
          }
        } catch { /* ignore */ }
      } else {
        if (!appUser) {
          toast.error(state.language === 'da' ? 'Kunne ikke gemme sag' : 'Could not save case');
          return;
        }
        const label = state.firmanavn
          ? `${state.firmanavn} — ${state.machineConfigs.map(m => m.type).join(', ')}`
          : state.machineConfigs.map(m => m.type).join(', ') || 'Konfiguration';
        const saveRes = await saveConfiguration(state, label, appUser.email.toLowerCase(), {
          ownership: ownershipPayload,
          leadId: effectiveLeadId,
          pricingMode: isExhibition ? 'messe' : undefined,
        });
        if (saveRes.error) {
          toast.error(state.language === 'da' ? 'Kunne ikke gemme sag' : 'Could not save case', {
            description: saveRes.error,
          });
          return;
        }
        if (saveRes.id) {
          setSavedConfigurationId(saveRes.id);
          setSavedQuoteNumber(saveRes.quote_number);
          setSavedOrderNumber(saveRes.order_number);
          setSavedSourceQuoteNumber(saveRes.source_quote_number);
          setIsSavedCurrent(true);
        }
        if (saveRes.itemsError) {
          toast.error(state.language === 'da' ? 'Sag gemt, men linjer fejlede' : 'Case saved, but line items failed', {
            description: saveRes.itemsError,
          });
          return;
        }
        // Readback verification before showing success.
        let visibleInScope = true;
        if (saveRes.id) {
          try {
            const items = await loadConfigurations(appUser.email.toLowerCase());
            visibleInScope = items.some(i => i.id === saveRes.id);
          } catch { /* ignore */ }
        }
        if (!visibleInScope) {
          toast.error('Sagen blev gemt, men kan ikke vises i Min konto. Tjek ejer/sælger-tilknytning.');
        } else {
          toast.success(state.language === 'da' ? 'Sag gemt' : 'Case saved', {
            description: saveRes.id ? `${state.language === 'da' ? 'Sag ID' : 'Case ID'}: ${saveRes.id}` : undefined,
          });
        }
      }
    } finally {
      setSavingChanges(false);
    }
  }, [savedConfigurationId, savingChanges, orderLocked, getRequiredOwnershipPayload, state, appUser, linkedLeadId, ensurePendingLeadCreated]);

  // Phase 40 — "Gem som lead" / "Save as lead": create a CRM lead from the
  // current configurator state without sending the quote. Only available on
  // the Tilbud flow for users with can_save_configurator_as_lead.
  const handleSaveAsLead = useCallback(async (options?: { quiet?: boolean }): Promise<string | null> => {
    if (savingAsLead) return null;
    // Duplicate protection: configuration already linked to a lead.
    if (linkedLeadId) {
      if (!options?.quiet) {
        toast.info(
          { da: 'Denne konfiguration er allerede knyttet til et lead.',
            en: 'This configuration is already linked to a lead.',
            de: 'Diese Konfiguration ist bereits mit einem Lead verknüpft.',
            it: 'Questa configurazione è già collegata a un lead.',
            hu: 'Ez a konfiguráció már egy leadhez van kapcsolva.' }[lang]
        );
      }
      return linkedLeadId;
    }
    setSavingAsLead(true);
    try {
      const { createLead } = await import('@/lib/crmLeadsService');
      const { calcConfigurationTotals } = await import('@/lib/calcConfiguration');
      const { resolveSellerId: resolveSid } = await import('@/lib/resolveSellerId');
      const totals = calcConfigurationTotals(state);
      const estimatedValue = isExhibition && displayCalc
        ? displayCalc.currentPrice
        : totals.finalPrice;

      // Build a short notes string with selected machines + accessories so
      // the seller can see what was configured before finishing the lead.
      let notes = '';
      try {
        const summary = buildQuoteContentSummary(state);
        const lines: string[] = [];
        for (const g of summary.machines) {
          lines.push(`${g.qty} × ${g.model_name}`);
          const accNames = new Set<string>();
          for (const u of g.units) for (const a of u.accessories) accNames.add(a.name);
          if (accNames.size > 0) lines.push('  • ' + Array.from(accNames).join(', '));
        }
        notes = lines.join('\n');
      } catch { /* */ }
      if (state.comment) notes = (notes ? notes + '\n\n' : '') + state.comment;

      const sellerId = ownership.sellerEmail
        ? await resolveSid(ownership.sellerEmail)
        : await resolveSid(appUser?.email);

      const machineTypes = Array.from(new Set(state.machineConfigs.map(m => m.type)));
      const title = state.firmanavn || ownership.dealerCompanyName || (machineTypes.join(', ') || 'Konfigurator');
      const contactInfo = [state.kontaktperson, state.email || state.emailRecipient, state.telefon]
        .filter(Boolean).join(' · ') || null;

      const created = await createLead({
        title,
        owner_user_id: sellerId,
        owner_name: ownership.sellerName || appUser?.display_name || null,
        owner_email: ownership.sellerEmail || appUser?.email || null,
        linked_dealer_id: ownership.dealerNumber || null,
        first_contact_date: new Date().toISOString().slice(0, 10),
        expected_close_date: null,
        next_followup_date: null,
        machine_types: machineTypes,
        next_activity: 'New lead',
        demo_has_run: null,
        contact_type: null,
        customer_type: null,
        contact_information: contactInfo,
        trade_fair: null,
        country: null,
        notes: notes || null,
        estimated_value: Math.round(estimatedValue || 0),
        probability: 10,
        pipeline_stage: 'Lead',
        lost_competitor: null,
        lost_reason: null,
        lost_comment: null,
        attachments: [],
        status: 'open',
        incomplete_from_configurator: true,
      });

      setLinkedLeadId(created.id);
      setLeadPickerKey(k => k + 1);

      // Also persist the configurator state as a saved case linked to this
      // lead, so it shows up in "Min konto" and stays editable. Update the
      // existing row when savedConfigurationId is already set, otherwise
      // create a new row. Does not send PDF/email/order.
      try {
        const ownershipPayload = await getRequiredOwnershipPayload();
        if (ownershipPayload && appUser) {
          if (savedConfigurationId) {
            const updRes = await updateConfiguration(savedConfigurationId, state, { ownership: ownershipPayload, pricingMode: isExhibition ? 'messe' : undefined });
            if (updRes.error) throw new Error(updRes.error);
            try {
              await supabase.from('configurations')
                .update({ lead_id: created.id })
                .eq('id', savedConfigurationId);
            } catch (e) {
              console.warn('[handleSaveAsLead] link lead_id failed:', e);
            }
          } else {
            const label = state.firmanavn
              ? `${state.firmanavn} — ${state.machineConfigs.map(m => m.type).join(', ')}`
              : state.machineConfigs.map(m => m.type).join(', ') || 'Konfiguration';
            const saveRes = await saveConfiguration(state, label, appUser.email.toLowerCase(), {
              ownership: ownershipPayload,
              leadId: created.id,
              pricingMode: isExhibition ? 'messe' : undefined,
            });
            if (saveRes.error) throw new Error(saveRes.error);
            if (saveRes.id) {
              savedConfigurationIdRef.current = saveRes.id;
              setSavedConfigurationId(saveRes.id);
              setSavedQuoteNumber(saveRes.quote_number);
              setSavedOrderNumber(saveRes.order_number);
              setSavedSourceQuoteNumber(saveRes.source_quote_number);
              setIsSavedCurrent(true);
            }
          }
        } else {
          console.warn('[handleSaveAsLead] missing ownership/appUser — configuration not saved');
        }
      } catch (e) {
        console.error('[handleSaveAsLead] save configuration failed:', e);
        if (!options?.quiet) {
          toast.error(
            { da: 'Lead gemt, men konfiguration kunne ikke gemmes',
              en: 'Lead saved, but configuration could not be saved',
              de: 'Lead gespeichert, aber Konfiguration konnte nicht gespeichert werden',
              it: 'Lead salvato, ma impossibile salvare la configurazione',
              hu: 'Lead mentve, de a konfiguráció mentése sikertelen' }[lang],
            { description: e instanceof Error ? e.message : String(e) },
          );
        }
        return null;
      }

      if (!options?.quiet) {
        toast.success({ da: 'Lead og konfiguration gemt', en: 'Lead and configuration saved', de: 'Lead und Konfiguration gespeichert', it: 'Lead e configurazione salvati', hu: 'Lead és konfiguráció mentve' }[lang]);
      }
      return created.id;
    } catch (err) {
      console.error('[handleSaveAsLead] failed:', err);
      if (!options?.quiet) {
        toast.error({ da: 'Kunne ikke gemme lead', en: 'Failed to save lead', de: 'Lead konnte nicht gespeichert werden', it: 'Impossibile salvare il lead', hu: 'A lead mentése sikertelen' }[lang]);
      }
      return null;
    } finally {
      setSavingAsLead(false);
    }
  }, [savingAsLead, linkedLeadId, state, ownership, appUser, lang, savedConfigurationId, getRequiredOwnershipPayload, isExhibition, displayCalc]);

  // ── CRM → Tilbud/Ordrer: "Åbn i konfigurator" (?configId=<uuid>) ──
  // When opened with ?configId, fetch the saved configuration (respecting
  // CRM visibility) and restore the full state — including ownership —
  // so a backend admin or the assigned seller can edit Birger's quote
  // without creating a new row.
  const [searchParams, setSearchParams] = useSearchParams();
  const [resumeBusy, setResumeBusy] = useState(false);
  const resumeAttemptedRef = useRef<string | null>(null);
  const leadQuoteAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    const configId = searchParams.get('configId');
    if (!configId) return;
    if (!appUser?.email) return; // wait until auth is ready
    if (resumeAttemptedRef.current === configId) return;
    resumeAttemptedRef.current = configId;
    setResumeBusy(true);
    (async () => {
      try {
        const role = derivePortalRole(appUser);
        const sellerId = await resolveSellerId(appUser?.email);
        const sellerView = getActiveSellerView(appUser?.email);
        const sellerInitials = sellerView?.initials
          ?? (role === 'timan_seller' && appUser?.display_name
              ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null
              : null);
        const sellerEmail = sellerView?.email
          ?? (role === 'timan_seller' ? appUser?.email?.toLowerCase() ?? null : null);
        const { row, error } = await fetchCrmConfigurationVisible(configId, {
          role,
          sellerId,
          sellerInitials,
          sellerEmail,
          dealerNumber: appUser?.dealer_number ?? null,
        });
        if (error || !row) {
          toast.error(lang === 'da' ? 'Kan ikke åbne sagen' : 'Cannot open case', {
            description: lang === 'da'
              ? 'Sagen findes ikke eller du har ikke adgang.'
              : 'The case does not exist or you do not have access.',
          });
          return;
        }
        const saved = await loadConfigurationByIdUnscoped(configId, appUser.email);
        if (!saved) {
          toast.error(lang === 'da' ? 'Kunne ikke indlæse sagen' : 'Failed to load case');
          return;
        }
        setState(saved.state_json);
        setSavedConfigurationId(saved.id);
        const lockedOnLoad = isSavedConfigurationOrderLocked(saved);
        setOrderLocked(lockedOnLoad);
        // If the saved row is a submitted order, force flowType='order' so
        // every UI guard that keys on state.flowType lights up correctly,
        // even if the persisted state_json still says 'quote' (legacy data
        // or a quote that was later converted/submitted as an order).
        if (lockedOnLoad) setFlowType('order');
        setSavedQuoteNumber(saved.quote_number);
        setSavedOrderNumber(saved.order_number);
        setSavedSourceQuoteNumber(saved.source_quote_number ?? null);
        setIsSavedCurrent(true);

        if (saved.lead_id) setLinkedLeadId(saved.lead_id);
        // Restore dealer/seller picker from the saved row so "Forhandler" does
        // not reset to "Ingen valgt". Prefer the CRM-view row (joined with
        // dealer_accounts → company name + account number) over the raw save.
        setOwnership((prev) => ({
          ...prev,
          sellerInitials: row.seller_initials ?? prev.sellerInitials,
          sellerEmail: row.seller_email ?? prev.sellerEmail,
          sellerName: row.seller_name ?? prev.sellerName,
          dealerAccountId: row.dealer_account_id ?? prev.dealerAccountId,
          dealerNumber: row.dealer_account_number ?? row.dealer_number ?? prev.dealerNumber,
          dealerCompanyName: row.dealer_company_name ?? row.dealer_name ?? prev.dealerCompanyName,
        }));
        toast.success(lang === 'da' ? 'Sag indlæst' : 'Case loaded', {
          description: lang === 'da'
            ? 'Den gemte konfiguration er genindlæst.'
            : 'The saved configuration has been restored.',
        });
      } catch (e) {
        console.error('[ConfiguratorPage] resume failed', e);
        toast.error(lang === 'da' ? 'Kunne ikke indlæse sagen' : 'Failed to load case');
      } finally {
        // Clean the URL so a manual refresh doesn't try to reload (and to
        // avoid duplicate restores when the user starts editing).
        const next = new URLSearchParams(searchParams);
        next.delete('configId');
        setSearchParams(next, { replace: true });
        setResumeBusy(false);
      }
    })();
  }, [searchParams, appUser, lang, setState, setSearchParams]);

  // CRM lead → configurator quote draft (?fromLeadQuote=<lead-id>).
  // This keeps the lead linked and preselects known machines/equipment, then
  // leaves the user in the configurator flow so delivery and existing reminder
  // dialogs are still handled by the normal configurator rules.
  useEffect(() => {
    const leadId = searchParams.get('fromLeadQuote');
    if (!leadId) return;
    if (searchParams.get('configId')) return;
    if (!appUser?.email) return;
    if (leadQuoteAttemptedRef.current === leadId) return;
    leadQuoteAttemptedRef.current = leadId;

    (async () => {
      try {
        const lead = await getLead(leadId);
        if (!lead) {
          toast.error(lang === 'da' ? 'Leadet blev ikke fundet' : 'Lead was not found');
          return;
        }
        setState((prev) => buildConfiguratorStateFromLead(lead, prev));
        setSavedConfigurationId(null);
        setSavedQuoteNumber(null);
        setSavedOrderNumber(null);
        setSavedSourceQuoteNumber(null);
        setIsSavedCurrent(false);
        setOrderLocked(false);
        setLinkedLeadId(lead.id);
        setOwnership((prev) => ({
          ...prev,
          sellerName: lead.owner_name || prev.sellerName,
          sellerEmail: lead.owner_email || prev.sellerEmail,
          dealerAccountId: lead.linked_dealer_id || prev.dealerAccountId,
        }));
        toast.success(lang === 'da' ? 'Lead indlæst som tilbud' : 'Lead loaded as quote', {
          description: lang === 'da'
            ? 'Kontrollér redskaberne og udfyld levering, før tilbuddet gemmes.'
            : 'Check the equipment and fill delivery before saving the quote.',
        });
      } catch (e) {
        console.error('[ConfiguratorPage] lead quote draft failed', e);
        toast.error(lang === 'da' ? 'Kunne ikke indlæse leadet' : 'Could not load lead');
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete('fromLeadQuote');
        setSearchParams(next, { replace: true });
      }
    })();
  }, [searchParams, appUser?.email, lang, setSearchParams, setState]);

  // Persist flowType changes to the saved case (if any), so Tilbud/Ordre is a real saved property
  const handleSetFlowType = useCallback(async (ft: 'quote' | 'order') => {
    if (state.flowType === ft) return;
    setFlowType(ft);
    if (savedConfigurationId) {
      console.info('[flowType] persisting change to saved case', { id: savedConfigurationId, flowType: ft });
      const ownershipPayload = await getRequiredOwnershipPayload();
      if (!ownershipPayload) return;
      updateConfigurationFlowType(savedConfigurationId, ft, ownershipPayload, { pricingMode: isExhibition ? 'messe' : undefined }).then(res => {
        if (res.error) {
          console.error('[flowType] failed to persist:', res.error);
          toast.error(lang === 'da' ? 'Kunne ikke gemme ændring' : 'Failed to save change', { description: res.error });
          return;
        }
        if (res.quote_number) setSavedQuoteNumber(res.quote_number);
        if (res.order_number) setSavedOrderNumber(res.order_number);
      });
    }
  }, [state.flowType, setFlowType, savedConfigurationId, lang, getRequiredOwnershipPayload, isExhibition]);

  // Auto-fill delivery date when entering step 2 (15 business days from today, skip weekends)
  useEffect(() => {
    if (state.step !== 2) return;
    if (isExhibition) {
      setState(s => ({ ...s, currentMachineIndex: 0 }));
      setStep(3);
      return;
    }
    if (state.date) return;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    let added = 0;
    while (added < 15) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    // Safety: if landed on weekend, push to Monday
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    setDate(format(d, 'yyyy-MM-dd'));
  }, [state.step, state.date, isExhibition, setDate, setStep]);

  useEffect(() => {
    if (isExhibition && state.flowType !== 'quote') {
      setFlowType('quote');
    }
  }, [isExhibition, state.flowType, setFlowType]);

  // Auto-fill email fields when entering step 4
  useEffect(() => {
    if (state.step === 4) {
      if (isExhibition && ownership.sellerEmail && state.email !== ownership.sellerEmail) {
        setCustomerField('email', ownership.sellerEmail);
      } else if (!isExhibition && appUser?.email && !state.email) {
        setCustomerField('email', appUser.email);
      }
      if (state.flowType === 'order' && !state.emailRecipient) {
        setCustomerField('emailRecipient', 'NB@Timan.dk');
      }
    }
  }, [state.step, isExhibition, ownership.sellerEmail, state.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEURCurrency = useCallback(() => ['en', 'de', 'it', 'hu'].includes(lang), [lang]);

  // Show auto-add modal for wire harness
  const showAutoAddModal = useCallback((item: Accessory) => {
    const itemName = getLocalizedName(item.name, lang);
    const itemVarenr = `${itemNoLabel(contentUiLang)}: ${item.varenr}`;
    const price = formatMoney(getPrice(item, lang), lang);
    const msg = `${TC('autoAddedTitle')}: <strong>${itemName}</strong><br><br>${itemVarenr}<br>${TC('priceLabel') !== 'priceLabel' ? TC('priceLabel') : (lang === 'da' ? 'Pris' : 'Price')}: ${price}`;
    setInfoModal({ title: TC('autoAddedTitle'), content: msg });
  }, [lang, isEURCurrency, contentUiLang]);

  // Wrapped toggleAcc that detects wire harness addition and oil modal
  const handleToggleAcc = useCallback((accId: string) => {
    const allUnits = getGlobalMachineUnits();
    const currentUnit = allUnits[state.currentMachineIndex];
    if (!currentUnit) return;

    // RC-1000S oil parent special-case: open oil modal
    if (currentUnit.modelType === 'RC-1000S' && accId === ACC_ID_OIL_1000_PARENT) {
      let currentAccIds: string[] = [];
      if (currentUnit.isSharedUnit) {
        const mc = state.machineConfigs.find(c => c.id === currentUnit.modelId);
        currentAccIds = mc?.acc || [];
      } else {
        currentAccIds = state.individualUnitConfigs[currentUnit.configKey]?.acc || [];
      }
      // If already selected, deselect parent + both oils
      if (currentAccIds.includes(ACC_ID_OIL_1000_PARENT)) {
        toggleAcc(ACC_ID_OIL_1000_PARENT);
        return;
      }
      // Open oil modal
      setOilChoice(null);
      setOilError(false);
      setOilModalOpen(true);
      return;
    }

    let currentAccIds: string[] = [];
    if (currentUnit.isSharedUnit) {
      const mc = state.machineConfigs.find(c => c.id === currentUnit.modelId);
      currentAccIds = mc?.acc || [];
    } else {
      currentAccIds = state.individualUnitConfigs[currentUnit.configKey]?.acc || [];
    }

    const hadWireHarness = currentAccIds.includes(ACC_ID_WIRE_HARNESS);

    toggleAcc(accId);

    setTimeout(() => {
      if (currentUnit.modelType === 'RC-1000S' && !hadWireHarness) {
        const newAccIds = [...currentAccIds];
        const idx = newAccIds.indexOf(accId);
        if (idx === -1) newAccIds.push(accId);
        else newAccIds.splice(idx, 1);
        const hasLight = newAccIds.includes(ACC_ID_FLASH_LIGHT) || newAccIds.includes(ACC_ID_WORK_LIGHT);
        const hasAttach = newAccIds.includes(ACC_ID_VPLOW) || newAccIds.includes(ACC_ID_WEEDBRUSH) || newAccIds.includes('418000');
        if (hasLight && hasAttach && !hadWireHarness) {
          const flatAccs = getAccessoriesFlat(currentUnit.modelType);
          const wireItem = flatAccs.find(a => a.id === ACC_ID_WIRE_HARNESS);
          if (wireItem) showAutoAddModal(wireItem as Accessory);
        }
      }
      // Packaging popup for loose tool
      if (currentUnit.modelType === LOOSE_TOOL_KEY && !currentAccIds.includes(accId) && PACKAGING_TRIGGER_IDS.includes(accId)) {
        setInfoModal({ title: TC('packagingCostTitle'), content: TC('packagingCostBody') });
      }
    }, 50);
  }, [state, toggleAcc, getGlobalMachineUnits, showAutoAddModal]);

  // Apply oil choice from modal
  const applyOilChoice = () => {
    if (!oilChoice) { setOilError(true); return; }
    // Add parent
    toggleAcc(ACC_ID_OIL_1000_PARENT);
    // Add chosen oil
    setTimeout(() => {
      toggleAcc(oilChoice === 'normal' ? ACC_ID_OIL_NORMAL : ACC_ID_OIL_BIO);
    }, 30);
    setOilModalOpen(false);
  };

  const showMachineDetails = (key: string) => {
    const p = PRODUCTS[key];
    if (!p?.machineDetails) return;
    const md = p.machineDetails;
    const mainText = typeof md.main === 'string' ? md.main : (md.main[lang] || md.main.da);
    const bullets = md.bullets[lang] || md.bullets.da || [];
    const dims = md.dimensions || [];
    let html = `<div class="p-3 bg-gray-50 rounded-lg"><h4 class="font-bold text-gray-800 mb-2">${TC('mainInfo')}</h4><p class="text-sm text-gray-700 whitespace-pre-line">${mainText}</p></div>`;
    if (bullets.length > 0) {
      html += `<div class="mt-4 pt-4 border-t border-gray-200"><h4 class="font-bold text-gray-800 mb-2">${TC('keyFeatures')}</h4><ul class="list-disc list-inside space-y-1 text-sm text-gray-700">`;
      bullets.forEach(b => { html += `<li>${b}</li>`; });
      html += '</ul></div>';
    }
    if (dims.length > 0) {
      html += `<div class="mt-4 pt-4 border-t border-gray-200"><h4 class="font-bold text-gray-800 mb-2">${TC('dimSpecs')}</h4>`;
      dims.forEach(d => {
        if (d.isHeader) {
          html += `<h5 class="font-extrabold text-sm text-gray-900 mt-4 mb-1">${translateSpecLabel(d.label, contentUiLang)}</h5>`;
        } else {
          const val = typeof d.value === 'string' ? d.value : ((d.value as any)?.[lang] || (d.value as any)?.da || '');
          if (val) html += `<div class="flex justify-between py-0.5 text-xs"><span class="font-medium text-gray-700">${translateSpecLabel(d.label, contentUiLang)}:</span><span class="font-semibold text-gray-900 text-right">${val}</span></div>`;
        }
      });
      html += '</div>';
    }
    setInfoModal({ title: `${TC('machineInfo')}: ${getLocalizedName(p.name, lang)}`, content: html });
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
        html += `<div class="font-medium text-gray-700">${translateSpecLabel(s.label, contentUiLang)}:</div><div class="font-semibold text-gray-900">${val}</div>`;
      });
      html += '</div>';
    }
    if (descEntry) {
      const val = typeof descEntry.value === 'string' ? descEntry.value : ((descEntry.value as any)?.[lang] || (descEntry.value as any)?.da || '');
      html += `<div class="mt-4 pt-4 border-t border-gray-200"><h4 class="font-bold text-gray-800 mb-2">${TC('specsDetails')}</h4><p class="text-sm text-gray-700 whitespace-pre-line">${val}</p></div>`;
    }
    setInfoModal({ title: getLocalizedName(acc.name, lang), content: html });
  };

  const setReqNumber = (unitNumber: number, value: string) => {
    setState(s => ({ ...s, reqNumbers: { ...s.reqNumbers, [`machine_${unitNumber}`]: value.slice(0, 20) } }));
  };

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
        ? `Du har afkrydset <strong>Demo maskine</strong> for <strong>${machineLabel}</strong>.<br><br>Der er tilføjet en ekstra omkostning på <strong>${feeText}</strong>.<br><br><strong>Vilkår:</strong><br>- Forhandleren kan erhverve 1 stk. af hver maskine pr. år til demonstrations-brug.<br>- Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.<br>- Overholdes dette ikke vil Timan opkræve differencen til den almindelige maskinrabat.`
        : `You have checked <strong>Demo machine</strong> for <strong>${machineLabel}</strong>.<br><br>An extra cost of <strong>${feeText}</strong> has been added.`;
      setInfoModal({ title, content: msg });
    }
  };

  const renderActionLinks = (item: { videoUrl?: string; imageUrl?: string; images?: { url: string | null }[]; videos?: { url: string | null }[]; specs?: any[]; id?: string }, machineType: string) => {
    const videoUrl = getVideoUrl(item);
    const imageUrl = getImageUrlForItem(item);
    const hasSpecs = !!(item.specs && item.specs.length > 0);
    const showVideoIcon = !!(item.videoUrl || (item.videos && item.videos.length > 0));
    const showImageIcon = !!(item.imageUrl || (item.images && item.images.length > 0) || item.videoUrl || (item.videos && item.videos.length > 0));
    if (!showVideoIcon && !showImageIcon && !hasSpecs) return null;
    return (
      <div className="mt-1 flex gap-2 whitespace-nowrap">
        {showVideoIcon && (videoUrl ? (
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>🎥 {T('videoLink')}</a>
        ) : (
          <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">🎥 {T('videoLink')}</span>
        ))}
        {showImageIcon && (imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-xs flex items-center gap-0.5 hover:text-emerald-800 transition" onClick={e => e.stopPropagation()}>📸 {T('imageLink')}</a>
        ) : (
          <span className="text-gray-400 text-xs flex items-center gap-0.5 cursor-not-allowed">📸 {T('imageLink')}</span>
        ))}
        {hasSpecs && (
          <button onClick={e => { e.stopPropagation(); showSpecs(item.id!, machineType); }} className="text-blue-600 text-xs font-medium p-0 bg-transparent flex items-center gap-0.5 hover:text-blue-800 transition">📄 {T('specsLink')}</button>
        )}
      </div>
    );
  };

  const renderSubItem = (sub: SubItem, selectedIds: string[], machineType: string, level: number = 1) => {
    const isSelected = selectedIds.includes(sub.id);
    const hasNestedSubs = sub.subItems && sub.subItems.length > 0;
    return (
      <div key={sub.id}>
        <div onClick={e => { e.stopPropagation(); handleToggleAcc(sub.id); }}
          className={`p-2 border rounded-lg cursor-pointer transition flex items-start gap-3 ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
          <div className="selection-indicator relative flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 rounded border-2"
            style={{ backgroundColor: isSelected ? '#059669' : 'white', borderColor: isSelected ? '#059669' : '#9ca3af' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-transparent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {hasNestedSubs && <span className="absolute left-1/2 -translate-x-1/2 top-[20px] text-[10px] text-gray-400 leading-none">↳</span>}
          </div>
          <div className="flex justify-between items-start gap-3 w-full min-w-0">
            <div className="min-w-0">
              <div className="text-sm text-gray-800">{getLocalizedName(sub.name, lang)}</div>
              <div className="text-xs text-gray-500">{itemNoLabel(uiLanguage)}: {sub.varenr}</div>
              {renderActionLinks(sub as any, machineType)}
            </div>
            <div className="font-bold text-emerald-700 whitespace-nowrap">{permissions.canSeePrices ? formatMoney(getPrice(sub, lang), lang) : ''}</div>
          </div>
        </div>
        {isSelected && hasNestedSubs && (
          <div className="ml-8 mt-2 space-y-2">
            {sub.subItems!.map(sub2 => renderSubItem(sub2 as SubItem, selectedIds, machineType, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // ======== Confirmation modal builder ========
  const buildConfirmationHtml = (overrides?: { quoteNumber?: string | null; orderNumber?: string | null; sourceQuoteNumber?: string | null; flowType?: ConfiguratorSubmitFlowType }) => {
    if (!calcResult) return '';
    const dateLocale: Record<string, string> = { da: 'da-DK', en: 'en-US', de: 'de-DE', it: 'it-IT', hu: 'hu-HU' };
    const delDate = state.date ? new Date(state.date + 'T12:00:00').toLocaleDateString(dateLocale[lang] || 'da-DK') : 'N/A';
    const today = new Date().toLocaleDateString(dateLocale[lang] || 'da-DK');
    const deliveryMethodText = state.deliveryMethod ? TC(state.deliveryMethod) : 'N/A';
    const renderFlowType = overrides?.flowType ?? state.flowType;
    const pdfTitle = renderFlowType === 'quote' ? TC('quoteRequestTitle') : TC('orderRequestTitle');

    const effQuoteNumber = overrides?.quoteNumber ?? savedQuoteNumber;
    const effOrderNumber = overrides?.orderNumber ?? savedOrderNumber;
    const effSourceQuoteNumber = overrides?.sourceQuoteNumber ?? savedSourceQuoteNumber;

    // Reference numbers section
    const refNumbersHtml = (() => {
      const lines: string[] = [];
      if (effQuoteNumber) {
        const label = { da: 'Tilbudsnr.', en: 'Quote no.', de: 'Angebotsnr.', it: 'N. preventivo', hu: 'Ajánlatszám' }[lang] || 'Quote no.';
        lines.push(`<span class="font-medium">${label}</span><span>${effQuoteNumber}</span>`);
      }
      if (effOrderNumber) {
        const label = { da: 'Ordrenr.', en: 'Order no.', de: 'Bestellnr.', it: 'N. ordine', hu: 'Rendelésszám' }[lang] || 'Order no.';
        lines.push(`<span class="font-medium">${label}</span><span>${effOrderNumber}</span>`);
      }
      if (effSourceQuoteNumber) {
        const label = { da: 'Oprettet fra tilbud', en: 'Created from quote', de: 'Erstellt aus Angebot', it: 'Creato dal preventivo', hu: 'Ajánlatból létrehozva' }[lang] || 'Created from quote';
        lines.push(`<span class="font-medium">${label}</span><span>${effSourceQuoteNumber}</span>`);
      }
      if (lines.length === 0) return '';
      return `<div class="mt-3 mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">${lines.join('')}</div>
      </div>`;
    })();

    let html = `<div class="max-w-4xl mx-auto text-[15px] leading-relaxed">
      <div class="text-center pb-6 border-b border-emerald-600">
        <h1 class="text-3xl font-bold text-gray-900">${pdfTitle}</h1>
        ${refNumbersHtml}
        <p class="mt-3 text-xl">
          <span class="block text-lg">${TC('confirmDate')} ${today}</span>
          <span class="block text-base">${TC('confirmDelivery')} ${delDate}</span>
          <span class="block text-base">${TC('deliveryMethod')}: ${deliveryMethodText}</span>
        </p>
      </div>
      <div class="mt-6 text-sm text-gray-700">
        <h2 class="font-bold text-base mb-2">${TC('confirmCustInfo')}</h2>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <span class="font-medium">${TC('confirmFirm')}</span><span>${state.firmanavn || '-'}</span>
          <span class="font-medium">${TC('confirmContact')}</span><span>${state.kontaktperson || '-'}</span>
          <span class="font-medium">${TC('confirmPhone')}</span><span>${state.telefon || '-'}</span>
          <span class="font-medium">${TC('confirmEmailSender')}</span><span>${state.email || '-'}</span>
          <span class="font-medium">${TC('confirmEmailRecipient')}</span><span>${(state.emailRecipient || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).join(', ') || '-'}</span>

          ${state.comment ? `<span class="font-medium">${TC('confirmComment')}</span><span>${state.comment}</span>` : ''}
        </div>
      </div>
        </div>
      </div>
      <div class="mt-6"><h2 class="font-bold text-base mb-2 border-b border-gray-200 pb-1">${TC('confirmDescription')}</h2>`;

    // Line items
    calcResult.lineItems.forEach(i => {
      if (i.subtotal) {
        html += `<div class="flex justify-between items-end text-sm font-semibold text-gray-800 pt-4 border-t border-dashed border-gray-300 mt-4 mb-6">
          <span>${i.txt}</span><span class="price-col">${formatMoney(i.price, lang)}</span></div>`;
        return;
      }
      if (i.isSectionHeader) {
        html += `<div class="text-sm font-bold text-gray-800 pt-3 pb-1 border-t border-gray-200 mt-2">${i.txt}</div>`;
        return;
      }
      const varenr = i.varenr || '';
      let paddingClass = 'pl-0';
      if (i.isDependentAccessory) paddingClass = 'pl-10';
      else if (i.sub) paddingClass = 'pl-6';

      if (i.bold) {
        html += `<div class="text-sm font-bold text-gray-800 pt-3 pb-1 border-t border-gray-200 mt-2">${i.txt}</div>`;
        if (i.isMachine && i.index) {
          // Always render the base machine line (varenr + name + price) so visible
          // line items match the subtotal. Display-only; totals are unchanged.
          const machName = i.txt.replace(/^.*\(([^)]+)\)\s*$/, '$1') || i.txt;
          const priceCol = permissions.canSeePrices
            ? `<div class="w-28 shrink-0 text-right price-col">${formatMoney(i.price, lang)}</div>`
            : '';
          html += `<div class="flex items-start text-sm py-1 text-gray-800 font-semibold">
            <div class="w-16 shrink-0 opacity-80">${varenr}</div>
            <div class="flex-grow px-2 leading-snug break-words">${machName}</div>
            ${priceCol}
          </div>`;
          const reqVal = state.reqNumbers[`machine_${i.index}`];
          if (reqVal) {
            html += `<div class="text-xs text-gray-500 pl-0 pb-1">${TC('reqNrLabel')}: ${reqVal}</div>`;
          }
        }
      } else {
        const autoTag = i.isAutoAdded ? ` <span style="font-size:9px;color:#b45309;background:#fef3c7;padding:1px 4px;border-radius:3px;margin-left:4px;">${TC('autoAdded')}</span>` : '';
        html += `<div class="flex items-start text-sm py-1 text-gray-600">
          <div class="w-16 shrink-0 opacity-80">${varenr}</div>
          <div class="flex-grow px-2 ${paddingClass} leading-snug break-words">${i.txt}${autoTag}</div>
          <div class="w-28 shrink-0 text-right price-col">${formatMoney(i.price, lang)}</div>
        </div>`;
      }
    });

    // Totals
    html += `<div data-pdf-keep="1" class="mt-8 border-t-2 pt-4 flex flex-col items-end">
      <div class="flex justify-between w-full text-xs">
        <span>${TC('confirmSubtotal')}</span>
        <span class="price-col">${formatMoney(displayCalc!.subtotal, lang)}</span>
      </div>`;
    displayCalc!.discountDetails.filter(d => d.amount > 0).forEach(d => {
      const discLabel = (state.flowType === 'order' && d.varenr) ? `${d.txt} (${d.varenr})` : d.txt;
      html += `<div class="flex justify-between w-full text-xs text-red-600">
        <span>${discLabel}</span><span class="price-col">-${formatMoney(d.amount, lang)}</span></div>`;
    });
    if (displayCalc!.totalDiscount > 0) {
      html += `<div class="flex justify-between w-full text-sm font-bold text-red-600 mt-1">
        <span>${TC('confirmTotalDiscount')} (${displayCalc!.totalPct.toFixed(2).replace('.', ',')}%)</span>
        <span class="price-col">-${formatMoney(displayCalc!.totalDiscount, lang)}</span>
      </div>`;
    }
    html += `<div class="flex justify-between w-full text-base font-bold mt-2">
        <span>${TC('confirmTotal')}</span>
        <span class="price-col">${formatMoney(displayCalc!.currentPrice, lang)}</span>
      </div>
      <div class="flex justify-between w-full text-xs text-gray-700 mt-2">
        <span>${getPaymentTermsLabel(lang)}</span>
        <span>${resolvePaymentTerms(state.paymentTerms)}</span>
      </div>
      <p class="text-xs text-gray-500 mt-1">${TC('confirmExVat')}</p>
    </div></div></div>`;

    if (includeSalesArgs && salesArgsData) {
      const selectedBulletsArr = salesArgsData.defaultBullets.concat(salesArgsData.extraBullets).filter(b => selectedSalesBullets.has(b));
      const salesText = `${salesArgsData.heading}\n\n${salesArgsData.paragraph}\n\n${selectedBulletsArr.map(b => `• ${b}`).join('\n')}`;
      html += `<div style="margin-top:24px;padding:16px;border:1px solid #a7f3d0;border-radius:8px;background:#ecfdf5;">
        <h2 style="font-weight:700;font-size:14px;margin-bottom:8px;color:#065f46;">${{ da: 'Fordele ved den valgte løsning', en: 'Benefits of the chosen solution', de: 'Vorteile der gewählten Lösung', it: 'Vantaggi della soluzione scelta', hu: 'A választott megoldás előnyei' }[lang]}</h2>
        <div style="white-space:pre-line;font-size:13px;color:#374151;line-height:1.6;">${salesText}</div>
      </div>`;
    }

    if (includeRecommendation && recommendationData) {
      const selectedRecArr = recommendationData.defaultBullets.concat(recommendationData.extraBullets).filter(b => selectedRecBullets.has(b));
      const recText = `${recommendationData.heading}\n\n${recommendationData.paragraph}\n\n${selectedRecArr.map(b => `• ${b}`).join('\n')}`;
      html += `<div style="margin-top:16px;padding:16px;border:1px solid #fbbf24;border-radius:8px;background:#fefce8;">
        <h2 style="font-weight:700;font-size:14px;margin-bottom:8px;color:#92400e;">${{ da: 'Timans anbefaling', en: 'Timan Recommends', de: 'Timan empfiehlt', it: 'Timan raccomanda', hu: 'Timan ajánlása' }[lang]}</h2>
        <div style="white-space:pre-line;font-size:13px;color:#374151;line-height:1.6;">${recText}</div>
      </div>`;
    }

    return html;
  };

  // Open confirmation — but first ask about sales arguments
  const openConfirmation = async () => {

    // Hard guard: a submitted order can never reopen the send confirmation.
    if (orderLocked) {
      toast.error(T('orderCannotResendTitle'));
      return;
    }
    if (!state.firmanavn || !state.kontaktperson || !state.email) {
      setInfoModal({ title: T('missingFieldsTitle'), content: T('missingFieldsMsg') });
      return;
    }


    // NOTE: No auto-save here. Saving only happens on:
    // 1) Download PDF (quote), 2) Afsend ordre til Timan (order), 3) "+ Gem nuværende" in My account.
    // If the case is already saved, ensure reference numbers exist for display in the preview.
    if (savedConfigurationId) {
      try {
        const isOrder = state.flowType === 'order';
        const refs = await ensureReferenceNumbers(savedConfigurationId, isOrder);
        if (refs.quote_number) setSavedQuoteNumber(refs.quote_number);
        if (refs.order_number) setSavedOrderNumber(refs.order_number);
      } catch (err) {
        console.error('Failed to ensure reference numbers:', err);
      }
    }

    // Show sales args prompt for quotes
    if (state.flowType === 'quote') {
      const data = generateSalesArguments(state, lang);
      setSalesArgsData(data);
      // Pre-select default bullets
      setSelectedSalesBullets(new Set(data.defaultBullets));
      const recData = generateRecommendations(state, lang);
      setRecommendationData(recData);
      if (recData) {
        setSelectedRecBullets(new Set(recData.defaultBullets));
      } else {
        setSelectedRecBullets(new Set());
      }
      setWantRecommendation(false);
      setIncludeRecommendation(false);
      setSalesArgsModalOpen(true);
    } else {
      setConfirmModalOpen(true);
    }
  };

  // PDF download + submit (single async flow). Guarded by `submitting` so the
  // button cannot trigger a second PDF/save/webhook.
  const downloadPdf = async (flowOverride?: ConfiguratorSubmitFlowType): Promise<boolean> => {
    if (submitting) return false;
    setSubmitting(true);
    try {
      return await downloadPdfInner(flowOverride);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdfInner = async (flowOverride?: ConfiguratorSubmitFlowType): Promise<boolean> => {
    const effectiveFlowType = flowOverride ?? state.flowType;
    let el = confirmContentRef.current;
    if (!el) {
      el = document.createElement('div');
      el.innerHTML = buildConfirmationHtml({ flowType: effectiveFlowType });
    }

    // Persist case before generating PDF so reference numbers exist for filename/preview.
    // This is one of the 3 allowed save triggers (Download PDF / Afsend ordre / + Gem nuværende).
    // IMPORTANT: ensure idempotency — never create a second row if this case is already saved.
    let activeCaseId: string | null = savedConfigurationId || savedConfigurationIdRef.current;
    let activeQuoteNumber: string | null = savedQuoteNumber;
    let activeOrderNumber: string | null = savedOrderNumber;
    const ownershipPayload = await getRequiredOwnershipPayload();
    if (!ownershipPayload) return false;
    // Resolve "Opret nyt lead" picker selection into a real lead now so
    // the save/send flow links the configuration to the new lead.
    const effectiveLeadId = await ensurePendingLeadCreated() ?? linkedLeadId;

    if (!activeCaseId && appUser) {
      try {
        const label = state.firmanavn
          ? `${state.firmanavn} — ${state.machineConfigs.map(m => m.type).join(', ')}`
          : state.machineConfigs.map(m => m.type).join(', ') || 'Konfiguration';
        const result = await saveConfiguration(state, label, appUser.email.toLowerCase(), { ownership: ownershipPayload, leadId: effectiveLeadId, pricingMode: isExhibition ? 'messe' : undefined });
        if (result.error) throw new Error(result.error);
        if (result.id) {
          activeCaseId = result.id;
          activeQuoteNumber = result.quote_number;
          activeOrderNumber = result.order_number;
          savedConfigurationIdRef.current = result.id;
          setSavedConfigurationId(result.id);
          setSavedQuoteNumber(result.quote_number);
          setSavedOrderNumber(result.order_number);
          setSavedSourceQuoteNumber(result.source_quote_number);
          setIsSavedCurrent(true);
        }
      } catch (saveErr) {
        console.error('Failed to save before PDF download:', saveErr);
        toast.error(T('saveFailed'), { description: saveErr instanceof Error ? saveErr.message : String(saveErr) });
        return false;
      }
    } else if (activeCaseId) {
      try {
        const refs = await ensureReferenceNumbers(activeCaseId, effectiveFlowType === 'order');
        if (refs.quote_number) { activeQuoteNumber = refs.quote_number; setSavedQuoteNumber(refs.quote_number); }
        if (refs.order_number) { activeOrderNumber = refs.order_number; setSavedOrderNumber(refs.order_number); }
      } catch (err) {
        console.error('Failed to ensure reference numbers before PDF:', err);
      }
    }

    if (activeCaseId && effectiveFlowType === 'order') {
      try {
        const flowRes = await updateConfigurationFlowType(activeCaseId, 'order', ownershipPayload, { pricingMode: isExhibition ? 'messe' : undefined });
        if (flowRes.error) throw new Error(flowRes.error);
        if (flowRes.quote_number) { activeQuoteNumber = flowRes.quote_number; setSavedQuoteNumber(flowRes.quote_number); }
        if (flowRes.order_number) { activeOrderNumber = flowRes.order_number; setSavedOrderNumber(flowRes.order_number); }
      } catch (flowErr) {
        console.error('Failed to switch configuration to order before sending:', flowErr);
        toast.error(T('saveFailed'), { description: flowErr instanceof Error ? flowErr.message : String(flowErr) });
        return false;
      }
    }

    try {
      const html2canvasModule = await import('html2canvas');
      const html2canvas = html2canvasModule.default;
      const jsPDFModule = await import('jspdf');
      const { jsPDF } = jsPDFModule;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginTop = 10;
      const marginBottom = 18; // generous bottom margin so footer text never clips
      const marginX = 10;
      const contentW = pageW - marginX * 2;
      const contentH = pageH - marginTop - marginBottom;
      const pxPerMm = 96 / 25.4;
      const renderW = Math.round(contentW * pxPerMm);

      // Clone into offscreen container — no max-height / overflow:hidden so the
      // full content height is measurable and rasterisable.
      const renderRoot = document.createElement('div');
      renderRoot.style.cssText = `position:fixed;left:-99999px;top:0;width:${renderW}px;background:#fff;overflow:visible;max-height:none;height:auto;`;
      document.body.appendChild(renderRoot);

      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.cssText = 'width:100%;max-width:none;max-height:none;height:auto;margin:0;padding:0 0 24px 0;background:#fff;overflow:visible;';
      try {
        clone.innerHTML = buildConfirmationHtml({
          quoteNumber: activeQuoteNumber,
          orderNumber: activeOrderNumber,
          sourceQuoteNumber: savedSourceQuoteNumber,
          flowType: effectiveFlowType,
        });
      } catch { /* fallback to original cloned DOM */ }
      renderRoot.appendChild(clone);

      // Inject page-break CSS for keep-together blocks (totals + machine blocks).
      // Marks: data-pdf-keep="1" (totals), data-pdf-block (machine groups).
      const pdfStyle = document.createElement('style');
      pdfStyle.textContent = `
        [data-pdf-keep], [data-pdf-block] {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        * { overflow: visible !important; max-height: none !important; }
      `;
      renderRoot.appendChild(pdfStyle);

      await new Promise(r => requestAnimationFrame(r));

      // Capture geometry BEFORE rasterising so we can choose safe slice
      // boundaries that don't clip text or split the price summary.
      const rootRect = renderRoot.getBoundingClientRect();
      const cssH = Math.max(renderRoot.scrollHeight, clone.scrollHeight);

      const breakPointsCss = new Set<number>([0, cssH]);
      const keepRanges: Array<{ top: number; bottom: number }> = [];
      const allEls = clone.querySelectorAll<HTMLElement>('*');
      allEls.forEach(node => {
        const r = node.getBoundingClientRect();
        const top = r.top - rootRect.top;
        const bottom = r.bottom - rootRect.top;
        if (node.hasAttribute('data-pdf-keep')) {
          keepRanges.push({ top, bottom });
          breakPointsCss.add(top);
        }
        if (r.height > 0 && r.height < 200 && node.children.length === 0) {
          breakPointsCss.add(bottom);
        }
      });

      const canvas = await html2canvas(renderRoot, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: renderW,
        windowHeight: cssH,
        height: cssH,
      });
      document.body.removeChild(renderRoot);

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const cssToCanvas = canvasH / cssH;
      const canvasPxPerMm = canvasW / contentW;
      const maxSliceH = Math.floor(contentH * canvasPxPerMm);

      const breaks = Array.from(breakPointsCss)
        .map(v => Math.round(v * cssToCanvas))
        .filter(v => v >= 0 && v <= canvasH)
        .sort((a, b) => a - b);
      const keepRangesCanvas = keepRanges.map(k => ({
        top: Math.round(k.top * cssToCanvas),
        bottom: Math.round(k.bottom * cssToCanvas),
      }));

      let yOffset = 0;
      let pageNum = 0;
      while (yOffset < canvasH - 1) {
        if (pageNum > 0) pdf.addPage();
        const remaining = canvasH - yOffset;

        // If everything that's left fits on this page, take it all.
        let cut: number;
        if (remaining <= maxSliceH) {
          cut = canvasH;
        } else {
          const hardLimit = yOffset + maxSliceH;
          cut = hardLimit;
          for (let i = breaks.length - 1; i >= 0; i--) {
            if (breaks[i] > yOffset && breaks[i] <= hardLimit) { cut = breaks[i]; break; }
          }
          // Don't split a keep-together block: move cut to its top if possible.
          for (const k of keepRangesCanvas) {
            if (k.top > yOffset && k.top < cut && k.bottom > cut) {
              if (k.bottom - k.top <= maxSliceH) cut = k.top;
            }
          }
          if (cut <= yOffset) cut = hardLimit;
        }

        const sliceH = cut - yOffset;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvasW;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, yOffset, canvasW, sliceH, 0, 0, canvasW, sliceH);

        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
        const imgH = (sliceH / canvasPxPerMm);
        pdf.addImage(imgData, 'JPEG', marginX, marginTop, contentW, imgH);

        yOffset = cut;
        pageNum++;
      }



      const pdfTitle = effectiveFlowType === 'quote' ? T('quote') : T('order');
      const refNum = activeOrderNumber || activeQuoteNumber || savedOrderNumber || savedQuoteNumber || '';
      const refSuffix = refNum ? `_${refNum}` : '';
      const pdfFilename = `Timan_${pdfTitle}${refSuffix}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(pdfFilename);

      // Capture PDF as base64 for webhook payload (strip data URI prefix)
      let pdfBase64 = '';
      let pdfBlob: Blob | null = null;
      try {
        const dataUri = pdf.output('datauristring');
        pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : '';
        pdfBlob = pdf.output('blob');
      } catch (b64Err) {
        console.error('Failed to encode PDF as base64:', b64Err);
      }

      // Track PDF generation in Supabase (silent — this is part of the SEND flow,
      // not a standalone PDF download action, so we don't surface a "PDF tracked" toast.
      // The user only cares about the send result, shown by the order/quote toasts below.
      // For the order flow we let markAsOrderSubmitted handle stamping; for the quote flow
      // we stamp quote_sent_at only on successful webhook (see below). So nothing to do here.

      // Send webhook for Ordre flow
      if (effectiveFlowType === 'order') {
        // ── Duplicate-send protection (server-side) ──
        // Re-read the current row from Supabase by id. If the order is
        // already submitted, abort BEFORE generating PDF / sending email /
        // calling n8n / updating order_sent_at. Do not trust local state.
        if (activeCaseId) {
          const lockCheck = await fetchIsOrderSubmitted(activeCaseId);
          if (lockCheck.locked) {
            setOrderLocked(true);
            toast.error(T('orderCannotResendTitle'));
            setConfirmModalOpen(false);
            return false;
          }
        }
        // Idempotent save: only create a new row if no case exists yet.
        // Reuse activeCaseId from the save block above to avoid duplicates.
        if (!activeCaseId && appUser) {
          try {
            const label = state.firmanavn
              ? `${state.firmanavn} — ${state.machineConfigs.map(m => m.type).join(', ')}`
              : state.machineConfigs.map(m => m.type).join(', ') || 'Ordre';
            const result = await saveConfiguration(state, label, appUser.email.toLowerCase(), { ownership: ownershipPayload, leadId: effectiveLeadId, pricingMode: isExhibition ? 'messe' : undefined });
            if (result.error) throw new Error(result.error);
            if (result.id) {
              activeCaseId = result.id;
              activeQuoteNumber = result.quote_number;
              activeOrderNumber = result.order_number;
              setSavedConfigurationId(result.id);
              setSavedQuoteNumber(result.quote_number);
              setSavedOrderNumber(result.order_number);
              setSavedSourceQuoteNumber(result.source_quote_number);
              setIsSavedCurrent(true);
            }
          } catch (saveErr) {
            console.error('Failed to save before webhook:', saveErr);
            toast.error(T('saveFailed'), { description: saveErr instanceof Error ? saveErr.message : String(saveErr) });
            return false;
          }
        } else if (activeCaseId && !activeOrderNumber) {
          // Existing case but no order number yet — ensure one exists
          try {
            const refs = await ensureReferenceNumbers(activeCaseId, true);
            if (refs.quote_number) { activeQuoteNumber = refs.quote_number; setSavedQuoteNumber(refs.quote_number); }
            if (refs.order_number) { activeOrderNumber = refs.order_number; setSavedOrderNumber(refs.order_number); }
          } catch (err) {
            console.error('Failed to ensure order number before webhook:', err);
          }
        }

        // Upload sent PDF to storage BEFORE webhook so we can include the
        // stored path/filename in the email payload (single source of truth).
        let orderSentPdfPath: string | null = null;
        if (activeCaseId && pdfBlob) {
          try {
            const up = await uploadSentPdf(activeCaseId, pdfBlob, pdfFilename);
            if (up.error) console.error('[Order] sent PDF upload error:', up.error);
            orderSentPdfPath = up.path;
          } catch (uploadErr) {
            console.error('[Order] sent PDF upload failed:', uploadErr);
          }
        }

        try {
          // Build structured content summary so the email template can render
          // machine + accessory specifications even without parsing the PDF.
          const contentSummary = buildQuoteContentSummary(state);

          // Order recipients:
          //  - Always include nb@timan.dk (orders go TO Timan).
          //  - Always include "E-mail på udfylder".
          //  - Also include "E-mail modtager" if filled (may contain multiple
          //    addresses separated by , or ;).
          //  - Deduplicate if both fields contain the same address.
          const emailUdfylder = (state.email || '').trim().toLowerCase();
          const emailModtagerRaw = (state.emailRecipient || '').trim().toLowerCase();
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const splitAddrs = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
          const modtagerList = splitAddrs(emailModtagerRaw);
          const allEmails = [emailUdfylder, ...modtagerList].filter(Boolean);
          const invalid = allEmails.filter(e => !emailRe.test(e));
          if (invalid.length > 0) {
            toast.error(lang === 'da' ? 'Ugyldig e-mail modtager.' : 'Invalid email recipient.', {
              description: invalid.join(', '),
            });
            return false;
          }
          const recipients = Array.from(new Set([
            'nb@timan.dk',
            ...allEmails,
          ]));
          const emailModtager = modtagerList.join(', ');

          // KRAV 2: visible recipient verification (no PDF/base64, no large payloads).
          console.info('[Configurator send recipients]', {
            flowType: 'order',
            enteredRecipient: state.emailRecipient || null,
            resolvedRecipients: recipients,
            fillerEmail: emailUdfylder || null,
            orderDefaultRecipients: ['nb@timan.dk'],
            quoteDefaultRecipients: [],
          });


          const webhookPayload = {
            case_id: activeCaseId || '',
            document_type: 'Ordre',
            order_number: activeOrderNumber || '',
            quote_number: activeQuoteNumber || '',
            source_quote_number: savedSourceQuoteNumber || '',
            firma: state.firmanavn,
            kontaktperson: state.kontaktperson,
            telefon: state.telefon,
            email_udfylder: emailUdfylder,
            email_modtager: emailModtager,
            recipients,
            kommentar: state.comment,
            pdf_url: '',
            pdf_storage_path: orderSentPdfPath || '',
            pdf_filename: pdfFilename,
            pdf_mime_type: 'application/pdf',
            pdf_base64: pdfBase64,
            // Structured product/specification data — source of truth is the
            // saved configurator state. Used by n8n to render quote/order
            // emails with full machine + accessory details.
            language: state.language,
            currency: contentSummary.currency,
            delivery: contentSummary.delivery,
            machines: contentSummary.machines,
            totals: contentSummary.totals,
            state_summary: contentSummary,
            main_categories: buildMainCategories(state),
          };

          const orderWebhookUrl = getOrderWebhookUrl();
          console.log('[Order webhook] POST', orderWebhookUrl, {
            env: getWebhookEnv(),
            case_id: webhookPayload.case_id,
            order_number: webhookPayload.order_number,
            machine_count: contentSummary.machines.length,
            pdf_size: pdfBase64.length,
            pdf_storage_path: orderSentPdfPath,
          });

          // STRICT success: only treat as delivered if we get a real, readable
          // 2xx response from n8n. No no-cors fallback — opaque responses are
          // unverifiable and were causing false "sent" states.
          let delivered = false;
          let failureReason = '';
          let webhookHttpStatus: number | null = null;
          let webhookRespText = '';
          try {
            const webhookRes = await fetch(orderWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
            });
            webhookHttpStatus = webhookRes.status;
            webhookRespText = await webhookRes.text().catch(() => '');
            console.log('[Order webhook] response', webhookRes.status, webhookRes.type, webhookRespText);
            if (webhookRes.type === 'opaque' || webhookRes.type === 'opaqueredirect') {
              failureReason = 'Opaque response (CORS) — cannot verify delivery';
            } else if (webhookRes.ok) {
              delivered = true;
            } else {
              failureReason = `HTTP ${webhookRes.status}`;
            }
          } catch (fetchErr) {
            failureReason = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            console.error('[Order webhook] fetch failed:', fetchErr);
          }

          // Audit log (success or failed). Never blocks send flow.
          if (activeCaseId) {
            await logConfigurationEmailSend({
              configurationId: activeCaseId,
              documentType: 'order',
              quoteNumber: activeQuoteNumber || null,
              orderNumber: activeOrderNumber || null,
              toRecipients: recipients,
              ccRecipients: [],
              bccRecipients: [],
              sendStatus: delivered ? 'success' : 'failed',
              httpStatus: webhookHttpStatus,
              errorMessage: delivered ? null : failureReason || null,
              webhookResponse: webhookRespText || null,
              webhookUrl: orderWebhookUrl,
              pdfFilename,
              pdfStoragePath: orderSentPdfPath || null,
              createdByEmail: appUser?.email || null,
              sellerEmail: ownership.sellerEmail || null,
              sellerInitials: ownership.sellerInitials || null,
            });
          }

          if (delivered) {
            // Persist sent date on the case so it shows in My account.
            // markAsOrderSubmitted preserves any existing quote_sent_at —
            // sending an order from a case that previously sent a quote
            // must NOT clear the quote sent date.
            if (activeCaseId) {
              try {
                await markAsOrderSubmitted(activeCaseId, { pricingMode: isExhibition ? 'messe' : undefined });
              } catch (markErr) {
                console.error('Failed to mark order as submitted:', markErr);
              }
            }
            toast.success(T('orderSentToTiman'));
            setConfirmModalOpen(false);
            setSuccessModal({
              flowType: 'order',
              orderNumber: activeOrderNumber || '',
              quoteNumber: activeQuoteNumber || '',
              recipients,
            });
            return true;
          } else {
            toast.error(T('orderSendFailed'), {
              description: failureReason || undefined,
            });
            return false;
          }
        } catch (webhookErr) {
          console.error('[Order webhook] call failed:', webhookErr);
          toast.error(T('orderSendError'), {
            description: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
          });
          return false;
        }
      }


      // Send webhook for Tilbud (Quote) flow — mirrors the order pattern
      if (effectiveFlowType === 'quote') {
        // Idempotent save: only create a new row if no case exists yet
        if (!activeCaseId && appUser) {
          try {
            const label = state.firmanavn
              ? `${state.firmanavn} — ${state.machineConfigs.map(m => m.type).join(', ')}`
              : state.machineConfigs.map(m => m.type).join(', ') || 'Tilbud';
            const result = await saveConfiguration(state, label, appUser.email.toLowerCase(), { ownership: ownershipPayload, leadId: effectiveLeadId, pricingMode: isExhibition ? 'messe' : undefined });
            if (result.error) throw new Error(result.error);
            if (result.id) {
              activeCaseId = result.id;
              activeQuoteNumber = result.quote_number;
              activeOrderNumber = result.order_number;
              setSavedConfigurationId(result.id);
              setSavedQuoteNumber(result.quote_number);
              setSavedOrderNumber(result.order_number);
              setSavedSourceQuoteNumber(result.source_quote_number);
              setIsSavedCurrent(true);
            }
          } catch (saveErr) {
            console.error('Failed to save before quote webhook:', saveErr);
            toast.error(T('saveFailed'), { description: saveErr instanceof Error ? saveErr.message : String(saveErr) });
            return false;
          }
        } else if (activeCaseId && !activeQuoteNumber) {
          try {
            const refs = await ensureReferenceNumbers(activeCaseId, false);
            if (refs.quote_number) { activeQuoteNumber = refs.quote_number; setSavedQuoteNumber(refs.quote_number); }
          } catch (err) {
            console.error('Failed to ensure quote number before webhook:', err);
          }
        }

        // Quote recipients:
        //  - Always include "E-mail på udfylder".
        //  - Also include "E-mail modtager" if filled (may contain multiple
        //    addresses separated by , or ;).
        //  - Deduplicate if both fields contain the same address.
        const emailUdfylder = (state.email || '').trim().toLowerCase();
        const emailModtagerRaw = (state.emailRecipient || '').trim().toLowerCase();
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const splitAddrs = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
        const modtagerList = splitAddrs(emailModtagerRaw);
        const allEmails = [emailUdfylder, ...modtagerList].filter(Boolean);
        const invalid = allEmails.filter(e => !emailRe.test(e));
        if (invalid.length > 0) {
          toast.error(lang === 'da' ? 'Ugyldig e-mail modtager.' : 'Invalid email recipient.', {
            description: invalid.join(', '),
          });
          return false;
        }
        if (allEmails.length === 0) {
          toast.error(lang === 'da' ? 'Ugyldig e-mail modtager.' : 'Invalid email recipient.');
          return false;
        }
        const recipients = Array.from(new Set(allEmails));
        const emailModtager = modtagerList.join(', ');

        // KRAV 2: visible recipient verification (no PDF/base64, no large payloads).
        console.info('[Configurator send recipients]', {
          flowType: 'quote',
          enteredRecipient: state.emailRecipient || null,
          resolvedRecipients: recipients,
          fillerEmail: emailUdfylder || null,
          orderDefaultRecipients: ['nb@timan.dk'],
          quoteDefaultRecipients: [],
        });



        // Upload sent PDF to storage BEFORE webhook so we can include the
        // stored path/filename in the email payload (single source of truth).
        let quoteSentPdfPath: string | null = null;
        if (activeCaseId && pdfBlob) {
          try {
            const up = await uploadSentPdf(activeCaseId, pdfBlob, pdfFilename);
            if (up.error) console.error('[Quote] sent PDF upload error:', up.error);
            quoteSentPdfPath = up.path;
          } catch (uploadErr) {
            console.error('[Quote] sent PDF upload failed:', uploadErr);
          }
        }

        try {
          // Build structured content summary so the quote email template can
          // render machine + accessory specifications, even if the PDF
          // attachment is missing or fails to parse downstream.
          const contentSummary = buildQuoteContentSummary(state);

          const webhookPayload = {
            case_id: activeCaseId || '',
            document_type: 'Tilbud',
            quote_number: activeQuoteNumber || '',
            order_number: activeOrderNumber || '',
            source_quote_number: savedSourceQuoteNumber || '',
            firma: state.firmanavn,
            kontaktperson: state.kontaktperson,
            telefon: state.telefon,
            email_udfylder: emailUdfylder,
            email_modtager: emailModtager,
            recipients,
            kommentar: state.comment,
            pdf_url: '',
            pdf_storage_path: quoteSentPdfPath || '',
            pdf_filename: pdfFilename,
            pdf_mime_type: 'application/pdf',
            pdf_base64: pdfBase64,
            // Structured product/specification data — source of truth is the
            // saved configurator state. Used by n8n so the quote email
            // includes the selected machines + accessories instead of
            // empty fields.
            language: state.language,
            currency: contentSummary.currency,
            delivery: contentSummary.delivery,
            machines: contentSummary.machines,
            totals: contentSummary.totals,
            state_summary: contentSummary,
            main_categories: buildMainCategories(state),
          };

          const quoteWebhookUrl = getQuoteWebhookUrl();
          console.log('[Quote webhook] POST', quoteWebhookUrl, {
            env: getWebhookEnv(),
            case_id: webhookPayload.case_id,
            quote_number: webhookPayload.quote_number,
            recipients,
            machine_count: contentSummary.machines.length,
            pdf_size: pdfBase64.length,
            pdf_storage_path: quoteSentPdfPath,
          });

          // STRICT success: only treat as delivered if we get a real, readable
          // 2xx response from n8n. No no-cors fallback — opaque responses are
          // unverifiable and were causing false "Tilbud afsendt" states even
          // when the webhook never actually fired.
          let delivered = false;
          let failureReason = '';
          let webhookHttpStatus: number | null = null;
          let webhookRespText = '';
          try {
            const webhookRes = await fetch(quoteWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
            });
            webhookHttpStatus = webhookRes.status;
            webhookRespText = await webhookRes.text().catch(() => '');
            console.log('[Quote webhook] response', webhookRes.status, webhookRes.type, webhookRespText);
            if (webhookRes.type === 'opaque' || webhookRes.type === 'opaqueredirect') {
              failureReason = 'Opaque response (CORS) — cannot verify delivery';
            } else if (webhookRes.ok) {
              delivered = true;
            } else {
              failureReason = `HTTP ${webhookRes.status}`;
            }
          } catch (fetchErr) {
            failureReason = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            console.error('[Quote webhook] fetch failed:', fetchErr);
          }

          // Audit log (success or failed). Never blocks send flow.
          if (activeCaseId) {
            await logConfigurationEmailSend({
              configurationId: activeCaseId,
              documentType: 'quote',
              quoteNumber: activeQuoteNumber || null,
              orderNumber: activeOrderNumber || null,
              toRecipients: recipients,
              ccRecipients: [],
              bccRecipients: [],
              sendStatus: delivered ? 'success' : 'failed',
              httpStatus: webhookHttpStatus,
              errorMessage: delivered ? null : failureReason || null,
              webhookResponse: webhookRespText || null,
              webhookUrl: quoteWebhookUrl,
              pdfFilename,
              pdfStoragePath: quoteSentPdfPath || null,
              createdByEmail: appUser?.email || null,
              sellerEmail: ownership.sellerEmail || null,
              sellerInitials: ownership.sellerInitials || null,
            });
          }

          if (delivered) {
            // Persist quote_sent_at on the case so it shows in My account.
            // markPdfDownloaded only sets quote_sent_at the first time, so
            // resending a quote does not overwrite the original sent date.
            if (activeCaseId) {
              try {
                await markPdfDownloaded(activeCaseId, 'quote', { pricingMode: isExhibition ? 'messe' : undefined });
              } catch (markErr) {
                console.error('Failed to stamp quote_sent_at:', markErr);
              }
            }
            toast.success(T('quoteSentSuccess'));
            setConfirmModalOpen(false);
            setSuccessModal({
              flowType: 'quote',
              orderNumber: activeOrderNumber || '',
              quoteNumber: activeQuoteNumber || '',
              recipients,
            });
            return true;
          } else {
            toast.error(T('quoteSendFailed'), {
              description: failureReason || undefined,
            });
            return false;
          }
        } catch (webhookErr) {
          console.error('[Quote webhook] call failed:', webhookErr);
          toast.error(T('quoteSendError'), {
            description: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
          });
          return false;
        }
      }

    } catch (e) {
      // Fallback to browser print
      const printWin = window.open('', '_blank');
      if (!printWin) return false;
      printWin.document.write(`<!DOCTYPE html><html><head><title>${TC('confirmTitle')}</title>
        <style>body{font-family:Arial,sans-serif;margin:20mm;font-size:14px;color:#333}
        .price-col{font-variant-numeric:tabular-nums}.text-red-600{color:#dc2626}.font-bold{font-weight:700}
        @media print{body{margin:10mm}}</style></head><body>${el.innerHTML}</body></html>`);
      printWin.document.close();
      setTimeout(() => { printWin.print(); }, 500);
      return false;
    }
    return false;
  };

  const handleSaveLeadAndSendOrder = useCallback(async () => {
    if (savingLeadAndOrder || savingAsLead || submitting) return;
    if (orderLocked) {
      toast.error(T('orderCannotResendTitle'));
      return;
    }
    if (!ownership.sellerEmail || !state.firmanavn.trim() || !state.kontaktperson.trim() || !state.email.trim()) {
      toast.error('Udfyld Timan-sælger, firmanavn, kontaktperson og e-mail.');
      return;
    }

    setSavingLeadAndOrder(true);
    try {
      const leadId = await handleSaveAsLead({ quiet: true });
      if (!leadId) {
        toast.error('Lead/konfiguration blev ikke gemt. Ordre-mail blev ikke sendt.');
        return;
      }

      const orderSent = await downloadPdf('order');
      if (!orderSent) {
        toast.error('Lead blev gemt, men ordre-mail blev ikke sendt.', {
          description: 'Prøv igen. Det eksisterende lead genbruges, så der ikke oprettes dubletter.',
        });
        return;
      }

      toast.success('Lead gemt og ordre sendt');
    } finally {
      setSavingLeadAndOrder(false);
    }
  }, [
    savingLeadAndOrder,
    savingAsLead,
    submitting,
    orderLocked,
    ownership.sellerEmail,
    state.firmanavn,
    state.kontaktperson,
    state.email,
    handleSaveAsLead,
    downloadPdf,
    T,
  ]);

  // ======== Delivery startup required check ========
  const needsStartup = lang === 'da' && state.deliveryMethod === 'deliver';
  const canProceedStep2 = !!state.date && !!state.deliveryMethod && (!needsStartup || !!state.deliveryDeliverStartup);

  // ======== Startup pricing in calc ========
  // (handled in useConfigurator via deliveryDeliverStartup state)

  // Not logged in → send to portal which hosts the unified login screen.
  if (!appUser) {
    if (typeof window !== 'undefined') {
      navigate('/portal', { replace: true });
    }
    return null;
  }


  // Helper: conditionally hide price text
  const showPrice = (price: number) => permissions.canSeePrices ? formatMoney(price, lang) : '—';

  return (
    <div className="p-4 md:p-8" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#f4f7f9' }}>
      {/* Info Modal */}
      {infoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-[620px] w-[95%] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-gray-900">{infoModal.title}</h3>
            <div dangerouslySetInnerHTML={{ __html: infoModal.content }} />
            <div className="mt-6 text-center">
              <button onClick={() => setInfoModal(null)} className="px-6 py-3 bg-gray-200 border border-gray-300 rounded-lg hover:bg-gray-300 font-medium text-gray-700">{TC('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Oil Modal */}
      {oilModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setOilModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-center text-gray-900">{TC('oilTitle')}</h3>
            {oilError && <p className="text-red-600 font-bold text-center mb-3">{TC('oilError')}</p>}
            <div className="space-y-3">
              {/* Normal oil */}
              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${oilChoice === 'normal' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="oil-choice" value="normal" checked={oilChoice === 'normal'} onChange={() => { setOilChoice('normal'); setOilError(false); }} className="accent-emerald-600" />
                <div className="flex-grow">
                  <div className="font-medium text-gray-900">{TC('oilNormal')} - Texaco HDZ46</div>
                  <div className="text-xs text-gray-500">{itemNoLabel(contentUiLang)}: {ACC_ID_OIL_NORMAL}</div>
                </div>
                <div className="font-bold text-emerald-700">
                  {(() => {
                    const flatAccs = getAccessoriesFlat('RC-1000S');
                    const oil = flatAccs.find(a => a.id === ACC_ID_OIL_NORMAL);
                    return oil ? formatMoney(getPrice(oil, lang), lang) : '';
                  })()}
                </div>
              </label>
              {/* Bio oil */}
              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${oilChoice === 'bio' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="oil-choice" value="bio" checked={oilChoice === 'bio'} onChange={() => { setOilChoice('bio'); setOilError(false); }} className="accent-emerald-600" />
                <div className="flex-grow">
                  <div className="font-medium text-gray-900">{TC('oilBio')} - Biohydran TMP 46</div>
                  <div className="text-xs text-gray-500">{itemNoLabel(contentUiLang)}: {ACC_ID_OIL_BIO}</div>
                  <div className="text-xs text-gray-500">{TC('oilTaxNote')}</div>
                </div>
                <div className="font-bold text-emerald-700">
                  {(() => {
                    const flatAccs = getAccessoriesFlat('RC-1000S');
                    const oil = flatAccs.find(a => a.id === ACC_ID_OIL_BIO);
                    return oil ? formatMoney(getPrice(oil, lang), lang) : '';
                  })()}
                </div>
              </label>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setOilModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium text-gray-700">{TC('oilCancel')}</button>
              <button onClick={applyOilChoice} className="px-4 py-2 bg-emerald-600 rounded-lg text-white font-medium hover:bg-emerald-700">{TC('oilChoose')}</button>
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

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { if (!submitting) setConfirmModalOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-[95%] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div ref={confirmContentRef} dangerouslySetInnerHTML={{ __html: buildConfirmationHtml() }} />
            <div className="flex justify-between mt-8 pt-4 border-t border-gray-200">
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={submitting}
                className="px-6 py-3 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {TC('close')}
              </button>
              <button
                onClick={() => { if (!submitting && !(state.flowType === 'order' && orderLocked)) setConfirmSubmitOpen(true); }}
                disabled={submitting || (state.flowType === 'order' && orderLocked)}
                title={state.flowType === 'order' && orderLocked ? TC('orderCannotResendTitle') : undefined}
                className="px-6 py-3 bg-emerald-600 rounded-lg hover:bg-emerald-700 font-medium text-white shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                {state.flowType === 'order' && orderLocked
                  ? TC('orderSubmittedBadge')
                  : submitting
                    ? (state.flowType === 'order' ? TC('sendingOrderBtn') : TC('sendingQuoteBtn'))
                    : (state.flowType === 'order' ? TC('submitOrderBtn') : TC('submitQuoteBtn'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm-submit Modal (asks once before the real submit) */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={() => { if (!submitting) setConfirmSubmitOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-[95%] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-3 text-gray-900">
              {state.flowType === 'order'
                ? (lang === 'da' ? 'Bekræft afsendelse' : 'Confirm submission')
                : (lang === 'da' ? 'Bekræft afsendelse' : 'Confirm submission')}
            </h3>
            <p className="text-sm text-gray-700 mb-6">
              {state.flowType === 'order'
                ? (lang === 'da'
                    ? 'Vil du afsende denne ordre til Timan? Der oprettes et ordrenummer og PDF sendes.'
                    : 'Do you want to submit this order to Timan? An order number will be created and the PDF will be sent.')
                : (lang === 'da'
                    ? 'Vil du afsende dette tilbud? Der oprettes et tilbudsnummer og PDF sendes.'
                    : 'Do you want to submit this quote? A quote number will be created and the PDF will be sent.')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSubmitOpen(false)}
                disabled={submitting}
                className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium text-gray-700 disabled:opacity-50">
                {lang === 'da' ? 'Annuller' : 'Cancel'}
              </button>
              <button
                onClick={async () => {
                  if (submitting) return;
                  setConfirmSubmitOpen(false);
                  await downloadPdf();
                }}
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-700 font-medium text-white shadow disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting
                  ? (state.flowType === 'order' ? T('sendingOrderBtn') : T('sendingQuoteBtn'))
                  : (lang === 'da' ? 'Bekræft' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal — single source of truth after a successful submit */}
      {successModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-[95%] p-6">
            <h3 className="text-xl font-bold mb-3 text-gray-900">
              {successModal.flowType === 'order'
                ? (lang === 'da' ? 'Din ordre er nu afsendt' : 'Your order has been submitted')
                : (lang === 'da' ? 'Dit tilbud er nu afsendt' : 'Your quote has been submitted')}
            </h3>
            <p className="text-sm text-gray-700 mb-6">
              {successModal.flowType === 'order'
                ? (lang === 'da'
                    ? `Ordren er sendt til Timan med ordrenummer ${successModal.orderNumber || '—'}.`
                    : `The order has been sent to Timan with order number ${successModal.orderNumber || '—'}.`)
                : (lang === 'da'
                    ? `Tilbuddet er sendt med tilbudsnummer ${successModal.quoteNumber || '—'}.`
                    : `The quote has been sent with quote number ${successModal.quoteNumber || '—'}.`)}
            </p>
            {successModal.recipients && successModal.recipients.length > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  {lang === 'da' ? 'Sendt til' : 'Sent to'}
                </p>
                <ul className="space-y-1">
                  {successModal.recipients.map((r) => (
                    <li key={r} className="text-sm text-gray-800 break-all">{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => { setSuccessModal(null); navigate('/portal'); }}
                className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium text-gray-700">
                {lang === 'da' ? 'Gå til portal forsiden' : 'Go to portal home'}
              </button>
              <button
                onClick={() => {
                  const wasOrder = successModal?.flowType === 'order';
                  setSuccessModal(null);
                  if (wasOrder) {
                    // Submitted orders are immutable. Drop all in-memory
                    // case state so the user starts a fresh configuration
                    // instead of editing the just-sent order in place.
                    resetState();
                    setIsSavedCurrent(false);
                    setSavedConfigurationId(null);
                    setSavedQuoteNumber(null);
                    setSavedOrderNumber(null);
                    setSavedSourceQuoteNumber(null);
                    setLinkedLeadId(null);
                    setOrderLocked(false);
                  }
                }}
                className="px-5 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-700 font-medium text-white shadow">
                {lang === 'da' ? 'Tilbage til konfigurator' : 'Back to configurator'}
              </button>

            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full max-w-6xl mx-auto mb-6 sm:mb-8 no-print flex flex-wrap lg:flex-nowrap justify-between items-center gap-3 px-3 sm:px-4">
        <div className="order-1 flex max-w-full space-x-1 overflow-x-auto p-1 rounded-lg bg-white shadow-md border">
          {LANGUAGES.map(l => (
            <button key={l.code} onClick={() => setLanguage(l.code)}
              className={`flag-button ${uiLanguage === l.code ? 'active' : ''}`}>
              <span className="text-lg">{l.flag}</span>
            </button>
          ))}
        </div>
        <div className="header-title-container order-3 lg:order-2 w-full lg:w-auto lg:flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 tracking-tight leading-tight break-words">{T('appTitle')}</h1>
          <p className="text-gray-500 font-medium mt-1 text-sm sm:text-lg">{T('subtitle')}</p>
        </div>
        {(() => {
          const portalRole = (appUser as { portal_role?: string | null } | null)?.portal_role ?? null;
          if (isExhibition) {
            return (
              <button
                onClick={() => navigate('/messe')}
                className="order-2 lg:order-3 inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 border border-gray-200 bg-white transition shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Tilbage til Timan Messe</span>
                <span className="sm:hidden">Messe</span>
              </button>
            );
          }
          const isDealerUser = portalRole === 'dealer_user';
          const dealerSidePortalRoles = new Set([
            'timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_user',
            'timan_backend', 'timan_seller', 'timan_service',
          ]);
          const backTarget = isDealerUser ? '/portal' : '/portal/salg-marketing';
          const showBackToPortal = !!appUser && (appUser.role !== 'slutkunde' || (portalRole ? dealerSidePortalRoles.has(portalRole) : false));
          return showBackToPortal ? (
          <button
            onClick={() => {
              const hasUnsaved = state.machineConfigs.length > 0 && !isSavedCurrent;
              if (hasUnsaved) {
                setShowLeavePortalConfirm(true);
              } else {
                navigate(backTarget);
              }
            }}
            className="order-2 lg:order-3 inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 border border-gray-200 bg-white transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isDealerUser ? (uiLanguage === 'da' ? 'Tilbage til forside' : 'Back to front page') : tPortal('backToSalesMarketing', uiLanguage)}
            </span>
            <span className="sm:hidden">
              {isDealerUser ? (uiLanguage === 'da' ? 'Forside' : 'Home') : (lang === 'da' ? 'Salg' : lang === 'de' ? 'Vertrieb' : lang === 'it' ? 'Vendite' : lang === 'hu' ? 'Értékesítés' : (uiLanguage === 'sv' ? 'Försäljning' : uiLanguage === 'fr' ? 'Ventes' : uiLanguage === 'pl' ? 'Sprzedaż' : uiLanguage === 'cs' ? 'Prodej' : 'Sales'))}
            </span>
          </button>
          ) : (
            <div className="hidden lg:block w-[116px]" />
          );
        })()}

      </header>

      <AlertDialog open={showLeavePortalConfirm} onOpenChange={setShowLeavePortalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lang === 'da' ? 'Forlad konfigurator?'
                : lang === 'de' ? 'Konfigurator verlassen?'
                : lang === 'it' ? 'Uscire dal configuratore?'
                : lang === 'hu' ? 'Elhagyod a konfigurátort?'
                : 'Leave configurator?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === 'da' ? 'Du har ikke-gemte ændringer. Vil du forlade konfiguratoren?'
                : lang === 'de' ? 'Sie haben ungespeicherte Änderungen. Möchten Sie den Konfigurator verlassen?'
                : lang === 'it' ? 'Hai modifiche non salvate. Vuoi uscire dal configuratore?'
                : lang === 'hu' ? 'Nem mentett módosításaid vannak. Elhagyod a konfigurátort?'
                : 'You have unsaved changes. Do you want to leave the configurator?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {lang === 'da' ? 'Bliv her'
                : lang === 'de' ? 'Hier bleiben'
                : lang === 'it' ? 'Resta qui'
                : lang === 'hu' ? 'Maradok'
                : 'Stay here'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLeavePortalConfirm(false);
                navigate('/portal');
              }}
            >
              {lang === 'da' ? 'Forlad konfigurator'
                : lang === 'de' ? 'Konfigurator verlassen'
                : lang === 'it' ? 'Esci dal configuratore'
                : lang === 'hu' ? 'Konfigurátor elhagyása'
                : 'Leave configurator'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step Tabs */}
      <div className="max-w-6xl mx-auto mb-4">
        <div className="flex space-x-1 border-b border-gray-200">
          {(isExhibition ? [1, 3, 4] : [1, 2, 3, 4]).map(step => {
            const maxStep = appUser?.max_step ?? 4;
            const allowed = step <= maxStep;
            return (
            <button key={step}
              onClick={() => { if (step <= state.step && allowed) setStep(step); }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${state.step === step ? 'tab-active bg-white border-x border-t' : step <= state.step && allowed ? 'tab-inactive hover:bg-gray-100 cursor-pointer' : 'text-gray-400 cursor-not-allowed'}`}>
              {T(`step${step}Tab`)}
            </button>
            );
          })}
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
        <main className="lg:col-span-3">
          {state.flowType === 'order' && orderLocked && (
            <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between">
              <span><strong>{T('orderLockedBannerStrong')}</strong> — {T('orderLockedBannerText')}</span>
              <span className="text-xs font-mono text-amber-800">{savedOrderNumber || ''}</span>
            </div>
          )}
          <fieldset disabled={state.flowType === 'order' && orderLocked} className={(state.flowType === 'order' && orderLocked) ? 'space-y-6 opacity-90 [&_*]:!cursor-not-allowed' : 'space-y-6'} style={(state.flowType === 'order' && orderLocked) ? { pointerEvents: 'none' } : undefined}>
            {/* Step 1 */}
            {state.step === 1 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-xl font-bold mb-4 text-center">{T('step1Title')}</h2>
                <p className="text-gray-600 font-medium mb-6 text-center">{T('step1Desc')}</p>

                <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 max-w-3xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['quote', 'order'] as const).map(ft => (
                      <button key={ft} onClick={() => handleSetFlowType(ft)}
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
                        {permissions.canSeePrices && <div className="text-3xl font-extrabold text-emerald-600">{formatMoney(getPrice(p, lang), lang)}</div>}
                        <p className="text-sm text-gray-500">{itemNoLabel(uiLanguage)}: {p.varenr}</p>

                        {p.techSpecs.length > 0 && (
                          <div className="space-y-1 py-3 border-t border-b border-gray-200">
                            {p.techSpecs.map((spec, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className="text-gray-600">{translateSpecLabel(spec.label, uiLanguage)}:</span>
                                <span className="font-semibold text-gray-900">{typeof spec.value === 'string' ? spec.value : ((spec.value as any)?.[lang] || (spec.value as any)?.da || '')}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-1 mb-1 flex flex-wrap justify-center gap-3 items-center">
                          {getVideoUrl(p) ? (
                            <a href={getVideoUrl(p)!} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1 font-medium">🎥 {T('videoLink')}</a>
                          ) : (key === 'Timan 2620' && (
                            <button onClick={(e) => { e.stopPropagation(); toast.info(lang === 'da' ? 'Indhold kommer senere' : 'Content coming soon'); }} className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1 font-medium p-0 bg-transparent">🎥 {T('videoLink')}</button>
                          ))}
                          {getImageUrlForItem(p) ? (
                            <a href={getImageUrlForItem(p)!} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1 font-medium">📸 {T('imageLink')}</a>
                          ) : (key === 'Timan 2620' && (
                            <button onClick={(e) => { e.stopPropagation(); toast.info(lang === 'da' ? 'Indhold kommer senere' : 'Content coming soon'); }} className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1 font-medium p-0 bg-transparent">📸 {T('imageLink')}</button>
                          ))}
                          {p.machineDetails && (
                            <button onClick={(e) => { e.stopPropagation(); showMachineDetails(key); }} className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 font-medium p-0 bg-transparent">📄 {T('infoSpecs')}</button>
                          )}
                        </div>

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

                        {/* Qty discount status per card — only shown for discount-eligible real machines */}
                        {!isExhibition && currentQty >= 1 && p.isDiscountEligible && (
                          <div className={`text-xs text-center mt-1 ${discountEligibleQty >= 2 ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}
                            dangerouslySetInnerHTML={{ __html: discountEligibleQty >= 4 ? `✅ ${T('qtyStatus4')}` : discountEligibleQty >= 2 ? `✅ ${T('qtyStatus2')}` : T('qtyStatus1') }} />
                        )}

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

                <div className="flex justify-center pt-6 border-t mt-8">
                  <button onClick={() => {
                    if (isExhibition) {
                      setState(s => ({ ...s, currentMachineIndex: 0 }));
                      setStep(3);
                      return;
                    }
                    setStep(2);
                  }} disabled={!flowSelected || totalQty === 0}
                    className={`px-6 py-3 rounded-lg text-base font-semibold transition ${flowSelected && totalQty > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
                    {isExhibition ? T('goToEquipment') : T('goToDelivery')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Delivery */}
            {!isExhibition && state.step === 2 && (
              <div className="bg-white rounded-2xl shadow p-6 text-center">
                <h2 className="text-xl font-bold mb-4">{T('step2Title')}</h2>
                <p className="text-gray-600 font-medium mb-6">{T('step2Desc')}</p>
                <div className="mb-8 mx-auto max-w-sm">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{T('deliveryDate')}</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'mt-1 w-full rounded-full justify-start text-left font-normal',
                          !state.date && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="flex-1 pointer-events-none select-none">
                          {selectedDeliveryDate ? format(selectedDeliveryDate, 'dd-MM-yyyy', { locale: dateLocale }) : T('datePlaceholder')}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <Calendar
                        mode="single"
                        selected={selectedDeliveryDate}
                        onSelect={(date) => {
                          if (!date) return;
                          const day = date.getDay();
                          if (day === 0 || day === 6) {
                            const next = new Date(date);
                            while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
                            toast.error('Leveringsdato kan ikke være en weekend.');
                            setDate(format(next, 'yyyy-MM-dd'));
                            return;
                          }
                          setDate(format(date, 'yyyy-MM-dd'));
                        }}
                        disabled={(date) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const day = date.getDay();
                          return date < today || day === 0 || day === 6;
                        }}
                        modifiers={{
                          discount: (date) => {
                            const threshold = new Date();
                            threshold.setMonth(threshold.getMonth() + 3);
                            return date > threshold;
                          },
                        }}
                        modifiersStyles={{
                          discount: {
                            backgroundColor: 'hsl(45 93% 80%)',
                            borderRadius: '6px',
                          },
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                      <div className="px-3 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: 'hsl(45 93% 80%)' }} />
                        {T('calendarDiscountNote')}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {(() => {
                    const hasDeliveryDiscount = state.date && (() => {
                      const d = new Date(state.date);
                      const threshold = new Date();
                      threshold.setMonth(threshold.getMonth() + 3);
                      return d > threshold;
                    })();
                    return (
                      <div className="mt-2 text-center">
                        {hasDeliveryDiscount ? (
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block">
                            ✅ {T('deliveryDiscountActive')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            {T('deliveryDiscountHint')}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="mt-3 space-y-3 w-full flex flex-col items-center max-w-2xl mx-auto">
                  {(['pickup', 'send', 'deliver'] as const).map(method => (
                    <label key={method} className="w-full max-w-2xl cursor-pointer">
                      <input type="radio" name="delivery-method" value={method} className="sr-only peer"
                        checked={state.deliveryMethod === method} onChange={() => {
                          setDeliveryMethod(method);
                          if (method !== 'deliver') setState(s => ({ ...s, deliveryDeliverStartup: null }));
                        }} />
                      <div className="w-full p-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 transition peer-checked:bg-emerald-50 peer-checked:border-emerald-500 peer-checked:shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex-1 min-w-0 text-[13px] md:text-sm whitespace-nowrap">{T(method)}</span>
                          <button type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeliveryInfoOpen(true); }}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-400 text-[11px] font-bold text-gray-600 hover:bg-gray-100 flex-shrink-0"
                            title={T('delivery_info_link')}>i</button>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Delivery startup sub-options (Danish only, deliver method) */}
                {needsStartup && (
                  <div className="mt-6 max-w-2xl mx-auto text-left">
                    <h3 className="text-sm font-bold text-gray-800 mb-2">{T('startupTitle')}</h3>
                    <div className="space-y-2">
                      {[
                        { value: 'no_bridge', label: T('startupNoBridge') },
                        { value: 'with_bridge', label: T('startupWithBridge') },
                        { value: 'other', label: T('startupOther') },
                      ].map(opt => (
                        <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                          <input type="radio" name="deliver-startup" value={opt.value} className="accent-emerald-600"
                            checked={state.deliveryDeliverStartup === opt.value}
                            onChange={() => setState(s => ({ ...s, deliveryDeliverStartup: opt.value }))} />
                          <span className="text-sm text-gray-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    {!state.deliveryDeliverStartup && (
                      <p className="text-red-500 text-xs mt-2">{T('startupRequired')}</p>
                    )}
                  </div>
                )}

                <div className="flex justify-between max-w-md mx-auto mt-8">
                  <button onClick={() => setStep(1)} className="text-gray-600">{T('back')}</button>
                  <div className="flex flex-col items-end gap-1">
                    {!state.date && (
                      <p className="text-red-500 text-xs">{T('selectDeliveryDate')}</p>
                    )}
                    {!state.deliveryMethod && (
                      <p className="text-red-500 text-xs">{T('selectDeliveryMethod')}</p>
                    )}
                    <button onClick={() => {
                      if (!canProceedStep2) return;
                      setState(s => ({ ...s, currentMachineIndex: 0 }));
                      setStep(3);
                    }}
                      disabled={!canProceedStep2}
                      className={`px-4 py-2 rounded-lg font-medium shadow-lg text-sm ${canProceedStep2 ? 'bg-emerald-600 text-white' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
                      {T('goToEquipment')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Accessories */}
            {state.step === 3 && (() => {
              const allUnits = getGlobalMachineUnits();
              const currentUnit = allUnits[state.currentMachineIndex];
              if (!currentUnit) return <div>No machine selected</div>;
              const machineType = currentUnit.modelType;
              const accs = machineType === LOOSE_TOOL_KEY ? getLooseToolAccessories() : (ACCESSORIES[machineType] || []);
              const displayUnits = getDisplayMachineUnits();

              let selectedIds: string[] = [];
              if (currentUnit.isSharedUnit) {
                const mc = state.machineConfigs.find(c => c.id === currentUnit.modelId);
                selectedIds = mc?.acc || [];
              } else {
                selectedIds = state.individualUnitConfigs[currentUnit.configKey]?.acc || [];
              }

              const currentDisplayIdx = displayUnits.findIndex(u => u.globalIndex === state.currentMachineIndex);

              const mandatoryGroups = machineType === 'Timan 3330' ? REQUIRED_GROUPS_3330
                : machineType === 'Timan 2620' ? REQUIRED_GROUPS_2620
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
                    elements.push(
                      <div key={`mg-${openMandatoryGroup}`}
                        className={`space-y-2 mb-4 ${!ok ? 'border-2 border-red-500 rounded-lg p-3' : ''}`}>
                        {mandatoryGroupItems}
                      </div>
                    );
                    mandatoryGroupItems = [];
                    openMandatoryGroup = null;
                  }
                };

                accs.forEach((a, idx) => {
                  if (a.hidden || (a.requires && !selectedIds.includes(a.requires))) return;
                  // RAL color (961050) only for Løs redskab
                  if ((String(a.id) === ACC_ID_RAL_COLOR || String(a.varenr) === ACC_ID_RAL_COLOR) && machineType !== LOOSE_TOOL_KEY) return;
                  // Danish-only / EUR-only filtering
                  const aId = String(a.id); const aVarenr = String(a.varenr);
                  if ((DANISH_ONLY_ITEM_IDS.has(aId) || DANISH_ONLY_ITEM_IDS.has(aVarenr)) && lang !== 'da') return;
                  if ((EUR_ONLY_ITEM_IDS.has(aId) || EUR_ONLY_ITEM_IDS.has(aVarenr)) && !isEURCurrency()) return;

                  const isMandatoryGroupItem = !!(a.group && mandatoryGroups.includes(a.group));

                  if (openMandatoryGroup && (!a.group || a.group !== openMandatoryGroup)) {
                    flushMandatoryGroup();
                  }

                  if (a.sectionStart) {
                    const prev = accs.slice(0, idx).reverse().find(x => x && !x.hidden);
                    if (!prev || prev.sectionStart !== a.sectionStart) {
                      let headerClass = 'text-gray-800';
                      if (isMandatoryGroupItem && !groupHasSelection[a.group!]) headerClass = 'text-red-600';
                      const sectionTitle = T(a.sectionStart) !== a.sectionStart ? T(a.sectionStart) : a.sectionStart;
                      elements.push(
                        <h3 key={`section-${idx}`} className={`font-bold ${headerClass} mt-10 mb-2 border-b pb-1 text-lg sticky top-0 bg-white z-10`}>
                          {sectionTitle}
                        </h3>
                      );
                    }
                  }

                  if (a.isHeader) {
                    const isLooseMain = machineType === LOOSE_TOOL_KEY &&
                      (a.id === 'REDSKABER_HEADER' || a.id === 'LOOSE_TIMAN3330_HEADER');
                    const headerCls = isLooseMain
                      ? 'font-bold text-gray-900 mt-10 mb-2 border-b-2 border-emerald-500 pb-1 text-lg sticky top-0 bg-white z-20'
                      : machineType === LOOSE_TOOL_KEY
                        ? 'font-semibold text-gray-700 mt-6 mb-2 border-b pb-1 text-base bg-white'
                        : 'font-bold text-gray-800 mt-10 mb-2 border-b pb-1 text-lg sticky top-0 bg-white z-10';
                    elements.push(
                      <h3 key={`header-${idx}`} className={headerCls}>
                        {getLocalizedName(a.name, lang)}
                      </h3>
                    );
                    return;
                  }

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
                          <div className="text-xs text-gray-500">{itemNoLabel(uiLanguage)}: {a.varenr}</div>
                          {renderActionLinks(a, machineType)}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <input type="number" min="0" max="99" value={currentQtyVal}
                            onChange={e => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setState(s => ({ ...s, accQty: { ...s.accQty, [`${currentUnit.configKey}_${a.id}`]: val } }));
                            }}
                            onClick={e => e.stopPropagation()} className="w-16 p-1.5 border rounded-md text-center" />
                          <div className="font-bold text-emerald-700 whitespace-nowrap w-24 text-right">{permissions.canSeePrices ? formatMoney(getPrice(a, lang), lang) : ''}</div>
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
                        <div className="selection-indicator relative flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5 mr-3 rounded border-2"
                          style={{ backgroundColor: isSelected ? '#059669' : 'white', borderColor: isSelected ? '#059669' : '#9ca3af' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-transparent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {hasSubs && <span className="absolute left-1/2 -translate-x-1/2 top-[20px] text-[10px] text-gray-400 leading-none">↳</span>}
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-grow min-w-0">
                              <span className="font-medium text-sm text-gray-800">{getLocalizedName(a.name, lang)}</span>
                              <div className="text-gray-500 text-xs">{itemNoLabel(uiLanguage)}: {a.varenr}</div>
                              {renderActionLinks(a, machineType)}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <span className="font-bold text-base text-emerald-700 price-col">{permissions.canSeePrices ? formatMoney(getPrice(a, lang), lang) : ''}</span>
                            </div>
                          </div>
                          {ralInput}
                        </div>
                      </div>
                      {isSelected && a.subItems && a.subItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-2">
                          <div className="text-xs font-semibold text-gray-600">{T('tilvalg')}</div>
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
                          {du.isSharedUnit ? `${T('allMachines')} ${getLocalizedName(PRODUCTS[du.modelType]?.name || '', lang)}` : `${T('machineLabel')} ${du.unitNumber}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2 mb-8 max-h-[60vh] overflow-y-auto pr-2 text-left">
                    {renderAccessories()}
                  </div>
                  {/* Step 3 validation: check all required groups across ALL units */}
                  {(() => {
                    // Check required groups for the CURRENT unit
                    const allMandatoryMet = mandatoryGroups.every(g => groupHasSelection[g]);
                    const isLastUnit = currentDisplayIdx >= displayUnits.length - 1;

                    // For the last unit, also check all previous units have their required groups met
                    let allUnitsMet = allMandatoryMet;
                    if (isLastUnit) {
                      displayUnits.forEach(du => {
                        if (du.globalIndex === state.currentMachineIndex) return;
                        const mt = du.modelType;
                        const groups = mt === 'Timan 3330' ? REQUIRED_GROUPS_3330
                          : mt === 'Timan 2620' ? REQUIRED_GROUPS_2620
                          : mt === 'RC-1000S' ? REQUIRED_GROUPS_RC1000 : [];
                        if (groups.length === 0) return;
                        let ids: string[] = [];
                        if (du.isSharedUnit) {
                          const mc = state.machineConfigs.find(c => c.id === du.modelId);
                          ids = mc?.acc || [];
                        } else {
                          ids = state.individualUnitConfigs[du.configKey]?.acc || [];
                        }
                        const flat = getAccessoriesFlat(mt);
                        groups.forEach(g => {
                          if (!flat.some(a => a.group === g && ids.includes(a.id))) allUnitsMet = false;
                        });
                      });
                    }

                    const canProceedStep3 = isLastUnit ? allUnitsMet : allMandatoryMet;

                    return (
                      <div className="flex justify-between pt-4 border-t">
                        <button onClick={() => setStep(isExhibition ? 1 : 2)} className="text-gray-600">{T('back')}</button>
                        {!allMandatoryMet && (
                          <p className="text-red-500 text-xs self-center">{T('requiredGroupsHint')}</p>
                        )}
                        <button onClick={() => {
                          if (!canProceedStep3) return;
                          const proceed = () => {
                            if (currentDisplayIdx < displayUnits.length - 1) {
                              setState(s => ({ ...s, currentMachineIndex: displayUnits[currentDisplayIdx + 1].globalIndex }));
                            } else {
                              setStep(4);
                            }
                          };
                          // Timan 3330 reminder: warn if varenr 721122 is not selected on this unit
                          if (machineType === 'Timan 3330' && !acknowledged721122.has(currentUnit.configKey)) {
                            const has721122 = selectedIds.some(id => {
                              const a = flatAccs.find(x => x.id === id);
                              return a && String(a.varenr) === '721122';
                            });
                            if (!has721122) {
                              setReminder721122({ open: true, pendingNext: proceed });
                              return;
                            }
                          }
                          // Løs redskab reminder: warn if varenr 721059 is not selected when one of
                          // the T2/T3 collection tanks (720125/720130/720132/720133) is selected.
                          if (machineType === LOOSE_TOOL_KEY && !acknowledged721059.has(currentUnit.configKey)) {
                            const LOOSE_721059_TRIGGER_VARENR = new Set(['720125', '720130', '720132', '720133']);
                            const hasTrigger = selectedIds.some(id => {
                              const a = flatAccs.find(x => x.id === id);
                              return a && LOOSE_721059_TRIGGER_VARENR.has(String(a.varenr));
                            });
                            const has721059 = selectedIds.some(id => {
                              const a = flatAccs.find(x => x.id === id);
                              return a && String(a.varenr) === '721059';
                            });
                            if (hasTrigger && !has721059) {
                              setReminder721059({ open: true, pendingNext: proceed });
                              return;
                            }
                          }
                          proceed();
                        }}
                          disabled={!canProceedStep3}
                          className={`px-4 py-2 rounded-lg font-medium shadow-lg text-sm ${canProceedStep3 ? 'bg-emerald-600 text-white' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
                          {currentDisplayIdx < displayUnits.length - 1 ? T('nextMachine') : T('goToContact')}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Step 4: Customer info */}
            {state.step === 4 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-xl font-bold mb-4">{T('step4Title')}</h2>
                <p className="text-gray-600 text-sm mb-6">{T('step4Desc')}</p>
                <div className="max-w-lg mx-auto mb-5">
                  <OwnershipPicker value={ownership} onChange={setOwnership} language={uiLanguage} variant="full" hideDealer={isExhibition} />
                </div>
                {state.flowType === 'quote' && !isExhibition && (
                  <div className="max-w-lg mx-auto mb-5">
                    <LeadLinkPicker
                      key={leadPickerKey}
                      appUser={appUser}
                      value={linkedLeadId ? linkedLeadId : (pendingNewLead ? '__new__' : null)}
                      onChange={(val) => {
                        if (val === '__new__') {
                          setPendingNewLead(true);
                          setLinkedLeadId(null);
                        } else {
                          setPendingNewLead(false);
                          setLinkedLeadId(val);
                        }
                      }}
                      dealerNumber={ownership.dealerNumber || null}
                      language={lang}
                    />
                  </div>
                )}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('email')} {state.flowType === 'order' && <span className="text-red-500">*</span>}</label>
                    <input type="email" value={state.email} onChange={e => setCustomerField('email', e.target.value)} className="w-full p-2 border rounded-lg" placeholder={T('emailSenderPlaceholder')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {state.flowType === 'order'
                        ? T('emailRecipientRequired')
                        : T('emailRecipientLabel')}
                    </label>
                    <input
                      type="email"
                      value={state.emailRecipient}
                      onChange={e => setCustomerField('emailRecipient', e.target.value)}
                      className={`w-full p-2 border rounded-lg ${state.flowType === 'order' ? 'bg-gray-100' : ''}`}
                      placeholder={T('emailRecipientPlaceholder')}
                      readOnly={state.flowType === 'order'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{T('comment')}</label>
                    <textarea value={state.comment} onChange={e => setCustomerField('comment', e.target.value)} className="w-full p-2 border rounded-lg" rows={5} />
                    <p className="text-xs text-gray-500 mt-1">{T('altDeliveryInfo')}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-8 pt-4 border-t">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setStep(3)} className="text-gray-600">{T('back')}</button>
                    <button
                      onClick={() => {
                        if (isSavedCurrent) {
                          resetState();
                          setIsSavedCurrent(false);
                          setSavedConfigurationId(null);
                        } else {
                          setNewConfigModalOpen(true);
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition"
                    >
                      {T('startNewConfig')}
                    </button>
                  </div>
                  {isExhibition ? (
                    <button
                      type="button"
                      onClick={() => void (isTimanMesseUser ? handleSaveLeadAndSendOrder() : handleSaveAsLead())}
                      disabled={savingAsLead || savingLeadAndOrder || submitting || !ownership.sellerEmail || !state.firmanavn.trim() || !state.kontaktperson.trim() || !state.email.trim() || (isTimanMesseUser && orderLocked)}
                      title={!ownership.sellerEmail ? 'Vælg Timan-sælger først.' : isTimanMesseUser && orderLocked ? T('orderCannotResendTitle') : ''}
                      className="px-6 py-3 bg-emerald-600 rounded-lg font-medium text-white shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {savingLeadAndOrder ? 'Gemmer og sender...' : savingAsLead ? 'Gemmer...' : isTimanMesseUser ? 'Gem som lead og send ordre' : 'Gem som lead'}
                    </button>
                  ) : false ? (
                    <span className="px-4 py-2 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold uppercase tracking-wide">
                      Demo mode — ordrer er deaktiveret
                    </span>
                  ) : state.flowType === 'order' && orderLocked ? (
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                        {T('orderSubmittedBadge')}
                      </span>
                      <button disabled className="px-6 py-3 bg-gray-400 rounded-lg font-medium text-white cursor-not-allowed" title={T('orderCannotResendTitle')}>
                        {T('sendOrder')}
                      </button>
                    </div>
                  ) : state.flowType === 'order' && !permissions.canSubmitOrder ? (
                    <button disabled className="px-6 py-3 bg-gray-400 rounded-lg font-medium text-white cursor-not-allowed">
                      {T('onlyDealerCanOrder')}
                    </button>
                  ) : (
                    <button onClick={openConfirmation}
                      className="px-6 py-3 bg-emerald-600 rounded-lg font-medium text-white shadow-lg">{T('sendOrder')}</button>
                  )}
                </div>
              </div>
            )}
          </fieldset>
        </main>


        {/* Sidebar */}
        <aside className="lg:col-span-2 no-print">
          <div className="bg-white rounded-2xl p-6 lg:sticky lg:top-8 bg-emerald-50 border-2 border-emerald-100">
            {state.flowType === 'order' && orderLocked && (
              <div className="w-full mb-3 px-4 py-2 bg-amber-100 border border-amber-300 text-amber-900 text-sm font-semibold rounded-lg text-center">
                {T('orderLockedReadonly')}
              </div>
            )}
            {false && isExhibition && (
              <div className="w-full mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold uppercase tracking-wide text-center">
                Demo mode — Timan Messe
              </div>
            )}
            {!isExhibition && state.step === 4 && !(state.flowType === 'order' && orderLocked) && (
              <button
                type="button"
                onClick={() => void handleSaveChanges()}
                disabled={savingChanges}
                title={savedQuoteNumber || savedOrderNumber || savedConfigurationId || ''}
                className="w-full mb-3 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                {savingChanges
                  ? T('savingChangesBtn')
                  : savedConfigurationId
                    ? T('saveChangesBtn')
                    : ({ da: 'Gem sag', en: 'Save case', de: 'Fall speichern', it: 'Salva caso', hu: 'Eset mentése' }[lang] || T('saveCase'))}
                {savedConfigurationId && (
                  <span className="ml-1 text-[11px] font-normal opacity-90 tabular-nums">
                    {savedQuoteNumber || savedOrderNumber || ''}
                  </span>
                )}
              </button>
            )}
            {state.step === 4 && state.flowType === 'quote' && (isExhibition || canSaveConfiguratorAsLead) && (() => {
              const hasRequired = !!((isExhibition || ownership.dealerNumber) && state.firmanavn.trim() && state.kontaktperson.trim() && state.email.trim() && (!isExhibition || ownership.sellerEmail));
              const label = isTimanMesseUser
                ? ({ da: 'Gem som lead og send ordre', en: 'Save lead and send order', de: 'Lead speichern und Bestellung senden', it: 'Salva lead e invia ordine', hu: 'Lead mentése és rendelés küldése' }[lang])
                : ({ da: 'Gem som lead', en: 'Save as lead', de: 'Als Lead speichern', it: 'Salva come lead', hu: 'Mentés leadként' }[lang]);
              const isActionBlockedByExistingLead = !isTimanMesseUser && !!linkedLeadId;
              const disabledTitle = !hasRequired
                ? { da: 'Udfyld forhandler, firmanavn, kontaktperson og e-mail.',
                    en: 'Fill in dealer, company, contact and email.',
                    de: 'Händler, Firma, Kontakt und E-Mail ausfüllen.',
                    it: 'Compila concessionario, azienda, contatto ed email.',
                    hu: 'Töltsd ki a kereskedőt, céget, kapcsolattartót és e-mailt.' }[lang]
                : isTimanMesseUser && orderLocked
                  ? T('orderCannotResendTitle')
                : isActionBlockedByExistingLead
                  ? { da: 'Denne konfiguration er allerede knyttet til et lead.',
                      en: 'This configuration is already linked to a lead.',
                      de: 'Bereits mit einem Lead verknüpft.',
                      it: 'Già collegata a un lead.',
                      hu: 'Már leadhez van kapcsolva.' }[lang]
                  : '';
              return (
                <button
                  type="button"
                  onClick={() => void (isTimanMesseUser ? handleSaveLeadAndSendOrder() : handleSaveAsLead())}
                  disabled={!hasRequired || savingAsLead || savingLeadAndOrder || submitting || isActionBlockedByExistingLead || (isTimanMesseUser && orderLocked)}
                  title={disabledTitle}
                  className="w-full mb-3 px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  {savingLeadAndOrder ? '…' : savingAsLead ? '…' : label}
                </button>
              );
            })()}
            <fieldset disabled={state.flowType === 'order' && orderLocked} className="contents">
              <OwnershipPicker value={ownership} onChange={setOwnership} language={uiLanguage} variant="compact" hideDealer={isExhibition} />
            </fieldset>
            <AccountPanel
              appUser={appUser}
              language={uiLanguage}
              currentState={state}
              ownershipOverride={buildOwnershipPayload}
              onSavedConfiguration={(configId, quoteNumber, orderNumber) => {
                setSavedConfigurationId(configId);
                setSavedQuoteNumber(quoteNumber ?? null);
                setSavedOrderNumber(orderNumber ?? null);
                setIsSavedCurrent(true);
              }}
              onLogout={async () => {
                console.log('[logout] Clearing state and signing out');
                await ctxLogout().catch(() => {});
                // Reset all configurator state to clean
                resetState();
                setSavedConfigurationId(null);
                setSavedQuoteNumber(null);
                setSavedOrderNumber(null);
                setSavedSourceQuoteNumber(null);
                setIsSavedCurrent(false);
                setSalesArgsData(null);
                setSelectedSalesBullets(new Set());
                setIncludeSalesArgs(false);
                setRecommendationData(null);
                setIncludeRecommendation(false);
                setSelectedRecBullets(new Set());
                setWantRecommendation(false);
                try {
                  const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('configurator') || k.startsWith('timan'));
                  keysToRemove.forEach(k => localStorage.removeItem(k));
                  const sessKeys = Object.keys(sessionStorage).filter(k => k.startsWith('configurator') || (k.startsWith('timan') && k !== 'timan.appUser'));
                  sessKeys.forEach(k => sessionStorage.removeItem(k));
                } catch { /* ignore */ }
                navigate('/portal', { replace: true });
              }}
              onRestoreState={(restored, configId, savedOwnership) => {
                setState(restored);
                setSavedConfigurationId(configId);
                setIsSavedCurrent(true);
                // Restore dealer/seller picker from the saved snapshot so the
                // "Forhandler" dropdown does not reset to "Ingen valgt".
                if (savedOwnership) {
                  setOwnership((prev) => ({
                    ...prev,
                    sellerInitials: savedOwnership.seller_initials ?? prev.sellerInitials,
                    sellerEmail: savedOwnership.seller_email ?? prev.sellerEmail,
                    sellerName: savedOwnership.seller_name ?? prev.sellerName,
                    dealerAccountId: savedOwnership.dealer_account_id ?? prev.dealerAccountId,
                    dealerNumber: savedOwnership.dealer_number ?? prev.dealerNumber,
                    dealerCompanyName: savedOwnership.dealer_name ?? prev.dealerCompanyName,
                  }));
                }
                toast.success(lang === 'da' ? 'Sag indlæst' : 'Case loaded', {
                  description: lang === 'da' ? 'Din gemte konfiguration er genindlæst.' : 'Your saved configuration has been restored.',
                });
              }}
            />

            <div className="flex items-center justify-between gap-3 mb-4 border-b border-emerald-200 pb-2">
              <h2 className="text-xl font-bold text-gray-800">{T('summaryTitle')}</h2>
              <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5 shadow-sm" role="group" aria-label="flow type">
                {(isExhibition ? (['quote'] as const) : (['quote', 'order'] as const)).map(ft => {
                  const active = state.flowType === ft;
                  return (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => handleSetFlowType(ft)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        active
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-transparent text-gray-600 hover:bg-gray-200'
                      }`}
                      aria-pressed={active}
                    >
                      {T(ft)}
                    </button>
                  );
                })}
              </div>
            </div>

            {!calcResult ? (
              <p className="text-gray-400 italic text-center">{T('cartEmpty')}</p>
            ) : (
              <>
                <div className="space-y-1 text-sm mb-6 max-h-[60vh] overflow-y-auto">
                  {calcResult.lineItems.map((item, idx) => {
                    if (item.subtotal) {
                      return (
                        <div key={idx} className="mt-2 mb-4 pb-3 border-b border-dashed border-emerald-400">
                          <div className="flex justify-between items-end text-sm font-semibold text-gray-800">
                            <span>{item.txt}</span>
                            {permissions.canSeePrices && <span className="price-col">{formatMoney(item.price, lang)}</span>}
                          </div>
                        </div>
                      );
                    }
                    if (item.isSectionHeader) {
                      return (
                        <div key={idx} className="pt-3 pb-1 text-sm font-semibold text-gray-800 border-t border-gray-200 mt-2">{item.txt}</div>
                      );
                    }
                    const lineClasses = item.bold ? 'font-bold text-gray-900 mt-4' : 'text-gray-600 text-xs';
                    let indent = 'pl-0';
                    if (item.sub) {
                      if (item.isDependentAccessory) indent = 'pl-10';
                      else if (item.isPrimaryAccessory) indent = 'pl-6';
                      else indent = 'pl-4';
                    }
                    return (
                      <div key={idx}>
                        {item.isMachine && item.index && (
                          <div className="mt-2 mb-3 pl-2">
                            <input type="text" maxLength={20}
                              value={state.reqNumbers[`machine_${item.index}`] || ''}
                              onChange={e => setReqNumber(item.index!, e.target.value)}
                              placeholder={T('reqNumberPlaceholder')}
                              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 placeholder-gray-400" />
                          </div>
                        )}
                        <div className={`flex justify-between items-start ${lineClasses} ${indent}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span>{item.txt}</span>
                              {item.isAutoAdded && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">{T('autoAdded')}</span>
                              )}
                            </div>
                            {item.subText && <div className="mt-1">{item.subText}</div>}
                          </div>
                          {permissions.canSeePrices && <span className="font-medium text-right price-col ml-3 whitespace-nowrap">{formatMoney(item.price, lang)}</span>}
                        </div>
                        {item.isMachine && (
                          <div className="text-[11px] text-gray-500 pl-4 mt-0.5">
                            <span className="mr-2">{item.varenr}</span>
                          </div>
                        )}
                        {!isExhibition && state.step === 4 && item.isMachine && item.index && DEMO_ELIGIBLE_VARENR.has(item.varenr) && permissions.canSeePrices && (
                          <div className={`flex justify-between items-center text-xs ${indent} mt-1`}>
                            <label className="flex items-center gap-2 text-gray-700 cursor-pointer select-none">
                              <input type="checkbox"
                                checked={isDemoSelected(item.varenr, item.index)}
                                onChange={() => toggleDemoMachine(item.varenr, item.index!, item.txt)} />
                              <span>{T('demoMachineLabel')} <span className="text-gray-500">(+{formatMoney(getDemoFee(), lang)})</span></span>
                            </label>
                          </div>
                        )}
                      </div>
                    );

                  })}
                </div>

                {permissions.canSeePrices && (
                  <div className="pt-4 border-t border-emerald-200 space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>{T('subtotal')}</span>
                      <span className="font-medium price-col">{formatMoney(displayCalc!.subtotal, lang)}</span>
                    </div>
                    {displayCalc!.totalDiscount > 0 && (
                      <div className="text-red-600 text-sm space-y-1">
                        {displayCalc!.discountDetails.filter(d => d.amount > 0).map((d, i) => (
                          <div key={i} className="flex justify-between">
                            <span className="text-red-500">{state.flowType === 'order' && d.varenr ? `${d.txt} (${d.varenr})` : d.txt}</span>
                            <span className="text-red-500 price-col">-{formatMoney(d.amount, lang)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold">
                          <span>{T('totalDiscount')} ({displayCalc!.totalPct.toFixed(2).replace('.', ',')}%)</span>
                          <span className="price-col">-{formatMoney(displayCalc!.totalDiscount, lang)}</span>
                        </div>
                      </div>
                    )}
                    {/* Dealer discount - only for permitted roles */}
                    {permissions.canSetDiscount && (
                      <div className="mt-3 pt-3 border-t border-dashed border-emerald-200">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {T('extraDealerDiscountPct')}
                        </label>
                        <input type="number" min="0" max="100" step="0.1"
                          value={state.manualDealerDiscountPct || ''}
                          onChange={e => {
                            const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                            setState(s => ({ ...s, manualDealerDiscountPct: v }));
                          }}
                          placeholder="0" className="w-20 p-1.5 border rounded-lg text-center text-sm" />
                      </div>
                    )}
                    {/* Phase 27 — Payment terms (information only, never affects totals).
                        Visible only for Backend / Timan Sælger with explicit permission. */}
                    {canManagePaymentTerms && (
                      <div className="mt-3 pt-3 border-t border-dashed border-emerald-200">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {getPaymentTermsLabel(lang)}
                        </label>
                        <select
                          value={resolvePaymentTerms(state.paymentTerms)}
                          onChange={(e) => {
                            const v = e.target.value || DEFAULT_PAYMENT_TERMS;
                            setState((s) => ({ ...s, paymentTerms: v }));
                          }}
                          className="w-full p-1.5 border rounded-lg text-sm bg-white"
                        >
                          {PAYMENT_TERMS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex justify-between items-end text-lg text-gray-800 pt-4 border-t border-emerald-300 mt-2">
                      <span className="text-sm sm:text-base whitespace-nowrap font-medium">{T('finalPrice')}</span>
                      <span className="text-xl text-emerald-700 price-col ml-2">{formatMoney(displayCalc!.currentPrice, lang)}</span>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </aside>
      </div>

      {/* New configuration confirmation modal */}
      <Dialog open={newConfigModalOpen} onOpenChange={setNewConfigModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{T('newConfigTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mt-2">
            {T('newConfigMsg')}
          </p>
          <div className="flex gap-3 mt-6 justify-end">
            <button
              onClick={() => setNewConfigModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              {T('cancelBtn')}
            </button>
            <button
              onClick={() => {
                setNewConfigModalOpen(false);
                resetState();
                setIsSavedCurrent(false);
                setSavedConfigurationId(null);
              }}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
            >
              {T('discardBtn')}
            </button>
            <button
              disabled={savingBeforeReset}
              onClick={async () => {
                if (!appUser) return;
                setSavingBeforeReset(true);
                const label = state.firmanavn
                  ? `${state.firmanavn} — ${state.machineConfigs.map(m => m.type).join(', ')}`
                  : state.machineConfigs.map(m => m.type).join(', ') || T('newConfigTitle');
                const ownershipPayload = await getRequiredOwnershipPayload();
                if (!ownershipPayload) { setSavingBeforeReset(false); return; }
                const effectiveLeadId = await ensurePendingLeadCreated() ?? linkedLeadId;
                const result = await saveConfiguration(state, label, appUser.email.toLowerCase(), { ownership: ownershipPayload, leadId: effectiveLeadId, pricingMode: isExhibition ? 'messe' : undefined });
                setSavingBeforeReset(false);
                setNewConfigModalOpen(false);
                if (result.error) {
                  toast.error(T('saveFailed'), { description: result.error });
                } else {
                  toast.success(T('caseSaved'), { description: `${T('caseIdLabel')}: ${result.id}` });
                  setSavedConfigurationId(result.id);
                  setSavedQuoteNumber(result.quote_number);
                  setSavedOrderNumber(result.order_number);
                  setSavedSourceQuoteNumber(result.source_quote_number);
                  resetState();
                  setIsSavedCurrent(false);
                  setSavedConfigurationId(null);
                  setSavedQuoteNumber(null);
                  setSavedOrderNumber(null);
                  setSavedSourceQuoteNumber(null);
                }
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {savingBeforeReset ? '...' : T('saveBtn')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales arguments + recommendation prompt modal */}
      <Dialog open={salesArgsModalOpen} onOpenChange={setSalesArgsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{{ da: 'Tilbud – valgmuligheder', en: 'Quote – options', de: 'Angebot – Optionen', it: 'Preventivo – opzioni', hu: 'Ajánlat – lehetőségek' }[lang]}</DialogTitle>
          </DialogHeader>

          {/* Phase 5: optional customer needs questionnaire — refines recommendations + benefits */}
          <CustomerNeedsPanel
            value={state.customerNeeds as CustomerNeeds | undefined}
            lang={lang}
            onChange={(next) => {
              setState((s) => ({ ...s, customerNeeds: next }));
              // Re-run engines so the modal immediately reflects new bias.
              const nextState = { ...state, customerNeeds: next };
              const sa = generateSalesArguments(nextState, lang);
              setSalesArgsData(sa);
              setSelectedSalesBullets(new Set(sa.defaultBullets));
              const rec = generateRecommendations(nextState, lang);
              setRecommendationData(rec);
              setSelectedRecBullets(rec ? new Set(rec.defaultBullets) : new Set());
            }}
          />


          {/* Section 1: Sales arguments */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {{ da: 'Ønsker du at tilføje fordele ved den valgte løsning?', en: 'Include benefits of the chosen solution?', de: 'Vorteile der gewählten Lösung hinzufügen?', it: 'Aggiungere vantaggi della soluzione scelta?', hu: 'Hozzáadja a választott megoldás előnyeit?' }[lang]}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIncludeSalesArgs(true)}
                  className={cn(
                    'px-4 py-1.5 text-xs font-medium rounded-full border transition',
                    includeSalesArgs
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-border text-muted-foreground hover:border-emerald-400'
                  )}
                >
                   {{ da: 'Ja', en: 'Yes', de: 'Ja', it: 'Sì', hu: 'Igen' }[lang]}
                </button>
                <button
                  onClick={() => setIncludeSalesArgs(false)}
                  className={cn(
                    'px-4 py-1.5 text-xs font-medium rounded-full border transition',
                    !includeSalesArgs
                      ? 'bg-muted text-foreground border-border'
                      : 'border-border text-muted-foreground hover:border-border'
                  )}
                >
                   {{ da: 'Nej', en: 'No', de: 'Nein', it: 'No', hu: 'Nem' }[lang]}
                </button>
              </div>
            </div>

            {includeSalesArgs && salesArgsData && (() => {
              const allBullets = [...salesArgsData.defaultBullets, ...salesArgsData.extraBullets];
              const totalSelected = selectedSalesBullets.size;
              const toggleSalesBullet = (bullet: string) => {
                setSelectedSalesBullets(prev => {
                  const next = new Set(prev);
                  if (next.has(bullet)) {
                    next.delete(bullet);
                    return next;
                  }
                   // Check max 7 in this section
                   if (prev.size >= 7) return prev;
                  next.add(bullet);
                  return next;
                });
              };
              return (
                <div className="border rounded-lg p-5 bg-muted/30 space-y-4">
                  {salesArgsData.heading && <h3 className="text-base font-bold text-foreground">{salesArgsData.heading}</h3>}
                  {salesArgsData.paragraph && <p className="text-sm text-foreground/90 leading-relaxed">{salesArgsData.paragraph}</p>}
                  
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {{ da: `Vælg nøglepunkter (maks. 7, ${totalSelected} valgt)`, en: `Select key points (max 7, ${totalSelected} selected)`, de: `Schlüsselpunkte wählen (max. 7, ${totalSelected} gewählt)`, it: `Seleziona punti chiave (max 7, ${totalSelected} selezionati)`, hu: `Válasszon kulcspontokat (max. 7, ${totalSelected} kiválasztva)` }[lang]}
                    </p>
                    {allBullets.map((bullet, i) => {
                      const isChecked = selectedSalesBullets.has(bullet);
                      const isDefault = i < salesArgsData.defaultBullets.length;
                      const isDisabled = !isChecked && totalSelected >= 7;
                      return (
                        <label
                          key={i}
                          className={cn(
                            'flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition border',
                            isChecked ? 'bg-emerald-50 border-emerald-200' : 'bg-background border-transparent hover:bg-muted/50',
                            isDisabled && 'opacity-40 cursor-not-allowed',
                            !isDefault && i === salesArgsData.defaultBullets.length && 'mt-3 pt-3 border-t border-border'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => !isDisabled && toggleSalesBullet(bullet)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                          />
                          <span className={cn('text-sm leading-relaxed', isChecked ? 'text-foreground' : 'text-foreground/70')}>
                            {bullet}
                          </span>
                          {!isDefault && !isChecked && (
                             <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">{{ da: 'Valgfri', en: 'Optional', de: 'Optional', it: 'Opzionale', hu: 'Opcionális' }[lang]}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Section 2: Timan recommendation */}
          {(
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {{ da: 'Vil du også høre, hvad Timan anbefaler?', en: 'Would you also like Timan\'s recommendation?', de: 'Möchten Sie auch Timans Empfehlung?', it: 'Volete anche la raccomandazione di Timan?', hu: 'Szeretné a Timan ajánlását is?' }[lang]}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setWantRecommendation(true)}
                    className={cn(
                      'px-4 py-1.5 text-xs font-medium rounded-full border transition',
                      wantRecommendation
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-border text-muted-foreground hover:border-emerald-400'
                    )}
                  >
                    {{ da: 'Ja', en: 'Yes', de: 'Ja', it: 'Sì', hu: 'Igen' }[lang]}
                  </button>
                  <button
                    onClick={() => setWantRecommendation(false)}
                    className={cn(
                      'px-4 py-1.5 text-xs font-medium rounded-full border transition',
                      !wantRecommendation
                        ? 'bg-muted text-foreground border-border'
                        : 'border-border text-muted-foreground hover:border-border'
                    )}
                  >
                    {{ da: 'Nej', en: 'No', de: 'Nein', it: 'No', hu: 'Nem' }[lang]}
                  </button>
                </div>
              </div>

              {wantRecommendation && recommendationData && (() => {
                const allRecBullets = [...recommendationData.defaultBullets, ...recommendationData.extraBullets];
                const totalSelected = selectedRecBullets.size;
                const toggleRecBullet = (bullet: string) => {
                  setSelectedRecBullets(prev => {
                    const next = new Set(prev);
                    if (next.has(bullet)) {
                      next.delete(bullet);
                      return next;
                    }
                    if (prev.size >= 7) return prev;
                    next.add(bullet);
                    return next;
                  });
                };
                return (
                  <div className="border border-amber-300 rounded-lg p-5 bg-amber-50/50 space-y-4">
                    {recommendationData.heading && <h3 className="text-base font-bold text-amber-900">{recommendationData.heading}</h3>}
                    {recommendationData.paragraph && <p className="text-sm text-amber-900/80 leading-relaxed">{recommendationData.paragraph}</p>}

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-amber-700 mb-2">
                        {{ da: `Vælg anbefalinger (maks. 7, ${totalSelected} valgt)`, en: `Select recommendations (max 7, ${totalSelected} selected)`, de: `Empfehlungen wählen (max. 7, ${totalSelected} gewählt)`, it: `Seleziona raccomandazioni (max 7, ${totalSelected} selezionate)`, hu: `Válasszon ajánlásokat (max. 7, ${totalSelected} kiválasztva)` }[lang]}
                      </p>
                      {allRecBullets.map((bullet, i) => {
                        const isChecked = selectedRecBullets.has(bullet);
                        const isDefault = i < recommendationData.defaultBullets.length;
                        const isDisabled = !isChecked && totalSelected >= 7;
                        return (
                          <label
                            key={i}
                            className={cn(
                              'flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition border',
                              isChecked ? 'bg-amber-50 border-amber-200' : 'bg-background border-transparent hover:bg-muted/50',
                              isDisabled && 'opacity-40 cursor-not-allowed',
                              !isDefault && i === recommendationData.defaultBullets.length && 'mt-3 pt-3 border-t border-border'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => !isDisabled && toggleRecBullet(bullet)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 accent-amber-600"
                            />
                            <span className={cn('text-sm leading-relaxed', isChecked ? 'text-amber-900' : 'text-amber-900/60')}>
                              {bullet}
                            </span>
                            <div className="ml-auto flex items-center gap-2 shrink-0">
                              {!isDefault && !isChecked && (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{{ da: 'Valgfri', en: 'Optional', de: 'Optional', it: 'Opzionale', hu: 'Opcionális' }[lang]}</span>
                              )}
                              <RecommendationInfoPopover
                                productId={recommendationData.bulletProductIds?.[i]}
                                lang={uiLanguage}
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {wantRecommendation && !recommendationData && (
                <div className="border border-amber-300 rounded-lg p-5 bg-amber-50/50">
                  <p className="text-sm text-amber-900/80">
                     {{ da: 'Der er ingen yderligere anbefalinger for denne konfiguration – I har allerede valgt de vigtigste tilbehør.', en: 'No additional recommendations for this configuration – you have already selected the key accessories.', de: 'Keine weiteren Empfehlungen für diese Konfiguration – Sie haben bereits das wichtigste Zubehör ausgewählt.', it: 'Nessuna raccomandazione aggiuntiva per questa configurazione – avete già selezionato gli accessori principali.', hu: 'Nincs további ajánlás ehhez a konfigurációhoz – már kiválasztotta a legfontosabb tartozékokat.' }[lang]}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-end mt-4 pt-4 border-t">
            <button
              onClick={() => {
                setSalesArgsModalOpen(false);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted transition"
            >
              {{ da: 'Annuller', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', hu: 'Mégse' }[lang]}
            </button>
            <button
              onClick={() => {
                setIncludeRecommendation(wantRecommendation);
                setSalesArgsModalOpen(false);
                setConfirmModalOpen(true);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
            >
              {{ da: 'Fortsæt', en: 'Continue', de: 'Weiter', it: 'Continua', hu: 'Tovább' }[lang]}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timan 3330 reminder: ensure varenr 721122 (centerslange) considered before leaving Step 3 */}
      <Dialog open={reminder721122.open} onOpenChange={(open) => { if (!open) setReminder721122({ open: false, pendingNext: null }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{T('reminderTitle')} (721122)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {T('reminderBody721122')}
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => {
                const next = reminder721122.pendingNext;
                const allUnits = getGlobalMachineUnits();
                const unit = allUnits[state.currentMachineIndex];
                if (unit && unit.modelType === 'Timan 3330') {
                  const flat = getAccessoriesFlat('Timan 3330');
                  const target = flat.find(a => a.id === '721122_standalone')
                    || flat.find(a => String(a.varenr) === '721122');
                  if (target) toggleAcc(target.id);
                }
                setReminder721122({ open: false, pendingNext: null });
                if (next) setTimeout(next, 0);
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
            >
              {T('reminderAdd')} 721122
            </button>
            <button
              onClick={() => {
                const next = reminder721122.pendingNext;
                const allUnits = getGlobalMachineUnits();
                const unit = allUnits[state.currentMachineIndex];
                if (unit) {
                  setAcknowledged721122(prev => {
                    const n = new Set(prev);
                    n.add(unit.configKey);
                    return n;
                  });
                }
                setReminder721122({ open: false, pendingNext: null });
                if (next) setTimeout(next, 0);
              }}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm font-medium"
            >
              {T('reminderContinueWithout')} 721122
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Løs redskab reminder: ensure varenr 721059 (centerslange eftermontering) considered */}
      <Dialog open={reminder721059.open} onOpenChange={(open) => { if (!open) setReminder721059({ open: false, pendingNext: null }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{T('reminderTitle')} (721059)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {T('reminderBody721059')}
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => {
                const next = reminder721059.pendingNext;
                const allUnits = getGlobalMachineUnits();
                const unit = allUnits[state.currentMachineIndex];
                if (unit && unit.modelType === LOOSE_TOOL_KEY) {
                  const flat = getAccessoriesFlat(LOOSE_TOOL_KEY);
                  const target = flat.find(a => String(a.varenr) === '721059');
                  if (target) toggleAcc(target.id);
                }
                setReminder721059({ open: false, pendingNext: null });
                if (next) setTimeout(next, 0);
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
            >
              {T('reminderAdd')} 721059
            </button>
            <button
              onClick={() => {
                const next = reminder721059.pendingNext;
                const allUnits = getGlobalMachineUnits();
                const unit = allUnits[state.currentMachineIndex];
                if (unit) {
                  setAcknowledged721059(prev => {
                    const n = new Set(prev);
                    n.add(unit.configKey);
                    return n;
                  });
                }
                setReminder721059({ open: false, pendingNext: null });
                if (next) setTimeout(next, 0);
              }}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm font-medium"
            >
              {T('reminderContinueWithout')} 721059
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
