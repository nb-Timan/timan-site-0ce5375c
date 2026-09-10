import type { DealerContact } from "@/lib/dealerContactsService";

const CONTACT_AREA_LABEL: Record<DealerContact["contact_area"], string> = {
  director: "Direktør",
  sales: "Salg",
  workshop: "Værksted & service",
  parts: "Reservedele",
  marketing: "Marketing",
  finance: "Økonomi",
};

function priority(contact: DealerContact): number {
  const role = (contact.role_title || "").trim().toLocaleLowerCase("da-DK");

  if (contact.contact_area === "director" || role.includes("direktør") || role.includes("director")) return 0;
  if (contact.contact_area === "sales" || role.includes("salg")) return 1;
  if (role.includes("indkøb") || role.includes("purchas")) return 2;
  if (role.includes("værkstedsansvarlig") || role.includes("værkstedschef")) return 3;
  if (contact.contact_area === "parts" || role.includes("reservedelsansvarlig") || role.includes("reservedelsbestiller")) return 4;
  return 5;
}

/** Read-only presentation for canonical Partnerdata contacts in budget references. */
export function sortBudgetReferenceDealerContacts(contacts: DealerContact[]): DealerContact[] {
  return contacts
    .filter((contact) => Boolean(contact.name?.trim()))
    .slice()
    .sort((left, right) =>
      priority(left) - priority(right)
      || Number(right.is_primary) - Number(left.is_primary)
      || (left.name || "").localeCompare(right.name || "", "da")
      || left.created_at.localeCompare(right.created_at),
    );
}

export function formatBudgetReferenceDealerContact(contact: DealerContact): string {
  const role = contact.role_title?.trim() || CONTACT_AREA_LABEL[contact.contact_area];
  return [contact.name?.trim(), role, contact.email?.trim()].filter(Boolean).join(" · ");
}
