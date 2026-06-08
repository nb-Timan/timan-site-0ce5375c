/**
 * Phase — Teknik & Service seller-scope helper.
 *
 * Builds a `JournalScope` for the currently logged in portal user using the
 * same `buildJournalScope` logic that already powers Søg på maskine /
 * Maskinjournal. Used by Garanti, Service registreringer, Service tickets,
 * Claims og TSB-lister så Timan Sælger kun ser data fra egne tildelte
 * forhandlere (plus undforhandlere under importør / service partner-link),
 * mens Timan Backend / Service stadig ser alt og forhandler-roller fortsat
 * kun ser egen konto.
 *
 * Returnerer en stabil scope-værdi der kan bruges som dependency i useMemo
 * filtre. `applyScopeFilter` er en utility til at filtrere arrays af
 * records med dealer_number/dealer_name kolonner.
 */
import { useEffect, useState } from "react";
import { useAppUser } from "@/context/AppUserContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole, PortalRole } from "@/lib/portalAccess";
import { buildJournalScope } from "@/lib/machineJournalScope";
import {
  dealerScopeAllows,
  type JournalScope,
} from "@/lib/machineJournalService";

const EMPTY_SCOPE: JournalScope = {
  role: null,
  dealerLabel: null,
  dealerNumbers: new Set(),
  dealerNames: new Set(),
  unrestricted: false,
};

export interface UseTeknikScopeResult {
  scope: JournalScope;
  role: PortalRole | null;
  loading: boolean;
}

export function useTeknikScope(): UseTeknikScopeResult {
  const { appUser } = useAppUser();
  const effective = useEffectivePortalUser(appUser ?? null);
  const role = derivePortalRole(effective ?? null);
  const [scope, setScope] = useState<JournalScope>(EMPTY_SCOPE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!effective || !role) {
      setScope(EMPTY_SCOPE);
      setLoading(false);
      return;
    }
    setLoading(true);
    buildJournalScope(effective, role)
      .then((s) => {
        if (!cancelled) setScope(s);
      })
      .catch((e) => {
        console.warn("[useTeknikScope] failed", e);
        if (!cancelled) setScope(EMPTY_SCOPE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effective, role]);

  return { scope, role, loading };
}

/**
 * Filter helper: keep records that pass `dealerScopeAllows`. Internal Timan
 * users (`unrestricted = true`) are returned unchanged.
 */
export function applyScopeFilter<T>(
  scope: JournalScope,
  rows: T[],
  pick: (row: T) => { dealer_number?: string | null; dealer_name?: string | null },
): T[] {
  if (scope.unrestricted) return rows;
  return rows.filter((r) => dealerScopeAllows(scope, pick(r)));
}
