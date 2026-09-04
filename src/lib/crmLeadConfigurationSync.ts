import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { logActivity } from '@/lib/crmActivitiesService';
import { getCrmLinkedConfigurationKind } from '@/lib/crmConfigurationsService';
import { normalizeConfiguratorState } from '@/lib/configuratorState';
import { getLead, updateLead, type CrmLead, type CrmLeadPatch } from '@/lib/crmLeadsService';
import { deriveLegacyPipelineStage, NEXT_ACTIVITY_WON } from '@/lib/leadStatus';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { supabase } from '@/lib/supabase';
import type { ConfiguratorState } from '@/types/configurator';

const SYNC_START = '--- CONFIGURATOR SYNC START ---';
const SYNC_END = '--- CONFIGURATOR SYNC END ---';

const CONFIGURATOR_MACHINE_TO_CRM_INTEREST: Record<string, string> = {
  'RC-751': 'RC-751',
  'RC-1000S': 'RC-1000s',
  'Timan 2620': 'Timan 2620',
  'Timan 3330': 'Timan 3330',
  'LOOSE_TOOL': 'Loader line / Tractor Equipment',
};

const CONFIGURATOR_ITEM_NUMBER_TO_CRM_INTEREST: Record<string, string> = {
  '410910': 'Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt',
  '411666': 'Equipment: RC-1000s - Rotorklipper 1350 mm',
  '411800': 'Equipment: RC-1000s - Fingerklipper 1700 mm',
  '412040': 'Equipment: RC-1000s - Skivehøster 1150mm',
  'HFS-1012': 'Equipment: RC-1000s - Stubfræser m/hydraulisk sving',
  '411742': 'Equipment: RC-1000s - V-plov m/gummiskær',
  '411845': 'Equipment: RC-1000s - Centerdrevet fejemaskine',
  '418000': 'Equipment: RC-1000s - Sneslynge 1100 mm',
  '730600': 'Equipment: RC-1000s - WB-170 ukrudtsbørste basis enhed',
  '720125': 'Equipment: Timan 3330 - Feje/Sug Redskaber - T2 Opsamlingstank uden højtryksslange',
  '720130': 'Equipment: Timan 3330 - Feje/Sug Redskaber - T2 Opsamlingstank inkl. højtryksrenser',
  '720132': 'Equipment: Timan 3330 - Feje/Sug Redskaber - T3 Opsamlingstank med tørsug',
  '720133': 'Equipment: Timan 3330 - Feje/Sug Redskaber - T3 Opsamlingstank med tørsug og højtryksrenser',
  '730030': 'Equipment: Timan 3330 - Feje/Sug Redskaber - Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost',
  '730017': 'Equipment: Timan 3330 - Græs opgaver - Rotorklipper med 3 gatorknive og tilt-up, 135 cm klippebredde',
  'HGM-2007': 'Equipment: Timan 3330 - Græs opgaver - Rotorklipper 150 cm med hydraulisk højdejustering og tilt-up',
  '730130': 'Equipment: Timan 3330 - Græs opgaver - Rotorklipper 120 cm for opsamling til fejesugtank',
  '730020': 'Equipment: Timan 3330 - Vinter redskaber - Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster',
  '730114': 'Equipment: Timan 3330 - Vinter redskaber - V-plov 130-150 cm med gummiskær',
  '730105': 'Equipment: Timan 3330 - Vinter redskaber - Dozerblad 130 cm med gummiskær',
  '730106': 'Equipment: Timan 3330 - Vinter redskaber - Sneslynge, 110 cm arbejdsbredde',
  '725131': 'Equipment: Timan 3330 - Vinter redskaber - CS-200 Valsespreder, for lad, manuel reg. Husk lad og vogn',
  '725132': 'Equipment: Timan 3330 - Vinter redskaber - CS-200 Combi, for lad, manuel reg. Husk lad og vogn',
  '725138': 'Equipment: Timan 3330 - Vinter redskaber - CS-200 Combi, for lad, el reg. Husk lad og vogn',
  'HGM-20083': 'Equipment: Timan 3330 - Øvrige Redskaber - Fingerklipper for Termit-arm',
  'HGM-20082': 'Equipment: Timan 3330 - Øvrige Redskaber - Multitrimmer for Termit-arm',
};

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

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function preferNonEmpty(next: string | null | undefined, current: string | null | undefined): string | null {
  return nonEmpty(next) ?? nonEmpty(current);
}

function normalizedKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

function crmMachineInterestFor(machineType: string): string {
  return CONFIGURATOR_MACHINE_TO_CRM_INTEREST[machineType] ?? machineType;
}

function extractTrailingItemNumber(value: string): string | null {
  return value.match(/\(([A-Z0-9][A-Z0-9._-]{2,})\)\s*$/i)?.[1]?.trim() || null;
}

