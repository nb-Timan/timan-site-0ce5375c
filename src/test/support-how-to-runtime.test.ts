import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const assistant = readFileSync('src/lib/assistantSupportService.ts', 'utf8');
const service = readFileSync('src/lib/supportService.ts', 'utf8');
const endpoint = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');

describe('Support Timan how-to runtime boundary', () => {
  it('routes read-only how-to before product discovery and transports only canonical intent metadata', () => {
    expect(assistant.indexOf('buildSupportHowToContext(request.content)'))
      .toBeLessThan(assistant.indexOf('isProductDiscoveryQuestion(request.content)'));
    expect(assistant).toContain("intent: 'timan-how-to'");
    expect(service).toContain('how_to: request.howTo');
  });

  it('uses targeted retrieval expansion without bypassing approved knowledge or confidence', () => {
    expect(endpoint).toContain("value.domain !== 'TIMAN_HOW_TO'");
    expect(endpoint).toContain("value.topic !== 'spare-parts-ordering'");
    expect(endpoint).toContain(': howToRetrievalQuery(message, howTo)');
    expect(endpoint).toContain('p_query_text: retrievalQuery');
    expect(endpoint).toContain("p_include_evaluation_only: false");
    expect(endpoint).toContain('Answer as read-only how-to guidance from the approved retrieved knowledge.');
    expect(endpoint).not.toContain("structuredConfidence('CANONICAL_HOW_TO')");
  });
});
