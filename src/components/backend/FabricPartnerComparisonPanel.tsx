import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CloudDownload, RefreshCw, Search, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { comparePartnerMaster, partnerParityCounts, proposeC5PartnerType, type ParityStatus, type PortalPartnerParity } from '@/lib/fabricPartnerParity';
import type { PartnerShadowRow } from '../../../supabase/functions/_shared/fabricPartnerSnapshot';
import { buildPartnerReviewRows, filterPartnerReviewRows, partnerReviewCounts,
  REVIEW_STATUSES, REVIEW_STATUS_LABELS, type PartnerReviewFilter, type PartnerReviewRow } from '@/lib/fabricPartnerReview';
import { loadPartnerReviews, type PartnerReviewPreview } from '@/lib/fabricPartnerReviewService';
import { getPartnerAccountTypeLabel } from '@/lib/partnerAccountTypes';
import FabricPartnerReviewDialog from './FabricPartnerReviewDialog';
import { partnerManagementCounts, type PartnerImportReceipt } from '@/lib/fabricPartnerManagement';

interface Preview {
  state: { last_success_at: string | null; row_count: number; last_error: string | null; source_as_of: string | null };
  shadow: PartnerShadowRow[]; portal: PortalPartnerParity[];
  imports?: PartnerImportReceipt[];
}
const labels: Record<ParityStatus, string> = {
  MATCH: 'Match', FIELD_DIFFERENCE: 'Afvigelser', C5_ONLY: 'Kun C5', PORTAL_ONLY: 'Kun Portal',
  TYPE_CONFLICT: 'Typekonflikt', ACCOUNT_CONFLICT: 'Kontokonflikt', REVIEW_REQUIRED: 'Kræver kontrol',
};
const ownershipLabels = { AUTO_CANDIDATE: 'C5-kandidat', REVIEW_ONLY: 'Manuel gennemgang' };

