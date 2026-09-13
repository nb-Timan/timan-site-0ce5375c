import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { ACADEMY_PORTAL_BASICS, ACADEMY_PROGRESS_CHANGED, academySandbox, type AcademyPortalBasicsStepSuccess } from '@/lib/academySandbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AcademyPortalBasicsStepSuccessModal() {
  const { uiLanguage } = useOptionalLanguage();
  const tr = (key: string) => t(key, uiLanguage);
  const [revision, refresh] = useState(0);
  const [success, setSuccess] = useState<AcademyPortalBasicsStepSuccess | null>(null);

  useEffect(() => {
    const update = () => refresh((revision) => revision + 1);
    window.addEventListener(ACADEMY_PROGRESS_CHANGED, update);
    return () => window.removeEventListener(ACADEMY_PROGRESS_CHANGED, update);
  }, []);

  useEffect(() => {
    if (academySandbox.getActiveCase() !== ACADEMY_PORTAL_BASICS) return;
    const pending = academySandbox.getPortalBasicsStepSuccess();
    if (!pending) return;
    academySandbox.acknowledgePortalBasicsStepSuccess(pending.taskId);
    setSuccess(pending);
  }, [revision]);

  const close = () => setSuccess(null);
  return <Dialog open={Boolean(success)} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent className="max-w-sm text-center">
      <DialogHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <DialogTitle className="text-lg">{tr('academyWellDone')}</DialogTitle>
        <DialogDescription className="text-sm leading-6 text-slate-600">
          {tr('academyYouCompleted')}:<br />
          <strong className="font-semibold text-slate-900">{success?.title}</strong>
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm font-semibold text-emerald-800">{tr('academyQuickTasksCompleted').replace('{completed}', String(success?.completed ?? 0)).replace('{total}', String(success?.total ?? 0))}</p>
      <DialogFooter className="sm:justify-center">
        <Link
          to="/portal?academy_mode=true#academy-guidance"
          onClick={close}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#126a45] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5a3b]"
        >
          {tr('academyContinueNextTask')}
        </Link>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
