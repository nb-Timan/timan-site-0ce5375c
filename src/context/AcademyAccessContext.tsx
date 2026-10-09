import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppUser, type SessionUser } from '@/context/AppUserContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { getMyAcademyCycle } from '@/lib/academyCyclesService';
import { academySandbox } from '@/lib/academySandbox';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';
import {
  ACADEMY_CASE_IDS,
  getLocalAcademyUser,
  isAcademyCapabilityGated,
  type AcademyCapability,
  isAcademyCapabilityUnlocked,
} from '@/lib/academyCurriculum';

type AcademyAccessState = {
  effectiveUser: SessionUser | null;
  completionIds: string[];
  resolving: boolean;
  error: Error | null;
  isUnlocked: (capability: AcademyCapability) => boolean;
};

const AcademyAccessContext = createContext<AcademyAccessState | null>(null);

function localCompletionIds() {
  const partnerData = academyPartnerDataSandbox.getProgress();
  const crm = academyCrmSandbox.getProgress();
  return [
    ...academySandbox.getCompletedCaseIds(),
    partnerData.part1Completed && ACADEMY_CASE_IDS.partnerDataPart1,
    partnerData.part2Completed && ACADEMY_CASE_IDS.partnerDataPart2,
    crm.part1Completed && ACADEMY_CASE_IDS.crmPart1,
    crm.part2Completed && ACADEMY_CASE_IDS.crmPart2,
  ].filter((id): id is string => Boolean(id));
}

export function AcademyAccessProvider({ children }: { children: ReactNode }) {
  const { appUser } = useAppUser();
  const localAcademyActive = academySandbox.isActive() && import.meta.env.DEV;
  const localUser = useMemo(() => localAcademyActive ? getLocalAcademyUser() : null, [localAcademyActive]);
  const accessUser = appUser ?? localUser;
  const { effectiveUser, resolving: resolvingEffectiveUser, error: effectiveUserError } = useEffectivePortalUserState(accessUser);
  const [canonicalCompletionIds, setCanonicalCompletionIds] = useState<string[]>([]);
  const [cycleResolving, setCycleResolving] = useState(false);
  const [localRevision, setLocalRevision] = useState(0);

  useEffect(() => {
    const refreshLocal = () => setLocalRevision((value) => value + 1);
    window.addEventListener('timan:academy-progress-changed', refreshLocal);
    window.addEventListener('timan:academy-crm-changed', refreshLocal);
    window.addEventListener('timan:academy-partnerdata-changed', refreshLocal);
    return () => {
      window.removeEventListener('timan:academy-progress-changed', refreshLocal);
      window.removeEventListener('timan:academy-crm-changed', refreshLocal);
      window.removeEventListener('timan:academy-partnerdata-changed', refreshLocal);
    };
  }, []);

  useEffect(() => {
    if (resolvingEffectiveUser) return;
    if (!effectiveUser || !isAcademyCapabilityGated(effectiveUser) || localUser) {
      setCanonicalCompletionIds([]);
      setCycleResolving(false);
      return;
    }

    let cancelled = false;
    setCycleResolving(true);
    const viewAsUserId = effectiveUser.id !== appUser?.id ? effectiveUser.id : undefined;
    void getMyAcademyCycle(viewAsUserId)
      .then((snapshot) => {
        if (!cancelled) setCanonicalCompletionIds(snapshot.completionIds);
      })
      .catch(() => {
        if (!cancelled) setCanonicalCompletionIds([]);
      })
      .finally(() => {
        if (!cancelled) setCycleResolving(false);
      });
    return () => { cancelled = true; };
  }, [appUser?.id, effectiveUser, localRevision, localUser, resolvingEffectiveUser]);

  const completionIds = useMemo(
    () => {
      void localRevision;
      const localIds = localAcademyActive ? localCompletionIds() : [];
      return [...new Set([...canonicalCompletionIds, ...localIds])];
    },
    [canonicalCompletionIds, localAcademyActive, localRevision],
  );
  const value = useMemo<AcademyAccessState>(() => ({
    effectiveUser,
    completionIds,
    resolving: resolvingEffectiveUser || cycleResolving,
    error: effectiveUserError,
    isUnlocked: (capability) => isAcademyCapabilityUnlocked(effectiveUser, capability, completionIds),
  }), [completionIds, cycleResolving, effectiveUser, effectiveUserError, resolvingEffectiveUser]);

  return <AcademyAccessContext.Provider value={value}>{children}</AcademyAccessContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAcademyAccess() {
  return useContext(AcademyAccessContext);
}
