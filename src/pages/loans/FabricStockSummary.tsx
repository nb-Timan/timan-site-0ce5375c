import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fabricLoanAssetDisplayIdentity } from '@/lib/fabricLoanStock';
import type { FabricStockSummary as Summary, FabricStockSummaryItem } from '@/lib/fabricStockSummary';

const number = (value: number) => value.toLocaleString('da-DK', { maximumFractionDigits: 6 });
const money = (value: number) => `${value.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
const cardClass = 'flex min-h-[76px] min-w-0 flex-col justify-center rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left';

export default function FabricStockSummary({ summary, loading, failed, onFindAsset }: {
  summary: Summary; loading?: boolean; failed?: boolean; onFindAsset: (assetId: string) => void;
}) {
  const unavailable = loading || failed;
  const value = unavailable ? '—' : !summary.lineCount ? money(0)
    : !summary.valuedLineCount ? 'Ikke tilgængelig' : money(summary.documentedValueDkk);
  const valueNote = unavailable ? (failed ? 'Lagerdata ikke tilgængelige' : 'Henter lagerdata…')
    : summary.missingValueLines ? `${summary.missingValueLines} varelinjer mangler værdi` : 'Dokumenteret værdi · DKK';
  return <section aria-label="Lageroverblik" className="grid min-w-0 grid-cols-2 gap-2 min-[1180px]:grid-cols-4">
    <div className={cardClass} data-stock-kpi="value">
      <p className="text-[11px] font-medium leading-tight text-slate-600">{summary.missingValueLines ? 'Samlet lagerværdi · dokumenteret' : 'Samlet lagerværdi'}</p>
      <p className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{valueNote}</p>
    </div>
    <SummaryPopover title="Antal på lager" value={unavailable ? '—' : `${number(summary.quantity)} stk.${summary.unknownQuantityGroups ? ' + ?' : ''}`}
      note={unavailable ? 'Henter lagerdata…' : `${summary.lineCount} varelinjer`}>
      <p>Antallet summerer stk.-antal i de synlige Fabric-linjer. Dokumenterede komponenter med samme Brik tælles som ét fysisk aktiv.</p>
      <p className="mt-2">{summary.lineCount} varelinjer · {summary.groupCount} fysiske grupper · {number(summary.quantity)} dokumenterede stk.</p>
      {summary.unknownQuantityGroups > 0 && <p className="mt-2 text-amber-800">{summary.unknownQuantityGroups} grupper har uafklaret antal eller fysisk identitet og indgår ikke i det dokumenterede antal.</p>}
      <p className="mt-2">En linje med 18 stk. forbliver én varelinje. Søge- og lagerfiltre gælder også her.</p>
    </SummaryPopover>
    <SummaryPopover title="Tre dyreste varer" value={unavailable ? '—' : summary.mostExpensive.length ? 'Se top 3' : 'Værdi mangler'}
      note="Klik eller hold musen over">
      <Ranking items={summary.mostExpensive} kind="value" onFindAsset={onFindAsset} />
      {summary.missingValueLines > 0 && <p className="mt-2 text-xs text-slate-600">{summary.missingValueLines} varelinjer uden dokumenteret værdi er udeladt.</p>}
    </SummaryPopover>
    <SummaryPopover title="Tre ældste varer" value={unavailable ? '—' : summary.oldest.length ? 'Se top 3' : 'Alder mangler'}
      note="Klik eller hold musen over">
      <Ranking items={summary.oldest} kind="date" onFindAsset={onFindAsset} />
      {summary.missingDateGroups > 0 && <p className="mt-2 text-xs text-slate-600">{summary.missingDateGroups} grupper uden dokumenteret lagerdato er udeladt. Fabric-opdateringsdato bruges ikke som alder.</p>}
    </SummaryPopover>
  </section>;
}

function Ranking({ items, kind, onFindAsset }: { items: FabricStockSummaryItem[]; kind: 'value' | 'date'; onFindAsset: (assetId: string) => void }) {
  if (!items.length) return <p>{kind === 'date' ? 'Lageralder ikke tilgængelig' : 'Ingen varer med dokumenteret lagerværdi'}</p>;
  return <ol className="space-y-2">{items.map((item, index) => <li key={item.key} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
    <p className="font-semibold">{index + 1}. {kind === 'value' ? money(item.valueDkk!) : `Lagerført/modtaget: ${item.receivedDate}`}</p>
    <p className="mb-1 text-xs text-slate-500">Samlet {item.assets.length > 1 ? 'fysisk gruppe' : 'varelinje'} · {item.quantity === null ? 'Antal uafklaret' : `${number(item.quantity)} stk.`}</p>
    {item.assets.map(asset => <button key={asset.asset_id} type="button" onClick={() => onFindAsset(asset.asset_id)}
      className="block w-full min-w-0 rounded p-1 text-left text-xs hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
      <span className="block break-words font-medium">{asset.line_text?.trim() || asset.item_name || asset.item_number}</span>
      <span className="block break-words text-slate-600">{asset.item_number} · {fabricLoanAssetDisplayIdentity(asset)} · Find vare</span>
    </button>)}
  </li>)}</ol>;
}

function SummaryPopover({ title, value, note, children }: { title: string; value: string; note: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const titleId = useId();
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = () => { cancelClose(); pinned.current = false; setOpen(false); };
  const leave = () => { cancelClose(); if (!pinned.current) closeTimer.current = setTimeout(close, 180); };
  return <Popover open={open} onOpenChange={next => { if (!next) close(); }}>
    <PopoverTrigger asChild><button type="button" aria-label={title} className={`${cardClass} outline-none hover:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-600`}
      onPointerEnter={event => { if (event.pointerType === 'touch') return; cancelClose(); setOpen(true); }}
      onPointerLeave={leave}
      onClick={event => { event.preventDefault(); cancelClose(); if (pinned.current) close(); else { pinned.current = true; setOpen(true); } }}>
      <span className="flex items-center gap-1 text-[11px] font-medium leading-tight text-slate-600">{title}<Info className="h-3 w-3 shrink-0" aria-hidden="true" /></span>
      <span className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-950">{value}</span>
      <span className="mt-0.5 text-[10px] leading-tight text-slate-500">{note}</span>
    </button></PopoverTrigger>
    <PopoverContent align="start" collisionPadding={12} aria-labelledby={titleId}
      className="z-[100] w-80 max-w-[calc(100vw-24px)] p-3 text-sm"
      onPointerEnter={cancelClose} onPointerLeave={leave} onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}>
      <div className="mb-2 flex items-start justify-between gap-2"><h2 id={titleId} className="font-semibold">{title}</h2>
        <button type="button" aria-label="Luk lagerinformation" onClick={close} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <div className="max-h-[min(24rem,60vh)] overflow-y-auto break-words [overflow-wrap:anywhere]" onClick={event => { if ((event.target as HTMLElement).closest('button')) close(); }}>{children}</div>
    </PopoverContent>
  </Popover>;
}
