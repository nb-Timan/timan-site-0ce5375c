export const MESSE_LEAD_BCC_EMAIL = 'sales@timan.dk';

function cleanEmail(value: string | null | undefined): string {
  return (value || '').trim();
}

export function buildMesseLeadInternalMailRouting(
  sellerEmail: string | null | undefined,
): {
  to: [string];
  bcc: string[];
} {
  const recipientEmail = cleanEmail(sellerEmail);
  if (!recipientEmail) {
    throw new Error('Messe lead mail requires a responsible Timan seller email.');
  }

  return {
    to: [recipientEmail],
    bcc: [MESSE_LEAD_BCC_EMAIL],
  };
}
