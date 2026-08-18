// Phase 43 — Read-only detail view of a single service registration.
// Visually mirrors the "Opret service registrering" form but renders every
// field as read-only text. RLS enforces dealer scoping at the DB level — if a
// user opens another dealer's registration by guessing the URL, the fetcher
// returns null and we show "ikke fundet".

import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, FileText, Wrench, Paperclip } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { pickT } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  ServiceRegistration,
  ServiceRegistrationPart,
  getServiceRegistration,
  listServiceRegistrationParts,
} from '@/lib/serviceMaintenanceService';

type Dict = Partial<Record<PortalUiLanguage, string>>;

const T: Record<string, Dict> = {
  title: { da: 'Service registrering', en: 'Service registration', de: 'Serviceerfassung' },
  notFound: { da: 'Registrering ikke fundet, eller du har ikke adgang.', en: 'Registration not found, or you do not have access.', de: 'Erfassung nicht gefunden oder kein Zugriff.' },
  loading: { da: 'Indlæser…', en: 'Loading…', de: 'Laden…' },
  sectionMachine: { da: 'Maskine', en: 'Machine', de: 'Maschine' },
  sectionService: { da: 'Service', en: 'Service', de: 'Service' },
  sectionParts: { da: 'Reservedele', en: 'Spare parts', de: 'Ersatzteile' },
  sectionExtra: { da: 'Ekstra reservedele uden for servicekit', en: 'Extra spare parts outside service kit', de: 'Zusätzliche Ersatzteile' },
  sectionNotes: { da: 'Bemærkninger og fejl', en: 'Notes and faults', de: 'Bemerkungen und Fehler' },
  sectionAttachments: { da: 'Vedhæftede billeder og dokumenter', en: 'Attachments', de: 'Anhänge' },
  fSerial: { da: 'Maskinnr. / serienummer', en: 'Machine no. / serial number', de: 'Maschinennr.' },
  fType: { da: 'Maskintype', en: 'Machine type', de: 'Maschinentyp' },
  fDealer: { da: 'Forhandler der udfører service', en: 'Dealer performing service', de: 'Händler' },
  fCustomer: { da: 'Kunde / bruger', en: 'Customer / user', de: 'Kunde / Benutzer' },
  fDate: { da: 'Servicedato', en: 'Service date', de: 'Servicedatum' },
  fHours: { da: 'Driftstimer', en: 'Operating hours', de: 'Betriebsstunden' },
  fInterval: { da: 'Serviceinterval', en: 'Service interval', de: 'Serviceintervall' },
  fTech: { da: 'Tekniker / signatur', en: 'Technician / signature', de: 'Techniker' },
  fPlan: { da: 'Udført iht. serviceplan', en: 'Completed per service plan', de: 'Gemäß Serviceplan' },
  fPlanYes: { da: 'Ja', en: 'Yes', de: 'Ja' },
  fPlanNo: { da: 'Nej', en: 'No', de: 'Nein' },
  fNotes: { da: 'Bemærkninger / indsigelser', en: 'Notes / objections', de: 'Bemerkungen' },
  fFaults: { da: 'Fejl fundet under service', en: 'Faults found during service', de: 'Festgestellte Fehler' },
  colItemNo: { da: 'Varenr', en: 'Item no.', de: 'Art.-Nr.' },
  colItemName: { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung' },
  colUnitPrice: { da: 'Stk pris', en: 'Unit price', de: 'Stückpreis' },
  colQty: { da: 'Antal', en: 'Qty', de: 'Anzahl' },
  colSum: { da: 'Sum', en: 'Sum', de: 'Summe' },
  totalKit: { da: 'Total servicekit', en: 'Total service kit', de: 'Servicekit gesamt' },
  totalExtra: { da: 'Total ekstra reservedele', en: 'Total extra parts', de: 'Extra-Teile gesamt' },
  totalGrand: { da: 'Total samlet', en: 'Grand total', de: 'Gesamtsumme' },
  attachmentOpen: { da: 'Åbn', en: 'Open', de: 'Öffnen' },
  noAttachments: { da: 'Ingen vedhæftede filer.', en: 'No attachments.', de: 'Keine Anhänge.' },
};

function fmt(v: number | null | undefined, suffix = '') {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toFixed(2)}${suffix}`;
}

export default function ServiceRegistrationDetailPage() {
  const { appUser, loading: userLoading, logout } = useAppUser();
  const { language: lang, setLanguage, uiLanguage } = useLanguage();
  const t = (k: keyof typeof T) => pickT(T[k], uiLanguage);
  const navigate = useNavigate();
  const { registrationId } = useParams<{ registrationId: string }>();

  const [reg, setReg] = useState<ServiceRegistration | null>(null);
  const [parts, setParts] = useState<ServiceRegistrationPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await getServiceRegistration(registrationId);
        if (cancelled) return;
        if (!r) {
          setError(t('notFound'));
          setReg(null);
          setParts([]);
          return;
        }
        setReg(r);
        try {
          const p = await listServiceRegistrationParts(registrationId);
          if (!cancelled) setParts(p);
        } catch {
          if (!cancelled) setParts([]);
        }
      } catch (e) {
        if (!cancelled) setError(t('notFound'));
        console.error('[service-registration-detail] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId]);

  const kitRows = useMemo(() => parts.filter((p) => p.source_type === 'servicekit'), [parts]);
  const extraRows = useMemo(() => parts.filter((p) => p.source_type === 'extra'), [parts]);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PortalHeader
          user={appUser}
          language={lang}
          onLanguageChange={setLanguage}
          onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
        />
        <main className="flex-1 p-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-sm text-slate-500">{t('loading')}</div>
          </div>
        </main>
        <PortalFooter language={lang} />
      </div>
    );
  }

  if (error || !reg) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PortalHeader
          user={appUser}
          language={lang}
          onLanguageChange={setLanguage}
          onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
        />
        <main className="flex-1 p-6">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {error ?? t('notFound')}
            </div>
          </div>
        </main>
        <PortalFooter language={lang} />
      </div>
    );
  }

  const kitTotal = reg.total_servicekit_price ?? kitRows.reduce((s, r) => s + (r.line_total || 0), 0);
  const extraTotal = reg.total_extra_parts_price ?? extraRows.reduce((s, r) => s + (r.line_total || 0), 0);
  const grandTotal = reg.total_price ?? kitTotal + extraTotal;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />
      <main className="flex-1 p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#2d5a27]/10 flex items-center justify-center">
            <Wrench className="h-6 w-6 text-[#2d5a27]" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900">{t('title')}</h1>
            <p className="text-slate-600 text-sm mt-1">
              {reg.serial_number} · {reg.machine_type} · {reg.service_date}
            </p>
          </div>
        </div>

        {/* Maskine */}
        <Section icon={ClipboardList} title={t('sectionMachine')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadField label={t('fSerial')} value={reg.serial_number} />
            <ReadField label={t('fType')} value={reg.machine_type} />
            <ReadField label={t('fDealer')} value={[reg.dealer_number, reg.dealer_name].filter(Boolean).join(' — ') || '—'} />
            <ReadField label={t('fCustomer')} value={reg.customer_name ?? '—'} />
          </div>
        </Section>

        {/* Service */}
        <Section icon={Wrench} title={t('sectionService')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadField label={t('fDate')} value={reg.service_date} />
            <ReadField label={t('fHours')} value={reg.operating_hours != null ? String(reg.operating_hours) : '—'} />
            <ReadField label={t('fInterval')} value={`${reg.service_interval_hours} h`} />
            <ReadField label={t('fTech')} value={reg.technician_name ?? '—'} />
            <ReadField label={t('fPlan')} value={reg.service_plan_completed ? t('fPlanYes') : t('fPlanNo')} />
          </div>
        </Section>

        {/* Parts (kit) */}
        {kitRows.length > 0 && (
          <Section icon={ClipboardList} title={t('sectionParts')}>
            <PartsTable rows={kitRows} t={t} />
            <div className="mt-3 flex justify-end text-sm">
              <div className="text-slate-600 mr-3">{t('totalKit')}</div>
              <div className="font-semibold">{fmt(kitTotal, ' kr')}</div>
            </div>
          </Section>
        )}

        {/* Extra parts */}
        {extraRows.length > 0 && (
          <Section icon={ClipboardList} title={t('sectionExtra')}>
            <PartsTable rows={extraRows} t={t} />
            <div className="mt-3 flex justify-end text-sm">
              <div className="text-slate-600 mr-3">{t('totalExtra')}</div>
              <div className="font-semibold">{fmt(extraTotal, ' kr')}</div>
            </div>
          </Section>
        )}

        {/* Totals */}
        {(kitRows.length > 0 || extraRows.length > 0) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex justify-between items-center">
            <div className="text-sm text-slate-600">{t('totalGrand')}</div>
            <div className="text-lg font-bold">{fmt(grandTotal, ' kr')}</div>
          </div>
        )}

        {/* Notes & faults */}
        {(reg.notes?.trim() || reg.faults_found?.trim()) && (
          <Section icon={FileText} title={t('sectionNotes')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reg.notes?.trim() && (
                <ReadField label={t('fNotes')} value={reg.notes} multiline />
              )}
              {reg.faults_found?.trim() && (
                <ReadField label={t('fFaults')} value={reg.faults_found} multiline />
              )}
            </div>
          </Section>
        )}

        {/* Attachments */}
        {reg.attachment_urls && reg.attachment_urls.length > 0 ? (
          <Section icon={Paperclip} title={t('sectionAttachments')}>
            <ul className="space-y-2">
              {reg.attachment_urls.map((url, i) => (
                <li key={i} className="text-sm">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#2d5a27] underline hover:no-underline break-all"
                  >
                    {url.split('/').pop() || url} — {t('attachmentOpen')}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        </div>
      </main>
      <PortalFooter language={lang} />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
        <Icon className="h-4 w-4 text-[#2d5a27]" />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function ReadField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div
        className={
          'mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 ' +
          (multiline ? 'whitespace-pre-wrap min-h-[3rem]' : 'truncate')
        }
      >
        {value || '—'}
      </div>
    </div>
  );
}

function PartsTable({
  rows,
  t,
}: {
  rows: ServiceRegistrationPart[];
  t: (k: keyof typeof T) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('colItemNo')}</TableHead>
          <TableHead>{t('colItemName')}</TableHead>
          <TableHead className="text-right">{t('colUnitPrice')}</TableHead>
          <TableHead className="text-right">{t('colQty')}</TableHead>
          <TableHead className="text-right">{t('colSum')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">{r.item_number ?? '—'}</TableCell>
            <TableCell>{r.description ?? '—'}</TableCell>
            <TableCell className="text-right">{fmt(r.unit_price)}</TableCell>
            <TableCell className="text-right">{r.quantity}</TableCell>
            <TableCell className="text-right">{fmt(r.line_total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
