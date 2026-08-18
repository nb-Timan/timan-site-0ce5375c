import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { listDemoLeads, resolveSeedOwners, formatDemoNo, type CrmDemoLead } from '@/lib/crmLeadsService';
import { Building2, MapPin, User, Calendar, Wrench, Gauge, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CLR: Record<string, string> = {
  'Hot lead':        'bg-rose-50 text-rose-700 border-rose-200',
  'Warm lead':       'bg-amber-50 text-amber-800 border-amber-200',
  'Cold lead':       'bg-sky-50 text-sky-700 border-sky-200',
  'Offer requested': 'bg-violet-50 text-violet-700 border-violet-200',
  Won:               'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost:              'bg-rose-50 text-rose-700 border-rose-200',
  'No fit':          'bg-gray-100 text-gray-700 border-gray-200',
};

function Field({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function CrmDemoLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);

  const [lead, setLead] = useState<CrmDemoLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const all = await listDemoLeads({});
      const resolved = await resolveSeedOwners(all);
      if (cancelled) return;
      const found = resolved.find(r => r.id === id) || null;
      if (!found) { setLead(null); setLoading(false); return; }
      const myEmail = (appUser?.email || '').toLowerCase();
      const visible = isAdmin
        || (sellerId && found.owner_user_id === sellerId)
        || (myEmail && (found.owner_email || '').toLowerCase() === myEmail);
      if (!visible) { setDenied(true); setLead(null); }
      else setLead(found);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, appUser?.email, isAdmin]);

  return (
    <CrmLayout pageTitle="Demo lead">
      <div className="max-w-5xl mx-auto">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-sm text-gray-500">Indlæser…</div>
        ) : denied ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-sm font-medium text-gray-900">Ingen adgang</p>
            <p className="text-xs text-gray-500 mt-1">Dette demo lead er ikke tildelt dig.</p>
          </div>
        ) : !lead ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-sm font-medium text-gray-900">Demo lead ikke fundet</p>
            <p className="text-xs text-gray-500 mt-1">Posten findes ikke længere eller er blevet slettet.</p>
          </div>
        ) : (
          <>
            {/* Header card */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                      <Sparkles className="h-3 w-3 mr-1" /> Demo lead
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                      {formatDemoNo(lead.demo_no)}
                    </span>
                    {lead.legacy_id && (
                      <span className="text-[11px] text-gray-400 font-mono">#{lead.legacy_id}</span>
                    )}
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">{lead.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {[lead.customer_name, lead.dealer_company, lead.dealer_country].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {lead.result_status && (
                  <span className={cn('inline-flex text-[11px] font-medium px-2.5 py-1 rounded-md border whitespace-nowrap',
                    STATUS_CLR[lead.result_status] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                    {lead.result_status}
                  </span>
                )}
              </div>
            </section>

            {/* Body grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 lg:col-span-2">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-5">Demonstration</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field icon={Wrench} label="Maskine" value={lead.demo_machine} />
                  <Field icon={Wrench} label="Udstyr" value={(lead.demo_equipment || []).join(', ') || '—'} />
                  <Field icon={Calendar} label="Demo-dato" value={lead.demo_date} />
                  <Field icon={Calendar} label="Næste opfølgning" value={lead.followup_date} />
                  <Field icon={User} label="Sælger / demonstrator" value={lead.dealer_rep} />
                  <Field icon={Building2} label="Kategori" value={(lead.machine_category || []).join(', ') || '—'} />
                  <Field icon={Gauge} label="Interesse-niveau" value={lead.interest_level != null ? `${lead.interest_level}/5` : '—'} />
                  <Field icon={Gauge} label="Sandsynlighed" value={lead.probability != null ? `${lead.probability}%` : '—'} />
                </div>

                {(lead.notes || lead.notes_after_demo) && (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    {lead.notes && (
                      <div className="mb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 mb-1">Noter</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
                      </div>
                    )}
                    {lead.notes_after_demo && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 mb-1">Noter efter demo</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes_after_demo}</p>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <aside className="space-y-5">
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="text-[15px] font-semibold text-gray-900 mb-5">Ejer</h3>
                  <div className="space-y-4">
                    <Field icon={User} label="Ansvarlig sælger" value={lead.owner_name || (
                      <span className="inline-flex text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        Unassigned
                      </span>
                    )} />
                    {lead.owner_email && <Field icon={User} label="Email" value={lead.owner_email} />}
                  </div>
                </section>

                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="text-[15px] font-semibold text-gray-900 mb-5">Kunde</h3>
                  <div className="space-y-4">
                    <Field icon={Building2} label="Kunde" value={lead.customer_name} />
                    <Field icon={MapPin} label="Adresse" value={lead.customer_address} />
                    <Field icon={Building2} label="Forhandler" value={lead.dealer_company} />
                    <Field icon={MapPin} label="Land" value={lead.dealer_country} />
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </CrmLayout>
  );
}
