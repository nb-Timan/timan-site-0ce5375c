export interface SalesCycleLead {
  id: string;
  first_contact_date: string | null;
  created_at: string;
  pipeline_stage: string | null;
  status: string | null;
}

export interface SalesCycleOrder {
  lead_id: string | null;
  order_sent_at: string | null;
  submitted_at: string | null;
}

export interface SalesCycleResult {
  averageDays: number;
  qualifyingCount: number;
  daysByLeadId: Map<string, number>;
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function firstSubmittedOrderTimestamp(order: SalesCycleOrder): number | null {
  const candidates = [timestamp(order.order_sent_at), timestamp(order.submitted_at)]
    .filter((value): value is number => value !== null);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function isWonLead(lead: SalesCycleLead): boolean {
  return lead.status?.trim().toLowerCase() === 'closed'
    && lead.pipeline_stage?.trim().toLowerCase() === 'won';
}

/**
 * Lead-local sales cycle: first contact (created_at fallback) to the first
 * actually submitted/sent order linked by the stable lead_id relation.
 */
export function calculateAverageSalesCycle(
  leads: SalesCycleLead[],
  orders: SalesCycleOrder[],
): SalesCycleResult {
  const firstOrderByLeadId = new Map<string, number>();
  for (const order of orders) {
    if (!order.lead_id) continue;
    const submittedAt = firstSubmittedOrderTimestamp(order);
    if (submittedAt === null) continue;
    const current = firstOrderByLeadId.get(order.lead_id);
    if (current === undefined || submittedAt < current) {
      firstOrderByLeadId.set(order.lead_id, submittedAt);
    }
  }

  const daysByLeadId = new Map<string, number>();
  for (const lead of leads) {
    if (!isWonLead(lead)) continue;
    const startedAt = timestamp(lead.first_contact_date) ?? timestamp(lead.created_at);
    const submittedAt = firstOrderByLeadId.get(lead.id);
    if (startedAt === null || submittedAt === undefined || submittedAt < startedAt) continue;
    daysByLeadId.set(lead.id, (submittedAt - startedAt) / 86_400_000);
  }

  const days = Array.from(daysByLeadId.values());
  return {
    averageDays: days.length === 0
      ? 0
      : Math.round(days.reduce((total, value) => total + value, 0) / days.length),
    qualifyingCount: days.length,
    daysByLeadId,
  };
}
