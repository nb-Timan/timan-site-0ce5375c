import { describe, expect, it } from 'vitest';
import { parsePlanningSupplyMatrix, selectPlanningSupplySheetName } from '@/lib/planningSupplyImport';

const headers = [
  'Serie Nr.', 'Maskin ident nr.', 'P-nr.', 'Salgsordre', 'Lev. Dato',
  'Maskine færdig i produktion', 'Bekræftet levering til kunden',
  'Forhandler', 'Kunde', 'Kommentar', 'Status', 'ÅR',
];

describe('Planning manual supply adapter', () => {
  it('selects only the canonical workbook sheet for each supported machine family', () => {
    const sheets = ['3330', 'RC1000', 'RC751', 'Tool-Trac', 'VPlov '];
    expect(selectPlanningSupplySheetName(sheets, '410040')).toBe('RC751');
    expect(selectPlanningSupplySheetName(sheets, '411000')).toBe('RC1000');
  });

  it('does not cross-match another machine sheet or silently fall back in a multi-sheet workbook', () => {
    expect(() => selectPlanningSupplySheetName(['RC1000', '3330'], '410040'))
      .toThrow('Workbooken indeholder ikke et entydigt ark for den valgte maskine.');
  });

  it('normalizes RC-751 identity, production reference, date, week and ERP reference', () => {
    const [row] = parsePlanningSupplyMatrix([headers, [
      'Serie 24', '410040-01-0387', 'S24-14', '', '25-09-25', 'U39',
      '', '', '', '', '', 2025,
    ]], '410040');
    expect(row).toMatchObject({
      rowNumber: 2,
      itemNumber: '410040',
      serialNumber: '410040-01-0387',
      machineIdentNumber: '410040-01-0387',
      productionReference: 'S24-14',
      productionCompletedAt: '2025-09-25',
      productionCompletedWeek: 39,
      productionCompletedYear: 2025,
      salesOrderNumber: null,
      validationError: null,
    });
  });

  it('keeps commercial spreadsheet fields out of the canonical row', () => {
    const [row] = parsePlanningSupplyMatrix([headers, [
      'Serie 24', '410040-01-0374', 'S24-1', '139151', '03-09-25', 'U36',
      '12-03-2026', 'UNTRUSTED DEALER', 'UNTRUSTED CUSTOMER', 'UNTRUSTED COMMENT', 'Solgt', 2025,
    ]], '410040');
    expect(row.hasIgnoredCommercialData).toBe(true);
    expect(row).not.toHaveProperty('dealer');
    expect(row).not.toHaveProperty('customer');
    expect(row).not.toHaveProperty('comment');
    expect(row).not.toHaveProperty('confirmedCustomerDelivery');
    expect(row).not.toHaveProperty('sourceStatus');
    expect(row.salesOrderNumber).toBe('139151');
  });

  it('does not treat Excel zero and 1900 commercial placeholders as source hints', () => {
    const [row] = parsePlanningSupplyMatrix([headers, [
      'Serie 25', '410040-01-0390', 'S25-1', 0, '08-06-26', 'U23',
      0, 0, 0, '', 0, 2026,
    ]], '410040');
    expect(row.hasIgnoredCommercialData).toBe(false);
    expect(row.salesOrderNumber).toBeNull();
  });

  it('groups S27-1 through S27-4 as four source units on 02.11.2026', () => {
    const rows = parsePlanningSupplyMatrix([headers,
      ...[410, 411, 412, 413].map((serial, index) => [
        'Serie 27', `410040-01-0${serial}`, `S27-${index + 1}`, '', '02-11-26', 'U44',
        '', '', '', '', '', 2026,
      ]),
    ], '410040');
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.productionCompletedAt))).toEqual(new Set(['2026-11-02']));
    expect(rows.map((row) => row.productionReference)).toEqual(['S27-1', 'S27-2', 'S27-3', 'S27-4']);
  });

  it('groups S27-5 through S27-8 as four source units on 09.11.2026', () => {
    const rows = parsePlanningSupplyMatrix([headers,
      ...[414, 415, 416, 417].map((serial, index) => [
        'Serie 27', `410040-01-0${serial}`, `S27-${index + 5}`, '', '09-11-26', 'U45',
        '', '', '', '', '', 2026,
      ]),
    ], '410040');
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.productionCompletedAt === '2026-11-09')).toBe(true);
  });

  it('parses the 23 gross completed candidates without hardcoding availability', () => {
    const sourceRows = [
      ...[387, 388, 389].map((serial, index) => [
        'Serie 24', `410040-01-0${serial}`, `S24-${index + 14}`, '', '25-09-25', 'U39',
        '', '', '', '', '', 2025,
      ]),
      ...Array.from({ length: 8 }, (_, index) => [
        'Serie 25', `410040-01-0${390 + index}`, `S25-${index + 1}`, '',
        index < 4 ? '08-06-26' : '15-06-26', index < 4 ? 'U23' : 'U24',
        '', '', '', '', '', 2026,
      ]),
      ...Array.from({ length: 12 }, (_, index) => [
        'Serie 26', `410040-01-0${398 + index}`, `S26-${index + 1}`, '',
        index < 4 ? '24-08-26' : index < 8 ? '31-08-26' : '14-09-26',
        index < 4 ? 'U34' : index < 8 ? 'U35' : 'U37',
        '', '', '', '', '', 2026,
      ]),
    ];
    const rows = parsePlanningSupplyMatrix([headers, ...sourceRows], '410040');
    expect(rows).toHaveLength(23);
    expect(new Set(rows.map((row) => row.serialNumber)).size).toBe(23);
    expect(rows.every((row) => row.validationError === null)).toBe(true);
    expect(rows.every((row) => row.productionCompletedAt! <= '2026-10-05')).toBe(true);
  });

  it('parses the Danish S25-8 delivery date without an offset or locale swap', () => {
    const [row] = parsePlanningSupplyMatrix([headers, [
      'Serie 25', '410040-01-0397', 'S25-8', '', '15-06-26', 'U24',
      '', '', '', '', '', 2026,
    ]], '410040');
    expect(row.productionCompletedAt).toBe('2026-06-15');
    expect(row.productionCompletedWeek).toBe(24);
    expect(row.productionCompletedYear).toBe(2026);
    expect(row.validationError).toBeNull();
  });

  it('parses both supplied S27 batches as eight future units', () => {
    const sourceRows = Array.from({ length: 8 }, (_, index) => [
      'Serie 27', `410040-01-0${410 + index}`, `S27-${index + 1}`, '',
      index < 4 ? '02-11-26' : '09-11-26', index < 4 ? 'U44' : 'U45',
      '', '', '', '', '', 2026,
    ]);
    const rows = parsePlanningSupplyMatrix([headers, ...sourceRows], '410040');
    expect(rows.filter((row) => row.productionCompletedAt === '2026-11-02')).toHaveLength(4);
    expect(rows.filter((row) => row.productionCompletedAt === '2026-11-09')).toHaveLength(4);
    expect(rows.every((row) => row.productionCompletedAt! > '2026-10-05')).toBe(true);
  });

  it('rejects serials for another selected machine and invalid P references', () => {
    const rows = parsePlanningSupplyMatrix([headers,
      ['Serie 27', '411000-01-0410', 'S27-1', '', '02-11-26', 'U44', '', '', '', '', '', 2026],
      ['Serie 27', '410040-01-0411', 'bad', '', '02-11-26', 'U44', '', '', '', '', '', 2026],
    ], '410040');
    expect(rows[0].validationError).toBe('Maskinidentitet matcher ikke valgt varenummer');
    expect(rows[1].validationError).toBe('Ugyldigt P-nr.');
  });

  it('parses the original production workbook headers without shifting the date', () => {
    const [row] = parsePlanningSupplyMatrix([[
      'ÅR', 'Serie Nr.', 'Maskin ident nr.', 'P-nr.', 'P-Ordre nr.', 'Uge færdig I prod.',
      'Dato færdig i produktion', 'Shipping date', 'Salgsordre', 'Faktureret',
      'Bekræftet Lev. Dato\r\nTil kunden', 'Forhandler', 'Ordre (Kommentar fra C5)', 'Kommentar', 'Status',
    ], [
      2026, 'Serie 51', '411000-04-1605', 'S51-1', '', 36, 46269, 46275, '140358', 'F',
      46266, 'UNTRUSTED DEALER', 'UNTRUSTED COMMENT', '', 'Solgt',
    ]], '411000');
    expect(row).toMatchObject({
      productionCompletedAt: '2026-09-04',
      productionCompletedWeek: 36,
      productionCompletedYear: 2026,
      validationError: null,
      hasIgnoredCommercialData: true,
    });
  });

  it('treats 1900 placeholder dates as missing', () => {
    const workbookHeaders = [
      'ÅR', 'Serie Nr.', 'Maskin ident nr.', 'P-nr.', 'Uge færdig I prod.',
      'Dato færdig i produktion', 'Shipping date',
    ];
    const [numericPlaceholder, textPlaceholder] = parsePlanningSupplyMatrix([workbookHeaders,
      [2026, 'Serie 52', '411000-04-1618', 'S52-2', 43, 5, 5],
      [2026, 'Serie 52', '411000-04-1619', 'S52-3', 43, '05-01-1900', '05-01-1900'],
    ], '411000');
    expect(numericPlaceholder.productionCompletedAt).toBeNull();
    expect(textPlaceholder.productionCompletedAt).toBeNull();
    expect(numericPlaceholder.validationError).toBeNull();
    expect(textPlaceholder.validationError).toBeNull();
  });

  it('accepts a unique RC-1000s serial without P-number or production date', () => {
    const [row] = parsePlanningSupplyMatrix([headers, [
      'Serie 53', '411000-04-1630', '', 0, '05-01-1900', 'U52',
      '00-01-1900', 0, 0, '', 0, 2026,
    ]], '411000');
    expect(row).toMatchObject({
      serialNumber: '411000-04-1630',
      productionReference: '',
      productionCompletedAt: null,
      validationError: null,
    });
  });

  it('still rejects malformed non-empty P-numbers and production dates', () => {
    const rows = parsePlanningSupplyMatrix([headers,
      ['Serie 53', '411000-04-1631', 'wrong', 0, '', 'U52', '', '', '', '', '', 2026],
      ['Serie 53', '411000-04-1632', '', 0, 'not-a-date', 'U52', '', '', '', '', '', 2026],
    ], '411000');
    expect(rows[0].validationError).toBe('Ugyldigt P-nr.');
    expect(rows[1].validationError).toBe('Ugyldig produktionsdato');
  });
});
