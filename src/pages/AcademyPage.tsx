import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  ClipboardList,
  Crown,
  Gem,
  Lock,
  LockKeyhole,
  Map,
  Medal,
  ShieldCheck,
  ShoppingCart,
  Trophy,
  Users,
} from 'lucide-react';
import PortalHeader from '@/components/portal/PortalHeader';
import { academySandbox } from '@/lib/academySandbox';
import {
  activateLocalAcademyEnrollment,
  getAcademyCapabilityProgress,
  getAcademyProgress,
  getLocalAcademyUser,
  isAcademyCapabilityUnlocked,
} from '@/lib/academyCurriculum';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { cn } from '@/lib/utils';

type State = 'new' | 'active' | 'ready' | 'done' | 'locked';

const labels: Record<State, string> = {
  new: 'Ny',
  active: 'I gang',
  ready: 'Klar',
  done: 'Gennemført',
  locked: 'Låst',
};

function ProgressBar({ value, gold = false }: { value: number; gold?: boolean }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn('h-full rounded-full', gold ? 'bg-amber-500' : 'bg-emerald-600')}
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function Status({ state }: { state: State }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        state === 'new' && 'bg-sky-50 text-sky-700',
        state === 'active' && 'bg-amber-50 text-amber-800',
        state === 'ready' && 'bg-emerald-50 text-emerald-700',
        state === 'done' && 'bg-emerald-100 text-emerald-800',
        state === 'locked' && 'bg-slate-100 text-slate-500',
      )}
    >
      {state === 'locked' ? <Lock className="h-3 w-3" /> : state === 'done' ? <CheckCircle2 className="h-3 w-3" /> : null}
      {labels[state]}
    </span>
  );
}

function Module({ icon: Icon, title, progress, children }: {
  icon: typeof ShoppingCart;
  title: string;
  progress: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Icon className="h-[18px] w-[18px] text-[#126a45]" />
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        </div>
        <span className="text-xs font-medium text-slate-500">{progress}</span>
      </header>
      {children}
    </section>
  );
}

function LockedModule({ icon: Icon, title, progress, description }: {
  icon: typeof ShoppingCart;
  title: string;
  progress: string;
  description: string;
}) {
  return (
    <section className="flex min-h-[104px] flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{progress}</span>
        <Status state="locked" />
      </div>
    </section>
  );
}

