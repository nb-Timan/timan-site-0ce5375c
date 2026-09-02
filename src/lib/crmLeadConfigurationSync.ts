import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { logActivity } from '@/lib/crmActivitiesService';
import { getCrmLinkedConfigurationKind } from '@/lib/crmConfigurationsService';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { getLead, updateLead, type CrmLead, type CrmLeadPatch } from '@/lib/crmLeadsService';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { supabase } from '@/lib/supabase';
import type { ConfiguratorState } from '@/types/configurator';

const SYNC_START = '--- CONFIGURATOR SYNC START ---';
const SYNC_END = '--- CONFIGURATOR SYNC END ---';

export type CrmLeadConfigurationSyncRow = {
  id: string;
  title: string | null;
  state_json: unknown | null;
  total_price: number | null;
  lead_id: string | null;
  quote_number: string | null;
  order_number: string | null;
  document_type: 'quote' | 'order' | null;
  case_type: string | null;
  case_status: string | null;
  status: string | null;
  quote_sent_at: string | null;
  order_sent_at: string | null;
  submitted_at: string | null;
  last_saved_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  dealer_account_id: string | null;
  dealer_account_number?: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  dealer_company_name?: string | null;
  assigned_seller_id: string | null;
  seller_email: string | null;
  seller_initials: string | null;
  seller_name: string | null;
};

export type CrmLeadConfigurationSyncResult = {
  lead: CrmLead;
  configurationId: string;
  configurationNumber: string | null;
  syncedFields: string[];
  preservedFields: string[];
};

function parseState(value: unknown): ConfiguratorState {
  if (typeof value === 'string') {
    return normalizeConfiguratorState(JSON.parse(value) as Partial<ConfiguratorState>);
  }
  return normalizeConfiguratorState((value ?? {}) as Partial<ConfiguratorState>);
}

function mergeUnique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function buildMachineTypesFromState(state: ConfiguratorState): string[] {
  const summary = buildQuoteContentSummary(state);
  const values: string[] = [];
  for (const machine of summary.machines) {
    values.push(machine.model_type);
    for (const unit of machine.units) {
      for (const accessory of unit.accessories) {
        values.push(`Equipment: ${machine.model_type} - ${accessory.name}${accessory.varenr ? ` (${accessory.varenr})` : ''}`);
      }
    }
  }
  return mergeUnique(values);
}

function buildSyncNote(state: ConfiguratorState, row: CrmLeadConfigurationSyncRow, syncedAt: string): string {
  const summary = buildQuoteContentSummary(state);
  const lines: string[] = [
    SYNC_START,
    `Synkroniseret: ${syncedAt}`,
    `Konfiguration: ${row.quote_number || row.order_number || row.id}`,
  ];
  for (const machine of summary.machines) {
    lines.push(`${machine.qty} x ${machine.model_name} (${machine.model_type})`);
    const accessoryNames = mergeUnique(machine.units.flatMap((unit) =>
      unit.accessories.map((accessory) => `${accessory.name}${accessory.varenr ? ` (${accessory.varenr})` : ''}`),
    ));
    if (accessoryNames.length > 0) lines.push(`  Udstyr: ${accessoryNames.join(', ')}`);
  }
  lines.push(`Værdi: ${Math.round(row.total_price ?? (calcConfigurationTotals(state).finalPrice || 0))} DKK`);
  lines.push(SYNC_END);
  return lines.join('\n');
}

function replaceSyncBlock(notes: string | null | undefined, syncBlock: string): string {
  const current = notes ?? '';
  const pattern = new RegExp(`\\n?${SYNC_START}[\\s\\S]*?${SYNC_END}\\n?`, 'm');
  const withoutOldBlock = current.replace(pattern, '').trim();
  return [withoutOldBlock, syncBlock].filter(Boolean).join('\n\n');
}

function contactInformationFromState(state: ConfiguratorState): string | null {
  return mergeUnique([state.kontaktperson, state.email || state.emailRecipient, state.telefon]).join(' · ') || null;
}

function getConfigurationNumber(row: CrmLeadConfigurationSyncRow): string | null {
  return row.order_number || row.quote_number || null;
}

function shouldClearIncompleteFlag(row: CrmLeadConfigurationSyncRow): boolean {
  return getCrmLinkedConfigurationKind(row) === 'quote' || getCrmLinkedConfigurationKind(row) === 'order';
}

