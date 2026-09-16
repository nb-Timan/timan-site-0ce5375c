import { describe, expect, it } from 'vitest';
import { buildMesseLeadInternalMailRouting, MESSE_LEAD_BCC_EMAIL } from '@/lib/messeLeadMail';

describe('Messe lead internal mail routing', () => {
  it.each(['em@timan.dk', 'akr@timan.dk', 'jtn@timan.dk', 'bp@timan.dk'])(
    'sends only the selected seller to %s and sales as BCC',
    (sellerEmail) => {
      const result = buildMesseLeadInternalMailRouting(sellerEmail);

      expect(result.to).toEqual([sellerEmail]);
      expect(result.bcc).toEqual([MESSE_LEAD_BCC_EMAIL]);
      expect(result.to).not.toContain(MESSE_LEAD_BCC_EMAIL);
    },
  );

  it('never accepts customer email as a recipient input', () => {
    const customerEmail = 'customer-test@invalid.example';
    const result = buildMesseLeadInternalMailRouting('jtn@timan.dk');

    expect(result.to).toEqual(['jtn@timan.dk']);
    expect([...result.to, ...result.bcc]).not.toContain(customerEmail);
  });

  it.each([null, undefined, '', '   '])('fails safely when the selected seller email is missing', (sellerEmail) => {
    expect(() => buildMesseLeadInternalMailRouting(sellerEmail)).toThrow(
      'Messe lead mail requires a responsible Timan seller email.',
    );
  });
});