function AcademyRow({ image, title, description, state, action, onClick }: {
  image?: string;
  title: string;
  description: string;
  state: State;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-100 px-4 py-2.5">
      <div className="flex h-10 w-11 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ClipboardList className="h-5 w-5 text-slate-400" />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <Status state={state} />
        {action && (
          <button type="button" onClick={onClick} className="hidden items-center gap-1 rounded-md bg-[#126a45] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0f5a3b] sm:inline-flex">
            {action}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
}

function Journey({ icon: Icon, label, active = false }: { icon: typeof ShoppingCart; label: string; active?: boolean }) {
  return (
    <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center text-center">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-full border', active ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-slate-50 text-slate-400')}>
        <Icon className="h-4 w-4" />
      </div>
      <span className={cn('mt-2 max-w-16 text-[10px] font-semibold leading-3', active ? 'text-[#126a45]' : 'text-slate-500')}>{label}</span>
    </div>
  );
}

export default function AcademyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { appUser, logout } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const { language, setLanguage } = useLanguage();
  const task = academySandbox.getCase1();

  // Enrollment is training state only; the portal's authenticated user remains untouched.
  useEffect(() => { activateLocalAcademyEnrollment(); }, []);

  const user = effectiveUser || appUser || getLocalAcademyUser();
  const completed = academySandbox.getCompletedCaseIds();
  const progress = getAcademyProgress(user, completed);
  const configurator = getAcademyCapabilityProgress('configurator', completed);
  const unlocked = !resolving && isAcademyCapabilityUnlocked(user, 'configurator', completed);
  const requirements = [
    task.machine,
    task.flail,
    task.weedBrush,
    task.requiredComponents,
    task.workLight,
    task.wireHarness,
    task.deliveryDiscount,
    task.quantityDiscount,
    task.quoteGenerated,
    Boolean(task.leadId),
  ].filter(Boolean).length;
  const caseState: State = task.completed ? 'done' : task.started ? 'active' : 'new';
  const startCase = () => {
    academySandbox.startCase1();
    navigate('/configurator?academy_mode=true');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader
        user={user}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />
      <main className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[1600px]">
          <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
            <div className="relative z-10 max-w-2xl">
              <h1 className="text-3xl font-bold text-slate-900">Min Academy</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-5 text-slate-600">Academy træningsmiljø. Du arbejder med træningsdata. Ingen rigtige kunder, mails eller salgsdata påvirkes.</p>
            </div>
            <img src="/messe/machines/rc-1000s-tile.png" alt="" className="pointer-events-none absolute right-6 top-1/2 hidden h-[115%] w-64 -translate-y-1/2 object-contain opacity-70 xl:block" />
          </section>

          {params.get('locked') && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <LockKeyhole className="h-4 w-4" />
              Denne funktion kræver Academy. Gennemfør det relevante forløb først.
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <section className="min-h-[154px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><BarChart3 className="h-4 w-4 text-[#126a45]" />Din progression</div>
              <div className="mt-4 text-2xl font-bold text-slate-900">{progress.completedCount} / {progress.total}</div>
              <ProgressBar value={progress.percentage} />
              <p className="mt-2 text-xs font-medium text-slate-500">{progress.percentage}% gennemført</p>
            </section>
            <section className="min-h-[154px] rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Lock className="h-4 w-4 text-amber-700" />Næste oplåsning</div>
              <p className="mt-3 text-sm font-bold text-slate-900">Konfigurator</p>
              <p className="mt-1 min-h-8 text-xs leading-4 text-slate-700">{unlocked ? 'Konfigurator er nu låst op.' : 'Gennemfør Sales Case 1 for at få adgang.'}</p>
              <ProgressBar value={configurator.total ? configurator.completedCount / configurator.total * 100 : 0} gold />
              <p className="mt-2 text-xs font-bold text-slate-700">{configurator.completedCount} / {configurator.total} gennemført</p>
            </section>
            <section className="min-h-[154px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Trophy className="h-4 w-4 text-amber-600" />Næste milepæl</div>
              <p className="mt-3 text-lg font-bold text-slate-900">Bronze</p>
              <p className="mt-1 text-xs leading-4 text-slate-600">Gennemfør grundlæggende Sales-opgaver.</p>
              <ProgressBar value={progress.percentage} />
              <p className="mt-2 text-xs font-bold text-slate-600">{progress.completedCount} / {progress.total}</p>
            </section>
            <section className="min-h-[154px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Medal className="h-4 w-4 text-[#126a45]" />Badges</div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold text-slate-800"><Medal className="h-4 w-4 text-[#b77939]" />Bronze</span><span className="text-slate-500">Grundforløb</span></div>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold text-slate-700"><ShieldCheck className="h-4 w-4 text-slate-400" />Sølv</span><span className="text-slate-500">Sales</span></div>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold text-slate-700"><Crown className="h-4 w-4 text-amber-500" />Guld</span><span className="text-slate-500">Komplet</span></div>
              </div>
            </section>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="relative min-h-[174px] overflow-hidden rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
              <div className="relative z-10">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><CirclePlay className="h-4 w-4 text-[#126a45]" />Fortsæt hvor jeg slap</div>
                <p className="mt-3 text-sm font-bold text-slate-900">Case 1 - Byg korrekt RC-1000 ordre</p>
                <p className="mt-1 text-xs text-slate-500">{requirements} af 10 krav opfyldt</p>
                <button type="button" onClick={startCase} className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#126a45] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0f5a3b]">
                  {task.started ? 'Fortsæt' : 'Start'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <img src="/messe/machines/rc-1000s-tile.png" alt="" className="pointer-events-none absolute -bottom-6 right-2 h-36 w-36 object-contain opacity-80" />
            </section>
            <section className="min-h-[174px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Map className="h-4 w-4 text-[#126a45]" />Din Sales Academy</div>
              <div className="relative mt-6 flex items-start justify-between">
                <div className="absolute left-[12%] right-[12%] top-[18px] h-px bg-slate-200" />
                <Journey icon={ShoppingCart} label="Konfigurator" active={unlocked} />
                <Journey icon={Users} label="CRM" />
                <Journey icon={CirclePlay} label="Demo" />
                <Journey icon={Gem} label="Tilbud & ordre" />
              </div>
            </section>
          </div>

          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            <Module icon={ShoppingCart} title="Salg" progress={`${task.completed ? 1 : 0} / 2 gennemført`}>
              <AcademyRow image="/messe/machines/rc-1000s-tile.png" title="Case 1 - Byg korrekt RC-1000 ordre" description="Konfigurer RC-1000 med nødvendigt udstyr, rabatter og Academy-lead." state={caseState} action={task.started ? 'Fortsæt' : 'Start'} onClick={startCase} />
              <AcademyRow image="/messe/machines/timan-3330-tile.png" title="Case 2 - Find en vedligeholdelsesvideo" description="Find og åbn den korrekte Weed Brush-vedligeholdelsesvideo for Timan 3330." state="ready" />
            </Module>
            <Module icon={Users} title="Partnerdata" progress="0 / 2 gennemført">
              <AcademyRow title="Part 1 - Virksomheds- og persondata" description="Tilføj rigtige kontaktpersoner, vælg første kontakt og opdater virksomhedens YouTube-kanal." state="new" />
              <AcademyRow title="Part 2 - Samarbejdspartnere og fakturering" description="Lær partnerrelationer og fakturaaccept for reservedelsbestilling at kende." state="locked" />
            </Module>
            <LockedModule icon={Users} title="CRM" progress="0 / 2 gennemført" description="Låses op senere i Academy-rejsen." />
            <LockedModule icon={CalendarDays} title="Kalender" progress="0 / 1 gennemført" description="Låses op senere i Academy-rejsen." />
          </div>

          <Link className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#126a45] hover:underline" to="/portal">← Tilbage til portalen</Link>
        </div>
      </main>
    </div>
  );
}
