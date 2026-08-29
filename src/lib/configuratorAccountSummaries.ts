import { getAccessoriesFlat, getLocalizedName, getPrice, PRODUCTS } from '@/data/machines';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { mapUiLanguageToLegacy } from '@/lib/portalLanguages';
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
  deliveryDate: string | null;
  deliveryMethod: string | null;
  machineLabel: string;
}

export interface AccountCaseLine {
  itemNo: string;
  description: string;
  note: string;
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

function getSelectedAccessoryIds(state: ConfiguratorState, machineId: string): string[] {
  const machine = state.machineConfigs.find((config) => config.id === machineId);
  if (!machine) return [];
  if (machine.configMode === 'shared') return machine.acc || [];

  const ids = new Set<string>();
  Object.entries(state.individualUnitConfigs || {}).forEach(([key, value]) => {
    if (!key.startsWith(`${machineId}_`)) return;
    (value?.acc || []).forEach((id) => ids.add(id));
  });
  return Array.from(ids);
}

export function getAccountCaseStatusGroup(item: Pick<AccountCaseLike, 'case_status'>): AccountCaseStatusFilter {
  if (item.case_status === 'aktiv') return 'active';
  if (item.case_status === 'pause') return 'paused';
  if (item.case_status === 'ordre_afgivet') return 'sent';
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
    status: item.case_status,
    statusGroup: getAccountCaseStatusGroup(item),
    typeLabel: item.case_type,
    totalPrice: totals.finalPrice,
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

export function buildAccountCaseLines(state: ConfiguratorState, language: string): AccountCaseLine[] {
  const legacyLang = normalizeLang(language);
  const lines: AccountCaseLine[] = [];

  state.machineConfigs.forEach((machine) => {
    const product = PRODUCTS[machine.type];
    const quantity = Math.max(1, machine.qty || 1);
    const unitPrice = product ? getPrice(product, legacyLang) : 0;

    lines.push({
      itemNo: product?.varenr || machine.type,
      description: product ? getLocalizedName(product.name, legacyLang) : machine.type,
      note: configurationModeLabel(machine.configMode, language),
      unitPrice,
      quantity,
      total: unitPrice * quantity,
    });

    const selectedIds = getSelectedAccessoryIds(state, machine.id);
    const accessories = getAccessoriesFlat(machine.type)
      .filter((accessory) => selectedIds.includes(accessory.id) && !accessory.isHeader);

    accessories.forEach((accessory) => {
      const qtyKey = `${machine.id}_${accessory.id}`;
      const qty = Math.max(1, state.accQty?.[qtyKey] || 1);
      const accessoryPrice = getPrice(accessory, legacyLang);
      lines.push({
        itemNo: String(accessory.varenr || accessory.id),
        description: getLocalizedName(accessory.name, legacyLang),
        note: machine.type,
        unitPrice: accessoryPrice,
        quantity: qty,
        total: accessoryPrice * qty,
      });
    });
  });

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
