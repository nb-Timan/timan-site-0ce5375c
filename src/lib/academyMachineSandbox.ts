import type { SessionUser } from '@/context/AppUserContext';
import type { MachineJournal, MachineOverviewRow, TimelineKind } from '@/lib/machineJournalService';
import { serialKey } from '@/lib/machineJournalService';
import type { MachineRegistryPage, RegistryMachineRow, fetchMachineRegistryPage } from '@/lib/machineRegistryPageService';
import { filterMachineOverview, sortMachineOverview } from '@/lib/machineOverviewFilters';
import { derivePortalRole } from '@/lib/portalAccess';
import { PORTAL_WARRANTY_MACHINE_TYPES } from '@/lib/portalWarrantyRegistrationForm';
import { academySandbox, ACADEMY_MACHINE_TARGET_SERIAL } from '@/lib/academySandbox';
import { academyPartnerDataSandbox, ACADEMY_PARTNER_ACCOUNT } from '@/lib/academyPartnerDataSandbox';
import { ACADEMY_CASE_IDS, canAccessAcademyCase, getAcademyCaseState, getAssignedAcademyCurriculum } from '@/lib/academyCurriculum';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { getAcademyCycleStorageScope } from '@/lib/academyCycleStorage';

export const ACADEMY_MACHINE_COMPANIES = [
  { account: ACADEMY_PARTNER_ACCOUNT, name: 'Academy Maskiner' },
  { account: 'ACADEMY-101', name: 'Academy Servicepartner' },
  { account: 'ACADEMY-102', name: 'Academy Have & Park' },
  { account: 'ACADEMY-103', name: 'Academy Kommunalteknik' },
] as const;

const models = [PORTAL_WARRANTY_MACHINE_TYPES[1], PORTAL_WARRANTY_MACHINE_TYPES[3], PORTAL_WARRANTY_MACHINE_TYPES[0], PORTAL_WARRANTY_MACHINE_TYPES[2]];
const prefixes = ['411000', '410040', '712000', 'TOOLTRAC'];

/** Immutable fixtures, projected into the same registry/journal models as production. */
export function createAcademyMachines(): RegistryMachineRow[] {
  return Array.from({ length: 28 }, (_, index) => {
    const n = index + 1;
    const modelIndex = index % models.length;
    const company = ACADEMY_MACHINE_COMPANIES[Math.floor(index / models.length) % ACADEMY_MACHINE_COMPANIES.length];
    const serial = `ACA-${prefixes[modelIndex]}-26-${1000 + n}`;
    const missingDealer = n % 11 === 0;
    const missingWarranty = missingDealer || n % 5 === 0;
    return {
      serial, normalizedSerial: serial, machineModel: models[modelIndex], machineType: models[modelIndex],
      dealerName: missingDealer ? null : company.name, dealerNumber: missingDealer ? null : company.account,
      customerName: `Academy Kunde ${n}`, deliveryDate: `2026-01-${String(n).padStart(2, '0')}`,
      operatingHours: n * 25, latestActivityDate: n % 4 === 0 ? null : '2026-06-15T10:00:00.000Z',
      openTickets: n % 3 === 0 ? 1 : 0, openClaims: n % 7 === 0 ? 1 : 0, openTsb: n % 6 === 0 ? 1 : 0,
      health: n % 7 === 0 ? 'critical' : n % 3 === 0 ? 'needs_attention' : 'healthy',
      warrantyId: missingWarranty ? null : `ACA-SP-${1000 + n}`, warrantyType: n % 4 === 0 ? 'historical' : 'normal',
      warrantyMatchStatus: missingDealer ? 'missing_warranty_and_dealer' : missingWarranty ? 'needs_clarification' : 'approved',
      warrantyMatchDetail: missingDealer ? 'missing_warranty_and_active_dealer' : missingWarranty ? 'missing_warranty_registration' : 'approved',
      machineOrderNumber: `ACA-MO-${1000 + n}`, erpOrderNumber: `ACA-ERP-${1000 + n}`,
      portalOrderNumber: `ACA-O-${1000 + n}`, invoiceNumber: `ACA-INV-${1000 + n}`,
    };
  });
}

/** Real account identifiers are never copied into the training data. View-as must
 * pass its effective user, not the authenticated Backend actor. */
export function academyMachineScope(user: SessionUser | null | undefined): string[] | null {
  if (!user || !canAccessAcademyCase(user, ACADEMY_CASE_IDS.serviceCase1)) return [];
  const role = derivePortalRole(user);
  if (role === 'timan_backend' || role === 'timan_service') return null;
  if (role === 'timan_seller') return [ACADEMY_PARTNER_ACCOUNT, 'ACADEMY-101'];
  // Each external participant works as the existing Academy partner. An explicit
  // synthetic assignment (e.g. QA View-as) narrows to that company instead.
  const assigned = ACADEMY_MACHINE_COMPANIES.find((company) => company.account === user.dealer_number);
  return [assigned?.account ?? ACADEMY_PARTNER_ACCOUNT];
}

export function scopedAcademyMachines(user: SessionUser | null | undefined) {
  const scope = academyMachineScope(user);
  return createAcademyMachines().filter((row) => scope === null || (!!row.dealerNumber && scope.includes(row.dealerNumber)));
}

