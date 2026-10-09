import type { CrmDemoLead } from '@/lib/crmLeadsService';

export type DemoProgress = 'missing' | 'requested' | 'scheduled' | 'awaiting' | 'completed' | 'cancelled';
export type DemoProgressRecord = Pick<CrmDemoLead, 'demo_date' | 'result_status' | 'completed_at'>;

export function crmDemoProgress(demo: DemoProgressRecord | null | undefined, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Copenhagen' })): DemoProgress {
  if (!demo) return 'missing';
  if (['canceled', 'cancelled'].includes(demo.result_status?.toLowerCase() || '')) return 'cancelled';
  if (demo.completed_at) return 'completed';
  if (!demo.demo_date) return 'requested';
  return demo.demo_date < today ? 'awaiting' : 'scheduled';
}

export const EMPTY_DEMO_RESULT = {
  interest_level: null,
  competitors_present: null,
} as const;

export function formatDemoDate(date: string | null | undefined): string | null {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : date || null;
}
