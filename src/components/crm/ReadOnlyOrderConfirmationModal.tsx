/**
 * Read-only rendering of the persisted submitted-order snapshot. The same
 * frozen Configurator state drives the sent PDF, totals, and this view.
 */
import { FileText, X } from 'lucide-react';
import { formatMoney } from '@/data/machines';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { resolvePaymentTerms } from '@/lib/paymentTerms';
import { orderPurchaseReferenceSummary } from '@/lib/orderPurchaseReferences';
import { activeMachineDeliveryDates, commonMachineDeliveryDate } from '@/lib/configuratorDelivery';
import type { SavedConfiguration } from '@/lib/configurationsService';

interface Props {
  order: SavedConfiguration;
  onClose: () => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('da-DK'); } catch { return '—'; }
}

function deliveryMethodLabel(value: string): string {
  return ({ pickup: 'Afhentning', send: 'Fragt', deliver: 'Levering + opstart' } as Record<string, string>)[value] || '—';
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{value?.trim() || '—'}</dd>
    </div>
  );
}

export default function ReadOnlyOrderConfirmationModal({ order, onClose }: Props) {
  const state = order.state_json;
  let document: ReturnType<typeof buildSubmittedOrderDocument> | null = null;
  let documentError = '';
  try { document = buildSubmittedOrderDocument(state); }
  catch (error) { documentError = error instanceof Error ? error.message : 'Ordrebekræftelsen kunne ikke indlæses.'; }
  const lines = document?.lines ?? [];
  const totals = document?.totals;
  const reference = order.order_number || order.quote_number || order.id.slice(0, 8);
  const sentAt = order.order_sent_at || order.submitted_at || order.created_at;
  const money = (value: number) => formatMoney(value, state.language);
  const purchaseReferences = orderPurchaseReferenceSummary(state);
  const deliveryDates = activeMachineDeliveryDates(state);
  const commonDelivery = commonMachineDeliveryDate(state);
  const hasIndividualDeliveryDates = new Set(deliveryDates.filter(Boolean)).size > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-5">
      <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" aria-label={`Ordrebekræftelse ${reference}`}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-[#2d5a27]">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900">Ordrebekræftelse{order.confirmation_revision_number ? ` · Revision ${order.confirmation_revision_number}` : ''}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{order.confirmation_revision_number ? 'Seneste afsluttede revision.' : 'Oprindelig afsendt ordre.'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Luk ordrebekræftelse">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
          {documentError && <p role="alert" className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{documentError}</p>}
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <Detail label="Ordrenr." value={reference} />
            <Detail label="Dato" value={formatDate(sentAt)} />
            <Detail label="Forventet levering" value={commonDelivery ? formatDate(`${commonDelivery}T12:00:00`) : 'Individuelle datoer'} />
            <Detail label="Leveringsmetode" value={deliveryMethodLabel(state.deliveryMethod)} />
            <Detail label="Rekvisitionsnr. / PO nr." value={purchaseReferences.headerValue} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">Kunde</h4>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label="Firma" value={state.firmanavn} />
                <Detail label="Kontaktperson" value={state.kontaktperson} />
                <Detail label="Telefon" value={state.telefon} />
                <Detail label="E-mail udfylder" value={state.email} />
                <Detail label="E-mail modtager" value={state.emailRecipient} />
                <Detail label="Adresse" value={[state.address, state.postalCode, state.city, state.country].filter(Boolean).join(', ')} />
              </dl>
            </section>
            <section className="rounded-lg border border-slate-200 p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">Handels- og leveringsoplysninger</h4>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label="Betalingsbetingelser" value={resolvePaymentTerms(state.paymentTerms)} />
                <Detail label="Ønsket levering" value={commonDelivery ? formatDate(`${commonDelivery}T12:00:00`) : 'Individuelle datoer'} />
                <Detail label="Leveringsmetode" value={deliveryMethodLabel(state.deliveryMethod)} />
                <Detail label="Rekvisitionsnr. / PO nr." value={purchaseReferences.headerValue} />
                {state.alternativeDeliveryAddress && <Detail label="Alternativ leveringsadresse" value={state.alternativeDeliveryAddress} />}
                {state.comment && <Detail label="Kommentar" value={state.comment} />}
              </dl>
              {hasIndividualDeliveryDates && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Levering pr. maskine</p>
                  <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                    {deliveryDates.map((date, index) => (
                      <div key={`${index + 1}-${date}`}>Maskine {index + 1}: <span className="font-medium">{formatDate(`${date}T12:00:00`)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Ordrelinjer</div>
            <div className="hidden grid-cols-[7rem_minmax(12rem,1fr)_5rem_8rem_8rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <div>Varenr.</div><div>Beskrivelse</div><div className="text-right">Antal</div><div className="text-right">Enhedspris</div><div className="text-right">Linjetotal</div>
            </div>
            <div className="divide-y divide-slate-100">
              {lines.map((line, index) => (
                <div key={`${line.itemNo}-${index}`} className="grid gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[7rem_minmax(12rem,1fr)_5rem_8rem_8rem] sm:items-center">
                  <div className="font-mono text-xs text-slate-500">{line.itemNo}</div>
                  <div className="font-medium text-slate-900">
                    {line.description}<span className="ml-2 text-xs font-normal text-slate-500">{line.note}</span>
                    {line.purchaseReferences?.length ? (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">REK./PO: {line.purchaseReferences.join(', ')}</span>
                    ) : null}
                  </div>
                  <div className="text-right tabular-nums text-slate-700">{line.quantity}</div>
                  <div className="text-right tabular-nums text-slate-700">{money(line.unitPrice)}</div>
                  <div className="text-right font-semibold tabular-nums text-slate-900">{money(line.total)}</div>
                </div>
              ))}
            </div>
            {totals && <div className="space-y-1 border-t border-slate-200 bg-white px-4 py-3 text-sm">
              <div className="flex justify-end gap-6"><span className="text-slate-500">Subtotal</span><span className="w-32 text-right font-semibold tabular-nums">{money(totals.subtotal)}</span></div>
              <div className="flex justify-end gap-6"><span className="text-slate-500">Rabat</span><span className="w-32 text-right font-semibold tabular-nums">{money(totals.totalDiscount)}</span></div>
              <div className="flex justify-end gap-6 text-base"><span className="font-bold text-slate-900">Total ekskl. moms</span><span className="w-32 text-right font-bold tabular-nums text-slate-900">{money(totals.finalPrice)}</span></div>
            </div>}
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Luk</button>
        </footer>
      </section>
    </div>
  );
}
