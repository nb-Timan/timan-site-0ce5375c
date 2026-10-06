import { describe, expect, it } from 'vitest';
import type { CrmActivity, CrmActivityType } from '@/lib/crmActivitiesService';
import {
  buildSellerPerformanceRows,
  canonicalPerformanceSellers,
  resolveActivityPerformanceSeller,
} from '@/lib/crmSellerPerformance';
import type { SellerDirectoryEntry } from '@/lib/sellerDirectory';

const directory: SellerDirectoryEntry[] = [
  { id: 'seller-bp', initials: 'BP', full_name: 'Birger Pedersen', email: 'bp@timan.dk', portal_role: 'timan_backend', company: 'Timan', phone: null },
  { id: 'seller-em', initials: 'EM', full_name: 'Esben Madsen', email: 'em@timan.dk', portal_role: 'timan_seller', company: 'Timan', phone: null },
  { id: 'seller-jtn', initials: 'JTN', full_name: 'Jakob Nielsen', email: 'jtn@timan.dk', portal_role: 'timan_seller', company: 'Timan', phone: null },
  { id: 'seller-akr', initials: 'AKR', full_name: 'Alexander Kirschner', email: 'akr@timan.dk', portal_role: 'timan_seller', company: 'Timan', phone: null },
  { id: 'seller-nb', initials: 'NB', full_name: 'Nicolai Moesgaard', email: 'nb@timan.dk', portal_role: 'timan_backend', company: 'Timan', phone: null },
  { id: 'unrelated', initials: 'JN', full_name: 'Janni Nielsen', email: 'janni@timan.dk', portal_role: 'timan_backend', company: 'Timan', phone: null },
];

const sellers = canonicalPerformanceSellers(directory);

function activity(
  id: string,
  owner: { id?: string | null; name?: string | null; createdId?: string | null; createdName?: string | null },
  type: CrmActivityType = 'quote_sent',
  value = 100,
  status: string | null = 'sent',
  date = '2026-10-03T10:00:00.000Z',
  meta: Record<string, unknown> | null = null,
): CrmActivity {
  return {
    id,
    activity_type: type,
    lead_id: null,
    activity_date: date,
    account_id: null,
    account_name: null,
    created_by_user_id: owner.createdId ?? null,
    created_by_name: owner.createdName ?? null,
    assigned_owner_user_id: owner.id ?? null,
    assigned_owner_name: owner.name ?? null,
    title: id,
    description: null,
    status,
    quote_id: type.startsWith('quote_') ? id : null,
    order_id: type === 'order_sent' ? id : null,
    configuration_id: null,
    value,
    currency: 'DKK',
    meta,
    created_at: date,
  };
}

function row(initials: string, activities: CrmActivity[] = aliases) {
  return buildSellerPerformanceRows(
    activities,
    'ytd',
    sellers,
    new Date('2026-10-06T12:00:00.000Z'),
  ).find((candidate) => candidate.seller.initials === initials)!;
}

const aliases = [
  activity('bp-email', { name: 'bp@timan.dk' }),
  activity('bp-label', { name: 'BP Sælger' }),
  activity('bp-name', { name: 'Birger Pedersen' }),
  activity('em-email', { name: 'em@timan.dk' }),
  activity('em-label', { name: 'EM Sælger' }),
  activity('em-name', { name: 'Esben Madsen' }),
  activity('jtn-email', { name: 'jtn@timan.dk' }),
  activity('jtn-label', { name: 'JTN Sælger' }),
  activity('jtn-name', { name: 'Jakob Nielsen' }),
  activity('jtn-legacy-name', { name: 'Jakob Troels Nielsen' }),
  activity('akr-email', { name: 'akr@timan.dk' }),
  activity('akr-label', { name: 'AKR Sælger' }),
  activity('akr-name', { name: 'Alexander Kirschner' }),
  activity('nb-email', { name: 'nb@timan.dk' }),
  activity('nb-name', { name: 'Nicolai Moesgaard' }),
];

