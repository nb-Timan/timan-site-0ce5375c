import { analyticsUserKey, type AnalyticsAudienceUser } from "@/lib/portalAnalyticsAudienceScope";

export interface PortalActivityPeriodMetrics {
  activeDays: number;
  activeSeconds: number;
  sessions: number;
  visits: number;
}

export interface PortalActivityUserMetrics extends AnalyticsAudienceUser {
  user_key: string;
  current: PortalActivityPeriodMetrics;
  previous: PortalActivityPeriodMetrics;
}

export interface PortalActivityIndexRow extends PortalActivityUserMetrics {
  currentIndex: number;
  previousIndex: number;
  delta: PortalActivityIndexDelta;
}

export type PortalActivityIndexDelta =
  | { state: "up" | "down" | "flat"; percent: number }
  | { state: "new" | "unavailable"; percent: null };

const ZERO_METRICS: PortalActivityPeriodMetrics = {
  activeDays: 0,
  activeSeconds: 0,
  sessions: 0,
  visits: 0,
};

function safeMetric(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function logNormalized(value: number, cohortMaximum: number): number {
  const safeValue = safeMetric(value);
  const safeMaximum = safeMetric(cohortMaximum);
  if (safeValue === 0 || safeMaximum === 0) return 0;
  return Math.min(1, Math.log1p(safeValue) / Math.log1p(safeMaximum));
}

export function calculatePortalActivityIndexes(
  users: PortalActivityUserMetrics[],
  periodDays: number,
  hasPreviousData: boolean,
): PortalActivityIndexRow[] {
  const safeDays = Math.max(1, safeMetric(periodDays));
  const currentMax = {
    activeSeconds: Math.max(0, ...users.map((user) => safeMetric(user.current.activeSeconds))),
    sessions: Math.max(0, ...users.map((user) => safeMetric(user.current.sessions))),
    visits: Math.max(0, ...users.map((user) => safeMetric(user.current.visits))),
  };
  const previousMax = {
    activeSeconds: Math.max(0, ...users.map((user) => safeMetric(user.previous.activeSeconds))),
    sessions: Math.max(0, ...users.map((user) => safeMetric(user.previous.sessions))),
    visits: Math.max(0, ...users.map((user) => safeMetric(user.previous.visits))),
  };

  const score = (metrics: PortalActivityPeriodMetrics, maxima: typeof currentMax) => {
    const activeDayPart = Math.min(1, safeMetric(metrics.activeDays) / safeDays);
    const weighted = (0.4 * activeDayPart)
      + (0.3 * logNormalized(metrics.activeSeconds, maxima.activeSeconds))
      + (0.2 * logNormalized(metrics.sessions, maxima.sessions))
      + (0.1 * logNormalized(metrics.visits, maxima.visits));
    return Math.min(100, Math.max(0, Math.round(weighted * 100)));
  };

  return users.map((user) => {
    const currentIndex = score(user.current, currentMax);
    const previousIndex = score(user.previous, previousMax);
    let delta: PortalActivityIndexDelta;
    if (!hasPreviousData) {
      delta = { state: "unavailable", percent: null };
    } else if (previousIndex === 0 && currentIndex > 0) {
      delta = { state: "new", percent: null };
    } else if (previousIndex === 0) {
      delta = { state: "flat", percent: 0 };
    } else {
      const percent = Math.round(((currentIndex - previousIndex) / previousIndex) * 100);
      delta = { state: percent > 0 ? "up" : percent < 0 ? "down" : "flat", percent };
    }
    return { ...user, currentIndex, previousIndex, delta };
  }).sort((a, b) => (
    b.currentIndex - a.currentIndex
    || b.current.activeDays - a.current.activeDays
    || b.current.activeSeconds - a.current.activeSeconds
    || displayName(a).localeCompare(displayName(b), "da-DK")
  ));
}

function displayName(user: AnalyticsAudienceUser): string {
  return (user.display_name || user.email || "").trim();
}

export function mergePortalActivityCohort(
  cohort: AnalyticsAudienceUser[],
  metrics: PortalActivityUserMetrics[],
): PortalActivityUserMetrics[] {
  const byKey = new Map(metrics.map((user) => [user.user_key || analyticsUserKey(user), user]));
  return cohort.map((user) => {
    const key = analyticsUserKey(user);
    return byKey.get(key) || {
      ...user,
      user_key: key,
      current: { ...ZERO_METRICS },
      previous: { ...ZERO_METRICS },
    };
  });
}

export function takePortalActivityTopFive(rows: PortalActivityIndexRow[]): PortalActivityIndexRow[] {
  return rows.slice(0, 5);
}
