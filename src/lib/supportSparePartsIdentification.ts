import type { SessionUser } from '@/context/AppUserContext';
import { fetchMachineRegistryPage } from '@/lib/machineRegistryPageService';
import { buildJournalScope } from '@/lib/machineJournalScope';
import { derivePortalRole } from '@/lib/portalAccess';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { SERVICE_MACHINE_TYPES } from '@/lib/serviceMachineTypes';
import { isSupportHowToQuestion } from '@/lib/supportHowTo';

export type SparePartsClarificationField = 'machine_or_model' | 'serial_number' | 'component';

export interface SupportSparePartsIdentificationContext {
  domain: 'SPARE_PARTS_IDENTIFICATION';
  source: 'approved_knowledge';
  language: PortalUiLanguage;
  requested_model: string | null;
  serial_number: string | null;
  requested_part_number: string | null;
  component_description_present: boolean;
  clarification_fields: SparePartsClarificationField[];
  machine_context: {
    serial_number: string;
    model: string | null;
    source: 'canonical_machine_registry';
  } | null;
  machine_lookup_status: 'NOT_REQUESTED' | 'MATCHED' | 'NOT_FOUND' | 'SKIPPED_VIEW_AS' | 'UNAVAILABLE';
}

const SPARE_PARTS_PATTERN = /\b(reservedele?|reservedelsnr\.?|reservedelsnummer|spare parts?|part number|ersatzteile?|teilenummer|ricambi|numero ricambio|alkatrész(?:ek)?|cikkszám|reservdelar?|artikelnummer|pièces détachées|référence pièce|części zamienne|numer części|náhradní díly|číslo dílu)\b/i;
const DANISH_PART_NUMBER_QUESTION_PATTERN = /\bvarenummer(?:et)?\b/i;
const DANISH_PART_REFERENCE_PATTERN = /\b(denne del|delen|reservedel|hydraul\w*|fremdrift\w*|motor\w*|pumpe\w*|filter\w*|leje\w*|rem\w*|kæde\w*|gear\w*|ventil\w*|cylinder\w*|kniv\w*)\b/i;
const SERIAL_PATTERN = /\b[A-Z0-9]{4,}(?:-[A-Z0-9]{2,}){1,}\b/i;
const PART_NUMBER_PATTERN = /\b(?:varenummer(?:et)?|reservedelsnummer|reservedelsnr\.?|part number|teilenummer|numero ricambio|cikkszám|artikelnummer|référence pièce|numer części|číslo dílu)\s*(?:er|is|ist|è|:)?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i;
const COMPONENT_PATTERN = /\b(hydraul\w*|fremdrift\w*|motor\w*|pumpe\w*|filter\w*|leje\w*|rem\w*|kæde\w*|gear\w*|ventil\w*|cylinder\w*|kniv\w*|drive\w*|pump\w*|bearing\w*|belt\w*|chain\w*|valve\w*|blade\w*|antrieb\w*|lager\w*|riemen\w*|kette\w*)\b/i;
const COMPONENT_REQUEST_PATTERN = /\b(del(?:en)?|komponent(?:en)?|part|component)\b.{0,40}\b(hydraul\w*|fremdrift\w*|motor\w*|drive\w*|pump\w*)\b/i;

function normalizeSerial(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractSerial(question: string): string | null {
  return question.match(SERIAL_PATTERN)?.[0] || null;
}

function extractPartNumber(question: string): string | null {
  return question.match(PART_NUMBER_PATTERN)?.[1] || null;
}

function mentionedModel(question: string): string | null {
  const normalized = question.toLocaleLowerCase();
  return [...SERVICE_MACHINE_TYPES]
    .sort((left, right) => right.label.length - left.label.length)
    .find((machine) => normalized.includes(machine.label.toLocaleLowerCase()))?.value || null;
}

export function isSparePartsIdentificationQuestion(question: string): boolean {
  const contextualDanishPartNumber = DANISH_PART_NUMBER_QUESTION_PATTERN.test(question)
    && DANISH_PART_REFERENCE_PATTERN.test(question);
  return (SPARE_PARTS_PATTERN.test(question) || COMPONENT_REQUEST_PATTERN.test(question) || contextualDanishPartNumber)
    && !isSupportHowToQuestion(question);
}

export function createSparePartsIdentificationContext(
  question: string,
  language: PortalUiLanguage,
): SupportSparePartsIdentificationContext | null {
  if (!isSparePartsIdentificationQuestion(question)) return null;
  const requestedModel = mentionedModel(question);
  const serialNumber = extractSerial(question);
  const requestedPartNumber = extractPartNumber(question);
  const componentDescriptionPresent = COMPONENT_PATTERN.test(question) || requestedPartNumber !== null;
  const clarificationFields: SparePartsClarificationField[] = [];
  if (!requestedModel && !serialNumber) clarificationFields.push('machine_or_model');
  if (!serialNumber) clarificationFields.push('serial_number');
  if (!componentDescriptionPresent) clarificationFields.push('component');
  return {
    domain: 'SPARE_PARTS_IDENTIFICATION',
    source: 'approved_knowledge',
    language,
    requested_model: requestedModel,
    serial_number: serialNumber,
    requested_part_number: requestedPartNumber,
    component_description_present: componentDescriptionPresent,
    clarification_fields: clarificationFields,
    machine_context: null,
    machine_lookup_status: serialNumber ? 'UNAVAILABLE' : 'NOT_REQUESTED',
  };
}

export async function buildSparePartsIdentificationContext(
  question: string,
  language: PortalUiLanguage,
  appUser: SessionUser,
  viewAsActive: boolean,
): Promise<SupportSparePartsIdentificationContext | null> {
  const context = createSparePartsIdentificationContext(question, language);
  if (!context?.serial_number) return context;
  if (viewAsActive) return { ...context, machine_lookup_status: 'SKIPPED_VIEW_AS' };
  try {
    const role = derivePortalRole(appUser);
    const scope = await buildJournalScope(appUser, role);
    const page = await fetchMachineRegistryPage({
      allowedDealers: scope.unrestricted ? null : [...scope.dealerNumbers],
      query: context.serial_number,
      dealer: '', model: 'all', warrantyType: 'all', health: 'all', warrantyMatch: 'all',
      demoOnly: false, dateFrom: '', dateTo: '', sort: 'activity', direction: 'desc',
      page: 1, pageSize: 5, includeBackendMargins: false,
    });
    const normalized = normalizeSerial(context.serial_number);
    const exact = page.rows.find((row) => normalizeSerial(row.serial) === normalized || row.normalizedSerial === normalized);
    if (!exact) return { ...context, machine_lookup_status: 'NOT_FOUND' };
    return {
      ...context,
      requested_model: exact.machineModel || exact.machineType || context.requested_model,
      machine_context: {
        serial_number: exact.serial,
        model: exact.machineModel || exact.machineType || null,
        source: 'canonical_machine_registry',
      },
      machine_lookup_status: 'MATCHED',
      clarification_fields: context.clarification_fields.filter((field) => field !== 'machine_or_model'),
    };
  } catch {
    return { ...context, machine_lookup_status: 'UNAVAILABLE' };
  }
}