export default function FabricPartnerComparisonPanel({ portalParents }: { portalParents?: Record<string, string | null> }) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ParityStatus | 'FORHANDLERKUNDER' | 'AUTO_SAFE_CANDIDATE' | ''>('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [reviews, setReviews] = useState<PartnerReviewPreview>({ reviews: [], contexts: [], parents: [] });
  const [reviewFilter, setReviewFilter] = useState<PartnerReviewFilter>('');
  const [reviewing, setReviewing] = useState<PartnerReviewRow | null>(null);
  const [view, setView] = useState<'COMPARE' | 'QUEUE'>('COMPARE');
  const reload = async () => {
    setBusy(true); setError(null);
    try {
      const response = await supabase.rpc('fabric_partner_shadow_preview');
      if (response.error) throw response.error;
      const reviewData = await loadPartnerReviews();
      setData(response.data as unknown as Preview);
      setReviews({ reviews: reviewData.reviews ?? [], contexts: reviewData.contexts ?? [], parents: reviewData.parents ?? [] });
    } catch { setError('Sammenligningen og reviewbeslutninger kunne ikke indlæses. Genindlæs før du gemmer.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void reload(); }, []);
  // No snapshot means no parity conclusion, not 111 fabricated Portal-only records.
  const rows = useMemo(() => data?.state.last_success_at ? comparePartnerMaster(data.portal.map(row => ({ ...row,
    parent_account_number: portalParents && Object.prototype.hasOwnProperty.call(portalParents, row.id) ? portalParents[row.id] : row.parent_account_number,
  })), data.shadow) : [], [data, portalParents]);
  const counts = useMemo(() => partnerParityCounts(rows), [rows]);
  const reviewRows = useMemo(() => buildPartnerReviewRows(rows, reviews.reviews, reviews.contexts), [rows, reviews]);
  const reviewCounts = useMemo(() => partnerReviewCounts(reviewRows), [reviewRows]);
  const management = useMemo(() => partnerManagementCounts(reviewRows, data?.portal ?? [], data?.imports,
    reviews.parents.map(parent => parent.id)), [reviewRows, data, reviews.parents]);
  const queue = management.queue;
  const shown = filterPartnerReviewRows(reviewRows, reviewFilter, search, reviews.parents).filter(row => (!filter || (filter === 'FORHANDLERKUNDER' ? row.c5.some(source => proposeC5PartnerType(source.c5_partner_type_code) === 'dealer_customer')
    : filter === 'AUTO_SAFE_CANDIDATE' || filter === 'REVIEW_REQUIRED' ? row.classification === filter : row.statuses.includes(filter)))
  );
  return <section aria-label="Fabric sammenligning" className="my-6 border-y border-gray-200 py-5 text-sm">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-gray-900">Partnerdata fra C5/Fabric</h2>
      <button type="button" title="Genindlæs sammenligning" aria-label="Genindlæs sammenligning" disabled={busy}
        onClick={() => void reload()} className="p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
    </div>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    <p className="mt-2 text-gray-600">Aktiv stamdatakilde: SharePoint + godkendte Portal-beslutninger. Fabric: shadow/review, ingen generel cutover.</p>
    {data && <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y py-3 sm:grid-cols-5">
      {([
        ['Eksisterende Portal-partnere', management.portalPartners],
        ['Afventer gennemgang', management.pending],
        ['Godkendt til import', management.approved],
        ['Kræver afklaring/genkontrol', management.needsReview],
        ['Faktisk overførte konti', management.transferred ?? 'Ikke tilgængelig'],
      ] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-gray-600">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}
    </dl>}
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <span title="Portal-udløst Fabric-job er ikke tilsluttet. Genindlæsning starter ikke en sync.">
        <button type="button" disabled className="inline-flex items-center gap-2 rounded border px-3 py-2 text-gray-500 disabled:opacity-60"><CloudDownload className="h-4 w-4" />Opdatér fra Fabric</button>
      </span>
      <span title="Kun den allerede godkendte JE Service-pilot er aktiveret. Ingen generel import er frigivet.">
        <button type="button" disabled className="inline-flex items-center gap-2 rounded border px-3 py-2 text-gray-500 disabled:opacity-60"><Send className="h-4 w-4" />Overfør godkendte til Partnerdata</button>
      </span>
    </div>
    <p className="mt-2 text-xs text-gray-600">Portal-udløst sync: ikke tilsluttet. Kontrolleret import: kun enkeltpiloten; ingen generel import aktiveret.</p>
    {data && <p className="mt-2 text-gray-600">Portal: {data.portal.length} · C5: {data.state.row_count} · Matchet: {counts.matched}
      {' · '}Sidst synkroniseret: {data.state.last_success_at ? new Date(data.state.last_success_at).toLocaleString('da-DK') : 'Afventer første snapshot'}</p>}
    {data?.state.last_error && <p role="alert" className="mt-2 text-amber-800">Seneste synkronisering fejlede. Sidste gyldige snapshot vises.</p>}
    <div className="mt-4 flex flex-wrap border-b" role="tablist" aria-label="Partnerdata reviewvisning">
      <button type="button" role="tab" aria-selected={view === 'COMPARE'} onClick={() => setView('COMPARE')} className={`px-3 py-2 ${view === 'COMPARE' ? 'border-b-2 border-gray-900 font-semibold' : 'text-gray-600'}`}>Sammenligning</button>
      <button type="button" role="tab" aria-selected={view === 'QUEUE'} onClick={() => setView('QUEUE')} className={`px-3 py-2 ${view === 'QUEUE' ? 'border-b-2 border-gray-900 font-semibold' : 'text-gray-600'}`}>Godkendte til import ({queue.reduce((sum, group) => sum + group.rows.length, 0)})</button>
    </div>
    {view === 'QUEUE' ? <div className="mt-4 space-y-4">
      {!!data?.imports?.length && <div>
        <h3 className="border-b pb-2 font-semibold">Faktisk overført</h3>
        {data.imports.map(receipt => <p key={receipt.id} className="break-words border-b py-2">{receipt.account_number} · {new Date(receipt.imported_at).toLocaleString('da-DK')} · Portal-ID: {receipt.account_id}</p>)}
      </div>}
      {queue.length === 0 && <p className="text-gray-600">Ingen aktuelle godkendelser i importkøen.</p>}
      {reviewCounts.NEEDS_RECHECK > 0 && <p className="text-amber-800">Kræver genkontrol: {reviewCounts.NEEDS_RECHECK}</p>}
      {queue.map(group => <div key={`${group.kind}-${group.partner_type}`}>
        <h3 className="border-b pb-2 font-semibold">{group.kind === 'NEW' ? 'Nye' : 'Eksisterende konti med godkendte stamdataændringer'} · {getPartnerAccountTypeLabel(group.partner_type, 'da')} ({group.rows.length})</h3>
        {group.rows.map(row => <div key={row.account_number} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
          <span className="min-w-0 break-words">{row.account_number} · {row.c5[0]?.company_name}</span>
          <button type="button" className="rounded border px-3 py-1.5" onClick={() => setReviewing(row)}>Gennemgå {row.account_number}</button>
        </div>)}
      </div>)}
    </div> : <>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Godkendelsesfilter">
      {REVIEW_STATUSES.map(status => <button key={status} type="button" aria-pressed={reviewFilter === status}
        onClick={() => { setReviewFilter(reviewFilter === status ? '' : status); setLimit(50); }}
        className={`rounded px-3 py-1.5 ${reviewFilter === status ? 'bg-gray-900 text-white' : 'border bg-white'}`}>{REVIEW_STATUS_LABELS[status]} ({reviewCounts[status]})</button>)}
      <button type="button" aria-pressed={reviewFilter === 'MATCHED'} onClick={() => { setReviewFilter(reviewFilter === 'MATCHED' ? '' : 'MATCHED'); setLimit(50); }}
        className={`rounded px-3 py-1.5 ${reviewFilter === 'MATCHED' ? 'bg-gray-900 text-white' : 'border bg-white'}`}>Matchede ({reviewCounts.MATCHED})</button>
      <button type="button" aria-pressed={reviewFilter === 'NEEDS_RECHECK'} onClick={() => { setReviewFilter(reviewFilter === 'NEEDS_RECHECK' ? '' : 'NEEDS_RECHECK'); setLimit(50); }}
        className={`rounded px-3 py-1.5 ${reviewFilter === 'NEEDS_RECHECK' ? 'bg-gray-900 text-white' : 'border bg-white'}`}>Kræver genkontrol ({reviewCounts.NEEDS_RECHECK})</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Sammenligningsfilter">
      <button type="button" aria-pressed={!filter && !reviewFilter} className={`rounded px-3 py-1.5 ${!filter && !reviewFilter ? 'bg-gray-900 text-white' : 'border bg-white'}`}
        onClick={() => { setFilter(''); setReviewFilter(''); setLimit(50); }}>Alle ({reviewRows.length})</button>
      {(Object.keys(labels) as ParityStatus[]).map(status => <button key={status} type="button" aria-pressed={filter === status}
        onClick={() => { setFilter(status); setLimit(50); }} className={`rounded px-3 py-1.5 ${filter === status ? 'bg-gray-900 text-white' : 'border bg-white'}`}>
        {labels[status]} ({counts[status]})</button>)}
      {(['FORHANDLERKUNDER', 'AUTO_SAFE_CANDIDATE'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
        onClick={() => { setFilter(value); setLimit(50); }} className={`rounded px-3 py-1.5 ${filter === value ? 'bg-gray-900 text-white' : 'border bg-white'}`}>
        {value === 'FORHANDLERKUNDER' ? 'Forhandlerkunder' : 'AUTO_SAFE_CANDIDATE'} ({counts[value]})</button>)}
    </div>
    <div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
      <input aria-label="Søg i Fabric sammenligning" placeholder="Konto, firma, land, type eller forhandler" value={search}
        onChange={event => { setSearch(event.target.value); setLimit(50); }} className="w-full rounded border py-2 pl-9 pr-3" />
    </div>
    <div className="mt-4 divide-y border-y">
      <div className="flex justify-end py-2 text-gray-500">Handling</div>
      {shown.slice(0, limit).map(row => <div key={row.account_number}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <button type="button" aria-expanded={expanded === row.account_number} onClick={() => setExpanded(expanded === row.account_number ? null : row.account_number)}
          className="grid w-full grid-cols-[20px_70px_1fr] items-start gap-2 py-3 text-left sm:grid-cols-[20px_80px_1fr_200px]">
          {expanded === row.account_number ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">{row.account_number || 'Tom konto'}</span>
          <span className="min-w-0 break-words">{row.portal[0]?.company_name ?? row.c5[0]?.company_name ?? '—'}</span>
          <span className="col-start-3 min-w-0 text-gray-600 sm:col-auto">{row.statuses.map(status => labels[status]).join(' · ')}</span>
        </button>
        <button type="button" aria-label={`Gennemgå ${row.account_number}`} onClick={() => setReviewing(row)} disabled={!row.context || !!error}
          className="mt-2 rounded border px-2 py-1.5 disabled:opacity-50">Gennemgå</button>
        </div>
        <p className={`mb-2 pl-7 text-xs ${row.needs_recheck ? 'text-amber-800' : 'text-gray-600'}`}>{row.needs_recheck ? 'Kræver genkontrol' : REVIEW_STATUS_LABELS[row.review_status]}</p>
        {expanded === row.account_number && <div className="mb-4">
          <p className="mb-3 break-words text-gray-600">Portal-ID: {row.portal.map(p => p.id).join(', ') || '—'} · C5-række: {row.c5.map(s => s.source_row_number).join(', ') || '—'}</p>
          <p className="mb-3 break-words"><strong>{row.classification}</strong> · {row.reason}</p>
          {row.invoiceChain.length > 0 && <dl className="mb-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="font-semibold">C5 invoice-kæde · kildefakta</dt><dd>{row.invoiceChain.join(' → ')}</dd></div>
            <div><dt className="font-semibold">Foreslået forhandler · kun gennemgang</dt><dd>{row.proposedDealer ?? 'Ikke entydigt bevist'}</dd></div>
            <div><dt className="font-semibold">Portal-ejet relation</dt><dd>{row.portal[0]?.parent_account_number ?? '—'} · {row.relationParity}</dd></div>
          </dl>}
          {row.c5.map(source => <dl key={`review-${source.source_row_number}`} className="mb-3 grid gap-2 border-y py-2 sm:grid-cols-3">
            {(['c5_partner_type_code', 'language', 'vat_number', 'currency', 'payment', 'c5_blocked', 'c5_approved'] as const).map(field => <div key={field} className="min-w-0 break-words">
              <dt className="font-semibold">{field}</dt><dd>{source[field] ?? '—'} · C5 · Kun gennemgang</dd>
            </div>)}
          </dl>)}
          {row.fields.length > 0 ? <div className="divide-y">
            {row.fields.map(field => <dl key={field.field} className={`grid gap-2 py-2 sm:grid-cols-4 ${field.different ? 'bg-amber-50' : ''}`}>
              <div><dt className="font-semibold">{field.field}</dt><dd>{ownershipLabels[field.ownership]}</dd></div>
              <div className="min-w-0 break-words"><dt className="text-gray-500">Portal</dt><dd>{field.portal ?? '—'}</dd></div>
              <div className="min-w-0 break-words"><dt className="text-gray-500">C5</dt><dd>{field.c5 ?? '—'}</dd></div>
              <div className="min-w-0 break-words"><dt className="text-gray-500">Foreslået</dt><dd>{field.proposed ?? '—'}</dd></div>
            </dl>)}
          </div> : row.c5.map(source => <dl key={source.source_row_number} className="grid gap-2 sm:grid-cols-2">
            <div><dt>C5 invoice-konto</dt><dd>{source.c5_invoice_account_number ?? '—'}</dd></div>
            <div><dt>Rå typekode</dt><dd>{source.c5_partner_type_code ?? '—'}</dd></div>
            <div><dt>ZIPCITY</dt><dd>{source.zipcity_raw ?? '—'} ({source.zipcity_validation})</dd></div>
          </dl>)}
        </div>}
      </div>)}
    </div>
    {shown.length > limit && <button type="button" onClick={() => setLimit(limit + 50)} className="mt-3 border px-3 py-2">Vis flere</button>}
    </>}
    {reviewing && <FabricPartnerReviewDialog key={`${reviewing.account_number}-${reviewing.review?.version ?? 0}`} row={reviewing} parents={reviews.parents}
      history={reviews.reviews.filter(review => review.account_number === reviewing.account_number)} onClose={() => setReviewing(null)} onSaved={reload} />}
  </section>;
}
