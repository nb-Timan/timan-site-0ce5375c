import { FileText, X } from 'lucide-react';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t as portalT } from '@/lib/i18n/translations';
import { buildReadOnlySalesDocument } from '@/lib/submittedOrderConfirmation';
import { getPaymentTermsDocumentValue } from '@/lib/paymentTerms';
import { orderPurchaseReferenceSummary } from '@/lib/orderPurchaseReferences';
import { activeMachineDeliveryDates, commonMachineDeliveryDate, formatDeliveryDestination, resolveDeliveryDestination } from '@/lib/configuratorDelivery';
import { configuratorCurrency } from '@/lib/configuratorPricing';
import {
  buildAccountOrderDiscountRows,
  hasCompleteHistoricalDiscountBreakdown,
  type AccountCaseLine,
} from '@/lib/configuratorAccountSummaries';
import type { SavedConfiguration } from '@/lib/configurationsService';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { timanCompanyLegalLine } from '../../../supabase/functions/_shared/timanCompanyProfile';

export type ReadOnlySalesDocumentType = 'quote' | 'order';

interface Props {
  document: SavedConfiguration;
  documentType: ReadOnlySalesDocumentType;
  onClose: () => void;
  language?: PortalUiLanguage;
}

const DATE_LOCALES: Record<PortalUiLanguage, string> = {
  da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU',
  sv: 'sv-SE', fr: 'fr-FR', pl: 'pl-PL', cs: 'cs-CZ',
};

function formatDate(value: string | null | undefined, language: PortalUiLanguage): string {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString(DATE_LOCALES[language]); } catch { return '—'; }
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{value?.trim() || '—'}</dd>
    </div>
  );
}

type LineLabels = { itemNo: string; description: string; quantity: string; unitPrice: string; total: string };

function LineHeader({ labels }: { labels: LineLabels }) {
  return (
    <div className="hidden grid-cols-[7rem_minmax(12rem,1fr)_5rem_8rem_8rem] gap-3 border-b border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
      <div>{labels.itemNo}</div><div>{labels.description}</div><div className="text-right">{labels.quantity}</div><div className="text-right">{labels.unitPrice}</div><div className="text-right">{labels.total}</div>
    </div>
  );
}

