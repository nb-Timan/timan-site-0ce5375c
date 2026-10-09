import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateAverageSalesCycle, type SalesCycleLead, type SalesCycleOrder } from '@/lib/crmSalesCycle';

const wonLead = (id: string, firstContact: string | null, createdAt = '2026-09-01T00:00:00.000Z'): SalesCycleLead => ({
  id,
  first_contact_date: firstContact,
  created_at: createdAt,
  pipeline_stage: 'Won',
  status: 'closed',
});

const order = (
  leadId: string | null,
  submittedAt: string | null,
  orderSentAt: string | null = null,
): SalesCycleOrder => ({ lead_id: leadId, submitted_at: submittedAt, order_sent_at: orderSentAt });

describe('CRM dashboard canonical average sales time', () => {
  it('uses first contact to the first submitted order and rounds the average', () => {
    const result = calculateAverageSalesCycle(
      [wonLead('a', '2026-09-01'), wonLead('b', '2026-09-01')],
      [order('a', '2026-09-04T00:00:00.000Z'), order('b', null, '2026-09-06T00:00:00.000Z')],
    );
    expect(result.qualifyingCount).toBe(2);
    expect(result.averageDays).toBe(4);
  });

  it('ignores drafts, sent offers and unlinked orders', () => {
    const result = calculateAverageSalesCycle(
      [wonLead('lead', '2026-09-01')],
      [order('lead', null), order(null, '2026-09-05T00:00:00.000Z')],
    );
    expect(result.qualifyingCount).toBe(0);
  });

  it('excludes open and lost leads even when an order timestamp exists', () => {
    const leads: SalesCycleLead[] = [
      { ...wonLead('open', '2026-09-01'), status: 'open', pipeline_stage: 'Lead' },
      { ...wonLead('lost', '2026-09-01'), pipeline_stage: 'Lost' },
    ];
    const result = calculateAverageSalesCycle(leads, [
      order('open', '2026-09-04T00:00:00.000Z'),
      order('lost', '2026-09-04T00:00:00.000Z'),
    ]);
    expect(result.qualifyingCount).toBe(0);
  });

  it('uses the earliest submitted timestamp across multiple linked orders', () => {
    const result = calculateAverageSalesCycle(
      [wonLead('lead', '2026-09-01')],
      [
        order('lead', '2026-09-10T00:00:00.000Z'),
        order('lead', '2026-09-05T00:00:00.000Z'),
        order('lead', '2026-09-07T00:00:00.000Z', '2026-09-04T00:00:00.000Z'),
      ],
    );
    expect(result.daysByLeadId.get('lead')).toBe(3);
  });

  it('uses created_at only when first contact is missing and rejects negative durations', () => {
    const result = calculateAverageSalesCycle(
      [
        wonLead('fallback', null, '2026-09-02T00:00:00.000Z'),
        wonLead('negative', '2026-09-05'),
      ],
      [
        order('fallback', '2026-09-04T00:00:00.000Z'),
        order('negative', '2026-09-04T00:00:00.000Z'),
      ],
    );
    expect(result.qualifyingCount).toBe(1);
    expect(result.averageDays).toBe(2);
    expect(result.daysByLeadId.has('negative')).toBe(false);
  });

  it('keeps seller and global scope by calculating only the supplied authorised records', () => {
    const allLeads = [wonLead('seller-a', '2026-09-01'), wonLead('seller-b', '2026-09-01')];
    const allOrders = [
      order('seller-a', '2026-09-04T00:00:00.000Z'),
      order('seller-b', '2026-09-08T00:00:00.000Z'),
    ];
    expect(calculateAverageSalesCycle(allLeads, allOrders).averageDays).toBe(5);
    expect(calculateAverageSalesCycle([allLeads[0]], [allOrders[0]]).averageDays).toBe(3);
  });

  it('defines the server KPI from stable lead_id and real submission timestamps', () => {
    const sql = readFileSync(
      'supabase/migrations/20261006082000_crm_dashboard_canonical_average_sales_time.sql',
      'utf8',
    );
    const salesCycleSql = sql.slice(sql.indexOf('first_submitted_orders as ('), sql.indexOf('totals as ('));
    expect(salesCycleSql).toContain('r.lead_id');
    expect(salesCycleSql).toContain('r.order_sent_at');
    expect(salesCycleSql).toContain('r.submitted_at');
    expect(salesCycleSql).toContain('l.first_contact_date');
    expect(salesCycleSql).toContain('l.created_at');
    expect(salesCycleSql).not.toContain('quote_created');
    expect(salesCycleSql).not.toContain('last_saved_at');
    expect(salesCycleSql).not.toContain('expected_close');
  });
});
