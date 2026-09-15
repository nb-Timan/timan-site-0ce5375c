import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const filterStrip = page.slice(
  page.indexOf('{/* Filter strip */}'),
  page.indexOf('{/* Table */}'),
);

describe('CRM leads mobile filter grid', () => {
  it('keeps search full-width while arranging filters in two mobile columns', () => {
    expect(filterStrip).toContain('grid grid-cols-2 gap-3');
    expect(filterStrip).toContain('col-span-2 md:col-span-1');
  });

  it('keeps the established filter order and state handlers', () => {
    const inOrder = [
      'value={typeFilter}',
      'value={machineFilter}',
      'value={equipmentFilter}',
      'value={stage}',
      'value={ownerFilter}',
      'value={sort}',
    ];

    let position = -1;
    for (const value of inOrder) {
      const nextPosition = filterStrip.indexOf(value);
      expect(nextPosition).toBeGreaterThan(position);
      position = nextPosition;
    }

    expect(filterStrip).toContain('onChange={e=>setTypeFilter');
    expect(filterStrip).toContain('onChange={e=>setMachineFilter');
    expect(filterStrip).toContain('onChange={e=>setEquipmentFilter');
    expect(filterStrip).toContain('onChange={e=>setStage');
    expect(filterStrip).toContain('onChange={e=>setOwnerFilter');
    expect(filterStrip).toContain('onChange={e=>setSort');
  });
});
