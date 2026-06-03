/**
 * Dealer profile badge — computes the 6-section completion status used on
 * the front-page Forhandlerdata card. Read-only / UI only (no writes).
 *
 * The 6 sections are:
 *   1. Firma information
 *   2. Økonomi afdeling
 *   3. Medier
 *   4. Salgsafdeling
 *   5. Serviceafdeling (værksted/reservedele)
 *   6. Brugere / Kontakter
 *
 * A section counts as "complete" when all required fields are filled.
 * For section 6 we just require at least one registered user OR
 * dealer_contact row.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchDealerAccountByNumber,
  type DealerAccount,
} from "@/lib/dealerAccountsService";
import { listDealerContacts } from "@/lib/dealerContactsService";

const isFilled = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

export type BadgeTone = "green" | "yellow" | "red" | "neutral";

export interface DealerProfileBadge {
  total: 6;
  missing: number;
  tone: BadgeTone;
  /** Pre-localised Danish label, e.g. "Mangler 2 af 6" or "Komplet". */
  label: string;
}

export function computeDealerProfileBadge(
  dealer: DealerAccount | null,
  peopleCount: number,
): DealerProfileBadge {
  if (!dealer) {
    return { total: 6, missing: 6, tone: "neutral", label: "Ikke udfyldt" };
  }
  const sections: boolean[] = [
    // 1. Firma
    [
      dealer.company_name, dealer.address, dealer.postal_code, dealer.city,
      dealer.country, dealer.vat_number, dealer.director_name,
      dealer.phone, dealer.email,
    ].every(isFilled),
    // 2. Økonomi
    [dealer.finance_contact_name, dealer.invoice_email].every(isFilled),
    // 3. Medier
    [dealer.website].every(isFilled),
    // 4. Salg
    [dealer.sales_contact_name].every(isFilled),
    // 5. Service / Værksted
    [dealer.workshop_contact_name].every(isFilled),
    // 6. Brugere / Kontakter
    peopleCount > 0,
  ];
  const missing = sections.filter((c) => !c).length;
  const tone: BadgeTone = missing === 0 ? "green" : missing <= 2 ? "yellow" : "red";
  const label = missing === 0 ? "Komplet" : `Mangler ${missing} af 6`;
  return { total: 6, missing, tone, label };
}

/**
 * Hook: fetches dealer + headcount for the given dealer_number and returns
 * the badge. Returns null while loading or if no dealer_number is provided.
 */
export function useDealerProfileBadge(
  dealerNumber: string | null | undefined,
): DealerProfileBadge | null {
  const [badge, setBadge] = useState<DealerProfileBadge | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!dealerNumber) { setBadge(null); return; }

    (async () => {
      try {
        const dealerRes = await fetchDealerAccountByNumber(dealerNumber);
        const dealer = dealerRes.row;

        let contactsCount = 0;
        if (dealer?.id) {
          try {
            const contacts = await listDealerContacts(dealer.id);
            contactsCount = contacts.length;
          } catch { /* ignore */ }
        }

        let usersCount = 0;
        try {
          const { count } = await supabase
            .from("app_users")
            .select("id", { count: "exact", head: true })
            .eq("dealer_number", dealerNumber);
          usersCount = count ?? 0;
        } catch { /* ignore */ }

        if (cancelled) return;
        setBadge(computeDealerProfileBadge(dealer, contactsCount + usersCount));
      } catch {
        if (!cancelled) setBadge(computeDealerProfileBadge(null, 0));
      }
    })();

    return () => { cancelled = true; };
  }, [dealerNumber]);

  return badge;
}
