import { getAccessoriesFlat, getLocalizedName, getPrice, PRODUCTS } from '@/data/machines';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { mapUiLanguageToLegacy } from '@/lib/portalLanguages';
import { hasFrozenConfiguratorPricing, snapshotAccessoryPrice, snapshotDemoFee, snapshotMachinePrice, snapshotStartupPrice } from '@/lib/configuratorPricing';
import { shouldIncludeQuantityAccessory } from '@/lib/looseToolDependencies';
import { machinePurchaseReference } from '@/lib/orderPurchaseReferences';
import type { ConfiguratorState, Language } from '@/types/configurator';

export type AccountCaseStatusFilter = 'all' | 'active' | 'sent' | 'paused';

export interface AccountCaseLike {
  id: string;
  title: string;
  case_type: 'quote' | 'order';
  case_status: string;
  state_json: ConfiguratorState;
  created_at: string;
  created_case_at: string | null;
  submitted_at: string | null;
  last_saved_at: string;
  quote_number: string | null;
  order_number: string | null;
  order_sent_at: string | null;
  seller_name: string | null;
  seller_email: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
}

export interface AccountCaseSummary {
  id: string;
  reference: string;
  orderDate: string | null;
  latestChange: string | null;
  customerName: string;
  contactName: string;
  customerEmail: string;
  customerPhone: string;
  dealerName: string;
  dealerNumber: string | null;
  sellerName: string;
  sellerEmail: string;
  status: string;
  statusGroup: AccountCaseStatusFilter;
  typeLabel: 'quote' | 'order';
  totalPrice: number;
  currencyLanguage: Language;
  deliveryDate: string | null;
  deliveryMethod: string | null;
  machineLabel: string;
}

export interface AccountCaseLine {
  unitNumber?: number;
  itemNo: string;
  description: string;
  note: string;
  purchaseReferences?: string[];
  unitPrice: number;
  quantity: number;
  total: number;
}

function normalizeLang(language: string): Language {
  return mapUiLanguageToLegacy(language) as Language;
}

function configurationModeLabel(mode: string, language: string): string {
  const labels: Record<string, Record<string, string>> = {
    shared: { da: 'Fælles valg', en: 'Shared choices', de: 'Gemeinsame Auswahl', it: 'Scelte condivise', hu: 'Közös választások', sv: 'Gemensamma val', fr: 'Choix partagés', pl: 'Wspólne wybory', cs: 'Společné volby' },
    individual: { da: 'Individuelle valg', en: 'Individual choices', de: 'Individuelle Auswahl', it: 'Scelte individuali', hu: 'Egyedi választások', sv: 'Individuella val', fr: 'Choix individuels', pl: 'Wybory indywidualne', cs: 'Individuální volby' },
  };
  return labels[mode]?.[language] || labels[mode]?.[normalizeLang(language)] || mode;
}

function isAccountCaseSent(item: Pick<AccountCaseLike, 'case_status' | 'submitted_at' | 'order_sent_at'>): boolean {
  return Boolean(item.order_sent_at || item.submitted_at || item.case_status === 'ordre_afgivet');
}

export function getAccountCaseStatusGroup(item: Pick<AccountCaseLike, 'case_status' | 'submitted_at' | 'order_sent_at'>): AccountCaseStatusFilter {
  if (isAccountCaseSent(item)) return 'sent';
  if (item.case_status === 'aktiv') return 'active';
  if (item.case_status === 'pause') return 'paused';
  return 'all';
}

export function buildAccountCaseSummary(item: AccountCaseLike, language: string): AccountCaseSummary {
  const legacyLang = normalizeLang(language);
  const totals = calcConfigurationTotals(item.state_json);
  const firstMachine = item.state_json.machineConfigs?.[0] ?? null;
  const machineCount = item.state_json.machineConfigs?.reduce((sum, config) => sum + (config.qty || 0), 0) ?? 0;
  const machineLabel = firstMachine
    ? `${firstMachine.type}${machineCount > 1 ? ` +${machineCount - 1}` : ''}`
    : '-';

  return {
    id: item.id,
    reference: item.order_number || item.quote_number || item.id.slice(0, 8),
    orderDate: item.order_sent_at || item.submitted_at || item.created_case_at || item.created_at || null,
    latestChange: item.last_saved_at || null,
    customerName: item.state_json.firmanavn || item.title || '-',
    contactName: item.state_json.kontaktperson || '-',
    customerEmail: item.state_json.email || item.state_json.emailRecipient || '-',
    customerPhone: item.state_json.telefon || '-',
    dealerName: item.dealer_name || '-',
    dealerNumber: item.dealer_number,
    sellerName: item.seller_name || '-',
    sellerEmail: item.seller_email || '-',
    status: isAccountCaseSent(item) ? 'ordre_afgivet' : item.case_status,
    statusGroup: getAccountCaseStatusGroup(item),
    typeLabel: isAccountCaseSent(item) ? 'order' : item.case_type,
    totalPrice: totals.finalPrice,
    // Saved configurations retain their own commercial currency when the portal UI changes language.
    currencyLanguage: item.state_json.language || legacyLang,
    deliveryDate: item.state_json.date || null,
    deliveryMethod: item.state_json.deliveryMethod || null,
    machineLabel,
  };
}

