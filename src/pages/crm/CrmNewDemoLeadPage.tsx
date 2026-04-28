import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  createDemoLead, DEMO_MACHINE_CATEGORY, DEMO_MACHINE_OPTIONS, DEMO_EQUIPMENT_OPTIONS, DEMO_RESULT_STATUS,
} from '@/lib/crmLeadsService';
import { toast } from 'sonner';
import { ArrowLeft, Save, X, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function Chips({ options, value, onChange, single }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button type="button" key={o} onClick={() => {
            if (single) onChange([o]);
            else onChange(active ? value.filter(v => v !== o) : [...value, o]);
          }}
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

export default function CrmNewDemoLeadPage() {
  const { appUser, loading: authLoading } = useAppUser();
  const navigate = useNavigate();
  const portalRole = derivePortalRole(appUser);
  const canCreate = isCrmAdmin(portalRole) || isScopedSeller(portalRole);

  const today = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState('');
  const [responsibleName, setResponsibleName] = useState(appUser?.display_name || appUser?.email || '');
  const [dealerCompany, setDealerCompany] = useState('');
  const [dealerRep, setDealerRep] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [machineCategory, setMachineCategory] = useState<string[]>([]);
  const [demoMachine, setDemoMachine] = useState<string[]>([]); // single
  const [demoEquipment, setDemoEquipment] = useState<string[]>([]);

  const [demoDate, setDemoDate] = useState(today);
  const [interest, setInterest] = useState(3);
  const [wantsOffer, setWantsOffer] = useState<'yes' | 'no'>('yes');
  const [followup, setFollowup] = useState('');
  const [estValue, setEstValue] = useState('');
  const [probability, setProbability] = useState('40');
  const [competitorsPresent, setCompetitorsPresent] = useState<'yes' | 'no'>('no');
  const [competitorName, setCompetitorName] = useState('');
  const [notesAfter, setNotesAfter] = useState('');
  const [status, setStatus] = useState<string>('Warm lead');

  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && !canCreate) return <Navigate to="/portal/crm" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Titel er påkrævet'); return; }
    setSubmitting(true);
    try {
      const sellerId = await resolveSellerId(appUser?.email);
      await createDemoLead({
        title: title.trim(),
        owner_user_id: sellerId,
        owner_name: responsibleName || null,
        dealer_company: dealerCompany || null,
        dealer_rep: dealerRep || null,
        customer_name: customerName || null,
        customer_address: customerAddress || null,
        notes: notes || null,
        machine_category: machineCategory,
        demo_machine: demoMachine[0] || null,
        demo_equipment: demoEquipment,
        demo_date: demoDate || null,
        interest_level: interest,
        wants_offer: wantsOffer,
        followup_date: followup || null,
        estimated_value: estValue ? Number(estValue) : null,
        probability: probability ? Number(probability) : null,
        competitors_present: competitorsPresent,
        competitor_name: competitorsPresent === 'yes' ? (competitorName || null) : null,
        notes_after_demo: notesAfter || null,
        result_status: status,
        attachments: files,
      });
      toast.success('Demo lead oprettet');
      navigate('/portal/crm/demo-leads');
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke oprette demo lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CrmLayout pageTitle="Nyt demo lead">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Nyt demo lead</h2>
            <p className="text-sm text-gray-500 mt-0.5">Opfølgning efter en gennemført maskindemonstration.</p>
          </div>
          <Link to="/portal/crm/demo-leads" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </Link>
        </div>

        <form onSubmit={handleSubmit}>
          <Section title="Grundinformation">
            <Field label="Titel" required full>
              <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Fx 'Demo Aalborg Kommune – RC-1000s'" />
            </Field>
            <Field label="Ansvarlig sælger">
              <input className={inputCls} value={responsibleName} onChange={e=>setResponsibleName(e.target.value)} />
            </Field>
            <Field label="Forhandler-firma">
              <input className={inputCls} value={dealerCompany} onChange={e=>setDealerCompany(e.target.value)} />
            </Field>
            <Field label="Sælger / demonstrator hos forhandler">
              <input className={inputCls} value={dealerRep} onChange={e=>setDealerRep(e.target.value)} />
            </Field>
            <Field label="Kunde-firma / CVR">
              <input className={inputCls} value={customerName} onChange={e=>setCustomerName(e.target.value)} />
            </Field>
            <Field label="Kunde-adresse" full>
              <input className={inputCls} value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} />
            </Field>
            <Field label="Noter / øvrig info" full>
              <textarea className={taCls} value={notes} onChange={e=>setNotes(e.target.value)} />
            </Field>
          </Section>

          <Section title="Demo-type" subtitle="Hvad blev demonstreret">
            <div className="md:col-span-2">
              <Chips options={DEMO_MACHINE_CATEGORY} value={machineCategory} onChange={setMachineCategory} />
            </div>
          </Section>

          <Section title="Demonstreret maskine">
            <div className="md:col-span-2">
              <Chips options={DEMO_MACHINE_OPTIONS} value={demoMachine} onChange={setDemoMachine} single />
            </div>
          </Section>

          <Section title="Demonstreret udstyr" subtitle="Vælg et eller flere">
            <div className="md:col-span-2">
              <Chips options={DEMO_EQUIPMENT_OPTIONS} value={demoEquipment} onChange={setDemoEquipment} />
            </div>
          </Section>

          <Section title="Demo-resultat">
            <Field label="Demo-dato">
              <input type="date" className={inputCls} value={demoDate} onChange={e=>setDemoDate(e.target.value)} />
            </Field>
            <Field label="Kundens interesse (1-5)">
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button type="button" key={n} onClick={()=>setInterest(n)}
                    className={cn('w-10 h-10 rounded-xl border text-sm font-medium transition',
                      interest===n ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Ønsker tilbud?">
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setWantsOffer(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      wantsOffer===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes'?'Ja':'Nej'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Opfølgningsdato">
              <input type="date" className={inputCls} value={followup} onChange={e=>setFollowup(e.target.value)} />
            </Field>
            <Field label="Forventet handelsstørrelse (DKK)">
              <input type="number" min={0} className={inputCls} value={estValue} onChange={e=>setEstValue(e.target.value)} />
            </Field>
            <Field label="Sandsynlighed (%)">
              <input type="number" min={0} max={100} className={inputCls} value={probability} onChange={e=>setProbability(e.target.value)} />
            </Field>
            <Field label="Konkurrenter til stede?">
              <div className="flex gap-2">
                {(['yes','no'] as const).map(v => (
                  <button type="button" key={v} onClick={()=>setCompetitorsPresent(v)}
                    className={cn('px-4 py-2 rounded-xl text-sm border transition',
                      competitorsPresent===v ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {v==='yes'?'Ja':'Nej'}
                  </button>
                ))}
              </div>
            </Field>
            {competitorsPresent === 'yes' && (
              <Field label="Hvilken konkurrent">
                <input className={inputCls} value={competitorName} onChange={e=>setCompetitorName(e.target.value)} />
              </Field>
            )}
            <Field label="Noter efter demo" full>
              <textarea className={taCls} value={notesAfter} onChange={e=>setNotesAfter(e.target.value)} />
            </Field>
          </Section>

          <Section title="Resultat (status)">
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {DEMO_RESULT_STATUS.map(s => (
                <button type="button" key={s} onClick={()=>setStatus(s)}
                  className={cn('px-3.5 py-2 rounded-xl text-sm border transition',
                    status===s ? 'bg-[#2d5a27] border-[#2d5a27] text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}>
                  {s}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Vedhæftninger" subtitle="Billeder, signerede papirer, noter, demo-dokumenter">
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-gray-300 rounded-xl px-4 py-6 justify-center hover:bg-gray-50 transition">
                <Upload className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Klik for at vælge filer</span>
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
            <Link to="/portal/crm/demo-leads" className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900">Annuller</Link>
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm transition">
              <Save className="h-4 w-4" />
              {submitting ? 'Gemmer…' : 'Gem demo lead'}
            </button>
          </div>
        </form>
      </div>
    </CrmLayout>
  );
}
