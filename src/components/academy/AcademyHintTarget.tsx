import { Children, cloneElement, type MouseEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import { academySandbox } from '@/lib/academySandbox';
import { cn } from '@/lib/utils';

export const ACADEMY_HINT_DELAY_MS = 7_000;

type HintState = 'pulse' | 'static' | null;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

export function useAcademyActionHint({
  active,
  targetKey,
  delay = ACADEMY_HINT_DELAY_MS,
}: {
  active: boolean;
  targetKey: string;
  delay?: number;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const dismissedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    dismissedRef.current = false;
    setVisible(false);
    if (!active) return;

    timerRef.current = window.setTimeout(() => {
      if (!dismissedRef.current) setVisible(true);
    }, delay);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active, delay, targetKey]);

  const dismiss = () => {
    dismissedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  };

  const hintState: HintState = visible ? (reducedMotion ? 'static' : 'pulse') : null;
  return { hintState, dismiss };
}

type AcademyHintTargetProps = {
  targetKey: string;
  activeTargetKey?: string | null;
  academyActive?: boolean;
  children: ReactElement<{ className?: string; onClick?: (event: MouseEvent<HTMLElement>) => void }>;
};

/**
 * Applies a calm, Academy-only hint to a semantic action key. The caller owns
 * the current requirement mapping; this component never queries page markup.
 */
export default function AcademyHintTarget({
  targetKey,
  activeTargetKey,
  academyActive = academySandbox.isActive(),
  children,
}: AcademyHintTargetProps) {
  const { hintState, dismiss } = useAcademyActionHint({
    active: academyActive && activeTargetKey === targetKey,
    targetKey,
  });
  const child = Children.only(children);

  return cloneElement(child, {
    className: cn(child.props.className, hintState && 'academy-hint-target'),
    'data-academy-hint-target': targetKey,
    'data-academy-hint-state': hintState ?? undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      dismiss();
      child.props.onClick?.(event);
    },
  });
}
