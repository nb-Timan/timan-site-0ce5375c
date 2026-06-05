/**
 * Dealer profile badge — single source of truth for the profile completion
 * status shown on:
 *   • Portal front page ("Forhandlerdata"-kortet)
 *   • CRM → Mine forhandlere (Profilstatus-kolonnen)
 *   • Forhandlerdata-siden (via computeCompletion direkte)
 *
 * Vi genbruger `computeCompletion` fra `dealerProfileCompletion.ts`, så CRM
 * og selvbetjeningssiden altid viser samme felter / samme status. Det betyder
 * også at importerede profilfelter (direktør, telefon, e-mail, økonomi-,
 * salgs-, værksteds- og marketing-kontakter, faktura-e-mail osv.) automatisk
 * tæller med.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchDealerAccountByNumber,
  type DealerAccount,
} from "@/lib/dealerAccountsService";
import { listDealerContacts } from "@/lib/dealerContactsService";
import { computeCompletion, type SectionKey } from "@/lib/dealerProfileCompletion";

const isFilled = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

export type BadgeTone = "green" | "yellow" | "red" | "neutral";

export interface DealerProfileBadge {
  total: number;
  missing: number;
  tone: BadgeTone;
  /** Pre-localised Danish label, e.g. "Mangler 2 af 6" or "Komplet". */
  label: string;
}

/** Display labels (Danish) for the 6 profile sections, in the same order
 *  as computeCompletion returns them. */
const SECTION_LABELS_BY_KEY: Record<SectionKey, string> = {
  company: "Firma information",
  finance: "Økonomi",
  media: "Medier",
  sales: "Salg",
  workshop: "Værksted",
  marketing: "Marketing",
};

export const DEALER_PROFILE_SECTION_LABELS = [
  SECTION_LABELS_BY_KEY.company,
  SECTION_LABELS_BY_KEY.finance,
  SECTION_LABELS_BY_KEY.media,
  SECTION_LABELS_BY_KEY.sales,
  SECTION_LABELS_BY_KEY.workshop,
  SECTION_LABELS_BY_KEY.marketing,
] as const;

/** Returns one boolean per section, in computeCompletion order. */
export function computeDealerProfileSections(
  dealer: DealerAccount | null,
  _peopleCount: number,
): boolean[] {
  if (!dealer) return [false, false, false, false, false, false];
  return computeCompletion(dealer).sections.map((s) => s.complete);
}

export function computeDealerProfileBadge(
  dealer: DealerAccount | null,
  peopleCount: number,
): DealerProfileBadge {
  if (!dealer) {
    return { total: 6, missing: 6, tone: "neutral", label: "Ikke udfyldt" };
  }
  const sections = computeDealerProfileSections(dealer, peopleCount);
  const total = sections.length;
  const missing = sections.filter((c) => !c).length;
  const tone: BadgeTone = missing === 0 ? "green" : missing <= 2 ? "yellow" : "red";
  const label = missing === 0 ? "Komplet" : `Mangler ${missing} af ${total}`;
  return { total, missing, tone, label };
}

export function getDealerProfileMissingLabels(
  dealer: DealerAccount | null,
  _peopleCount: number,
): string[] {
  if (!dealer) return [...DEALER_PROFILE_SECTION_LABELS];
  return computeCompletion(dealer).sections
    .filter((s) => !s.complete)
    .map((s) => SECTION_LABELS_BY_KEY[s.key]);
}

export type DealerProfileSeverity = "complete" | "partial" | "critical" | "neutral";

/**
 * Liste af kritiske stamdata. Hvis bare ét af disse felter mangler, vises
 * forhandleren som "Kritisk" i CRM. Listen er bevidst snæver — den dækker
 * kun det Timan-salg har brug for for overhovedet at kunne kontakte og
 * fakturere forhandleren. Resten af profilfelterne tæller som "Mangler info".
 */
function missingCriticalFields(dealer: DealerAccount): string[] {
  const missing: string[] = [];
  if (!isFilled(dealer.company_name)) missing.push("Firmanavn");
  if (!isFilled(dealer.address_line_1)) missing.push("Adresse 1");
  if (!isFilled(dealer.postal_code)) missing.push("Postnummer");
  if (!isFilled(dealer.city)) missing.push("By");
  if (!isFilled(dealer.country)) missing.push("Land");
  if (!isFilled(dealer.phone) && !isFilled(dealer.email)) {
    missing.push("Telefon eller e-mail");
  }
  // Faktura-e-mail er obligatorisk hvis økonomisektionen er taget i brug
  // (vi behandler økonomi som påkrævet for alle handelsforhandlere).
  if (!isFilled(dealer.invoice_email)) missing.push("E-mail til faktura");
  return missing;
}

/**
 * CRM severity:
 *   • "critical" hvis ét eller flere kritiske stamdatafelter mangler
 *   • "complete" hvis alle 6 profilsektioner er komplette
 *   • "partial"  hvis kritiske felter er udfyldt, men der mangler øvrige
 *                sektioner / kontaktpersoner
 */
export function computeDealerProfileSeverity(
  dealer: DealerAccount | null,
  peopleCount: number,
): DealerProfileSeverity {
  if (!dealer) return "neutral";
  if (missingCriticalFields(dealer).length > 0) return "critical";
  const sections = computeDealerProfileSections(dealer, peopleCount);
  if (sections.every(Boolean)) return "complete";
  return "partial";
}

/** Eksporteret så CRM-tooltippet kan vise præcis hvad der mangler. */
export function getDealerProfileCriticalMissing(
  dealer: DealerAccount | null,
): string[] {
  if (!dealer) return [];
  return missingCriticalFields(dealer);
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
