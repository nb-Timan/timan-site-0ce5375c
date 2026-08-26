import { describe, expect, it } from 'vitest';
import { buildMesseLeadMailRecipients, MESSE_LEAD_BCC_EMAIL } from '@/lib/messeLeadMail';

describe('Messe lead mail recipients', () => {
  it.each([
    ['EM', 'em@timan.dk'],
    ['AKR', 'akr@timan.dk'],
    ['JTN', 'jtn@timan.dk'],
    ['BP', 'bp@timan.dk'],
  ])('keeps %s as visible recipient and adds sales as BCC', (_initials, sellerEmail) => {
    const result = buildMesseLeadMailRecipients(sellerEmail);

    expect(result.to).toEqual([sellerEmail]);
    expect(result.recipientEmail).toBe(sellerEmail);
    expect(result.bcc).toEqual([MESSE_LEAD_BCC_EMAIL]);
    expect(result.to).not.toContain(MESSE_LEAD_BCC_EMAIL);
  });

  it('keeps extra visible recipient separate from the fixed BCC', () => {
    const result = buildMesseLeadMailRecipients('em@timan.dk', 'kunde@example.dk');

    expect(result.to).toEqual(['em@timan.dk', 'kunde@example.dk']);
    expect(result.extraRecipientEmail).toBe('kunde@example.dk');
    expect(result.bcc).toEqual([MESSE_LEAD_BCC_EMAIL]);
    expect(result.to).not.toContain(MESSE_LEAD_BCC_EMAIL);
  });
});
