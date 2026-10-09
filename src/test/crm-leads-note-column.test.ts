import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');

describe('CRM leads note column', () => {
  it('places a compact left-aligned Note column between Status and Handling', () => {
    const statusHeader = page.indexOf("tt('col_status', lang)");
    const noteHeader = page.indexOf('data-testid="crm-leads-note-header"');
    const actionHeader = page.indexOf("tt('col_action', lang)");
    const header = page.slice(noteHeader, page.indexOf('</th>', noteHeader));

    expect(statusHeader).toBeGreaterThan(-1);
    expect(noteHeader).toBeGreaterThan(statusHeader);
    expect(actionHeader).toBeGreaterThan(noteHeader);
    expect(header).toContain('w-[84px] min-w-[84px]');
    expect(header).toContain('text-left');
    expect(header).toContain("crmLeadText('note', lang)");
    expect(header).not.toContain('text-center');
  });

  it('keeps the existing Quick Note control and count inside the Note cell', () => {
    const noteCellStart = page.indexOf('data-testid="crm-leads-note-cell"');
    const actionCellStart = page.indexOf('data-testid="crm-leads-action-cell"');
    const noteCell = page.slice(noteCellStart, actionCellStart);

    expect(noteCell).toContain('text-left align-middle');
    expect(noteCell).toContain('<Plus className="h-3.5 w-3.5" />');
    expect(noteCell).toContain('<span>{noteActionLabel}</span>');
    expect(noteCell).toContain('setNoteTarget(r)');
    expect(page).toContain("const noteActionLabel = noteCount > 0 ? `${crmLeadText('note', lang)} (${noteCount})` : crmLeadText('note', lang);");
  });

  it('keeps only lead actions in Handling', () => {
    const actionCellStart = page.indexOf('data-testid="crm-leads-action-cell"');
    const actionCell = page.slice(actionCellStart, page.indexOf('</td>', actionCellStart));

    expect(actionCell).not.toContain('setNoteTarget(r)');
    expect(actionCell).not.toContain('noteActionLabel');
    expect(actionCell).toContain("demoFlowText('plan', lang)");
    expect(actionCell).toContain('handleConvertToQuote(r.id)');
    expect(actionCell).toContain('setCloseTarget(lead)');
  });

  it('keeps the compact Note column inside the existing responsive table scroller', () => {
    const scroller = page.indexOf('<div className="overflow-x-auto">');
    const table = page.indexOf('<table className="w-full text-sm">', scroller);
    const noteHeader = page.indexOf('data-testid="crm-leads-note-header"', table);
    const actionHeader = page.indexOf("tt('col_action', lang)", noteHeader);

    expect(scroller).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(scroller);
    expect(noteHeader).toBeGreaterThan(table);
    expect(actionHeader).toBeGreaterThan(noteHeader);
    expect(page).toContain('gap-1 whitespace-nowrap rounded-md');
  });
});
