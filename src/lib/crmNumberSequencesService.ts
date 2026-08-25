import { supabase } from '@/lib/supabase';

export type CrmDocumentSequenceKey = 'lead' | 'quote' | 'order';

const LOCAL_SEQUENCE_CONFIG: Record<CrmDocumentSequenceKey, { prefix: 'L' | 'T' | 'O'; start: number; storageKey: string }> = {
  lead: { prefix: 'L', start: 1001, storageKey: 'timan_crm_lead_next_number' },
  quote: { prefix: 'T', start: 4001, storageKey: 'timan_crm_quote_next_number' },
  order: { prefix: 'O', start: 7001, storageKey: 'timan_crm_order_next_number' },
};

function nextLocalNumber(storageKey: string, start: number): number {
  try {
    const current = Number.parseInt(localStorage.getItem(storageKey) || '', 10);
    const next = Number.isFinite(current) && current >= start ? current : start;
    localStorage.setItem(storageKey, String(next + 1));
    return next;
  } catch {
    return start + Math.floor(Math.random() * 100000);
  }
}

export function generateLocalCrmDocumentNumber(sequenceKey: CrmDocumentSequenceKey): string {
  const config = LOCAL_SEQUENCE_CONFIG[sequenceKey];
  return `${config.prefix}-${nextLocalNumber(config.storageKey, config.start)}`;
}

export async function getNextCrmDocumentNumber(sequenceKey: CrmDocumentSequenceKey): Promise<string> {
  try {
    const { data, error } = await (supabase as any).rpc('next_crm_document_number', {
      p_sequence_key: sequenceKey,
    });

    if (!error && typeof data === 'string' && data.trim()) {
      return data.trim();
    }

    console.warn('[crmNumberSequences] Falling back to local number:', error);
  } catch (error) {
    console.warn('[crmNumberSequences] RPC unavailable, falling back to local number:', error);
  }

  return generateLocalCrmDocumentNumber(sequenceKey);
}