async function loadLinkedConfiguration(configurationId: string): Promise<CrmLeadConfigurationSyncRow> {
  const { data, error } = await supabase
    .from('crm_configurations_view')
    .select('*')
    .eq('id', configurationId)
    .neq('case_status', 'deleted')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Configuration not found or not visible.');
  return data as CrmLeadConfigurationSyncRow;
}

export function buildLeadPatchFromConfigurationState(
  lead: CrmLead,
  row: CrmLeadConfigurationSyncRow,
  state: ConfiguratorState,
  syncedAt: string,
  sellerId?: string | null,
): CrmLeadPatch {
  const machineTypes = buildMachineTypesFromState(state);
  const estimatedValue = Math.round(row.total_price ?? (calcConfigurationTotals(state).finalPrice || 0));
  const linkedDealerId = row.dealer_account_id || row.dealer_number || lead.linked_dealer_id || null;

  return {
    title: state.firmanavn || row.title || lead.title,
    machine_types: machineTypes.length > 0 ? machineTypes : lead.machine_types,
    contact_information: contactInformationFromState(state) ?? lead.contact_information,
    estimated_value: estimatedValue || lead.estimated_value,
    linked_dealer_id: linkedDealerId,
    owner_user_id: sellerId || row.assigned_seller_id || lead.owner_user_id,
    owner_name: row.seller_name || row.seller_initials || lead.owner_name,
    owner_email: row.seller_email || lead.owner_email || null,
    notes: replaceSyncBlock(lead.notes, buildSyncNote(state, row, syncedAt)),
    incomplete_from_configurator: shouldClearIncompleteFlag(row) ? false : lead.incomplete_from_configurator ?? false,
  };
}

export async function syncLeadFromConfiguration(
  configurationId: string,
  expectedLeadId?: string | null,
): Promise<CrmLeadConfigurationSyncResult> {
  const row = await loadLinkedConfiguration(configurationId);
  const leadId = row.lead_id;
  if (!leadId) throw new Error('Configuration is not linked to a CRM lead.');
  if (expectedLeadId && expectedLeadId !== leadId) {
    throw new Error('Configuration is linked to another CRM lead.');
  }

  const lead = await getLead(leadId);
  if (!lead) throw new Error('Linked CRM lead not found.');

  const state = parseState(row.state_json);
  const syncedAt = new Date().toISOString();
  const estimatedValue = Math.round(row.total_price ?? (calcConfigurationTotals(state).finalPrice || 0));
  const linkedDealerId = row.dealer_account_id || row.dealer_number || lead.linked_dealer_id || null;
  const sellerId = row.assigned_seller_id || (row.seller_email ? await resolveSellerId(row.seller_email) : null);
  const patch = buildLeadPatchFromConfigurationState(lead, row, state, syncedAt, sellerId);

  const updatedLead = await updateLead(lead.id, patch);

  await logActivity({
    activity_type: 'comment',
    configuration_id: row.id,
    quote_id: row.document_type === 'quote' ? row.id : null,
    order_id: row.document_type === 'order' ? row.id : null,
    title: 'Lead synkroniseret fra konfigurator',
    description: `Lead opdateret fra ${getConfigurationNumber(row) || row.id}`,
    status: 'aktiv',
    created_by_user_id: updatedLead.owner_user_id,
    assigned_owner_user_id: updatedLead.owner_user_id,
    assigned_owner_name: updatedLead.owner_name,
    account_id: linkedDealerId,
    account_name: row.dealer_company_name || row.dealer_name || null,
    value: estimatedValue || null,
    currency: 'DKK',
    meta: {
      lead_id: updatedLead.id,
      configuration_id: row.id,
      configuration_number: getConfigurationNumber(row),
      synced_at: syncedAt,
      synced_fields: ['title', 'machine_types', 'contact_information', 'estimated_value', 'linked_dealer_id', 'owner'],
      preserved_fields: ['status', 'pipeline_stage', 'next_followup_date', 'next_activity', 'manual_notes_outside_sync_block', 'activities'],
    },
  });

  return {
    lead: updatedLead,
    configurationId: row.id,
    configurationNumber: getConfigurationNumber(row),
    syncedFields: ['title', 'machine_types', 'contact_information', 'estimated_value', 'linked_dealer_id', 'owner'],
    preservedFields: ['status', 'pipeline_stage', 'next_followup_date', 'next_activity', 'manual_notes_outside_sync_block', 'activities'],
  };
}
