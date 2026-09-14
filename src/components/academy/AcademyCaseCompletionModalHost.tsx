import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AcademyCompletionModal from '@/components/academy/AcademyCompletionModal';
import { useOptionalLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import {
  ACADEMY_CASE_COMPLETED,
  type AcademyCaseCompletion,
} from '@/lib/academySandbox';

function isAcademyCaseCompletion(value: unknown): value is AcademyCaseCompletion {
  if (!value || typeof value !== 'object') return false;
  const completion = value as Partial<AcademyCaseCompletion>;
  return typeof completion.caseId === 'string'
    && typeof completion.titleKey === 'string'
    && typeof completion.completed === 'number'
    && typeof completion.total === 'number';
}

/**
 * Completion is hosted beside the router so map/fullscreen containers cannot
 * clip it. The sandbox only emits this event on a new completion transition.
 */
export default function AcademyCaseCompletionModalHost() {
  const navigate = useNavigate();
  const { uiLanguage } = useOptionalLanguage();
  const [completion, setCompletion] = useState<AcademyCaseCompletion | null>(null);

  useEffect(() => {
    const handleCompletion = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isAcademyCaseCompletion(detail)) setCompletion(detail);
    };
    window.addEventListener(ACADEMY_CASE_COMPLETED, handleCompletion);
    return () => window.removeEventListener(ACADEMY_CASE_COMPLETED, handleCompletion);
  }, []);

  const close = (returnToAcademy = false) => {
    setCompletion(null);
    if (returnToAcademy) window.setTimeout(() => navigate('/academy'), 0);
  };

  return (
    <AcademyCompletionModal
      open={completion !== null}
      onOpenChange={(open) => { if (!open) close(); }}
      title={completion ? t(completion.titleKey, uiLanguage) : ''}
      completed={completion?.completed ?? 0}
      total={completion?.total ?? 0}
      onBackToAcademy={() => close(true)}
    />
  );
}
