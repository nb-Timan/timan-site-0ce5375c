import type { CrmActivity } from '@/lib/crmActivitiesService';
import { BUDGET_SELLERS } from '@/lib/crmBudgetService';
import type { SellerDirectoryEntry } from '@/lib/sellerDirectory';

export type SellerPerformanceFilter = 'this_month' | 'last_month' | 'ytd' | 'forecast';

export interface CanonicalPerformanceSeller {
  id: string;
  initials: string;
  fullName: string;
  email: string;
}

export interface SellerPerformanceRow {
  seller: CanonicalPerformanceSeller;
  closedCount: number;
  closedValue: number;
  activeCount: number;
  activeValue: number;
  prevValue: number;
  prevPctChange: number;
  forecastCount: number;
  forecastValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
}

// Verified against historical crm_activities. All other aliases are derived
// from stable app_users fields or the deterministic "<initials> Sælger" label.
const VERIFIED_LEGACY_NAME_ALIASES: Readonly<Record<string, string>> = {
  'jakob troels nielsen': 'JTN',
};

function normalized(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    : '';
}

function metaText(activity: CrmActivity, key: string): string {
  return normalized(activity.meta?.[key]);
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function startOfYear(value: Date): Date {
  return new Date(value.getFullYear(), 0, 1);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function isOpenQuote(activity: CrmActivity): boolean {
  return activity.activity_type === 'quote_created'
    || activity.activity_type === 'quote_revised'
    || activity.activity_type === 'quote_sent'
    || activity.activity_type === 'order_created';
}

function isWon(activity: CrmActivity): boolean {
  return activity.activity_type === 'order_sent'
    && normalized(activity.status) !== 'lost';
}

/** Resolve the five performance sellers from live app_users directory rows. */
export function canonicalPerformanceSellers(
  directory: SellerDirectoryEntry[],
): CanonicalPerformanceSeller[] {
  return BUDGET_SELLERS.flatMap((reference) => {
    const entry = directory.find((candidate) => normalized(candidate.email) === normalized(reference.email))
      ?? directory.find((candidate) => normalized(candidate.initials) === normalized(reference.initials));
    return entry ? [{
      id: entry.id,
      initials: entry.initials.toUpperCase(),
      fullName: entry.full_name,
      email: entry.email.toLowerCase(),
    }] : [];
  });
}

interface SellerIndexes {
  byId: Map<string, CanonicalPerformanceSeller>;
  byAlias: Map<string, CanonicalPerformanceSeller>;
}

function buildSellerIndexes(sellers: CanonicalPerformanceSeller[]): SellerIndexes {
  const byId = new Map<string, CanonicalPerformanceSeller>();
  const byInitials = new Map<string, CanonicalPerformanceSeller>();
  const byAlias = new Map<string, CanonicalPerformanceSeller>();
  const addAlias = (value: string, seller: CanonicalPerformanceSeller) => {
    const key = normalized(value);
    if (key) byAlias.set(key, seller);
  };

  for (const seller of sellers) {
    byId.set(seller.id, seller);
    byInitials.set(seller.initials.toUpperCase(), seller);
    addAlias(seller.email, seller);
    addAlias(seller.initials, seller);
    addAlias(seller.fullName, seller);
    addAlias(`${seller.initials} Sælger`, seller);
  }

  for (const [alias, initials] of Object.entries(VERIFIED_LEGACY_NAME_ALIASES)) {
    const seller = byInitials.get(initials);
    if (seller) addAlias(alias, seller);
  }

  return { byId, byAlias };
}

function firstAliasMatch(
  candidates: string[],
  byAlias: Map<string, CanonicalPerformanceSeller>,
): CanonicalPerformanceSeller | null {
  for (const candidate of candidates) {
    const seller = byAlias.get(candidate);
    if (seller) return seller;
  }
  return null;
}

/**
 * Resolve an activity owner without fuzzy matching. Stable app_users IDs win;
 * assigned-owner evidence wins over creator evidence.
 */
export function resolveActivityPerformanceSeller(
  activity: CrmActivity,
  sellers: CanonicalPerformanceSeller[],
): CanonicalPerformanceSeller | null {
  return resolveActivityWithIndexes(activity, buildSellerIndexes(sellers));
}

function resolveActivityWithIndexes(
  activity: CrmActivity,
  { byId, byAlias }: SellerIndexes,
): CanonicalPerformanceSeller | null {
  const assignedUserId = activity.assigned_owner_user_id?.trim()
    || metaText(activity, 'seller_user_id')
    || metaText(activity, 'legacy_assigned_owner_user_id');
  if (assignedUserId) return byId.get(assignedUserId) ?? null;

  const assignedAliases = [
    activity.assigned_owner_name,
    metaText(activity, 'seller_email'),
    metaText(activity, 'seller_initials'),
    metaText(activity, 'seller_name'),
    metaText(activity, 'legacy_assigned_owner_name'),
  ].map(normalized).filter(Boolean);
  if (assignedAliases.length > 0) {
    return firstAliasMatch(assignedAliases, byAlias);
  }

  const creatorUserId = activity.created_by_user_id?.trim();
  if (creatorUserId) return byId.get(creatorUserId) ?? null;

  return firstAliasMatch([
    activity.created_by_name,
    metaText(activity, 'created_by_email'),
    metaText(activity, 'legacy_created_by_email'),
    metaText(activity, 'legacy_created_by_name'),
  ].map(normalized).filter(Boolean), byAlias);
}

function emptyRow(seller: CanonicalPerformanceSeller): SellerPerformanceRow {
  return {
    seller,
    closedCount: 0,
    closedValue: 0,
    activeCount: 0,
    activeValue: 0,
    prevValue: 0,
    prevPctChange: 0,
    forecastCount: 0,
    forecastValue: 0,
    wonCount: 0,
    lostCount: 0,
    winRate: 0,
  };
}

export function buildSellerPerformanceRows(
  activities: CrmActivity[],
  filter: SellerPerformanceFilter,
  sellers: CanonicalPerformanceSeller[],
  now: Date = new Date(),
): SellerPerformanceRow[] {
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const monthBeforeStart = addMonths(monthStart, -2);
  const yearStart = startOfYear(now);
  const nextMonthStart = addMonths(monthStart, 1);
  const nextMonthEnd = addMonths(monthStart, 2);

  let scopeFrom: Date;
  let scopeTo: Date;
  switch (filter) {
    case 'this_month': scopeFrom = monthStart; scopeTo = now; break;
    case 'last_month': scopeFrom = lastMonthStart; scopeTo = monthStart; break;
    case 'forecast': scopeFrom = yearStart; scopeTo = now; break;
    case 'ytd':
    default: scopeFrom = yearStart; scopeTo = now; break;
  }

  const rowsBySellerId = new Map(sellers.map((seller) => [seller.id, emptyRow(seller)]));
  const monthBeforeClosed = new Map<string, number>();
  const sellerIndexes = buildSellerIndexes(sellers);

  for (const activity of activities) {
    const seller = resolveActivityWithIndexes(activity, sellerIndexes);
    if (!seller) continue;
    const row = rowsBySellerId.get(seller.id);
    if (!row) continue;
    const date = new Date(activity.activity_date);

    if (isWon(activity) && date >= scopeFrom && date <= scopeTo) {
      row.closedCount += 1;
      row.closedValue += activity.value || 0;
    }

    if (isOpenQuote(activity)) {
      row.activeCount += 1;
      row.activeValue += activity.value || 0;
    }

    if (isWon(activity) && date >= lastMonthStart && date < monthStart) {
      row.prevValue += activity.value || 0;
    }

    if (isWon(activity) && date >= monthBeforeStart && date < lastMonthStart) {
      monthBeforeClosed.set(seller.id, (monthBeforeClosed.get(seller.id) || 0) + (activity.value || 0));
    }

    if (date >= scopeFrom && date <= scopeTo) {
      if (isWon(activity)) row.wonCount += 1;
      if (activity.activity_type === 'order_sent' && normalized(activity.status) === 'lost') row.lostCount += 1;
      if (activity.activity_type === 'lead_rejected') row.lostCount += 1;
    }

    if (isOpenQuote(activity)) {
      const expectedRaw = activity.meta?.expected_close_date;
      const expected = typeof expectedRaw === 'string' && expectedRaw ? new Date(expectedRaw) : null;
      if (expected && expected >= nextMonthStart && expected < nextMonthEnd) {
        row.forecastCount += 1;
        row.forecastValue += activity.value || 0;
      }
    }
  }

  for (const row of rowsBySellerId.values()) {
    if (row.forecastCount === 0 && row.activeCount > 0) {
      row.forecastCount = Math.max(1, Math.round(row.activeCount * 0.5));
      row.forecastValue = Math.round(row.activeValue * 0.5);
    }
    const previousPrevious = monthBeforeClosed.get(row.seller.id) || 0;
    row.prevPctChange = previousPrevious === 0
      ? (row.prevValue > 0 ? 100 : 0)
      : Math.round(((row.prevValue - previousPrevious) / previousPrevious) * 100);
    const outcomes = row.wonCount + row.lostCount;
    row.winRate = outcomes === 0 ? 0 : Math.round((row.wonCount / outcomes) * 100);
  }

  return Array.from(rowsBySellerId.values()).sort((left, right) => {
    const performance = right.closedValue - left.closedValue;
    if (performance !== 0) return performance;
    return sellers.findIndex((seller) => seller.id === left.seller.id)
      - sellers.findIndex((seller) => seller.id === right.seller.id);
  });
}
