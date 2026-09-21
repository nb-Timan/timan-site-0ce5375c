import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

describe('Backend submitted-order revision confirmations', () => {
  it('offers the three explicit Backend-only completion actions', () => {
    expect(source).toContain("state.flowType === 'order' && backendCorrectionSessionId ? (");
    expect(source).toContain('Gem ændring');
    expect(source).toContain('Gem og opret ny ordrebekræftelse');
    expect(source).toContain('Gem og send ny ordrebekræftelse');
  });

  it('saves a revision without a PDF or mail through the existing save path', () => {
    expect(source).toContain('if (await handleSaveChanges()) setConfirmModalOpen(false);');
    expect(source).toContain('await completeSubmittedOrderCorrection(backendCorrectionSessionId);');
  });

  it('creates a revised PDF without entering the webhook, mail-audit or sent-date path', () => {
    const start = source.indexOf("options?.orderRevisionAction === 'confirmation'");
    const end = source.indexOf('// Track PDF generation in Supabase', start);
    const confirmationOnly = source.slice(start, end);

    expect(source).toContain('pdf.save(pdfFilename);');
    expect(confirmationOnly).toContain('completeSubmittedOrderCorrection(backendCorrectionSessionId)');
    expect(confirmationOnly).not.toContain('fetch(orderWebhookUrl');
    expect(confirmationOnly).not.toContain('logMailAuditEvent');
    expect(confirmationOnly).not.toContain('markAsOrderSubmitted');
  });

  it('keeps the send action on the canonical n8n and mail-audit path', () => {
    expect(source).toContain("onClick={() => { if (!submitting) setConfirmSubmitOpen(true); }}");
    expect(source).toContain("orderRevisionAction: 'send'");
    expect(source).toContain("source_action: 'send_order'");
    expect(source).toContain("provider: 'n8n:timan-afsend-ordre'");
    expect(source).toContain('resend: Boolean(backendCorrectionSessionId)');
  });

  it('never reserves a new order number while revising an already submitted order', () => {
    expect(source).toContain('if (backendCorrectionSessionId) {');
    expect(source).toContain('mangler et canonical ordrenummer og kan ikke revideres sikkert');
    expect(source).toContain('const reservedOrderNumber = await getNextCrmDocumentNumber(\'order\');');
  });
});
