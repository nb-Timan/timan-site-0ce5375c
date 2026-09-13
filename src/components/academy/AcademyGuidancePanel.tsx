import { CheckCircle2, Circle, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';

export type AcademyGuidanceTask = { label: string; complete: boolean };

export default function AcademyGuidancePanel({
  title,
  description,
  tasks,
  next,
}: {
  title: string;
  description: string;
  tasks: AcademyGuidanceTask[];
  next: string;
}) {
  const completed = tasks.filter((task) => task.complete).length;
  const isComplete = completed === tasks.length;

  return (
    <section className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Academy træningsstatus">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold"><GraduationCap className="h-4 w-4" />Academy - {title}</p>
          <p className="mt-1 text-xs">{description}</p>
        </div>
        <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold">{completed} / {tasks.length} krav</span>
      </div>
      <ul className="mt-3 grid gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <li key={task.label} className={task.complete ? 'text-emerald-800' : 'text-amber-900'}>
            {task.complete ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <Circle className="mr-1 inline h-3.5 w-3.5" />}
            {task.label}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span className={isComplete ? 'text-emerald-800' : 'text-amber-950'}>{isComplete ? 'Case gennemført.' : `Næste trin: ${next}`}</span>
        <Link to="/academy" className="text-[#126a45] hover:underline">Tilbage til Academy</Link>
      </div>
    </section>
  );
}
