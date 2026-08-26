export const MESSE_LEAD_BCC_EMAIL = 'sales@timan.dk';

function cleanEmail(value: string | null | undefined): string {
  return (value || '').trim();
}

export function buildMesseLeadMailRecipients(
  sellerEmail: string | null | undefined,
  extraRecipientEmail?: string | null,
): {
  to: string[];
  recipientEmail: string;
  extraRecipientEmail: string | null;
  bcc: string[];
} {
  const primaryEmail = cleanEmail(sellerEmail);
  const extraEmail = cleanEmail(extraRecipientEmail);
  const visibleRecipients = Array.from(new Set([primaryEmail, extraEmail].filter(Boolean)));

  return {
    to: visibleRecipients,
    recipientEmail: primaryEmail,
    extraRecipientEmail: extraEmail || null,
    bcc: [MESSE_LEAD_BCC_EMAIL],
  };
}
