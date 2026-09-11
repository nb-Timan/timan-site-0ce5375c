import type { PortalUiLanguage } from "@/lib/portalLanguages";

export type PartnerAccountTypeId =
  | "dealer"
  | "service_partner"
  | "importer"
  | "dealer_customer"
  | "supplier"
  | "spare_parts"
  | "end_customer"
  | "closed_customer"
  | "employee_single"
  | "misc"
  | "demo_location"
  | "other_partner";

type PartnerAccountTypeConfig = {
  id: PartnerAccountTypeId;
  labels: Record<PortalUiLanguage, string>;
  color: string;
  mapVisibility: "public" | "internal";
};

export const PARTNER_ACCOUNT_TYPES: Record<PartnerAccountTypeId, PartnerAccountTypeConfig> = {
  dealer: {
    id: "dealer",
    labels: {
      da: "Forhandler",
      en: "Dealer",
      de: "Händler",
      it: "Rivenditore",
      hu: "Kereskedő",
      sv: "Återförsäljare",
      fr: "Revendeur",
      pl: "Dealer",
      cs: "Prodejce",
    },
    color: "#dc2626",
    mapVisibility: "public",
  },
  service_partner: {
    id: "service_partner",
    labels: {
      da: "Servicepartner",
      en: "Service partner",
      de: "Servicepartner",
      it: "Partner di servizio",
      hu: "Szervizpartner",
      sv: "Servicepartner",
      fr: "Partenaire de service",
      pl: "Partner serwisowy",
      cs: "Servisní partner",
    },
    color: "#16a34a",
    mapVisibility: "public",
  },
  importer: {
    id: "importer",
    labels: {
      da: "Importør",
      en: "Importer",
      de: "Importeur",
      it: "Importatore",
      hu: "Importőr",
      sv: "Importör",
      fr: "Importateur",
      pl: "Importer",
      cs: "Dovozce",
    },
    color: "#2563eb",
    mapVisibility: "public",
  },
  dealer_customer: {
    id: "dealer_customer",
    labels: {
      da: "Forhandlerkunde",
      en: "Dealer customer",
      de: "Händlerkunde",
      it: "Cliente rivenditore",
      hu: "Kereskedői ügyfél",
      sv: "Återförsäljarkund",
      fr: "Client revendeur",
      pl: "Klient dealera",
      cs: "Zákazník prodejce",
    },
    color: "#64748b",
    mapVisibility: "internal",
  },
  supplier: {
    id: "supplier",
    labels: {
      da: "Leverandør",
      en: "Supplier",
      de: "Lieferant",
      it: "Fornitore",
      hu: "Beszállító",
      sv: "Leverantör",
      fr: "Fournisseur",
      pl: "Dostawca",
      cs: "Dodavatel",
    },
    color: "#0f766e",
    mapVisibility: "internal",
  },
  spare_parts: {
    id: "spare_parts",
    labels: {
      da: "Reservedele",
      en: "Spare parts",
      de: "Ersatzteile",
      it: "Ricambi",
      hu: "Alkatrészek",
      sv: "Reservdelar",
      fr: "Pièces détachées",
      pl: "Części zamienne",
      cs: "Náhradní díly",
    },
    color: "#65a30d",
    mapVisibility: "internal",
  },
  end_customer: {
    id: "end_customer",
    labels: {
      da: "Slutkunde",
      en: "End customer",
      de: "Endkunde",
      it: "Cliente finale",
      hu: "Végfelhasználó",
      sv: "Slutkund",
      fr: "Client final",
      pl: "Klient końcowy",
      cs: "Koncový zákazník",
    },
    color: "#78716c",
    mapVisibility: "internal",
  },
  closed_customer: {
    id: "closed_customer",
    labels: {
      da: "Lukket kunde",
      en: "Closed customer",
      de: "Geschlossener Kunde",
      it: "Cliente chiuso",
      hu: "Lezárt ügyfél",
      sv: "Stängd kund",
      fr: "Client fermé",
      pl: "Zamknięty klient",
      cs: "Uzavřený zákazník",
    },
    color: "#71717a",
    mapVisibility: "internal",
  },
  employee_single: {
    id: "employee_single",
    labels: {
      da: "Ansat person",
      en: "Employee",
      de: "Mitarbeiter",
      it: "Dipendente",
      hu: "Alkalmazott",
      sv: "Anställd",
      fr: "Employé",
      pl: "Pracownik",
      cs: "Zaměstnanec",
    },
    color: "#475569",
    mapVisibility: "internal",
  },
  misc: {
    id: "misc",
    labels: {
      da: "Diverse",
      en: "Miscellaneous",
      de: "Sonstige",
      it: "Varie",
      hu: "Egyéb",
      sv: "Diverse",
      fr: "Divers",
      pl: "Różne",
      cs: "Různé",
    },
    color: "#7c2d12",
    mapVisibility: "internal",
  },
  demo_location: {
    id: "demo_location",
    labels: {
      da: "Demonstrationer",
      en: "Demonstrations",
      de: "Demonstrationen",
      it: "Dimostrazioni",
      hu: "Bemutatók",
      sv: "Demonstrationer",
      fr: "Démonstrations",
      pl: "Demonstracje",
      cs: "Demonstrace",
    },
    color: "#7c3aed",
    mapVisibility: "internal",
  },
  other_partner: {
    id: "other_partner",
    labels: {
      da: "Anden partner",
      en: "Other partner",
      de: "Anderer Partner",
      it: "Altro partner",
      hu: "Egyéb partner",
      sv: "Annan partner",
      fr: "Autre partenaire",
      pl: "Inny partner",
      cs: "Jiný partner",
    },
    color: "#475569",
    mapVisibility: "internal",
  },
};