function LineRows({ lines, money, labels }: { lines: AccountCaseLine[]; money: (value: number) => string; labels: LineLabels }) {
  return (
    <div className="divide-y divide-slate-100">
      {lines.map((line, index) => (
        <div key={`${line.unitNumber ?? 'other'}-${line.itemNo}-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[7rem_minmax(12rem,1fr)_5rem_8rem_8rem] sm:items-center">
          <div className="min-w-0 font-mono text-xs text-slate-500">{line.itemNo}</div>
          <div className="col-span-2 min-w-0 break-words font-medium text-slate-900 sm:col-span-1">
            {line.description}<span className="ml-2 text-xs font-normal text-slate-500">{line.note}</span>
            <span className="mt-1 block text-xs font-normal text-slate-500 sm:hidden">{labels.quantity} {line.quantity} · {labels.unitPrice} {money(line.unitPrice)}</span>
          </div>
          <div className="hidden text-right tabular-nums text-slate-700 sm:block">{line.quantity}</div>
          <div className="hidden text-right tabular-nums text-slate-700 sm:block">{money(line.unitPrice)}</div>
          <div className="col-start-2 row-start-1 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900 sm:col-auto sm:row-auto">{money(line.total)}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReadOnlySalesDocumentModal({ document: saved, documentType, onClose, language }: Props) {
  const { uiLanguage: contextLanguage } = useOptionalLanguage();
  const uiLanguage = language ?? contextLanguage;
  const tx = (key: string) => portalT(key, uiLanguage);
  const state = saved.state_json;
  let salesDocument: ReturnType<typeof buildReadOnlySalesDocument> | null = null;
  let documentError = '';
  try { salesDocument = buildReadOnlySalesDocument(state); }
  catch (error) { documentError = error instanceof Error ? error.message : 'The historical document could not be loaded.'; }

  const lines = salesDocument?.lines ?? [];
  const machineGroups = salesDocument?.machineGroups ?? [];
  const ungroupedLines = salesDocument?.ungroupedLines ?? lines;
  const totals = salesDocument?.totals;
  const isOrder = documentType === 'order';
  const reference = (isOrder ? saved.order_number : saved.quote_number) || saved.id.slice(0, 8);
  const sentAt = isOrder
    ? saved.order_sent_at || saved.submitted_at || saved.created_at
    : saved.quote_sent_at || saved.last_saved_at || saved.created_at;
  const currency = configuratorCurrency(state);
  const money = (value: number) => new Intl.NumberFormat(DATE_LOCALES[uiLanguage], {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2,
  }).format(value);
  const lineLabels: LineLabels = {
    itemNo: tx('salesItemNo'), description: tx('salesDescription'), quantity: tx('salesQuantity'),
    unitPrice: tx('salesUnitPrice'), total: tx('salesLineTotal'),
  };
  const purchaseReferences = orderPurchaseReferenceSummary(state);
  const deliveryDates = activeMachineDeliveryDates(state);
  const commonDelivery = commonMachineDeliveryDate(state);
  const hasIndividualDeliveryDates = new Set(deliveryDates.filter(Boolean)).size > 1;
  const discountRows = totals ? buildAccountOrderDiscountRows(state.pricingSnapshot, totals.totalDiscount, uiLanguage) : [];
  const hasDetailedDiscounts = totals
    ? hasCompleteHistoricalDiscountBreakdown(state.pricingSnapshot, totals.totalDiscount)
    : true;
  const componentDiscountRows = hasDetailedDiscounts ? discountRows : [];
  const pricingContexts = [
    state.pricingMode === 'direct' ? tx('salesDirectPricing') : null,
    state.partnerAccountType === 'importer' ? tx('salesImporterPricing') : null,
    (state.pricingSnapshot?.discountDetails?.some(detail => detail.kind === 'demo')
      || Object.values(state.demoMachines ?? {}).some(Boolean)) ? tx('salesDemoPricing') : null,
  ].filter((value): value is string => Boolean(value));
  const deliveryMethod = ({ pickup: tx('salesPickup'), send: tx('salesFreight'), deliver: tx('salesDeliveryStartup') } as Record<string, string>)[state.deliveryMethod] || '—';
  const deliveryDestination = resolveDeliveryDestination(state);
  const title = tx(isOrder ? 'salesOrderConfirmation' : 'salesQuoteConfirmation');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-5">
      <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" aria-label={`${title} ${reference}`}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-[#2d5a27]">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold text-slate-900">{title}{saved.confirmation_revision_number ? ` · Revision ${saved.confirmation_revision_number}` : ''}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{saved.confirmation_revision_number ? tx('salesLatestRevision') : tx(isOrder ? 'salesOriginalOrder' : 'salesSavedQuote')}</p>
              {pricingContexts.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{pricingContexts.map(context => <span key={context} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{context}</span>)}</div>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={tx('salesClose')}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 space-y-5 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
          {documentError && <p role="alert" className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{documentError}</p>}
          <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <Detail label={tx(isOrder ? 'salesOrderNo' : 'salesQuoteNo')} value={reference} />
            <Detail label={tx('salesDate')} value={formatDate(sentAt, uiLanguage)} />
            <Detail label={tx('salesExpectedDelivery')} value={commonDelivery ? formatDate(`${commonDelivery}T12:00:00`, uiLanguage) : tx('salesIndividualDates')} />
            <Detail label={tx('salesDeliveryMethod')} value={deliveryMethod} />
            <Detail label={tx('salesPurchaseOrder')} value={purchaseReferences.headerValue} />
            <Detail label={tx('salesIssuer')} value={salesDocument ? timanCompanyLegalLine() : null} />
          </dl>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">{tx('salesCustomer')}</h4>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label={tx('salesCompany')} value={state.firmanavn} />
                <Detail label={tx('salesContact')} value={state.kontaktperson} />
                <Detail label={tx('salesPhone')} value={state.telefon} />
                <Detail label={tx('salesFillerEmail')} value={state.email} />
                <Detail label={tx('salesRecipientEmail')} value={state.emailRecipient} />
                <Detail label={tx('salesAddress')} value={[state.address, state.postalCode, state.city, state.country].filter(Boolean).join(', ')} />
              </dl>
            </section>
            <section className="rounded-lg border border-slate-200 p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">{tx('salesTradeDelivery')}</h4>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label={tx('salesPaymentTerms')} value={getPaymentTermsDocumentValue(state.paymentTerms)} />
                <Detail label={tx('salesDesiredDelivery')} value={commonDelivery ? formatDate(`${commonDelivery}T12:00:00`, uiLanguage) : tx('salesIndividualDates')} />
                <Detail label={tx('salesDeliveryMethod')} value={deliveryMethod} />
                <Detail label={tx('salesPurchaseOrder')} value={purchaseReferences.headerValue} />
                <Detail
                  label={tx('salesAlternativeAddress')}
                  value={formatDeliveryDestination(deliveryDestination) || '—'}
                />
                {state.comment && <Detail label={tx('salesComment')} value={state.comment} />}
              </dl>
              {hasIndividualDeliveryDates && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tx('salesMachineDelivery')}</p>
                  <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                    {deliveryDates.map((date, index) => <div key={`${index + 1}-${date}`}>{tx('salesMachine')} {index + 1}: <span className="font-medium">{formatDate(`${date}T12:00:00`, uiLanguage)}</span></div>)}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{tx(isOrder ? 'salesOrderLines' : 'salesQuoteLines')}</div>
            <div className="space-y-4 bg-slate-50/40 p-3 sm:p-4">
              {machineGroups.map(group => (
                <section key={`${group.machineConfigId}-${group.unitNumber}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <h5 className="break-words text-sm font-semibold text-slate-900">{tx('salesMachine')} {group.unitNumber} – {group.title}</h5>
                    <dl className="mt-1 grid gap-x-5 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
                      <div><dt className="inline font-medium">{tx('salesPurchaseOrder')}:</dt> <dd className="inline">{group.purchaseReference || '—'}</dd></div>
                      <div><dt className="inline font-medium">{tx('salesDesiredDelivery')}:</dt> <dd className="inline">{formatDate(group.deliveryDate ? `${group.deliveryDate}T12:00:00` : null, uiLanguage)}</dd></div>
                    </dl>
                  </div>
                  <LineHeader labels={lineLabels} />
                  <LineRows lines={group.lines} money={money} labels={lineLabels} />
                  <div className="flex min-w-0 justify-end gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-sm">
                    <span className="min-w-0 break-words text-slate-600">{tx('salesMachineSubtotal')} {group.unitNumber}</span>
                    <span className="w-32 shrink-0 text-right font-semibold tabular-nums text-slate-900">{money(group.subtotal)}</span>
                  </div>
                </section>
              ))}
              {ungroupedLines.length > 0 && (
                <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {machineGroups.length > 0 && <h5 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{tx('salesOtherLines')}</h5>}
                  <LineHeader labels={lineLabels} />
                  <LineRows lines={ungroupedLines} money={money} labels={lineLabels} />
                </section>
              )}
            </div>
            {totals && <div className="space-y-1.5 border-t border-slate-200 bg-white px-4 py-3 text-sm">
              <div className="flex min-w-0 justify-end gap-4 sm:gap-6"><span className="min-w-0 break-words text-slate-500">{tx('salesGrossTotal')}</span><span className="w-32 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">{money(totals.subtotal)}</span></div>
              {componentDiscountRows.map(row => <div key={row.label} className="flex min-w-0 justify-end gap-4 sm:gap-6"><span className="min-w-0 break-words text-slate-500">{row.label}</span><span className="w-32 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">{row.amount > 0 ? '-' : ''}{money(row.amount)}</span></div>)}
              {!hasDetailedDiscounts && totals.totalDiscount > 0 && <p className="ml-auto max-w-xl py-1 text-right text-xs text-amber-700">{tx('salesHistoricalBreakdownMissing')}</p>}
              {totals.totalDiscount > 0 && <div className="flex min-w-0 justify-end gap-4 border-t border-slate-100 pt-1.5 sm:gap-6"><span className="min-w-0 break-words text-slate-500">{portalT('accountOrderTotalDiscount', uiLanguage)}</span><span className="w-32 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">-{money(totals.totalDiscount)}</span></div>}
              <div className="flex min-w-0 justify-end gap-4 border-t border-slate-200 pt-1.5 text-base sm:gap-6"><span className="min-w-0 break-words font-bold text-slate-900">{tx('salesTotalExVat')}</span><span className="w-32 shrink-0 whitespace-nowrap text-right font-bold tabular-nums text-slate-900">{money(totals.finalPrice)}</span></div>
            </div>}
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{tx('salesClose')}</button>
        </footer>
      </section>
    </div>
  );
}
