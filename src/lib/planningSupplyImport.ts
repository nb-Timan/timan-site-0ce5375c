import * as XLSX from 'xlsx';
import { serialKey } from '@/lib/machineJournalService';
import { supabase } from '@/lib/supabase';

export const MANUAL_SUPPLY_SOURCE = 'manual_supply_import';

export interface PlanningSupplyImportRow {
  rowNumber: number;
  itemNumber: string;
  serialNumber: string;
  machineIdentNumber: string;
  productionReference: string;
  salesOrderNumber: string | null;
  productionCompletedAt: string | null;
  productionCompletedWeek: number | null;
  productionCompletedYear: number | null;
  hasIgnoredCommercialData: boolean;
  validationError: string | null;
}

export type PlanningSupplyPreviewOutcome =
  | 'new' | 'existing' | 'updated' | 'duplicate' | 'conflict' | 'invalid';

export interface PlanningSupplyPreviewRow extends PlanningSupplyImportRow {
  sourceRecordKey: string;
  outcome: PlanningSupplyPreviewOutcome;
  supplyStatus: 'available' | 'incoming' | 'blocked' | 'unavailable';
  portalState: 'none' | 'quote' | 'order' | 'historical';
  conflictReason: string | null;
}

export interface PlanningSupplyImportSummary {
  sourceRows: number;
  uniqueSerials: number;
  newMachines: number;
  existingMatches: number;
  updatedMachines: number;
  completedCandidates: number;
  futureUnits: number;
  quoteReserved: number;
  orderReserved: number;
  soldCompleted: number;
  freeStock: number;
  duplicates: number;
  conflicts: number;
  invalidRows: number;
}

