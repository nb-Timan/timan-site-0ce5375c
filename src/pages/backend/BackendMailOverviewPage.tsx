import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mail, RefreshCw, Search, X } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { isBackendActor } from '@/lib/portalAccess';
import {
  fetchMailAuditEvents,
  MAIL_AUDIT_CATEGORIES,
  MAIL_AUDIT_CATEGORY_LABELS,
  type MailAuditEvent,
  type MailAuditStatus,
} from '@/lib/mailAuditService';

const STATUS_LABEL: Record<MailAuditStatus, string> = { queued: 'I kø', sent: 'Sendt', failed: 'Fejlet' };
const STATUS_CLASS: Record<MailAuditStatus, string> = {
  queued: 'bg-amber-100 text-amber-800',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
};

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function sellerLabel(event: MailAuditEvent): string {
  const seller = event.responsible_seller;
  return seller?.initials || seller?.full_name || seller?.email || '—';
}

function recipients(event: MailAuditEvent): string {
  return event.to_addresses.length > 0 ? event.to_addresses.join(', ') : '—';
}

function relatedHref(event: MailAuditEvent): string | null {
  if (event.related_entity_type === 'crm_lead' && event.related_entity_id) return `/portal/crm/leads/${event.related_entity_id}`;
  return null;
}

export default function BackendMailOverviewPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = isBackendActor(appUser);
  const [events, setEvents] = useState<MailAuditEvent[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [responsible, setResponsible] = useState('all');
  const [selected, setSelected] = useState<MailAuditEvent | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setEvents(await fetchMailAuditEvents());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setEvents([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (isBackend) void load(); }, [isBackend]);

  const sources = useMemo(() => Array.from(new Set(events.map((event) => event.source_module))).sort(), [events]);
  const responsibles = useMemo(() => Array.from(new Set(events.map(sellerLabel).filter((value) => value !== '—'))).sort(), [events]);
  const filtered = useMemo(() => events.filter((event) => {
    if (date && !event.created_at.startsWith(date)) return false;
    if (category !== 'all' && event.category !== category) return false;
    if (status !== 'all' && event.status !== status) return false;
    if (source !== 'all' && event.source_module !== source) return false;
    if (responsible !== 'all' && sellerLabel(event) !== responsible) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [event.subject, event.to_addresses.join(' '), event.cc_addresses.join(' '), event.bcc_addresses.join(' '), sellerLabel(event), event.source_module, event.related_entity_label, event.related_entity_id]
      .some((value) => value?.toLowerCase().includes(needle));
  }), [category, date, events, query, responsible, source, status]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Indlæser...</div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={language} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
      <main className="mx-auto w-full max-w-[1700px] flex-grow px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50"><Mail className="h-6 w-6 text-emerald-700" /></span>
            <div><h1 className="text-3xl font-bold text-slate-950">Mailoversigt</h1><p className="text-sm text-slate-600">Append-only metadataaudit. Mailindhold gemmes ikke.</p></div>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Genindlæs</button>
        </div>

        <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg modtager, emne eller reference" className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm" /></label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="Dato" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="Kategori"><option value="all">Alle kategorier</option>{MAIL_AUDIT_CATEGORIES.map((value) => <option key={value} value={value}>{MAIL_AUDIT_CATEGORY_LABELS[value]}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="Status"><option value="all">Alle statusser</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="Kilde"><option value="all">Alle kilder</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select value={responsible} onChange={(event) => setResponsible(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="Ansvarlig"><option value="all">Alle ansvarlige</option>{responsibles.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </div>

        {error && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Kunne ikke hente mailaudit: {error}</p>}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-[1200px] w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><Th>Dato</Th><Th>Kategori</Th><Th>Emne</Th><Th>Til</Th><Th>CC / BCC</Th><Th>Ansvarlig</Th><Th>Kilde</Th><Th>Reference</Th><Th>Status</Th></tr></thead>
            <tbody>{busy ? <tr><td colSpan={9} className="p-10 text-center text-slate-500">Henter mails...</td></tr> : filtered.length === 0 ? <tr><td colSpan={9} className="p-10 text-center text-slate-500">Ingen mailposter matcher filteret.</td></tr> : filtered.map((event) => <tr key={event.id} onClick={() => setSelected(event)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"><Td>{formatDateTime(event.sent_at || event.created_at)}</Td><Td>{MAIL_AUDIT_CATEGORY_LABELS[event.category]}</Td><Td className="max-w-[300px] truncate font-medium">{event.subject || '—'}</Td><Td className="max-w-[220px] truncate">{recipients(event)}</Td><Td className="max-w-[180px] truncate">{[...event.cc_addresses, ...event.bcc_addresses].join(', ') || '—'}</Td><Td>{sellerLabel(event)}</Td><Td>{event.source_module}</Td><Td>{relatedHref(event) ? <Link to={relatedHref(event)!} onClick={(click) => click.stopPropagation()} className="font-semibold text-emerald-700 hover:underline">{event.related_entity_label || event.related_entity_id}</Link> : event.related_entity_label || event.related_entity_id || '—'}</Td><Td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[event.status]}`}>{STATUS_LABEL[event.status]}</span></Td></tr>)}</tbody>
          </table>
        </div>
      </main>
      {selected && <MailDetail event={selected} onClose={() => setSelected(null)} />}
      <PortalFooter language={language} />
    </div>
  );
}

function MailDetail({ event, onClose }: { event: MailAuditEvent; onClose: () => void }) {
  const fields: Array<[string, string]> = [
    ['Dato', formatDateTime(event.sent_at || event.created_at)], ['Kategori', MAIL_AUDIT_CATEGORY_LABELS[event.category]], ['Status', STATUS_LABEL[event.status]], ['Emne', event.subject || '—'], ['Til', recipients(event)], ['CC', event.cc_addresses.join(', ') || '—'], ['BCC', event.bcc_addresses.join(', ') || '—'], ['Ansvarlig', sellerLabel(event)], ['Kilde', `${event.source_module} / ${event.source_action}`], ['Reference', event.related_entity_label || event.related_entity_id || '—'], ['Provider', event.provider || '—'], ['Message-ID', event.provider_message_id || '—'], ['Vedhæftninger', String(event.attachment_count)], ['Teknisk fejl', event.error_message || '—'],
  ];
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="Maildetaljer" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()} className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"><div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Maildetaljer</h2><p className="mt-1 text-sm text-slate-500">Read-only metadata</p></div><button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Luk"><X className="h-5 w-5" /></button></div><dl className="space-y-3">{fields.map(([label, value]) => <div key={label} className="border-b border-slate-100 pb-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{value}</dd></div>)}</dl></section></div>;
}

function Th({ children }: { children: ReactNode }) { return <th className="px-3 py-3 whitespace-nowrap">{children}</th>; }
function Td({ children, className = '' }: { children: ReactNode; className?: string }) { return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>; }
