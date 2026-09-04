import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configurator saved edit state', () => {
  const source = () => readFileSync('src/lib/configurationsService.ts', 'utf8');

  it('restores active sent quotes as editable quotes even if legacy type says order', () => {
    const code = source();
    expect(code).toContain('function deriveEditableFlowType');
    expect(code).toContain('if (row.order_sent_at || row.submitted_at) return');
    expect(code).toContain('if (row.quote_number && row.quote_sent_at && !row.order_number) return');
    expect(code).toContain('const flowType = deriveEditableFlowType(row)');
  });

  it('saves edits back to the same canonical row using the current flow type', () => {
    const code = source();
    expect(code).toContain('document_type: state.flowType');
    expect(code).toContain('case_type: state.flowType');
    expect(code).toContain('state_json: state');
  });
});
