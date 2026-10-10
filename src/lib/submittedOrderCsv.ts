import { lineDeliveryDates } from '@/lib/configuratorDelivery';
import { configuratorCurrency, hasFrozenConfiguratorPricing } from '@/lib/configuratorPricing';
import { roundPricingMoney } from '@/lib/calcConfiguration';
import type { ConfiguratorLineDiscountApplication, ConfiguratorState } from '@/types/configurator';

export const SUBMITTED_ORDER_CSV_DELIMITER = ';';
export const SUBMITTED_ORDER_CSV_MIME_TYPE = 'text/csv; charset=utf-8';

export const SUBMITTED_ORDER_CSV_HEADERS = [
  'OrderNumber', 'OrderDate', 'DocumentCurrency', 'DealerNumber', 'DealerName', 'CustomerName', 'SellerInitials',
  'MachineGroup', 'LineNumber', 'SKU', 'Description', 'Quantity', 'UnitListPrice', 'LineGrossAmount',
  'StandardDiscountPct', 'QuantityDiscountPct', 'DeliveryDiscountPct', 'ExtraDealerDiscountPct',
  'CampaignDiscountPct', 'DemoDiscountPct', 'DirectExtraDiscountPct', 'NAVBaseDiscountPct',
  'NetAfterNAVBaseDiscount', 'NetAfterExtraDiscount', 'FinalLineNetAmount',
  'RequestedDeliveryDate', 'ConfirmedDeliveryDate', 'SerialNumber', 'ERPReference',
  'OrderGrossTotal', 'StandardDiscountTotal', 'QuantityDiscountTotal', 'DeliveryDiscountTotal',
  'ExtraDealerDiscountTotal', 'CampaignDiscountTotal', 'DemoDiscountTotal', 'DirectExtraDiscountTotal',
  'OrderNetTotal', 'CSVMatchesOrderTotal',
] as const;

type DiscountKind = NonNullable<ConfiguratorLineDiscountApplication['kind']>;

export interface SubmittedOrderCsvInput {
  state: ConfiguratorState;
  orderNumber: string;
  orderDate: string;
  dealerNumber: string | null;
  dealerName: string | null;
  sellerInitials: string | null;
  confirmedDeliveryDate?: string | null;
  serialNumbersByUnit?: Record<number, string>;
  erpReferencesByUnit?: Record<number, string>;
}

export interface SubmittedOrderCsvFile {
  filename: string;
  mimeType: typeof SUBMITTED_ORDER_CSV_MIME_TYPE;
  delimiter: typeof SUBMITTED_ORDER_CSV_DELIMITER;
  encoding: 'UTF-8-BOM';
  content: string;
  base64: string;
  lineCount: number;
  matchesOrderTotal: boolean;
}

/** Sequential equivalent used by C5/NAV. Input and output are percentages. */
export function sequentialEquivalentDiscountPct(...percentages: number[]): number {
  const retained = percentages.reduce((factor, percentage) => (
    factor * (1 - Math.min(100, Math.max(0, percentage || 0)) / 100)
  ), 1);
  return (1 - retained) * 100;
}

function applicationPct(applications: ConfiguratorLineDiscountApplication[], kind: DiscountKind): number {
  return sequentialEquivalentDiscountPct(...applications.filter(item => item.kind === kind).map(item => item.percent));
}

function applicationAmount(applications: ConfiguratorLineDiscountApplication[], kinds: DiscountKind[]): number {
  return roundPricingMoney(applications
    .filter(item => kinds.includes(item.kind))
    .reduce((total, item) => total + item.amount, 0));
}

