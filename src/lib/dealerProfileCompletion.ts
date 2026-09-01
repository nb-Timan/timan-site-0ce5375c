/**
 * Computes completion status for the self-service dealer profile.
 * A section is "complete" when all required datapoints are present.
 * The headline percentage is field-based; section counts stay section-based.
 */
import type { DealerAccount } from "@/lib/dealerAccountsService";
import type { DealerContact, DealerContactArea } from "@/lib/dealerContactsService";

export type SectionKey = "company" | "finance" | "purchasing" | "sales" | "workshop" | "marketing";

export interface SectionStatus {
  key: SectionKey;
  required: number;
  filled: number;
  complete: boolean;
}

export interface ProfileCompletion {
  totalSteps: number;
  completedSteps: number;
  missingSteps: number;
  percentage: number;
  totalRequired: number;
  filledRequired: number;
  missingRequired: number;
  sections: SectionStatus[];
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function contactValues(
  contacts: DealerContact[],
  area: DealerContactArea,
  legacy: { name?: string | null; email?: string | null },
): unknown[] {
  const areaContacts = contacts.filter((c) => c.contact_area === area);
  const contact = areaContacts.find((c) => nonEmpty(c.name) && nonEmpty(c.email))
    ?? areaContacts.find((c) => nonEmpty(c.name) || nonEmpty(c.email) || nonEmpty(c.phone));
  return [
    contact?.name ?? legacy.name ?? "",
    contact?.email ?? legacy.email ?? "",
  ];
}

function hasPrimaryContact(contacts: DealerContact[], d: DealerAccount | null): boolean {
  if (contacts.some((contact) => contact.is_primary && (nonEmpty(contact.name) || nonEmpty(contact.email) || nonEmpty(contact.phone)))) {
    return true;
  }
  return nonEmpty(d?.primary_contact_name) || nonEmpty(d?.primary_contact_email) || nonEmpty(d?.primary_contact_phone);
}

/** Required field map per section. Optional fields are excluded from required-count. */
function requiredFields(d: DealerAccount | null, contacts: DealerContact[]): Record<SectionKey, unknown[]> {
  return {
    company: [
      d?.company_name ?? "",
      d?.address_line_1 ?? "",
      d?.postal_code ?? "",
      d?.city ?? "",
      d?.country ?? "",
      d?.vat_number ?? "",
      ...contactValues(contacts, "director", { name: d?.director_name, email: null }),
    ],
    finance: [
      ...contactValues(contacts, "finance", { name: d?.finance_contact_name, email: d?.finance_contact_email }),
      d?.invoice_email ?? "",
    ],
    purchasing: [
      ...contactValues(contacts, "parts", { name: null, email: null }),
    ],
    sales: [
      ...contactValues(contacts, "sales", { name: d?.sales_contact_name, email: d?.sales_contact_email }),
      hasPrimaryContact(contacts, d) ? "first-contact" : "",
    ],
    workshop: [
      ...contactValues(contacts, "workshop", { name: d?.workshop_contact_name, email: d?.workshop_contact_email }),
    ],
    marketing: [
      d?.website ?? "",
      ...contactValues(contacts, "marketing", { name: d?.marketing_contact_name, email: d?.marketing_contact_email }),
    ],
  };
}

export function computeCompletion(d: DealerAccount | null, contacts: DealerContact[] = []): ProfileCompletion {
  const required = requiredFields(d, contacts);
  const sections: SectionStatus[] = (Object.keys(required) as SectionKey[]).map((key) => {
    const vals = required[key];
    const filled = vals.filter(nonEmpty).length;
    return { key, required: vals.length, filled, complete: filled === vals.length };
  });
  const completedSteps = sections.filter((s) => s.complete).length;
  const totalSteps = sections.length;
  const totalRequired = sections.reduce((sum, section) => sum + section.required, 0);
  const filledRequired = sections.reduce((sum, section) => sum + section.filled, 0);
  const missingRequired = totalRequired - filledRequired;
  return {
    totalSteps,
    completedSteps,
    missingSteps: totalSteps - completedSteps,
    percentage: totalRequired === 0 ? 100 : Math.round((filledRequired / totalRequired) * 100),
    totalRequired,
    filledRequired,
    missingRequired,
    sections,
  };
}