export const PARTNER_ACCOUNT_MAP_TYPE_IDS: PartnerAccountTypeId[] = [
  "dealer",
  "service_partner",
  "importer",
  "supplier",
  "dealer_customer",
  "demo_location",
];

export function normalizePartnerAccountType(value: string | null | undefined): PartnerAccountTypeId | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ø/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "");

  if (!normalized) return null;
  if (normalized === "dealer" || normalized === "forhandler") return "dealer";
  if (normalized === "servicepartner" || normalized === "service" || normalized === "servicepartner") return "service_partner";
  if (normalized === "importer" || normalized === "importoer" || normalized === "importor") return "importer";
  if (normalized === "dealercustomer" || normalized === "forhandlerkunde") return "dealer_customer";
  if (normalized === "supplier" || normalized === "leverandoer" || normalized === "leverandoermv" || normalized === "leverandormv") return "supplier";
  if (normalized === "spareparts" || normalized === "reservedele") return "spare_parts";
  if (normalized === "endcustomer" || normalized === "slutkunde") return "end_customer";
  if (normalized === "closedcustomer" || normalized === "lukketkunde") return "closed_customer";
  if (normalized === "employeesingle" || normalized === "ansatpersonenkel" || normalized === "ansatperson") return "employee_single";
  if (normalized === "misc" || normalized === "diverse") return "misc";
  if (normalized === "demolocation" || normalized === "demo") return "demo_location";
  return null;
}

export function resolvePartnerAccountType(input: {
  customer_type_label?: string | null;
  customer_type?: string | null;
  dealer_type?: string | null;
}): PartnerAccountTypeId {
  return normalizePartnerAccountType(input.customer_type_label)
    ?? normalizePartnerAccountType(input.customer_type)
    ?? normalizePartnerAccountType(input.dealer_type)
    ?? "other_partner";
}

export function getPartnerAccountTypeLabel(
  type: PartnerAccountTypeId,
  lang: PortalUiLanguage,
): string {
  const labels = PARTNER_ACCOUNT_TYPES[type]?.labels ?? PARTNER_ACCOUNT_TYPES.other_partner.labels;
  return labels[lang] ?? labels.en;
}

export function getPartnerAccountTypeColor(type: PartnerAccountTypeId): string {
  return PARTNER_ACCOUNT_TYPES[type]?.color ?? PARTNER_ACCOUNT_TYPES.other_partner.color;
}

export function isPublicPartnerAccountType(type: PartnerAccountTypeId): boolean {
  return PARTNER_ACCOUNT_TYPES[type]?.mapVisibility === "public";
}
