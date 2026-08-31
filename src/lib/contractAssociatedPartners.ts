import type { PortalUiLanguage } from "@/lib/portalLanguages";
import type { DealerAccount } from "@/lib/dealerAccountsService";

export type ContractAssociatedPartnerKind = "dealer" | "service_partner" | "dealer_customer";
export type ContractAssociatedPartnerStatus = "existing" | "pending";

export interface ContractAssociatedPartner {
  id: string;
  kind: ContractAssociatedPartnerKind;
  status: ContractAssociatedPartnerStatus;
  existingAccountId: string | null;
  accountNumber: string | null;
  companyName: string;
  cvr: string;
  country: string;
  address: string;
  postalCode: string;
  city: string;
  createdAt: string;
  updatedAt?: string | null;
}

export const CONTRACT_ASSOCIATED_PARTNER_KINDS: ContractAssociatedPartnerKind[] = [
  "dealer",
  "service_partner",
  "dealer_customer",
];

const KIND_LABELS: Record<ContractAssociatedPartnerKind, Record<PortalUiLanguage, string>> = {
  dealer: {
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
  service_partner: {
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
  dealer_customer: {
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
};

const STATUS_LABELS: Record<ContractAssociatedPartnerStatus, Record<PortalUiLanguage, string>> = {
  existing: {
    da: "Eksisterende partner",
    en: "Existing partner",
    de: "Bestehender Partner",
    it: "Partner esistente",
    hu: "Meglévő partner",
    sv: "Befintlig partner",
    fr: "Partenaire existant",
    pl: "Istniejący partner",
    cs: "Stávající partner",
  },
  pending: {
    da: "Ny samarbejdspartner i kontraktkladde",
    en: "New associated partner in contract draft",
    de: "Neuer Partner im Vertragsentwurf",
    it: "Nuovo partner nella bozza di contratto",
    hu: "Új együttműködő partner a szerződéstervezetben",
    sv: "Ny samarbetspartner i avtalsutkast",
    fr: "Nouveau partenaire dans le brouillon du contrat",
    pl: "Nowy partner w wersji roboczej umowy",
    cs: "Nový spolupracující partner v návrhu smlouvy",
  },
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKind(value: unknown): ContractAssociatedPartnerKind | null {
  return CONTRACT_ASSOCIATED_PARTNER_KINDS.includes(value as ContractAssociatedPartnerKind)
    ? value as ContractAssociatedPartnerKind
    : null;
}

function normalizeStatus(value: unknown): ContractAssociatedPartnerStatus {
  return value === "existing" ? "existing" : "pending";
}

function fallbackId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `associated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getContractAssociatedPartnerKindLabel(kind: ContractAssociatedPartnerKind, lang: PortalUiLanguage) {
  const labels = KIND_LABELS[kind] ?? KIND_LABELS.dealer;
  return labels[lang] ?? labels.en;
}

export function getContractAssociatedPartnerStatusLabel(status: ContractAssociatedPartnerStatus, lang: PortalUiLanguage) {
  const labels = STATUS_LABELS[status] ?? STATUS_LABELS.pending;
  return labels[lang] ?? labels.en;
}

export function normalizeContractAssociatedPartners(input: unknown): ContractAssociatedPartner[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();

  return input.reduce<ContractAssociatedPartner[]>((list, raw) => {
    if (!raw || typeof raw !== "object") return list;
    const record = raw as Record<string, unknown>;
    const kind = normalizeKind(record.kind);
    const companyName = asText(record.companyName);
    if (!kind || !companyName) return list;

    const status = normalizeStatus(record.status);
    const existingAccountId = asText(record.existingAccountId) || null;
    const accountNumber = asText(record.accountNumber) || null;
    const key = existingAccountId
      ? `${kind}:existing:${existingAccountId}`
      : `${kind}:${status}:${companyName.toLowerCase()}:${asText(record.cvr).toLowerCase()}`;
    if (seen.has(key)) return list;
    seen.add(key);

    list.push({
      id: asText(record.id) || fallbackId(),
      kind,
      status,
      existingAccountId,
      accountNumber,
      companyName,
      cvr: asText(record.cvr),
      country: asText(record.country),
      address: asText(record.address),
      postalCode: asText(record.postalCode),
      city: asText(record.city),
      createdAt: asText(record.createdAt) || new Date().toISOString(),
      updatedAt: asText(record.updatedAt) || null,
    });
    return list;
  }, []);
}

export function createContractAssociatedPartnerFromDealerAccount(
  account: DealerAccount,
  kind: ContractAssociatedPartnerKind,
): ContractAssociatedPartner {
  return {
    id: fallbackId(),
    kind,
    status: "existing",
    existingAccountId: account.id,
    accountNumber: account.account_number || null,
    companyName: account.company_name,
    cvr: account.vat_number ?? "",
    country: account.country ?? "",
    address: account.address_line_1 || account.address || "",
    postalCode: account.postal_code ?? "",
    city: account.city ?? "",
    createdAt: new Date().toISOString(),
  };
}

export function createPendingContractAssociatedPartner(
  kind: ContractAssociatedPartnerKind,
  input: Pick<ContractAssociatedPartner, "companyName" | "cvr" | "country" | "address" | "postalCode" | "city">,
): ContractAssociatedPartner {
  return {
    id: fallbackId(),
    kind,
    status: "pending",
    existingAccountId: null,
    accountNumber: null,
    companyName: input.companyName.trim(),
    cvr: input.cvr.trim(),
    country: input.country.trim(),
    address: input.address.trim(),
    postalCode: input.postalCode.trim(),
    city: input.city.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function isValidPendingContractAssociatedPartner(input: Pick<ContractAssociatedPartner, "companyName" | "country" | "address" | "postalCode" | "city">) {
  return Boolean(
    input.companyName.trim()
    && input.country.trim()
    && input.address.trim()
    && input.postalCode.trim()
    && input.city.trim(),
  );
}

export function summarizeContractAssociatedPartner(partner: ContractAssociatedPartner) {
  const postalCity = [partner.postalCode, partner.city].filter(Boolean).join(" ");
  return [partner.address, postalCity, partner.country].filter(Boolean).join(", ");
}
