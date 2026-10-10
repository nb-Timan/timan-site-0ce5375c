import { useEffect, useId, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { LoanCaseSummary, LoanOverviewInfo } from '@/lib/loanService';
import { loanStatusTranslationKey } from '@/lib/loanDomain';

export type LoanOverviewInfoLoader = (caseId: string) => Promise<LoanOverviewInfo>;
type InfoKind = 'assets' | 'delivery' | 'notes';
const titles: Record<InfoKind, string> = { assets: 'loansInfoAssets', delivery: 'loansInfoDelivery', notes: 'loansInfoNotes' };

export default function LoanOverviewInfoPopover({ item, kind, label, loadInfo }: {
  item: LoanCaseSummary; kind: InfoKind; label: (key: string) => string; loadInfo: LoanOverviewInfoLoader;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LoanOverviewInfo | null>(null);
  const [error, setError] = useState(false);
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const mode = useRef<'hover' | 'focus' | 'click' | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const suppressFocus = useRef(false);
  const restoreFocus = useRef(false);
  const title = label(titles[kind]);
  const text = kind === 'assets' ? item.loan_number : kind === 'delivery' ? item.partner_name : item.responsible_name;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(null); setError(false);
    void loadInfo(item.id).then((info) => { if (active) setData(info); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [open, item.id, item.updated_at, loadInfo]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = () => {
    cancelClose(); restoreFocus.current = mode.current !== 'hover'; mode.current = null; setOpen(false);
  };
  const leave = () => {
    cancelClose();
    if (mode.current === 'hover') closeTimer.current = setTimeout(close, 180);
  };

  return <Popover open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <PopoverTrigger asChild>
      <button ref={trigger} type="button" aria-label={`${text} — ${title}`}
        className="inline-flex max-w-full items-center gap-1 rounded-sm text-left underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        onPointerEnter={(event) => { if (event.pointerType === 'touch') return; cancelClose(); if (!open) { mode.current = 'hover'; setOpen(true); } }}
        onPointerLeave={leave}
        onFocus={() => { if (!suppressFocus.current && !open) { mode.current = 'focus'; setOpen(true); } }}
        onBlur={() => { suppressFocus.current = false; }}
        onClick={(event) => { event.preventDefault(); cancelClose(); if (open && mode.current === 'click') close(); else { mode.current = 'click'; setOpen(true); } }}>
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{text}</span><Info aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" />
      </button>
    </PopoverTrigger>
    <PopoverContent ref={content} align="start" collisionPadding={12} aria-labelledby={titleId}
      className="w-80 max-w-[calc(100vw-24px)] text-sm"
      onPointerEnter={cancelClose} onPointerLeave={leave}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // Never steal focus from the next field or an outside control.
        if (restoreFocus.current && (document.activeElement === document.body || document.activeElement === trigger.current || content.current?.contains(document.activeElement))) {
          suppressFocus.current = true; trigger.current?.focus();
        }
      }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-semibold text-slate-950">{title}</h2>
        <button type="button" aria-label={label('close')} className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={close}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="max-h-[min(24rem,50vh)] overflow-y-auto break-words [overflow-wrap:anywhere]">
        {error ? <p role="alert">{label('loansLoadError')}</p> : !data ? <p role="status">{label('loading')}</p> : <InfoBody data={data} kind={kind} item={item} label={label} />}
      </div>
    </PopoverContent>
  </Popover>;
}

function InfoBody({ data, kind, item, label }: { data: LoanOverviewInfo; kind: InfoKind; item: LoanCaseSummary; label: (key: string) => string }) {
  if (kind === 'notes') return <p className="whitespace-pre-wrap">{data.notes?.trim() ? data.notes : label('loansInfoNoNotes')}</p>;
  if (kind === 'delivery') {
    const address = data.delivery;
    const hasAddress = [address.delivery_address, address.delivery_postal_code, address.delivery_city, address.delivery_country].some((value) => value?.trim());
    return <div className="space-y-1">
      <p className="font-medium">{label(address.alternative_delivery_address ? 'loansAlternativeAddress' : 'loansInfoPartnerAddress')}</p>
      {!hasAddress ? <p>{label('loansInfoNoAddress')}</p> : <>
        {address.delivery_contact && <p>{address.delivery_contact}</p>}
        {address.delivery_address && <p className="whitespace-pre-wrap">{address.delivery_address}</p>}
        {(address.delivery_postal_code || address.delivery_city) && <p>{[address.delivery_postal_code, address.delivery_city].filter(Boolean).join(' ')}</p>}
        {address.delivery_country && <p>{address.delivery_country}</p>}
      </>}
    </div>;
  }
  const returns = new Map(data.returnSummary.map((entry) => [entry.case_item_id, entry]));
  return <>
    <p className="mb-3 text-xs text-slate-500">{item.loan_number} · {label('loansAssetCount')}: {data.items.length}</p>
    {!data.items.length ? <p>{label('loansInfoNoAssets')}</p> : <ul className="space-y-3">{data.items.map((asset) => {
      const receipt = returns.get(asset.id);
      const status = item.status === 'CANCELLED' ? item.status : receipt?.receipt_status ?? (receipt?.is_outstanding ? 'ON_LOAN' : item.status);
      return <li key={asset.id} className="border-t border-slate-200 pt-2">
        <p className="font-medium">{asset.product_name_snapshot || asset.product_sku}</p>
        <p>{label('loansItemNumber')}: {asset.product_sku}</p>
        {asset.serial_snapshot && <p>{label('loansSerialNumber')}: {asset.serial_snapshot}</p>}
        {asset.brik_number_snapshot != null && <p>{label('loansStockBrikNumber')}: {asset.brik_number_snapshot}</p>}
        <p className="mt-1 text-xs text-slate-600">{label(loanStatusTranslationKey(status))}</p>
      </li>;
    })}</ul>}
  </>;
}