export interface PlanningSupplyImportResult {
  preview: boolean;
  alreadyImported: boolean;
  batchId: string | null;
  summary: PlanningSupplyImportSummary;
  rows: PlanningSupplyPreviewRow[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  serial: ['maskin ident nr', 'maskinident nr', 'maskinidentitet', 'serienr', 'serienummer'],
  productionReference: ['p nr', 'p nummer', 'produktionsreference'],
  salesOrder: ['salgsordre', 'erp nr', 'erp nummer'],
  productionDate: ['lev dato', 'produktionsdato', 'produktions slutdato'],
  productionWeek: ['maskine faerdig i produktion', 'maskine færdig i produktion', 'produktionsuge'],
  productionYear: ['ar', 'år', 'produktionsar', 'produktionsår'],
  dealer: ['forhandler'],
  customer: ['kunde'],
  comment: ['kommentar'],
  confirmedDelivery: ['bekraeftet levering til kunden', 'bekræftet levering til kunden'],
  sourceStatus: ['status'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('da-DK')
    .replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function findColumn(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  return headers.findIndex((header) => HEADER_ALIASES[key].includes(header));
}

function cell(row: unknown[], column: number): unknown {
  return column >= 0 ? row[column] : null;
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = clean(value);
  if (!text) return null;
  const danish = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (danish) {
    const year = danish[3].length === 2 ? 2000 + Number(danish[3]) : Number(danish[3]);
    return `${year}-${danish[2].padStart(2, '0')}-${danish[1].padStart(2, '0')}`;
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  return iso && Number.isFinite(Date.parse(`${iso}T12:00:00Z`)) ? iso : null;
}

function parseWeek(value: unknown): number | null {
  const match = /(?:U|W)?\s*(\d{1,2})/i.exec(clean(value));
  if (!match) return null;
  const week = Number(match[1]);
  return week >= 1 && week <= 53 ? week : null;
}

function parseYear(value: unknown, date: string | null): number | null {
  const year = Number(clean(value));
  if (Number.isInteger(year) && year >= 1900 && year <= 2200) return year;
  return date ? Number(date.slice(0, 4)) : null;
}

export function parsePlanningSupplyMatrix(
  matrix: unknown[][],
  itemNumber: string,
): PlanningSupplyImportRow[] {
  const headerIndex = matrix.findIndex((row) => row.some((value) => normalizeHeader(value) === 'maskin ident nr'));
  if (headerIndex < 0) throw new Error('Filen mangler kolonnen Maskin ident nr.');
  const headers = matrix[headerIndex].map(normalizeHeader);
  const columns = {
    serial: findColumn(headers, 'serial'), productionReference: findColumn(headers, 'productionReference'),
    salesOrder: findColumn(headers, 'salesOrder'), productionDate: findColumn(headers, 'productionDate'),
    productionWeek: findColumn(headers, 'productionWeek'), productionYear: findColumn(headers, 'productionYear'),
    dealer: findColumn(headers, 'dealer'), customer: findColumn(headers, 'customer'),
    comment: findColumn(headers, 'comment'), confirmedDelivery: findColumn(headers, 'confirmedDelivery'),
    sourceStatus: findColumn(headers, 'sourceStatus'),
  };
  if (columns.productionReference < 0 || columns.productionDate < 0) {
    throw new Error('Filen skal indeholde P-nr. og Lev. Dato.');
  }
  return matrix.slice(headerIndex + 1)
    .map((row, index) => ({ row, rowNumber: headerIndex + index + 2 }))
    .filter(({ row }) => row.some((value) => clean(value)))
    .map(({ row, rowNumber }) => {
      const serialNumber = clean(cell(row, columns.serial)).toUpperCase();
      const productionReference = clean(cell(row, columns.productionReference)).toUpperCase();
      const productionCompletedAt = parseDate(cell(row, columns.productionDate));
      const validationError = !serialNumber
        ? 'Mangler maskinidentitet'
        : !serialKey(serialNumber).startsWith(serialKey(itemNumber))
          ? 'Maskinidentitet matcher ikke valgt varenummer'
          : !/^S\d+-\d+$/i.test(productionReference)
            ? 'Ugyldigt P-nr.'
            : !productionCompletedAt ? 'Ugyldig produktionsdato' : null;
      const ignored = [columns.dealer, columns.customer, columns.comment,
        columns.confirmedDelivery, columns.sourceStatus]
        .some((column) => clean(cell(row, column)).length > 0);
      return {
        rowNumber,
        itemNumber,
        serialNumber,
        machineIdentNumber: serialNumber,
        productionReference,
        salesOrderNumber: clean(cell(row, columns.salesOrder)) || null,
        productionCompletedAt,
        productionCompletedWeek: parseWeek(cell(row, columns.productionWeek)),
        productionCompletedYear: parseYear(cell(row, columns.productionYear), productionCompletedAt),
        hasIgnoredCommercialData: ignored,
        validationError,
      };
    });
}

export async function parsePlanningSupplyFile(file: File, itemNumber: string): Promise<PlanningSupplyImportRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Filen indeholder ikke et ark.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  return parsePlanningSupplyMatrix(matrix, itemNumber);
}

export async function planningSupplyFileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toRpcRows(rows: PlanningSupplyImportRow[]) {
  return rows.map((row) => ({
    row_number: row.rowNumber,
    serial_number: row.serialNumber,
    machine_ident_number: row.machineIdentNumber,
    production_reference: row.productionReference,
    sales_order_number: row.salesOrderNumber,
    production_completed_at: row.productionCompletedAt,
    production_completed_week: row.productionCompletedWeek,
    production_completed_year: row.productionCompletedYear,
    has_ignored_commercial_data: row.hasIgnoredCommercialData,
    validation_error: row.validationError,
  }));
}

export async function processPlanningSupplyImport(input: {
  fileName: string;
  fileSha256: string;
  itemNumber: string;
  rows: PlanningSupplyImportRow[];
  confirm: boolean;
  asOf?: string;
}): Promise<PlanningSupplyImportResult> {
  const { data, error } = await supabase.rpc('planning_process_supply_import', {
    p_file_name: input.fileName,
    p_file_sha256: input.fileSha256,
    p_item_number: input.itemNumber,
    p_rows: toRpcRows(input.rows),
    p_confirm: input.confirm,
    p_as_of: input.asOf ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as PlanningSupplyImportResult;
}