export function filterAccountCases<T extends AccountCaseLike>(
  items: T[],
  statusFilter: AccountCaseStatusFilter,
  search: string,
): T[] {
  const normalizedSearch = search.trim().toLowerCase();
  return items.filter((item) => {
    if (statusFilter !== 'all' && getAccountCaseStatusGroup(item) !== statusFilter) return false;
    if (!normalizedSearch) return true;

    const summary = buildAccountCaseSummary(item, 'en');
    return [
      summary.reference,
      summary.customerName,
      summary.dealerName,
      summary.dealerNumber ?? '',
      item.title,
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });
}

export function buildAccountCaseLines(
  state: ConfiguratorState,
  language: string,
  sourceLanguage: Language = state.language,
): AccountCaseLine[] {
  if (hasFrozenConfiguratorPricing(state) && state.pricingSnapshot?.lines) {
    return state.pricingSnapshot.lines.map(line => {
      const reference = line.unitNumber ? machinePurchaseReference(state, line.unitNumber) : null;
      return { ...line, purchaseReferences: reference ? [reference] : [] };
    });
  }
  const legacyLang = normalizeLang(language);
  const frozen = hasFrozenConfiguratorPricing(state);
  const lines: AccountCaseLine[] = [];
  let machineUnitNumber = 0;

  state.machineConfigs.forEach((machine) => {
    const product = PRODUCTS[machine.type];
    const quantity = Math.max(0, machine.qty || 0);
    const unitPrice = product
      ? snapshotMachinePrice(state, machine.type, frozen ? Number.NaN : getPrice(product, sourceLanguage))
      : Number.NaN;
    for (let unit = 1; unit <= quantity; unit += 1) {
      machineUnitNumber += 1;
      const reference = machinePurchaseReference(state, machineUnitNumber);
      const purchaseReferences = reference ? [reference] : [];
      const configKey = machine.configMode === 'shared' ? machine.id : `${machine.id}_${unit}`;

      lines.push({
        unitNumber: machineUnitNumber,
        itemNo: product?.varenr || machine.type,
        description: product ? getLocalizedName(product.name, legacyLang) : machine.type,
        note: configurationModeLabel(machine.configMode, language),
        purchaseReferences,
        unitPrice,
        quantity: 1,
        total: unitPrice,
      });

      // Ignore stale unit drafts beyond the saved machine quantity (e.g. m0_2).
      const selectedIds = machine.configMode === 'shared'
        ? machine.acc ?? []
        : state.individualUnitConfigs?.[configKey]?.acc ?? [];
      const accessories = getAccessoriesFlat(machine.type)
        .filter((accessory) => !accessory.isHeader && (selectedIds.includes(accessory.id)
          || shouldIncludeQuantityAccessory(machine.type, accessory, selectedIds, state.accQty?.[`${configKey}_${accessory.id}`] ?? 0)));

      accessories.forEach((accessory) => {
        const qtyKey = `${configKey}_${accessory.id}`;
        const qty = Math.max(1, state.accQty?.[qtyKey] || 1);
        const accessoryPrice = snapshotAccessoryPrice(
          state,
          machine.type,
          accessory,
          frozen ? Number.NaN : getPrice(accessory, sourceLanguage),
        );
        lines.push({
          unitNumber: machineUnitNumber,
          itemNo: String(accessory.varenr || accessory.id),
          description: getLocalizedName(accessory.name, legacyLang),
          note: machine.type,
          purchaseReferences,
          unitPrice: accessoryPrice,
          quantity: qty,
          total: accessoryPrice * qty,
        });
      });
      if (state.demoMachines?.[`${product?.varenr}_${machineUnitNumber}`]) {
        const fee = frozen ? state.pricingSnapshot?.prices[`demo:${sourceLanguage}`] ?? Number.NaN : snapshotDemoFee(state, sourceLanguage);
        lines.push({ unitNumber: machineUnitNumber, itemNo: 'DEMO', description: 'Demo', note: machine.type, purchaseReferences, unitPrice: fee, quantity: 1, total: fee });
      }
    }
  });

  if (state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    const option = state.deliveryDeliverStartup;
    const fallback = option === 'no_bridge' ? (sourceLanguage === 'da' ? 1500 : 200)
      : option === 'with_bridge' ? (sourceLanguage === 'da' ? 2500 : 335) : 0;
    const price = snapshotStartupPrice(state, sourceLanguage, option, frozen ? Number.NaN : fallback);
    lines.push({ itemNo: '795050', description: 'Levering / opstart', note: option, unitPrice: price, quantity: 1, total: price });
  }

  return lines;
}

export function buildReorderDraft(state: ConfiguratorState): ConfiguratorState {
  return {
    ...state,
    step: 1,
    flowType: 'order',
    internalNote: '',
    comment: state.comment || '',
  };
}
