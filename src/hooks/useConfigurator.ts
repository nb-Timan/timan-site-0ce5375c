import { useState, useCallback, useMemo } from 'react';
import {
  ConfiguratorState, DocumentType, Language, MachineSelection,
  UnitConfig, DeliveryInfo, CustomerInfo, DeliveryMethod,
  PriceSummary, DiscountBreakdown, LineItem, ConfigMode,
} from '@/types/configurator';
import { getMachineById } from '@/data/machines';

const initialDelivery: DeliveryInfo = { method: 'pickup', date: null };
const initialCustomer: CustomerInfo = { companyName: '', contactPerson: '', phone: '', email: '', comment: '' };

export function useConfigurator() {
  const [state, setState] = useState<ConfiguratorState>({
    currentStep: 0,
    documentType: 'quote',
    language: 'da',
    machineSelections: [],
    unitConfigs: [],
    deliveryInfo: initialDelivery,
    customerInfo: initialCustomer,
  });

  const setStep = useCallback((step: number) => setState((s) => ({ ...s, currentStep: step })), []);
  const setDocumentType = useCallback((dt: DocumentType) => setState((s) => ({ ...s, documentType: dt })), []);
  const setLanguage = useCallback((lang: Language) => setState((s) => ({ ...s, language: lang })), []);

  const setMachineSelections = useCallback((selections: MachineSelection[]) => {
    setState((s) => {
      // Build unit configs for all units
      const configs: UnitConfig[] = [];
      for (const sel of selections) {
        const machine = getMachineById(sel.machineId);
        if (!machine) continue;
        const count = sel.configMode === 'shared' ? 1 : sel.quantity;
        for (let i = 0; i < count; i++) {
          // Preserve existing config if available
          const existing = s.unitConfigs.find(
            (c) => c.machineId === sel.machineId && c.unitIndex === i
          );
          configs.push(
            existing ?? {
              machineId: sel.machineId,
              unitIndex: i,
              selectedAccessories: {},
              accessoryQuantities: {},
              ralColors: {},
              subItemSelections: {},
            }
          );
        }
      }
      return { ...s, machineSelections: selections, unitConfigs: configs };
    });
  }, []);

  const updateUnitConfig = useCallback((machineId: string, unitIndex: number, updates: Partial<UnitConfig>) => {
    setState((s) => ({
      ...s,
      unitConfigs: s.unitConfigs.map((c) =>
        c.machineId === machineId && c.unitIndex === unitIndex ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const setDeliveryInfo = useCallback((info: Partial<DeliveryInfo>) => {
    setState((s) => ({ ...s, deliveryInfo: { ...s.deliveryInfo, ...info } }));
  }, []);

  const setCustomerInfo = useCallback((info: Partial<CustomerInfo>) => {
    setState((s) => ({ ...s, customerInfo: { ...s.customerInfo, ...info } }));
  }, []);

  // Pricing calculations
  const priceSummary = useMemo((): PriceSummary => {
    let subtotal = 0;
    const totalMachineCount = state.machineSelections.reduce((sum, s) => {
      const m = getMachineById(s.machineId);
      return m?.isLooseTool ? sum : sum + s.quantity;
    }, 0);
    const hasOnlyLooseTools = totalMachineCount === 0;

    for (const sel of state.machineSelections) {
      const machine = getMachineById(sel.machineId);
      if (!machine) continue;
      const unitConfigs = state.unitConfigs.filter((c) => c.machineId === sel.machineId);
      const isShared = sel.configMode === 'shared';

      for (let i = 0; i < sel.quantity; i++) {
        subtotal += machine.basePrice;
        const cfg = isShared ? unitConfigs[0] : unitConfigs[i];
        if (!cfg) continue;

        for (const acc of machine.accessories) {
          if (cfg.selectedAccessories[acc.id]) {
            const qty = cfg.accessoryQuantities[acc.id] ?? 1;
            subtotal += acc.price * qty;

            if (acc.subItems) {
              for (const si of acc.subItems) {
                if (cfg.subItemSelections[acc.id]?.[si.id]) {
                  subtotal += si.price;
                }
              }
            }
          }
        }
      }
    }

    // Discount chain: base 25% → qty → delivery
    const baseDiscountPercent = 25;
    const baseDiscount = subtotal * (baseDiscountPercent / 100);
    let afterBase = subtotal - baseDiscount;

    let qtyDiscountPercent = 0;
    if (!hasOnlyLooseTools) {
      if (totalMachineCount >= 4) qtyDiscountPercent = 4;
      else if (totalMachineCount >= 2) qtyDiscountPercent = 2;
    }
    const qtyDiscount = afterBase * (qtyDiscountPercent / 100);
    let afterQty = afterBase - qtyDiscount;

    let deliveryDiscountPercent = 0;
    if (state.deliveryInfo.date) {
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      if (state.deliveryInfo.date > threeMonths) {
        deliveryDiscountPercent = 2;
      }
    }
    const deliveryDiscount = afterQty * (deliveryDiscountPercent / 100);
    const finalPrice = afterQty - deliveryDiscount;

    const totalDiscount = baseDiscount + qtyDiscount + deliveryDiscount;

    return {
      subtotal,
      discounts: {
        baseDiscount,
        baseDiscountPercent,
        quantityDiscount: qtyDiscount,
        quantityDiscountPercent: qtyDiscountPercent,
        deliveryDiscount,
        deliveryDiscountPercent,
        manualDiscount: 0,
        manualDiscountPercent: 0,
      },
      totalDiscount,
      finalPrice,
    };
  }, [state.machineSelections, state.unitConfigs, state.deliveryInfo]);

  // Generate line items for summary/PDF
  const lineItems = useMemo((): LineItem[] => {
    const items: LineItem[] = [];
    for (const sel of state.machineSelections) {
      const machine = getMachineById(sel.machineId);
      if (!machine) continue;
      items.push({
        name: machine.name,
        itemNumber: machine.itemNumber,
        quantity: sel.quantity,
        unitPrice: machine.basePrice,
        totalPrice: machine.basePrice * sel.quantity,
      });
      const unitConfigs = state.unitConfigs.filter((c) => c.machineId === sel.machineId);
      const isShared = sel.configMode === 'shared';
      const cfg = unitConfigs[0];
      if (!cfg) continue;

      for (const acc of machine.accessories) {
        if (acc.hidden) continue;
        if (cfg.selectedAccessories[acc.id]) {
          const qty = cfg.accessoryQuantities[acc.id] ?? 1;
          const multiplier = isShared ? sel.quantity : 1;
          items.push({
            name: acc.name,
            itemNumber: acc.itemNumber,
            quantity: qty * multiplier,
            unitPrice: acc.price,
            totalPrice: acc.price * qty * multiplier,
            indent: true,
          });
        }
      }
    }
    return items;
  }, [state.machineSelections, state.unitConfigs]);

  return {
    state,
    setStep,
    setDocumentType,
    setLanguage,
    setMachineSelections,
    updateUnitConfig,
    setDeliveryInfo,
    setCustomerInfo,
    priceSummary,
    lineItems,
  };
}
