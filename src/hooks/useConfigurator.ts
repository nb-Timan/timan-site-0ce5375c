import { useState, useCallback, useMemo, useEffect } from 'react';
import { useProductMasterRevision } from '@/hooks/useProductMasterRevision';
import { academySandbox } from '@/lib/academySandbox';
import { academyScopedStorageKey } from '@/lib/academyCycleStorage';
import { ConfiguratorState, Language, FlowType, DeliveryMethod, CalcResult } from '@/types/configurator';
import { PRODUCTS, ACCESSORIES, getAccessoriesFlat, getPrice, getLocalizedName, ACC_ID_OIL_NORMAL, ACC_ID_OIL_BIO, LOOSE_TOOL_KEY, DEMO_ELIGIBLE_VARENR, getLooseToolAccessories } from '@/data/machines';
import { createEmptyConfiguratorState, normalizeConfiguratorState, transitionConfiguratorFlowType } from '@/lib/configuratorState';
import { hasFrozenConfiguratorPricing } from '@/lib/configuratorPricing';
import {
  getConfiguratorMachineUnits,
  setConfiguratorMachineQuantity,
  setConfiguratorMode,
  toggleConfiguratorAccessory,
} from '@/lib/configuratorDomain';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { useCampaignRevision } from '@/lib/configuratorCampaigns';
import { useMarketingBadgeClock } from '@/lib/marketingBadgeSchedule';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { toast } from 'sonner';

type ConfiguratorStateUpdate =
  | ConfiguratorState
  | Partial<ConfiguratorState>
  | undefined
  | ((prev: ConfiguratorState) => ConfiguratorState | Partial<ConfiguratorState> | undefined);

export function useConfigurator() {
  const [rawState, setRawState] = useState<ConfiguratorState>(() => {
    if (academySandbox.isActive()) {
      try {
        const saved = localStorage.getItem(academyScopedStorageKey('timan.academy.configurator.v1'));
        if (saved) return normalizeConfiguratorState(JSON.parse(saved));
      } catch { /* Invalid local drafts start with the canonical empty state. */ }
    }
    return createEmptyConfiguratorState();
  });

  const state = useMemo(() => normalizeConfiguratorState(rawState), [rawState]);

  useEffect(() => {
    if (academySandbox.isActive()) localStorage.setItem(academyScopedStorageKey('timan.academy.configurator.v1'), JSON.stringify(state));
  }, [state]);

  const setState = useCallback((next: ConfiguratorStateUpdate) => {
    setRawState(prev => {
      const safePrev = normalizeConfiguratorState(prev);
      const resolved = typeof next === 'function'
        ? (next as (prev: ConfiguratorState) => ConfiguratorState | Partial<ConfiguratorState> | undefined)(safePrev)
        : next;

      return normalizeConfiguratorState(resolved);
    });
  }, []);

  const setStep = useCallback((step: number) => setState(s => ({ ...s, step })), []);
  const setLanguage = useCallback((language: Language) => setState(s => ({ ...s, language })), []);
  const setFlowType = useCallback((flowType: FlowType) => setState(s => transitionConfiguratorFlowType(s, flowType)), []);
  const setDeliveryMethod = useCallback((deliveryMethod: DeliveryMethod | '') => setState(s => ({ ...s, deliveryMethod })), []);
  const setDate = useCallback((date: string) => setState(s => ({ ...s, date })), []);

  const setCustomerField = useCallback((field: string, value: string) => {
    setState(s => ({ ...s, [field]: value }));
  }, []);

  // Machine qty from step 1
  const setMachineQty = useCallback((machineType: string, delta: number) => {
    setState(s => setConfiguratorMachineQuantity(s, machineType, delta));
  }, []);

  const setConfigMode = useCallback((machineType: string, mode: 'shared' | 'individual') => {
    setState(s => setConfiguratorMode(s, machineType, mode));
  }, []);

  // Get all machine units
  const getGlobalMachineUnits = useCallback(() => {
    return getConfiguratorMachineUnits(state);
  }, [state.machineConfigs]);

  const getDisplayMachineUnits = useCallback(() => {
    return getGlobalMachineUnits().filter(u => u.isBaseUnit);
  }, [getGlobalMachineUnits]);

  // Toggle accessory
  const toggleAcc = useCallback((accId: string) => {
    setState(s => {
      const result = toggleConfiguratorAccessory(s, accId);
      if (result.blockedReason === 'SINGLETON_LIMIT') {
        toast.error('Dette varenummer kan kun vælges én gang pr. ordre.');
      }
      return result.state;
    });
  }, []);

  // Calculate prices
  const campaignRevision = useCampaignRevision();
  const productRevision = useProductMasterRevision();
  const campaignClock = useMarketingBadgeClock();
  const calcResult = useMemo((): CalcResult | null => {
    void productRevision;
    void campaignRevision;
    if (state.pricingSnapshot?.totalsOnly) return null;
    if (hasFrozenConfiguratorPricing(state)) {
      try { return buildSubmittedOrderDocument(state).calcResult; }
      catch { return null; }
    }
    if (!state.machineConfigs.length) return null;
    return calculateConfiguration(state, { now: campaignClock });
  }, [state, campaignRevision, campaignClock, productRevision]);

  const resetState = useCallback(() => {
    setState(prev => createEmptyConfiguratorState(prev.language));
  }, [setState]);

  return {
    state,
    setState,
    setStep,
    setLanguage,
    setFlowType,
    setDeliveryMethod,
    setDate,
    setCustomerField,
    setMachineQty,
    setConfigMode,
    toggleAcc,
    calcResult,
    getGlobalMachineUnits,
    getDisplayMachineUnits,
    resetState,
  };
}
