import { CheckCircle2, Circle, GraduationCap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import AcademyCompletionModal from './AcademyCompletionModal';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { academySandbox, type AcademyActiveCase } from '@/lib/academySandbox';

export type AcademyGuidanceTask = { label: string; description?: string; complete: boolean };
export type AcademyGuidanceStep = { title: string; description?: string; tasks: AcademyGuidanceTask[] };

export default function AcademyGuidancePanel({
  title,
  description,
  tasks,
  steps,
  next,
  actions,
  completion = false,
  explanation,
  activeTaskLabel,
  stepColumns = 1,
  stepNumbers,
  stepLabelKey = 'academyStep',
  nextLabelKey = 'academyNextStep',
  caseId,
}: {
  title: string;
  description: string;
  tasks?: AcademyGuidanceTask[];
  steps?: AcademyGuidanceStep[];
  next: string;
  actions?: ReactNode;
  completion?: boolean | { nextUnlock?: string };
  explanation?: ReactNode;
  activeTaskLabel?: string;
  stepColumns?: 1 | 2 | 3;
  stepNumbers?: string[];
  stepLabelKey?: string;
  nextLabelKey?: string;
  caseId?: AcademyActiveCase;
}) {
  const navigate = useNavigate();
  const { uiLanguage } = useOptionalLanguage();
  const tr = (key: string) => t(key, uiLanguage);
  const allTasks = steps?.flatMap((step) => step.tasks) ?? tasks ?? [];
  const completed = allTasks.filter((task) => task.complete).length;
  const isComplete = allTasks.length > 0 && completed === allTasks.length;
  const activeStepIndex = steps?.findIndex((step) => step.tasks.some((task) => !task.complete)) ?? -1;
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const previousComplete = useRef(isComplete);
  const completionEnabled = Boolean(completion);
  const nextUnlock = typeof completion === 'object' ? completion.nextUnlock : undefined;

  useEffect(() => {
    // Only the false-to-true transition is a new achievement. A persisted
    // completion therefore does not replay the modal after refresh or reopen.
    if (completionEnabled && !previousComplete.current && isComplete) {
      setCompletionModalOpen(true);
    }
    previousComplete.current = isComplete;
  }, [completionEnabled, isComplete]);

  return (
    <>
      <section className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-label={tr('academyTitle')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold"><GraduationCap className="h-4 w-4" />Academy - {title}</p>
            <p className="mt-1 text-xs">{description}</p>
          </div>
          <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold">{completed} / {allTasks.length} {tr('academyRequirements')}</span>
        </div>
        {steps ? (
          <ol className={stepColumns === 3 ? 'mt-3 grid gap-2.5 lg:grid-cols-3' : stepColumns === 2 ? 'mt-3 grid gap-2.5 md:grid-cols-2' : 'mt-3 space-y-2.5'}>
            {steps.map((step, index) => {
              const stepComplete = step.tasks.every((task) => task.complete);
              const active = index === activeStepIndex;
              const stepNumber = stepNumbers?.[index] ?? String(index + 1);
              return <li key={step.title} className={`h-full rounded-md border p-3 ${stepComplete ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : active ? 'border-amber-400 bg-white text-amber-950 shadow-sm' : 'border-amber-200 bg-amber-50/60 text-amber-900'}`}>
                <div className="flex items-start gap-2">
                  <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold ${stepComplete ? 'bg-emerald-600 text-white' : active ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-900'}`}>
                    {stepComplete ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{tr(stepLabelKey)} {stepNumber}: {step.title}</p>
                    {step.description && <p className="mt-1 text-xs font-normal leading-relaxed text-amber-950">{step.description}</p>}
                    <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {step.tasks.map((task) => <li key={task.label} className={`flex items-start gap-1.5 text-xs ${task.complete ? 'text-emerald-800' : 'text-amber-900'}`}>
                        {task.complete ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span>{task.label}</span>
                      </li>)}
                    </ul>
                  </div>
                </div>
              </li>;
            })}
          </ol>
        ) : (
          <ul className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {allTasks.map((task) => {
              const active = task.label === activeTaskLabel && !task.complete;
              return <li key={task.label} className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 ${task.complete ? 'text-emerald-800' : active ? 'border border-amber-400 bg-white font-semibold text-amber-950 shadow-sm' : 'text-amber-900'}`}>
                {task.complete ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <div>
                  <p>{task.label}</p>
                  {task.description && <p className="mt-1 text-xs font-normal leading-relaxed text-amber-950">{task.description}</p>}
                </div>
              </li>;
            })}
          </ul>
        )}
        {explanation && <div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-relaxed text-amber-950">{explanation}</div>}
        {actions && <div className="mt-3">{actions}</div>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
          <span className={isComplete ? 'text-emerald-800' : 'text-amber-950'}>{isComplete ? tr('academyCaseCompleted') : `${tr(nextLabelKey)} ${next}`}</span>
          <Link to="/academy" className="text-[#126a45] hover:underline">{tr('academyBackToAcademy')}</Link>
        </div>
      </section>
      {completionEnabled && (
        <AcademyCompletionModal
          open={completionModalOpen}
          onOpenChange={setCompletionModalOpen}
          title={title}
          completed={completed}
          total={allTasks.length}
          nextUnlock={nextUnlock}
          onBackToAcademy={caseId ? () => {
            academySandbox.clearActiveCase(caseId);
            navigate('/academy');
          } : undefined}
        />
      )}
    </>
  );
}
