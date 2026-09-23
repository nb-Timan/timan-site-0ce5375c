import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
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
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';
import { setAcademyCycleStorageScope } from '@/lib/academyCycleStorage';
import { getMyAcademyCycle, recordAcademyCycleCompletion, type AcademyCycleSnapshot } from '@/lib/academyCyclesService';
import {
  activateLocalAcademyEnrollment,
  getAcademyCapabilityProgress,
  getLocalAcademyUser,
  isAcademyCapabilityUnlocked,
} from '@/lib/academyCurriculum';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { t } from '@/lib/i18n/translations';
import { cn } from '@/lib/utils';
import { ACADEMY_AREA_ICONS } from '@/lib/academyAreaIcons';

type State = 'new' | 'active' | 'ready' | 'done' | 'locked';

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

function Status({ state, label }: { state: State; label: string }) {
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
      {label}
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

function LockedModule({ icon: Icon, title, progress, description, lockedLabel }: {
  icon: typeof ShoppingCart;
  title: string;
  progress: string;
  description: string;
  lockedLabel: string;
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
        <Status state="locked" label={lockedLabel} />
      </div>
    </section>
  );
}

function AcademyRow({ icon: Icon, title, description, state, statusLabel, action, onClick }: {
  icon: typeof ShoppingCart;
  title: string;
  description: string;
  state: State;
  statusLabel: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 border-t border-slate-100 px-4 py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-[#126a45]">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1 sm:flex-nowrap sm:gap-3">
        <Status state={state} label={statusLabel} />
        {action && (
          <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md bg-[#126a45] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0f5a3b]">
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
  const { language, uiLanguage, setLanguage } = useLanguage();
  const tr = (key: string) => t(key, uiLanguage);
  const stateLabel = (state: State) => tr(`academyStatus${state[0].toUpperCase()}${state.slice(1)}`);
  const [cycleSnapshot, setCycleSnapshot] = useState<AcademyCycleSnapshot | null>(null);
  const [cycleResolved, setCycleResolved] = useState(false);
  const [cycleLoadFailed, setCycleLoadFailed] = useState(false);
  const [, setProgressVersion] = useState(0);
  const task = academySandbox.getCase1();
  const videoTask = academySandbox.getCase2();
  const portalBasics = academySandbox.getPortalBasics();
  const partnerMap = academySandbox.getPartnerMap();
  const crm = academyCrmSandbox.getProgress();
  const partnerData = academyPartnerDataSandbox.getProgress();

  const applyCycleSnapshot = (snapshot: AcademyCycleSnapshot, localPreview: boolean) => {
    if (snapshot.cycle) {
      setAcademyCycleStorageScope(snapshot.cycle.id, snapshot.cycle.reset_version, snapshot.cycle.status);
      if (snapshot.cycle.status === 'active') academySandbox.enterSession();
    } else if (!localPreview) {
      academySandbox.leaveSession();
    }
    setCycleSnapshot(snapshot);
    setCycleLoadFailed(false);
    setCycleResolved(true);
    setProgressVersion((value) => value + 1);
  };

  // Only a local development preview may work without a Backend-created cycle.
  useEffect(() => {
    const localPreview = !appUser && import.meta.env.DEV;
    if (localPreview) {
      activateLocalAcademyEnrollment();
      setAcademyCycleStorageScope('local-preview');
      academySandbox.enterSession();
    }
    let cancelled = false;
    void getMyAcademyCycle()
      .then((snapshot) => {
        if (cancelled) return;
        applyCycleSnapshot(snapshot, localPreview);
      })
      .catch(() => {
        if (!cancelled) {
          setCycleLoadFailed(true);
          setCycleResolved(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const refresh = () => setProgressVersion((value) => value + 1);
    window.addEventListener('timan:academy-progress-changed', refresh);
    window.addEventListener('timan:academy-crm-changed', refresh);
    window.addEventListener('timan:academy-partnerdata-changed', refresh);
    return () => {
      window.removeEventListener('timan:academy-progress-changed', refresh);
      window.removeEventListener('timan:academy-crm-changed', refresh);
      window.removeEventListener('timan:academy-partnerdata-changed', refresh);
    };
  }, []);

  const user = effectiveUser || appUser || getLocalAcademyUser();
  const completed = academySandbox.getCompletedCaseIds();
  const configurator = getAcademyCapabilityProgress('configurator', completed);
  const unlocked = !resolving && isAcademyCapabilityUnlocked(user, 'configurator', completed);
  const caseState: State = task.completed ? 'done' : task.started ? 'active' : 'new';
  const case2Unlocked = task.completed;
  const videoCaseState: State = videoTask.completed ? 'done' : videoTask.started && case2Unlocked ? 'active' : case2Unlocked ? 'ready' : 'locked';
  const crmCompleted = Number(Boolean(crm.part1Completed)) + Number(Boolean(crm.part2Completed));
  const partnerDataCompleted = Number(Boolean(partnerData.part1Completed)) + Number(Boolean(partnerData.part2Completed));
  const overallCompleted = Number(Boolean(task.completed)) + Number(Boolean(videoTask.completed)) + Number(Boolean(portalBasics.completed)) + Number(Boolean(partnerMap.completed)) + crmCompleted + partnerDataCompleted;
  const overallTotal = 8;
  const overallPercentage = overallCompleted / overallTotal * 100;
  const localCompletionIds = [
    ...academySandbox.getCompletedCaseIds(),
    crm.part1Completed && 'crm.part_1',
    crm.part2Completed && 'crm.part_2',
    partnerData.part1Completed && 'partnerdata.part_1_profile',
    partnerData.part2Completed && 'partnerdata.part_2_relations',
  ].filter(Boolean) as string[];
  const cycle = cycleSnapshot?.cycle ?? null;
  const activeCycle = cycle?.status === 'active' ? cycle : null;
  const cycleMissing = Boolean(appUser) && cycleResolved && !cycle && !cycleLoadFailed;
  const cycleActionBlocked = Boolean(appUser) && cycleResolved && !activeCycle;
  const academyAction = (label: string | undefined) => cycleActionBlocked ? undefined : label;
  const actionForCase = (state: State, started: boolean) => state === 'done' || state === 'locked'
    ? undefined
    : academyAction(started ? tr('academyContinue') : tr('academyStart'));
  const completedCycles = cycleSnapshot?.completedCycleCount ?? 0;
  const awardCounts = cycleSnapshot?.awardCounts ?? { bronze: 0, silver: 0, gold: 0 };
  const currentCycleAwards = cycleSnapshot?.awards ?? [];
  const nextAward = !currentCycleAwards.includes('bronze') ? tr('academyAwardBronze') : !currentCycleAwards.includes('silver') ? tr('academyAwardSilver') : !currentCycleAwards.includes('gold') ? tr('academyAwardGold') : tr('academyAllBadges');

  useEffect(() => {
    if (!activeCycle) return;
    const missing = localCompletionIds.filter((id) => !cycleSnapshot?.completionIds.includes(id));
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      for (const caseId of missing) {
        try {
          await recordAcademyCycleCompletion(cycle.id, caseId);
          if (!cancelled) {
            // The final completion can lock the cycle and schedule its next
            // activation. Read the canonical server snapshot back instead of
            // trying to reproduce lifecycle transitions in the browser.
            applyCycleSnapshot(await getMyAcademyCycle(), !appUser && import.meta.env.DEV);
          }
        } catch {
          // Keep the completed local exercise. Metadata sync retries next time.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeCycle?.id, activeCycle?.status, cycleSnapshot?.completionIds.join(','), localCompletionIds.join(',')]);
  const portalBasicsState: State = portalBasics.completed ? 'done' : portalBasics.started ? 'active' : 'new';
  const partnerMapUnlocked = portalBasics.completed;
  const partnerMapState: State = partnerMap.completed ? 'done' : partnerMap.started && partnerMapUnlocked ? 'active' : partnerMapUnlocked ? 'ready' : 'locked';
  const crmPart1State: State = crm.part1Completed ? 'done' : academyCrmSandbox.getState().part1Started ? 'active' : 'new';
  const crmPart2State: State = crm.part2Completed ? 'done' : academyCrmSandbox.getState().part2Started ? 'active' : crm.part1Completed ? 'ready' : 'locked';
  const partnerDataPart1State: State = partnerData.part1Completed ? 'done' : academyPartnerDataSandbox.getState().part1Started ? 'active' : 'new';
  const partnerDataPart2State: State = partnerData.part2Completed ? 'done' : academyPartnerDataSandbox.getState().part2Started ? 'active' : partnerData.part1Completed ? 'ready' : 'locked';
  const startCase = () => {
    if (cycleActionBlocked) return;
    academySandbox.startCase1();
    navigate('/configurator?academy_mode=true');
  };
  const startVideoCase = () => {
    if (cycleActionBlocked) return;
    if (!academySandbox.isCase2Unlocked()) return;
    academySandbox.startCase2();
    navigate('/portal/videos?academy_mode=true&academy_case=2');
  };
  const startPortalBasics = () => {
    if (cycleActionBlocked) return;
    academyPartnerDataSandbox.leaveCase();
    academySandbox.startPortalBasics(language);
    navigate('/portal?academy_mode=true');
  };
  const startCrmPart1 = () => {
    if (cycleActionBlocked) return;
    academyCrmSandbox.start(1);
    navigate('/academy/crm/leads?academy_mode=true&academy_part=1');
  };
  const startCrmPart2 = () => {
    if (cycleActionBlocked) return;
    academyCrmSandbox.start(2);
    navigate('/academy/crm/leads?academy_mode=true&academy_part=2');
  };
  const startPartnerMap = () => {
    if (cycleActionBlocked) return;
    academyPartnerDataSandbox.leaveCase();
    academySandbox.startPartnerMap();
    navigate('/portal/misc/partner-map?academy_mode=true');
  };
  const startPartnerDataPart1 = () => {
    if (cycleActionBlocked) return;
    academyPartnerDataSandbox.start(1);
    navigate('/portal/dealer-data?academy_mode=true&academy_part=1');
  };
  const startPartnerDataPart2 = () => {
    if (cycleActionBlocked) return;
    academyPartnerDataSandbox.start(2);
    navigate('/portal/dealer-data?academy_mode=true&academy_part=2');
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
          <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">{tr('academyTitle')}</h1>
                <p className="mt-1.5 max-w-xl text-sm leading-5 text-slate-600">{tr('academySandboxNotice')}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-800">{cycle ? (cycle.status === 'completed' ? tr('academyCycleCompleted') : tr('academyCycleActive')).replace('{number}', String(cycle.cycle_number)) : tr('academyLocalPreview')}</p>
              </div>
              <div className="border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Map className="h-4 w-4 text-[#126a45]" />{tr('academySalesJourney')}</div>
                <div className="relative mt-5 flex items-start justify-between">
                  <div className="absolute left-[12%] right-[12%] top-[18px] h-px bg-slate-200" />
                  <Journey icon={ShoppingCart} label={tr('academyConfigurator')} active={unlocked} />
                  <Journey icon={Users} label="CRM" active={crm.part1Completed} />
                  <Journey icon={CirclePlay} label={tr('academyDemo')} active={crm.part2Completed} />
                  <Journey icon={Gem} label={tr('academyQuoteOrder')} />
                </div>
              </div>
            </div>
          </section>

          {params.get('locked') && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <LockKeyhole className="h-4 w-4" />
              {tr('academyNeedsAcademy')}
            </div>
          )}

          {cycleMissing && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <LockKeyhole className="h-4 w-4 shrink-0" />
              {tr('academyNoActiveCycle')}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <section className="min-h-[154px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><BarChart3 className="h-4 w-4 text-[#126a45]" />{tr('academyProgress')}</div>
              <div className="mt-4 text-2xl font-bold text-slate-900">{overallCompleted} / {overallTotal}</div>
              <ProgressBar value={overallPercentage} />
              <p className="mt-2 text-xs font-medium text-slate-500">{Math.round(overallPercentage)}% {tr('academyCompleted')}{cycle ? ` · ${tr('academyCycleLabel')} ${cycle.cycle_number}` : ''}</p>
            </section>
            <section className="min-h-[154px] rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Lock className="h-4 w-4 text-amber-700" />{tr('academyNextUnlock')}</div>
              <p className="mt-3 text-sm font-bold text-slate-900">Konfigurator</p>
              <p className="mt-1 min-h-8 text-xs leading-4 text-slate-700">{unlocked ? tr('academyConfiguratorUnlocked') : tr('academyCompleteSalesCase1')}</p>
              <ProgressBar value={configurator.total ? configurator.completedCount / configurator.total * 100 : 0} gold />
              <p className="mt-2 text-xs font-bold text-slate-700">{configurator.completedCount} / {configurator.total} {tr('academyCompleted')}</p>
            </section>
            <section className="min-h-[154px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Trophy className="h-4 w-4 text-amber-600" />{tr('academyNextMilestone')}</div>
              <p className="mt-3 text-lg font-bold text-slate-900">{nextAward}</p>
              <p className="mt-1 text-xs leading-4 text-slate-600">{currentCycleAwards.length === 3 ? tr('academyAllBadges') : completedCycles ? tr('academyCompletedCycles').replace('{count}', String(completedCycles)) : tr('academyCompleteSalesTasks')}</p>
              <ProgressBar value={overallPercentage} />
              <p className="mt-2 text-xs font-bold text-slate-600">{overallCompleted} / {overallTotal}</p>
            </section>
            <section className="min-h-[154px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Medal className="h-4 w-4 text-[#126a45]" />{tr('academyBadges')}</div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold text-slate-800"><Medal className="h-4 w-4 text-[#b77939]" />{tr('academyAwardBronze')}</span><span className="text-slate-500">× {awardCounts.bronze}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold text-slate-700"><ShieldCheck className="h-4 w-4 text-slate-400" />{tr('academyAwardSilver')}</span><span className="text-slate-500">× {awardCounts.silver}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold text-slate-700"><Crown className="h-4 w-4 text-amber-500" />{tr('academyAwardGold')}</span><span className="text-slate-500">× {awardCounts.gold}</span></div>
              </div>
            </section>
          </div>

          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            <Module icon={ACADEMY_AREA_ICONS.sales} title={tr('academySales')} progress={`${Number(task.completed) + Number(videoTask.completed)} / 2 ${tr('academyCompleted')}`}>
              <AcademyRow icon={ACADEMY_AREA_ICONS.sales} title={tr('academySalesCase1Title')} description={tr('academySalesCase1Description')} state={caseState} statusLabel={stateLabel(caseState)} action={actionForCase(caseState, task.started)} onClick={cycleActionBlocked ? undefined : startCase} />
              <AcademyRow icon={ACADEMY_AREA_ICONS.sales} title={tr('academySalesCase2Title')} description={tr('academySalesCase2Description')} state={videoCaseState} statusLabel={stateLabel(videoCaseState)} action={actionForCase(videoCaseState, videoTask.started)} onClick={cycleActionBlocked ? undefined : case2Unlocked ? startVideoCase : undefined} />
            </Module>
            <Module icon={ACADEMY_AREA_ICONS.portalBasics} title={tr('academyPortalBasics')} progress={`${Number(portalBasics.completed) + Number(partnerMap.completed)} / 2 ${tr('academyCompleted')}`}>
              <AcademyRow icon={ACADEMY_AREA_ICONS.portalBasics} title={tr('academyPortalBasicsCaseTitle')} description={tr('academyPortalBasicsCaseDescription')} state={portalBasicsState} statusLabel={stateLabel(portalBasicsState)} action={actionForCase(portalBasicsState, portalBasics.started)} onClick={cycleActionBlocked ? undefined : startPortalBasics} />
              <AcademyRow icon={ACADEMY_AREA_ICONS.portalBasics} title={tr('academyPartnerMapTitle')} description={tr('academyPartnerMapDescription')} state={partnerMapState} statusLabel={stateLabel(partnerMapState)} action={actionForCase(partnerMapState, partnerMap.started)} onClick={cycleActionBlocked ? undefined : partnerMapUnlocked ? startPartnerMap : undefined} />
            </Module>
            <Module icon={ACADEMY_AREA_ICONS.partnerData} title={tr('academyPartnerData')} progress={`${partnerDataCompleted} / 2 ${tr('academyCompleted')}`}>
              <AcademyRow icon={ACADEMY_AREA_ICONS.partnerData} title={tr('academyPartnerDataPart1Title')} description={tr('academyPartnerDataPart1Description')} state={partnerDataPart1State} statusLabel={stateLabel(partnerDataPart1State)} action={actionForCase(partnerDataPart1State, academyPartnerDataSandbox.getState().part1Started)} onClick={cycleActionBlocked ? undefined : startPartnerDataPart1} />
              <AcademyRow icon={ACADEMY_AREA_ICONS.partnerData} title={tr('academyPartnerDataPart2Title')} description={tr('academyPartnerDataPart2Description')} state={partnerDataPart2State} statusLabel={stateLabel(partnerDataPart2State)} action={actionForCase(partnerDataPart2State, academyPartnerDataSandbox.getState().part2Started)} onClick={cycleActionBlocked ? undefined : partnerData.part1Completed ? startPartnerDataPart2 : undefined} />
            </Module>
            <Module icon={ACADEMY_AREA_ICONS.crm} title="CRM" progress={`${crmCompleted} / 2 ${tr('academyCompleted')}`}>
              <AcademyRow icon={ACADEMY_AREA_ICONS.crm} title={tr('academyCrmCase1Title')} description={tr('academyCrmDashboardCase1Description')} state={crmPart1State} statusLabel={stateLabel(crmPart1State)} action={actionForCase(crmPart1State, academyCrmSandbox.getState().part1Started)} onClick={cycleActionBlocked ? undefined : startCrmPart1} />
              <AcademyRow icon={ACADEMY_AREA_ICONS.crm} title={tr('academyCrmCase2Title')} description={tr('academyCrmDashboardCase2Description')} state={crmPart2State} statusLabel={stateLabel(crmPart2State)} action={actionForCase(crmPart2State, academyCrmSandbox.getState().part2Started)} onClick={cycleActionBlocked ? undefined : crm.part1Completed ? startCrmPart2 : undefined} />
            </Module>
            <LockedModule icon={CalendarDays} title={tr('academyCalendar')} progress={`0 / 1 ${tr('academyCompleted')}`} description={tr('academyCalendarLocked')} lockedLabel={stateLabel('locked')} />
          </div>

          <Link className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#126a45] hover:underline" to="/portal">← {tr('academyBackToPortal')}</Link>
        </div>
      </main>
    </div>
  );
}
