import type { ReactNode, Ref } from 'react';

/** The stock summary occupies the existing space between the title and action. */
export default function LoanPageHeader({ title, description, action, summaryRef }: {
  title: string; description: string; action: ReactNode; summaryRef?: Ref<HTMLDivElement>;
}) {
  return <header className={summaryRef
    ? 'mb-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 min-[1180px]:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_auto]'
    : 'mb-5 flex flex-wrap items-start justify-between gap-3'}>
    <div className="min-w-0"><h1 className="text-2xl font-semibold text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-600">{description}</p></div>
    {summaryRef && <div ref={summaryRef} className="col-span-2 row-start-2 min-w-0 min-[1180px]:col-span-1 min-[1180px]:col-start-2 min-[1180px]:row-start-1" />}
    <div className={summaryRef ? 'col-start-2 row-start-1 shrink-0 min-[1180px]:col-start-3' : 'shrink-0'}>{action}</div>
  </header>;
}