function csvText(value: unknown): string {
  const plain = String(value ?? '');
  const formulaSafe = /^[=+@-]/.test(plain) ? `'${plain}` : plain;
  return /[;"\r\n]/.test(formulaSafe) ? `"${formulaSafe.replace(/"/g, '""')}"` : formulaSafe;
}

function money(value: number): string {
  return roundPricingMoney(value).toFixed(2).replace('.', ',');
}

function percent(value: number): string {
  return value.toFixed(4).replace('.', ',');
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function machineGroupByUnit(state: ConfiguratorState): Map<number, string> {
  const groups = new Map<number, string>();
  let unitNumber = 0;
  for (const machine of state.machineConfigs) {
    for (let index = 0; index < Math.max(0, machine.qty); index += 1) {
      groups.set(++unitNumber, machine.type);
    }
  }
  return groups;
}

function totalByKind(applications: ConfiguratorLineDiscountApplication[][], kind: DiscountKind): number {
  return roundPricingMoney(applications.flat().filter(item => item.kind === kind).reduce((total, item) => total + item.amount, 0));
}

export function buildSubmittedOrderCsv(input: SubmittedOrderCsvInput): SubmittedOrderCsvFile {
  const { state } = input;
  if (!hasFrozenConfiguratorPricing(state) || !state.pricingSnapshot?.lines || !state.pricingSnapshot.totals) {
    throw new Error('CSV kræver et komplet, frosset ordre-snapshot.');
  }
  if (!input.orderNumber.trim()) throw new Error('CSV kræver et canonical ordrenummer.');

  const lines = state.pricingSnapshot.lines;
  const allApplications = lines.map(line => line.discountApplications ?? []);
  if (lines.some(line => !Number.isFinite(line.finalNetAmount))) {
    throw new Error('CSV kræver canonical linjenet og rabatfordeling fra ordre-snapshotet.');
  }

  const groups = machineGroupByUnit(state);
  const totals = state.pricingSnapshot.totals;
  const grossLineTotal = roundPricingMoney(lines.reduce((sum, line) => sum + line.total, 0));
  const finalLineTotal = roundPricingMoney(lines.reduce((sum, line) => sum + Number(line.finalNetAmount), 0));
  const allocatedDiscountTotal = roundPricingMoney(allApplications.flat().reduce((sum, item) => sum + item.amount, 0));
  const matchesOrderTotal = Math.abs(grossLineTotal - totals.subtotal) < 0.005
    && Math.abs(allocatedDiscountTotal - totals.totalDiscount) < 0.005
    && Math.abs(finalLineTotal - totals.finalPrice) < 0.005;
  if (!matchesOrderTotal) {
    throw new Error(`CSV-linjer (${finalLineTotal}) matcher ikke ordretotalen (${totals.finalPrice}).`);
  }

  const orderTotals = {
    gross: totals.subtotal,
    base: roundPricingMoney(totalByKind(allApplications, 'base') + totalByKind(allApplications, 'sales_stock_base') + totalByKind(allApplications, 'sales_stock')),
    quantity: totalByKind(allApplications, 'quantity'),
    delivery: totalByKind(allApplications, 'delivery'),
    dealer: totalByKind(allApplications, 'dealer'),
    campaign: totalByKind(allApplications, 'campaign'),
    demo: totalByKind(allApplications, 'demo'),
    direct: totalByKind(allApplications, 'direct'),
    net: totals.finalPrice,
  };
  const orderDate = input.orderDate.slice(0, 10);
  const currency = configuratorCurrency(state);

  const records = lines.map((line, index) => {
    const applications = line.discountApplications ?? [];
    const standardPct = sequentialEquivalentDiscountPct(applicationPct(applications, 'base'), applicationPct(applications, 'sales_stock_base'), applicationPct(applications, 'sales_stock'));
    const quantityPct = applicationPct(applications, 'quantity');
    const deliveryPct = applicationPct(applications, 'delivery');
    const extraPct = applicationPct(applications, 'dealer');
    const campaignPct = applicationPct(applications, 'campaign');
    const demoPct = applicationPct(applications, 'demo');
    const directPct = applicationPct(applications, 'direct');
    const navBasePct = demoPct > 0
      ? demoPct
      : sequentialEquivalentDiscountPct(standardPct, quantityPct, deliveryPct);
    const navBaseAmount = applicationAmount(applications, demoPct > 0
      ? ['demo']
      : ['base', 'sales_stock_base', 'sales_stock', 'quantity', 'delivery']);
    const extraAmount = applicationAmount(applications, ['dealer', 'direct']);
    const netAfterNavBase = roundPricingMoney(line.total - navBaseAmount);
    const netAfterExtra = roundPricingMoney(netAfterNavBase - extraAmount);
    const unitNumber = line.unitNumber;
    const dates = unitNumber ? lineDeliveryDates(state, unitNumber, line.itemNo) : [state.date];
    if (new Set(dates).size > 1) {
      throw new Error(`C5/NAV CSV kan ikke repræsentere flere leveringsdatoer på den samme mængdelinje: ${line.itemNo}. Portalens enhedsdatoer er bevaret.`);
    }

    return [
      input.orderNumber, orderDate, currency, input.dealerNumber, input.dealerName, state.firmanavn, input.sellerInitials,
      unitNumber ? groups.get(unitNumber) ?? '' : '', index + 1, line.itemNo, line.description, line.quantity,
      money(line.unitPrice), money(line.total), percent(standardPct), percent(quantityPct), percent(deliveryPct), percent(extraPct),
      percent(campaignPct), percent(demoPct), percent(directPct), percent(navBasePct),
      money(netAfterNavBase), money(netAfterExtra), money(Number(line.finalNetAmount)),
      dates[0] ?? state.date, input.confirmedDeliveryDate ?? '',
      unitNumber ? input.serialNumbersByUnit?.[unitNumber] ?? state.salesStockAssets?.find(asset => asset.configuratorUnitNumber === unitNumber)?.serialNumber ?? '' : '',
      unitNumber ? input.erpReferencesByUnit?.[unitNumber] ?? state.salesStockAssets?.find(asset => asset.configuratorUnitNumber === unitNumber)?.sourceOrderNumber ?? '' : '',
      money(orderTotals.gross), money(orderTotals.base), money(orderTotals.quantity), money(orderTotals.delivery),
      money(orderTotals.dealer), money(orderTotals.campaign), money(orderTotals.demo), money(orderTotals.direct),
      money(orderTotals.net), matchesOrderTotal ? 'YES' : 'NO',
    ];
  });

  const content = `\uFEFF${[SUBMITTED_ORDER_CSV_HEADERS, ...records]
    .map(row => row.map(csvText).join(SUBMITTED_ORDER_CSV_DELIMITER))
    .join('\r\n')}\r\n`;
  const safeOrderNumber = input.orderNumber.replace(/[^A-Za-z0-9_-]+/g, '_');

  return {
    filename: `Timan_Order_${safeOrderNumber}_${orderDate}.csv`,
    mimeType: SUBMITTED_ORDER_CSV_MIME_TYPE,
    delimiter: SUBMITTED_ORDER_CSV_DELIMITER,
    encoding: 'UTF-8-BOM',
    content,
    base64: utf8Base64(content),
    lineCount: lines.length,
    matchesOrderTotal,
  };
}