export function canOpenAcademyService(user: SessionUser | null | undefined) {
  const partner = academyPartnerDataSandbox.getProgress();
  const completed = [
    ...(getAcademyCycleStorageScope()?.completionIds ?? []),
    ...academySandbox.getCompletedCaseIds(),
    ...(partner.part1Completed ? [ACADEMY_CASE_IDS.partnerDataPart1] : []),
    ...(partner.part2Completed ? [ACADEMY_CASE_IDS.partnerDataPart2] : []),
  ];
  return canAccessAcademyCase(user, ACADEMY_CASE_IDS.serviceCase1)
    && getAcademyCaseState(ACADEMY_CASE_IDS.serviceCase1, completed, [], true, getAssignedAcademyCurriculum(user)) !== 'locked';
}

type RegistryInput = Parameters<typeof fetchMachineRegistryPage>[0];
export function getAcademyMachinePage(user: SessionUser | null | undefined, input: RegistryInput): MachineRegistryPage {
  const scopeRows = scopedAcademyMachines(user);
  const overview: MachineOverviewRow[] = scopeRows.map((row) => ({ ...row, sources: [], warrantyIdNumeric: null, latestActivityLabel: null }));
  // Normalize exact/partial serial searches using the production serial identity rules.
  const query = serialKey(input.query);
  const matches = filterMachineOverview(overview, {
    dealerQuery: input.dealer, model: input.model, warrantyType: input.warrantyType,
    dateFrom: input.dateFrom, dateTo: input.dateTo, health: input.health,
  }).filter((row) => (!query || [row.serial, row.warrantyId, (row as RegistryMachineRow).machineOrderNumber].some((value) => serialKey(value).includes(query)))
    && (input.warrantyMatch === 'all' || row.warrantyMatchStatus === input.warrantyMatch));
  const sorted = sortMachineOverview(matches, input.sort, input.direction);
  const count = (predicate: (row: RegistryMachineRow) => boolean) => scopeRows.filter(predicate).length;
  return {
    rows: sorted.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
    total: matches.length, scopeTotal: scopeRows.length,
    normal: count((row) => row.warrantyType === 'normal'), historical: count((row) => row.warrantyType === 'historical'),
    healthy: count((row) => row.health === 'healthy'), needsAttention: count((row) => row.health === 'needs_attention'), critical: count((row) => row.health === 'critical'),
    approved: count((row) => row.warrantyMatchStatus === 'approved'), needsClarification: count((row) => row.warrantyMatchStatus === 'needs_clarification'),
    missingWarrantyAndDealer: count((row) => row.warrantyMatchStatus === 'missing_warranty_and_dealer'),
  };
}

export function getAcademyMachineJournal(user: SessionUser | null | undefined, serial: string, language: PortalUiLanguage): MachineJournal | null {
  const row = scopedAcademyMachines(user).find((machine) => serialKey(machine.serial) === serialKey(serial));
  if (!row) return null;
  const n = Number(row.serial.slice(-4)) - 1000;
  const target = row.serial === ACADEMY_MACHINE_TARGET_SERIAL;
  const kinds: TimelineKind[] = ['comment'];
  if (row.warrantyId) kinds.push('warranty');
  if (row.latestActivityDate) kinds.push('service');
  if (row.openTickets || target) kinds.push('ticket');
  if (row.openClaims || target) kinds.push('claim');
  if (row.openTsb || target) kinds.push('tsb');
  const timeline = kinds.map((kind, index) => ({
    id: `${row.serial}:${kind}`, kind, date: `2026-0${index + 1}-15T10:00:00.000Z`,
    title: t(`academyMachineEvent_${kind}`, language),
    description: `${t('academyMachineLocalHistory', language)} · ${row.serial}`,
  })).reverse();
  const related = (kind: TimelineKind) => timeline.filter((event) => event.kind === kind).map((event) => ({
    id: event.id, kind, label: event.title, date: event.date, sublabel: row.serial,
  }));
  const expired = n % 4 === 0;
  return {
    found: true,
    summary: {
      serial: row.serial, normalizedSerial: row.normalizedSerial, machineType: row.machineType, model: row.machineModel,
      customerName: row.customerName ?? null, dealerName: row.dealerName, importerName: null,
      servicePartnerName: null, sellerLabel: 'ACA', warrantyStart: row.warrantyId ? row.deliveryDate : null,
      warrantyEnd: row.warrantyId ? (expired ? '2026-02-01' : '2027-01-31') : null,
      registrationDate: row.deliveryDate, currentHours: row.operatingHours, latestServiceDate: row.latestActivityDate,
      openTickets: row.openTickets, openClaims: row.openClaims, tsbPending: row.openTsb,
      openItemsCount: row.openTickets + row.openClaims + row.openTsb, hoursRegression: null,
      status: 'active', machineRecord: null, registryRecord: row, dealerLinkMissing: !row.dealerNumber,
      statusItems: [{ key: 'warranty', label: t('academyMachineEvent_warranty', language), value: row.warrantyId ?? '—', tone: row.warrantyId ? 'green' : 'yellow' }],
      health: { level: row.health, reasons: [] },
    },
    timeline, comments: [{ id: `${row.serial}:note`, date: row.deliveryDate, author: 'Academy Service', source: 'service', body: t('academyMachineLocalHistory', language) }],
    related: { warranties: related('warranty'), serviceRegistrations: related('service'), tickets: related('ticket'), claims: related('claim'), tsb: related('tsb') },
    documents: [], photos: [], owners: row.dealerName ? [{ period: '2026', name: row.dealerName }] : [],
  };
}
