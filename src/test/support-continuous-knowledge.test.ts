import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { searchTimanWeb } from '../../supabase/functions/_shared/supportAssistantProvider.ts';
import {
  canonicalTimanUrl,
  isStructuredAuthorityQuestion,
  timanLanguageFromUrl,
  timanPageCategory,
  timanProductRelations,
} from '../../supabase/functions/_shared/supportTimanKnowledge.ts';

const migration = readFileSync('supabase/migrations/20260930211748_support_continuous_timan_knowledge.sql', 'utf8');
const schedulerLifecycleMigration = readFileSync('supabase/migrations/20260930214700_allow_controlled_timan_sync_review_insert.sql', 'utf8');
const coverageMigration = readFileSync('supabase/migrations/20260930215500_complete_timan_knowledge_coverage.sql', 'utf8');
const syncFunction = readFileSync('supabase/functions/support-knowledge-sync/index.ts', 'utf8');
const chatFunction = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');

describe('continuous Timan.dk knowledge', () => {
  it('canonicalizes and classifies only Timan.dk URLs', () => {
    expect(canonicalTimanUrl('https://www.timan.dk/en/machines/?utm_source=test#spec')).toBe('https://timan.dk/en/machines/');
    expect(canonicalTimanUrl('https://example.com/en/machines/')).toBeNull();
    expect(timanLanguageFromUrl('https://timan.dk/de/maskinen/')).toBe('de');
    expect(timanLanguageFromUrl('https://timan.dk/se/maskiner/')).toBe('sv');
    expect(timanLanguageFromUrl('https://timan.dk/cz/maskiner/')).toBe('cs');
    expect(timanLanguageFromUrl('https://timan.dk/maskiner/')).toBe('da');
    expect(timanPageCategory('https://timan.dk/redskaber/rc-1000/')).toBe('Products / Attachments');
    expect(timanPageCategory('https://timan.dk/en/tools/tools-for-rc-1000/')).toBe('Products / Attachments');
    expect(timanPageCategory('https://timan.dk/de/haendler/')).toBe('Dealers');
    expect(timanProductRelations('RC-751 and Timan 3330')).toEqual(['RC-751', 'Timan 3330']);
  });

  it('keeps structured business facts out of live web fallback', () => {
    expect(isStructuredAuthorityQuestion('Hvad koster en RC-751?')).toBe(true);
    expect(isStructuredAuthorityQuestion('Which attachments are compatible with RC-1000s?')).toBe(true);
    expect(isStructuredAuthorityQuestion('Hvor ligger Timan?')).toBe(false);
    expect(chatFunction).toContain("&& !isStructuredAuthorityQuestion(message)");
    expect(chatFunction.indexOf('if (productPriceLookup)')).toBeLessThan(chatFunction.indexOf('mayUseControlledWeb'));
  });

  it('uses OpenAI Responses web search with a hard Timan.dk domain allowlist', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.tools).toEqual([{ type: 'web_search', filters: { allowed_domains: ['timan.dk'] } }]);
      expect(body.tool_choice).toBe('required');
      expect(body.store).toBe(false);
      return new Response(JSON.stringify({
        id: 'resp_web_1',
        model: 'gpt-4.1-mini-2025-04-14',
        status: 'completed',
        usage: { input_tokens: 8200, output_tokens: 80, input_tokens_details: { cached_tokens: 0 } },
        output: [
          { type: 'web_search_call', action: { sources: [
            { url: 'https://www.timan.dk/om-timan?utm_source=test#facts', title: 'Om Timan' },
            { url: 'https://example.com/unsafe', title: 'Unsafe' },
          ] } },
          { type: 'message', content: [{ type: 'output_text', text: 'Timan is based in Denmark.', annotations: [] }] },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await searchTimanWeb({
      apiKey: 'test-key', model: 'gpt-4.1-mini-2025-04-14', timeoutMs: 1000,
      maxOutputTokens: 200, languageName: 'English', question: 'Where is Timan based?', fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.answer).toBe('Timan is based in Denmark.');
    expect(result.sources).toEqual([{ url: 'https://timan.dk/om-timan/', title: 'Om Timan' }]);
  });

  it('reuses the governed review, immutable revision and scheduler foundations', () => {
    expect(migration).toContain("auto_promotion_enabled boolean not null default false");
    expect(syncFunction).not.toContain('auto_promotion_enabled === true');
    expect(migration).toContain('support_knowledge_sync_runs');
    expect(migration).toContain('support_web_knowledge_candidates');
    expect(migration).toContain('support-timan-knowledge-daily');
    expect(coverageMigration).toContain('secondary_language_cadence_days');
    expect(coverageMigration).toContain('language_indexed_counts');
    expect(coverageMigration).toContain('relevant_excerpt');
    expect(chatFunction).toContain(".eq('is_current', true)");
    expect(chatFunction).toContain(".eq('status', 'INDEXED')");
    expect(chatFunction).toContain("if (registry?.knowledge_item_id && indexedItemIds.has(registry.knowledge_item_id)) continue");
    expect(chatFunction).toContain("level: 'MEDIUM', score: 0.8, reason: 'CONTROLLED_TIMAN_DK_WEB'");
    expect(syncFunction).toContain("lifecycle_status: 'REVIEW'");
    expect(syncFunction).toContain("status: 'NOT_INDEXED'");
    expect(syncFunction).toContain("supersedes_source_id: latest?.id || null");
    expect(syncFunction).toContain('reusableReviewSource');
    expect(syncFunction).toContain("latest.normalized_content_hash === page.contentHash");
    expect(syncFunction).not.toContain('...existing,');
    expect(syncFunction).toContain("errorMessage(reason).slice(0, 200)");
    expect(syncFunction).not.toContain("lifecycle_status: 'APPROVED'");
    expect(schedulerLifecycleMigration).toContain("auth.role() = 'service_role'");
    expect(schedulerLifecycleMigration).toContain("new.status = 'REVIEW'");
    expect(schedulerLifecycleMigration).toContain("new.knowledge_type = 'TIMAN_DK_PAGE'");
    expect(schedulerLifecycleMigration).toContain("and new.source_reference ~ '^https://timan\\.dk(/|$)'");
  });

  it('configures all nine portal languages and preserves same-language discovery', () => {
    for (const language of ['da','en','de','it','hu','sv','fr','pl','cs']) expect(migration).toContain(`'${language}'`);
    expect(syncFunction).toContain('if (language !== feed.language) continue');
    expect(syncFunction).toContain('effectiveLanguageSet.has(row.language)');
    expect(syncFunction).toContain("replace(/\\[\\/?[a-z][^\\]]*\\]/gi, ' ')");
    expect(chatFunction).toContain("p_language: language");
    expect(chatFunction).toContain(`Answer in \${LANGUAGE_NAMES[language] || 'English'}`);
  });

  it('covers the controlled Timan.dk evaluation matrix without weakening structured authority', () => {
    const evaluationCases = [
      { language: 'da', category: 'machine facts', question: 'Hvad er RC-1000s udviklet til?', liveWebEligible: true },
      { language: 'en', category: 'attachments', question: 'Which attachments are available for the RC-1000s?', liveWebEligible: true },
      { language: 'de', category: 'winter maintenance', question: 'Welche Timan-Lösungen gibt es für den Winterdienst?', liveWebEligible: true },
      { language: 'da', category: 'weed removal', question: 'Hvilke Timan-løsninger findes til ukrudtsbekæmpelse?', liveWebEligible: true },
      { language: 'en', category: 'spare-parts ordering', question: 'How do I order Timan spare parts?', liveWebEligible: false },
      { language: 'de', category: 'dealer finding', question: 'Wie finde ich meinen lokalen Timan-Händler?', liveWebEligible: true },
      { language: 'da', category: 'company information', question: 'Hvad laver Timan?', liveWebEligible: true },
      { language: 'en', category: 'product guidance', question: 'Which Timan machine is designed for demanding slopes?', liveWebEligible: true },
      { language: 'de', category: 'portal guidance', question: 'Wo finde ich Angebote im Timan Portal?', liveWebEligible: false },
    ] as const;

    expect(new Set(evaluationCases.map((item) => item.category))).toHaveLength(9);
    expect(new Set(evaluationCases.map((item) => item.language))).toEqual(new Set(['da', 'en', 'de']));
    for (const evaluationCase of evaluationCases) {
      expect(!isStructuredAuthorityQuestion(evaluationCase.question), evaluationCase.category)
        .toBe(evaluationCase.liveWebEligible);
    }
  });
});
