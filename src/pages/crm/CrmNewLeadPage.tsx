import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  createLead, MACHINE_TYPE_OPTIONS, NEXT_ACTIVITY_OPTIONS, CONTACT_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS, PIPELINE_STAGES, LOST_COMPETITOR_OPTIONS, LOST_REASON_OPTIONS,
  PipelineStage,
} from '@/lib/crmLeadsService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { fetchBackendUsers } from '@/lib/backendUsersService';
import type { BackendUser } from '@/lib/backend-users-store';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Save, X, Upload, AlertTriangle, ChevronsUpDown, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';

// ---- Tiny shared form primitives (kept in this file to avoid extra files) ----
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
      <header className="mb-5">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('flex flex-col gap-1.5', full && 'md:col-span-2')}>
      <span className="text-[12px] font-medium text-gray-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none transition';
const taCls = inputCls + ' min-h-[90px] resize-y';

function MultiChip({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button type="button" key={o} onClick={() => onChange(active ? value.filter(v => v !== o) : [...value, o])}
            className={cn('text-[12px] px-2.5 py-1.5 rounded-lg border transition',
              active ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                     : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50')}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ---- Dealer picker option (mirrors Calendar behaviour) ----
interface DealerOption {
  value: string;          // account_number
  label: string;          // "Axima AB · 10239 · BP"
  searchKey: string;
  isMine: boolean;
  company_name: string;
  account_number: string;
}

function dealerToOption(d: DealerAccount, mine: boolean): DealerOption {
  const initials = d.assigned_seller_initials || '';
  const label = `${d.company_name} · ${d.account_number}${initials ? ` · ${initials}` : ''}`;
  return {
    value: d.account_number,
    label,
    searchKey: [d.company_name, d.account_number, d.city, d.country].filter(Boolean).join(' ').toLowerCase(),
    isMine: mine,
    company_name: d.company_name,
    account_number: d.account_number,
  };
}

export default function CrmNewLeadPage() {
  const { appUser, loading: authLoading } = useAppUser();
  const navigate = useNavigate();
  const portalRole = derivePortalRole(appUser);
  const canCreate = isCrmAdmin(portalRole) || isScopedSeller(portalRole);

  // External users: dealer is auto-filled and locked.
  const isInternal = isCrmAdmin(portalRole) || isScopedSeller(portalRole);
  const lockedDealerNumber = !isInternal ? (appUser?.dealer_number ?? null) : null;

  const today = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState('');
  const [responsibleName, setResponsibleName] = useState(appUser?.display_name || appUser?.email || '');
  const [linkedDealer, setLinkedDealer] = useState<string>(lockedDealerNumber || '');
  const [firstContact, setFirstContact] = useState(today);
  const [expectedClose, setExpectedClose] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');

  const [machineTypes, setMachineTypes] = useState<string[]>([]);
  const [nextActivity, setNextActivity] = useState<string>('');
  const [demoHasRun, setDemoHasRun] = useState<'yes' | 'no'>('no');
  const [contactType, setContactType] = useState<string>('');
  const [customerType, setCustomerType] = useState<string>('');

  const [contactInfo, setContactInfo] = useState('');
  const [tradeFair, setTradeFair] = useState('');
  const [country, setCountry] = useState('Danmark');
  const [notes, setNotes] = useState('');
  const [estimatedValue, setEstimatedValue] = useState<string>('');
  const [probability, setProbability] = useState<string>('25');
  const [stage, setStage] = useState<PipelineStage>('Lead');

  const [lostCompetitor, setLostCompetitor] = useState<string>('');
  const [lostCompetitorCustom, setLostCompetitorCustom] = useState('');
  const [lostReason, setLostReason] = useState<string>('');
  const [lostComment, setLostComment] = useState('');

  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Dealer picker state
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (appUser && !responsibleName) setResponsibleName(appUser.display_name || appUser.email);
  }, [appUser, responsibleName]);

  // Load dealer_accounts (same as Calendar)
  useEffect(() => {
    let cancelled = false;
    setDealersLoading(true);
    fetchDealerAccounts({ includeDeleted: false })
      .then(res => { if (!cancelled) setDealers(res.rows); })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setDealersLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const { mineOptions, otherOptions, allOptions } = useMemo(() => {
    const mineInitials = ''; // we don't have seller initials on appUser; rely on email
    const mineEmail = (appUser?.email || '').toLowerCase();
    const opts: DealerOption[] = dealers.map(d => {
      const de = (d.assigned_seller_email || '').toLowerCase();
      const mine = mineEmail !== '' && de === mineEmail;
      return dealerToOption(d, mine);
    });
    const mine = opts.filter(o => o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    const others = opts.filter(o => !o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    return { mineOptions: mine, otherOptions: others, allOptions: opts };
  }, [dealers, appUser]);

  const selectedDealer = allOptions.find(o => o.value === linkedDealer) || null;
  const dealerTriggerLabel = selectedDealer
    ? selectedDealer.label
    : (linkedDealer ? linkedDealer : 'Vælg forhandler…');

  const isLost = stage === 'Lost';

  if (!authLoading && !canCreate) return <Navigate to="/portal/crm" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim())   { toast.error('Titel er påkrævet'); return; }
    if (!linkedDealer)   { toast.error('Vælg en linket forhandler.'); return; }
    if (!contactType)    { toast.error('Vælg kontakttype.'); return; }
    if (!customerType)   { toast.error('Vælg kundetype.'); return; }
    if (!nextActivity)   { toast.error('Vælg næste aktivitet.'); return; }

    setSubmitting(true);
    try {
      const sellerId = await resolveSellerId(appUser?.email);
      await createLead({
        title: title.trim(),
        owner_user_id: sellerId,
        owner_name: responsibleName || null,
        linked_dealer_id: linkedDealer,
        first_contact_date: firstContact || null,
        expected_close_date: expectedClose || null,
        next_followup_date: nextFollowup || null,
        machine_types: machineTypes,
        next_activity: nextActivity,
        demo_has_run: demoHasRun,
        contact_type: contactType,
        customer_type: customerType,
        contact_information: contactInfo || null,
        trade_fair: tradeFair || null,
        country: country || null,
        notes: notes || null,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        probability: probability ? Number(probability) : null,
        pipeline_stage: stage,
        lost_competitor: isLost ? (lostCompetitor === 'Andre' ? (lostCompetitorCustom || 'Andre') : lostCompetitor) || null : null,
        lost_reason: isLost ? (lostReason || null) : null,
        lost_comment: isLost ? (lostComment || null) : null,
        attachments: files,
        status: 'open',
      });
      toast.success('Lead oprettet');
      navigate('/portal/crm/leads');
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke oprette lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CrmLayout pageTitle="Nyt lead">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Nyt lead</h2>
            <p className="text-sm text-gray-500 mt-0.5">Opret et nyt lead i CRM. Aktivitet logges automatisk.</p>
          </div>
          <Link to="/portal/crm/leads" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Tilbage til leads
          </Link>
        </div>

        <form onSubmit={handleSubmit}>
          <Section title="Grundinformation" subtitle="Hvem og hvornår">
            <Field label="Titel" required full>
              <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Fx 'Aalborg Kommune – RC-1000s'" />
            </Field>
            <Field label="Ansvarlig sælger">
              <input className={inputCls} value={responsibleName} onChange={e=>setResponsibleName(e.target.value)} />
            </Field>
            <Field label="Linket forhandler" required>
              {lockedDealerNumber ? (
                <div className={cn(inputCls, 'flex items-center justify-between bg-gray-50 text-gray-700')}>
                  <span className="truncate">{selectedDealer?.label || lockedDealerNumber}</span>
                  <Lock className="h-3.5 w-3.5 text-gray-400 ml-2 shrink-0" />
                </div>
              ) : (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'w-full justify-between font-normal h-10 rounded-xl border-gray-200',
                        !linkedDealer && 'text-gray-400'
                      )}
                    >
                      <span className="truncate text-left">{dealerTriggerLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                    <Command
                      filter={(value, search) => {
                        const opt = allOptions.find(o => o.value === value);
                        const hay = opt ? opt.searchKey : value.toLowerCase();
                        return hay.includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Søg forhandler, nr., by, land…" />
                      <CommandList>
                        <CommandEmpty>{dealersLoading ? 'Henter forhandlere…' : 'Ingen match'}</CommandEmpty>

                        {mineOptions.length > 0 && (
                          <CommandGroup heading="Mine forhandlere">
                            {mineOptions.map(o => (
                              <CommandItem
                                key={o.value}
                                value={o.value}
                                onSelect={() => { setLinkedDealer(o.value); setPickerOpen(false); }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', linkedDealer === o.value ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{o.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}

                        {otherOptions.length > 0 && (
                          <CommandGroup heading="Andre forhandlere">
                            {otherOptions.map(o => (
                              <CommandItem
                                key={o.value}
                                value={o.value}
                                onSelect={() => { setLinkedDealer(o.value); setPickerOpen(false); }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', linkedDealer === o.value ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{o.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </Field>
            <Field label="Første kontakt">
              <input type="date" className={inputCls} value={firstContact} onChange={e=>setFirstContact(e.target.value)} />
            </Field>
            <Field label="Forventet lukkedato">
              <input type="date" className={inputCls} value={expectedClose} onChange={e=>setExpectedClose(e.target.value)} />
            </Field>
            <Field label="Næste opfølgning" full>
              <input type="date" className={inputCls} value={nextFollowup} onChange={e=>setNextFollowup(e.target.value)} />
            </Field>
          </Section>

          <Section title="Maskine-interesse" subtitle="Vælg en eller flere maskiner kunden er interesseret i">
            <div className="md:col-span-2">
              <MultiChip options={MACHINE_TYPE_OPTIONS} value={machineTypes} onChange={setMachineTypes} />
            </div>
          </Section>

          <Section title="Næste aktivitet">
            <Field label="Næste aktivitet" required full>
              <select className={inputCls} value={nextActivity} onChange={e=>setNextActivity(e.target.value)}>
                <option value="">Vælg…</option>
                {NEXT_ACTIVITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          <Section title="Demo">
            <Field label="Demo afholdt?">
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setDemoHasRun(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      demoHasRun===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes'?'Ja':'Nej'}
                  </button>
                ))}
              </div>
            </Field>
            {demoHasRun === 'yes' && (
              <Field label="Konvertering">
                <Link to="/portal/crm/demo-leads/new" className="inline-flex items-center gap-1.5 text-sm text-[#2d5a27] hover:underline self-start mt-1">
                  Convert to Demo Lead →
                </Link>
              </Field>
            )}
          </Section>

          <Section title="Kontakttype & kundetype">
            <Field label="Kontakttype" required>
              <select className={inputCls} value={contactType} onChange={e=>setContactType(e.target.value)}>
                <option value="">Vælg…</option>
                {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Kundetype" required>
              <select className={inputCls} value={customerType} onChange={e=>setCustomerType(e.target.value)}>
                <option value="">Vælg…</option>
                {CUSTOMER_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          <Section title="Detaljer">
            <Field label="Kontaktinformation" full>
              <textarea className={taCls} value={contactInfo} onChange={e=>setContactInfo(e.target.value)} placeholder="Navn, telefon, email, virksomhed…" />
            </Field>
            <Field label="Messe (TradeFair)">
              <input className={inputCls} value={tradeFair} onChange={e=>setTradeFair(e.target.value)} />
            </Field>
            <Field label="Land">
              <input className={inputCls} value={country} onChange={e=>setCountry(e.target.value)} />
            </Field>
            <Field label="Noter" full>
              <textarea className={taCls} value={notes} onChange={e=>setNotes(e.target.value)} />
            </Field>
            <Field label="Budget-estimat (DKK)">
              <input type="number" min={0} className={inputCls} value={estimatedValue} onChange={e=>setEstimatedValue(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Sandsynlighed (%)">
              <input type="number" min={0} max={100} className={inputCls} value={probability} onChange={e=>setProbability(e.target.value)} />
            </Field>
            <Field label="Pipeline-stage" full>
              <div className="flex flex-wrap gap-2">
                {PIPELINE_STAGES.map(s => (
                  <button type="button" key={s} onClick={()=>setStage(s)}
                    className={cn('px-3.5 py-2 rounded-xl text-sm border transition',
                      stage===s ? (s==='Lost' ? 'bg-rose-600 border-rose-600 text-white' : s==='Won' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-[#2d5a27] border-[#2d5a27] text-white')
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {isLost && (
            <section className="bg-rose-50/40 rounded-2xl border border-rose-100 shadow-sm p-6 mb-5">
              <header className="mb-5 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 className="text-[15px] font-semibold text-rose-900">Lost Deal Analysis</h3>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Lost to competitor">
                  <select className={inputCls} value={lostCompetitor} onChange={e=>setLostCompetitor(e.target.value)}>
                    <option value="">Vælg…</option>
                    {LOST_COMPETITOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                {lostCompetitor === 'Andre' && (
                  <Field label="Anden konkurrent (custom)">
                    <input className={inputCls} value={lostCompetitorCustom} onChange={e=>setLostCompetitorCustom(e.target.value)} />
                  </Field>
                )}
                <Field label="Why we lost the order" full>
                  <select className={inputCls} value={lostReason} onChange={e=>setLostReason(e.target.value)}>
                    <option value="">Vælg…</option>
                    {LOST_REASON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Kommentar" full>
                  <textarea className={taCls} value={lostComment} onChange={e=>setLostComment(e.target.value)} />
                </Field>
              </div>
            </section>
          )}

          <Section title="Filer" subtitle="Vedhæft tilbud, billeder eller PDF (gemmes som metadata i preview)">
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-gray-300 rounded-xl px-4 py-6 justify-center hover:bg-gray-50 transition">
                <Upload className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Klik for at vælge filer eller træk dem hertil</span>
                <input type="file" multiple className="hidden" onChange={e => {
                  const list = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }));
                  setFiles(prev => [...prev, ...list]);
                }} />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <span className="truncate text-gray-700">{f.name}</span>
                      <button type="button" onClick={()=>setFiles(files.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-rose-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <div className="sticky bottom-4 flex items-center justify-end gap-3 bg-white/90 backdrop-blur rounded-2xl border border-gray-100 shadow-sm p-3 mt-6">
            <Link to="/portal/crm/leads" className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900">Annuller</Link>
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm transition">
              <Save className="h-4 w-4" />
              {submitting ? 'Gemmer…' : 'Gem lead'}
            </button>
          </div>
        </form>
      </div>
    </CrmLayout>
  );
}