function canonicalizeExistingMachineInterest(value: string | null | undefined): string | null {
  const trimmed = nonEmpty(value);
  if (!trimmed) return null;

  const exactMachine = CONFIGURATOR_MACHINE_TO_CRM_INTEREST[trimmed];
  if (exactMachine) return exactMachine;

  const itemNumberMatch = CONFIGURATOR_ITEM_NUMBER_TO_CRM_INTEREST[normalizedKey(extractTrailingItemNumber(trimmed))];
  if (itemNumberMatch) return itemNumberMatch;

  return trimmed.replace(/^Equipment:\s*RC-1000S\s+-\s+/i, 'Equipment: RC-1000s - ');
}

function fallbackEquipmentInterest(machineType: string, name: string, itemNumber: string | null | undefined): string {
  const crmMachine = crmMachineInterestFor(machineType);
  return `Equipment: ${crmMachine} - ${name}${itemNumber ? ` (${itemNumber})` : ''}`;
}

export function crmMachineInterestForConfiguratorItem(input: {
  machineType: string;
  itemId?: string | null;
  itemNumber?: string | null;
  itemName: string;
}): string {
  const itemNumberMatch = CONFIGURATOR_ITEM_NUMBER_TO_CRM_INTEREST[normalizedKey(input.itemNumber)];
  if (itemNumberMatch) return itemNumberMatch;

  const itemIdMatch = CONFIGURATOR_ITEM_NUMBER_TO_CRM_INTEREST[normalizedKey(input.itemId)];
  if (itemIdMatch) return itemIdMatch;

  return fallbackEquipmentInterest(input.machineType, input.itemName, input.itemNumber);
}

function buildMachineTypesFromState(state: ConfiguratorState, existingMachineTypes: string[] = []): string[] {
  const summary = buildQuoteContentSummary(state);
  const values: string[] = existingMachineTypes
    .map(canonicalizeExistingMachineInterest)
    .filter((value): value is string => !!value);
  for (const machine of summary.machines) {
    values.push(crmMachineInterestFor(machine.model_type));
    for (const unit of machine.units) {
      for (const accessory of unit.accessories) {
        values.push(crmMachineInterestForConfiguratorItem({
          machineType: machine.model_type,
          itemId: accessory.id,
          itemNumber: accessory.varenr,
          itemName: accessory.name,
        }));
      }
    }
  }
  return mergeUnique(values);
}

type StructuredContactInfo = {
  company: string;
  contactPerson: string;
  address: string;
  postalCode: string;
  city: string;
  zipCity: string;
  phone: string;
  email: string;
  country: string;
};

function splitPostalCodeAndCity(value: string): { postalCode: string; city: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Z]{0,3}[-\s]?\d{3,6})\s+(.+)$/i);
  if (!match) return { postalCode: '', city: '' };
  return { postalCode: match[1].trim(), city: match[2].trim() };
}

function parseStructuredContactInformation(value: string | null | undefined, fallbackCountry: string | null | undefined): StructuredContactInfo {
  const info: StructuredContactInfo = {
    company: '',
    contactPerson: '',
    address: '',
    postalCode: '',
    city: '',
    zipCity: '',
    phone: '',
    email: '',
    country: '',
  };

  String(value ?? '').split(/\r?\n/).forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) return;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const fieldValue = line.slice(separatorIndex + 1).trim();
    if (!fieldValue) return;

    if (key.startsWith('firma')) info.company = fieldValue;
    else if (key.startsWith('kontaktperson')) info.contactPerson = fieldValue;
    else if (key.startsWith('adresse')) info.address = fieldValue;
    else if (key.startsWith('postnr') || key.includes('zip') || key.includes('plz')) {
      info.zipCity = fieldValue;
      const split = splitPostalCodeAndCity(fieldValue);
      info.postalCode = split.postalCode;
      info.city = split.city;
    }
    else if (key === 'by' || key === 'city' || key === 'ort') info.city = fieldValue;
    else if (key.startsWith('telefon') || key.startsWith('phone')) info.phone = fieldValue;
    else if (key.startsWith('e-mail') || key === 'email') info.email = fieldValue;
    else if (key.startsWith('land') || key === 'country') info.country = fieldValue;
  });

  if (!info.country && String(value ?? '').trim() && fallbackCountry) {
    info.country = fallbackCountry;
  }

  return info;
}

function buildStructuredContactInformation(info: StructuredContactInfo): string {
  const postalCode = info.postalCode.trim();
  const city = info.city.trim();
  const zipCity = info.zipCity.trim() || [postalCode, city].filter(Boolean).join(' ').trim();
  return [
    info.company.trim() ? `Firma/CVR: ${info.company.trim()}` : null,
    info.contactPerson.trim() ? `Kontaktperson: ${info.contactPerson.trim()}` : null,
    info.address.trim() ? `Adresse: ${info.address.trim()}` : null,
    zipCity ? `Postnr. og by: ${zipCity}` : null,
    info.phone.trim() ? `Telefon: ${info.phone.trim()}` : null,
    info.email.trim() ? `E-mail: ${info.email.trim()}` : null,
    info.country.trim() ? `Land: ${info.country.trim()}` : null,
  ].filter(Boolean).join('\n');
}