describe('CRM seller performance canonical identity', () => {
  it('derives exactly the five performance sellers from canonical app_users rows', () => {
    expect(sellers.map((seller) => [seller.initials, seller.fullName])).toEqual([
      ['BP', 'Birger Pedersen'],
      ['EM', 'Esben Madsen'],
      ['JTN', 'Jakob Nielsen'],
      ['AKR', 'Alexander Kirschner'],
      ['NB', 'Nicolai Moesgaard'],
    ]);
  });

  it.each([
    ['BP', 3],
    ['EM', 3],
    ['JTN', 4],
    ['AKR', 3],
    ['NB', 2],
  ])('collapses all verified %s aliases into one row', (initials, activeCount) => {
    expect(row(initials).activeCount).toBe(activeCount);
  });

  it('returns only canonical seller identities without raw emails or legacy labels', () => {
    const rows = buildSellerPerformanceRows(
      aliases,
      'ytd',
      sellers,
      new Date('2026-10-06T12:00:00.000Z'),
    );
    expect(rows).toHaveLength(5);
    expect(rows.map((candidate) => `${candidate.seller.initials} · ${candidate.seller.fullName}`)).toEqual([
      'BP · Birger Pedersen',
      'EM · Esben Madsen',
      'JTN · Jakob Nielsen',
      'AKR · Alexander Kirschner',
      'NB · Nicolai Moesgaard',
    ]);
    expect(rows.map((candidate) => candidate.seller.fullName).join(' ')).not.toMatch(/@timan\.dk|Sælger/);
  });

  it('prioritizes stable app_users id over stale names and never fuzzy-matches unrelated users', () => {
    const staleName = activity('stable-id', { id: 'seller-akr', name: 'nb@timan.dk' });
    expect(resolveActivityPerformanceSeller(staleName, sellers)?.initials).toBe('AKR');
    expect(resolveActivityPerformanceSeller(
      activity('unrelated', { id: 'unrelated', name: 'Jakob Nielsen' }),
      sellers,
    )).toBeNull();
    expect(resolveActivityPerformanceSeller(
      activity('similar', { name: 'Jakob Nielson' }),
      sellers,
    )).toBeNull();
  });

  it('aggregates order and offer counts, values and win rate after identity resolution', () => {
    const combined = [
      activity('won-id', { id: 'seller-jtn', name: 'JTN Sælger' }, 'order_sent', 1_000, 'sent'),
      activity('lost-email', { name: 'jtn@timan.dk' }, 'order_sent', 500, 'lost'),
      activity('quote-name', { name: 'Jakob Troels Nielsen' }, 'quote_sent', 250),
      activity('quote-canonical', { name: 'Jakob Nielsen' }, 'quote_created', 750),
    ];
    const jtn = row('JTN', combined);
    expect(jtn.closedCount).toBe(1);
    expect(jtn.closedValue).toBe(1_000);
    expect(jtn.activeCount).toBe(2);
    expect(jtn.activeValue).toBe(1_000);
    expect(jtn.wonCount).toBe(1);
    expect(jtn.lostCount).toBe(1);
    expect(jtn.winRate).toBe(50);
  });

  it('keeps period filters intact after alias normalization', () => {
    const periodActivities = [
      activity('this-month', { name: 'AKR Sælger' }, 'order_sent', 300, 'sent', '2026-10-03T10:00:00.000Z'),
      activity('last-month', { name: 'akr@timan.dk' }, 'order_sent', 200, 'sent', '2026-09-03T10:00:00.000Z'),
      activity('older', { name: 'Alexander Kirschner' }, 'order_sent', 100, 'sent', '2026-08-03T10:00:00.000Z'),
    ];
    const now = new Date('2026-10-06T12:00:00.000Z');
    const thisMonth = buildSellerPerformanceRows(periodActivities, 'this_month', sellers, now)
      .find((candidate) => candidate.seller.initials === 'AKR')!;
    const lastMonth = buildSellerPerformanceRows(periodActivities, 'last_month', sellers, now)
      .find((candidate) => candidate.seller.initials === 'AKR')!;
    const ytd = buildSellerPerformanceRows(periodActivities, 'ytd', sellers, now)
      .find((candidate) => candidate.seller.initials === 'AKR')!;
    expect(thisMonth.closedValue).toBe(300);
    expect(lastMonth.closedValue).toBe(200);
    expect(ytd.closedValue).toBe(600);
  });
});