function readStateField(state: ConfiguratorState, keys: string[]): string | null {
  const record = state as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function contactInformationFromState(lead: CrmLead, state: ConfiguratorState): string | null {
  const current = parseStructuredContactInformation(lead.contact_information, lead.country);
  const next: StructuredContactInfo = {
    company: preferNonEmpty(state.firmanavn, current.company) ?? '',
    contactPerson: preferNonEmpty(state.kontaktperson, current.contactPerson) ?? '',
    address: preferNonEmpty(readStateField(state, ['adresse', 'address', 'customerAddress']), current.address) ?? '',
    postalCode: preferNonEmpty(readStateField(state, ['postnr', 'postalCode', 'zip', 'zipCode']), current.postalCode) ?? '',
    city: preferNonEmpty(readStateField(state, ['by', 'city']), current.city) ?? '',
    zipCity: current.zipCity,
    phone: preferNonEmpty(state.telefon, current.phone) ?? '',
    email: preferNonEmpty(state.email || state.emailRecipient, current.email) ?? '',
    country: preferNonEmpty(readStateField(state, ['land', 'country']), current.country || lead.country) ?? '',
  };

  if (next.postalCode !== current.postalCode || next.city !== current.city) {
    next.zipCity = [next.postalCode, next.city].filter(Boolean).join(' ');
  }

  return buildStructuredContactInformation(next) || lead.contact_information || null;
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

function getConfigurationNumber(row: CrmLeadConfigurationSyncRow): string | null {
  return row.order_number || row.quote_number || null;
}

function shouldClearIncompleteFlag(row: CrmLeadConfigurationSyncRow): boolean {
  return getCrmLinkedConfigurationKind(row) === 'quote' || getCrmLinkedConfigurationKind(row) === 'order';
}

function isCanonicalSubmittedOrder(row: CrmLeadConfigurationSyncRow): boolean {
  return getCrmLinkedConfigurationKind(row) === 'order';
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
  const machineTypes = buildMachineTypesFromState(state, lead.machine_types);
  const estimatedValue = Math.round(row.total_price ?? (calcConfigurationTotals(state).finalPrice || 0));
  const linkedDealerId = preferNonEmpty(row.dealer_account_id, null)
    ?? preferNonEmpty(row.dealer_number, null)
    ?? lead.linked_dealer_id
    ?? null;

  const patch: CrmLeadPatch = {
    title: preferNonEmpty(state.firmanavn, null) ?? preferNonEmpty(row.title, null) ?? lead.title,
    machine_types: machineTypes.length > 0 ? machineTypes : lead.machine_types,
    contact_information: contactInformationFromState(lead, state),
    estimated_value: estimatedValue || lead.estimated_value,
    linked_dealer_id: linkedDealerId,
    owner_user_id: preferNonEmpty(sellerId, null) ?? preferNonEmpty(row.assigned_seller_id, null) ?? lead.owner_user_id,
    owner_name: preferNonEmpty(row.seller_name, null) ?? preferNonEmpty(row.seller_initials, null) ?? lead.owner_name,
    owner_email: preferNonEmpty(row.seller_email, lead.owner_email),
    notes: replaceSyncBlock(lead.notes, buildSyncNote(state, row, syncedAt)),
    incomplete_from_configurator: shouldClearIncompleteFlag(row) ? false : lead.incomplete_from_configurator ?? false,
  };

  if (isCanonicalSubmittedOrder(row)) {
    patch.next_activity = NEXT_ACTIVITY_WON;
    patch.probability = 100;
    patch.pipeline_stage = deriveLegacyPipelineStage(NEXT_ACTIVITY_WON);
    patch.status = 'closed';
  }

  return patch;
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
      synced_fields: [
        'title',
        'machine_types',
        'contact_information',
        'estimated_value',
        'linked_dealer_id',
        'owner',
        ...(isCanonicalSubmittedOrder(row) ? ['lifecycle'] : []),
      ],
      preserved_fields: isCanonicalSubmittedOrder(row)
        ? ['next_followup_date', 'manual_notes_outside_sync_block', 'activities']
        : ['status', 'pipeline_stage', 'next_followup_date', 'next_activity', 'manual_notes_outside_sync_block', 'activities'],
    },
  });

  return {
    lead: updatedLead,
    configurationId: row.id,
    configurationNumber: getConfigurationNumber(row),
    syncedFields: [
      'title',
      'machine_types',
      'contact_information',
      'estimated_value',
      'linked_dealer_id',
      'owner',
      ...(isCanonicalSubmittedOrder(row) ? ['lifecycle'] : []),
    ],
    preservedFields: isCanonicalSubmittedOrder(row)
      ? ['next_followup_date', 'manual_notes_outside_sync_block', 'activities']
      : ['status', 'pipeline_stage', 'next_followup_date', 'next_activity', 'manual_notes_outside_sync_block', 'activities'],
  };
}
