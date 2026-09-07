import { convertCurrency, type Currency } from "@/lib/currency";

export type DashboardCurrencyFilter = Currency | "both";
export type PrototypeSellerScope = "akr_seller" | "em_seller" | "bp_seller" | "jtn_seller";
export type PrototypePartnerScope = "dealer_wj" | "importer_avistech" | "service_nordic";
export type PrototypeScopeMode = "backend" | PrototypeSellerScope | PrototypePartnerScope;

const prototypeSellerInitials: Record<PrototypeSellerScope, "AKR" | "EM" | "BP" | "JTN"> = {
  akr_seller: "AKR",
  em_seller: "EM",
  bp_seller: "BP",
  jtn_seller: "JTN",
};

export function prototypeScopeForSeller(initials: string | null | undefined): PrototypeSellerScope {
  const normalized = initials?.trim().toUpperCase();
  if (normalized === "EM") return "em_seller";
  if (normalized === "BP") return "bp_seller";
  if (normalized === "JTN") return "jtn_seller";
  return "akr_seller";
}

function isPrototypeSellerScope(scope: PrototypeScopeMode | "seller"): scope is PrototypeSellerScope | "seller" {
  return scope === "seller" || scope in prototypeSellerInitials;
}

export const prototypeScopeLabels: Record<PrototypeScopeMode, string> = {
  backend: "Timan Backend - globalt scope",
  akr_seller: "Timan Sælger - AKR scope",
  em_seller: "Timan Sælger - EM scope",
  bp_seller: "Timan Sælger - BP scope",
  jtn_seller: "Timan Sælger - JTN scope",
  dealer_wj: "Forhandler - WJ Maskinservice",
  importer_avistech: "Importør - AVISTECH SRO + relationer",
  service_nordic: "Servicepartner - Nordic Mower AB + relationer",
};

// Local adapter for the future dealer_contacts read model. It mirrors the
// canonical contact_area = "sales" rule without querying or changing live data.
const prototypePartnerSalesContacts: Record<PrototypePartnerScope, string[]> = {
  dealer_wj: [],
  importer_avistech: ["Petra Novák", "Marek Svoboda"],
  service_nordic: [],
};

export function isPartnerPrototypeScope(scope: PrototypeScopeMode) {
  return scope === "dealer_wj" || scope === "importer_avistech" || scope === "service_nordic";
}

export function salesLabelForDashboardRow(row: DealerDashboardRow, scope: PrototypeScopeMode) {
  if (!isPartnerPrototypeScope(scope)) return row.seller;
  const contacts = prototypePartnerSalesContacts[scope];
  if (!contacts.length) return "Info mangler";
  const index = Array.from(row.customer).reduce((sum, character) => sum + character.charCodeAt(0), 0) % contacts.length;
  return contacts[index];
}

export type DealerDashboardRow = {
  id: string;
  date: string;
  seller: "AKR" | "EM" | "BP" | "JTN";
  country: "Danmark" | "Tyskland" | "Sverige" | "Norge" | "Holland";
  dealer: string;
  customer: string;
  machine: "RC-1000" | "RC-751" | "Timan 3330" | "Tool-Trac";
  partnerType: "Forhandler" | "Importør" | "Servicepartner";
  currency: Currency;
  listPrice: number;
  standardDiscountPct: number;
  extraDiscountPct: number;
  paymentDeliveryDiscountPct: number;
  quantity: number;
  dbPct: number | null;
  orderNumber: string;
  quoteNumber: string;
};

export type DealerDashboardFilters = {
  from: string;
  to: string;
  fromYear: string;
  toYear: string;
  countries: string[];
  sellers: string[];
  dealers: string[];
  customers: string[];
  machines: string[];
  partnerType: string;
  currency: DashboardCurrencyFilter;
};

const dealers = [
  ["WJ Maskinservice", "Danmark", "AKR", "Forhandler"],
  ["AVISTECH SRO", "Tyskland", "EM", "Importør"],
  ["Weimer & Hollar", "Tyskland", "AKR", "Forhandler"],
  ["Lyngfeldt", "Danmark", "BP", "Forhandler"],
  ["Nordic Mower AB", "Sverige", "JTN", "Servicepartner"],
  ["Hummelmühle-Lockwitz", "Tyskland", "AKR", "Forhandler"],
  ["Ecosol Équipement", "Holland", "EM", "Importør"],
  ["Fora GmbH Zeven", "Tyskland", "BP", "Forhandler"],
] as const;

const machines = [
  ["RC-1000", 420_000, 31, 5],
  ["RC-751", 310_000, 27, 4],
  ["Timan 3330", 690_000, 24, 3],
  ["Tool-Trac", 240_000, 22, 2],
] as const;

// Local equivalent of the existing scope expansion: parent account children
// for dealers/importers and explicit service-partner links. No live accounts
// or relations are queried or changed by the prototype.
const prototypeRelationScope: Record<PrototypePartnerScope, string[]> = {
  dealer_wj: ["WJ Maskinservice"],
  importer_avistech: ["AVISTECH SRO", "Weimer & Hollar", "Hummelmühle-Lockwitz"],
  service_nordic: ["Nordic Mower AB", "Lyngfeldt"],
};

/** Local-only demonstration rows. Never fetched from or written to Supabase. */
export const dealerDashboardPrototypeRows: DealerDashboardRow[] = Array.from({ length: 72 }, (_, index) => {
  const [dealer, country, seller, partnerType] = dealers[index % dealers.length];
  const [machine, basePrice, baseDiscount, baseExtraDiscount] = machines[(index * 3 + Math.floor(index / 7)) % machines.length];
  const year = 2021 + (index % 6);
  const month = (index * 5) % 12;
  const currency: Currency = country === "Danmark" || index % 5 === 0 ? "DKK" : "EUR";
  const priceMultiplier = 1 + ((index % 5) * 0.07);
  const listPriceDkk = basePrice * priceMultiplier;
  const listPrice = currency === "EUR" ? Math.round(convertCurrency(listPriceDkk, "DKK", "EUR")) : Math.round(listPriceDkk);
  const quantity = 1 + (index % 3 === 0 ? 1 : 0);
  const extraDiscountPct = baseExtraDiscount + (index % 4);
  const paymentDeliveryDiscountPct = index % 4 === 0 ? 2 : index % 6 === 0 ? 1 : 0;
  return {
    id: `prototype-${index + 1}`,
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(4 + (index % 23)).padStart(2, "0")}`,
    seller: seller as DealerDashboardRow["seller"],
    country: country as DealerDashboardRow["country"],
    dealer,
    customer: `${["Nordby", "Møller", "Bachmann", "Ehlers", "Sørensen", "Hansen"][index % 6]} ${2021 + (index % 6)}`,
    machine: machine as DealerDashboardRow["machine"],
    partnerType: partnerType as DealerDashboardRow["partnerType"],
    currency,
    listPrice,
    standardDiscountPct: baseDiscount + (index % 3),
    extraDiscountPct,
    paymentDeliveryDiscountPct,
    quantity,
    dbPct: index % 5 === 0 ? null : 28 + (index % 11),
    orderNumber: `O-${7301 + index}`,
    quoteNumber: `T-${4301 + index}`,
  };
});

export function totalDiscountPct(row: DealerDashboardRow) {
  return row.standardDiscountPct + row.extraDiscountPct + row.paymentDeliveryDiscountPct;
}

export function netValue(row: DealerDashboardRow) {
  return row.listPrice * (1 - totalDiscountPct(row) / 100);
}

export function discountValue(row: DealerDashboardRow) {
  return row.listPrice - netValue(row);
}

export function presentationValue(value: number, source: Currency, display: DashboardCurrencyFilter) {
  return display === "both" ? value : convertCurrency(value, source, display);
}

export function filterDealerDashboardRows(
  rows: DealerDashboardRow[],
  filters: DealerDashboardFilters,
  scope: PrototypeScopeMode | "seller",
) {
  const from = filters.from || (filters.fromYear ? `${filters.fromYear}-01-01` : "0000-01-01");
  const to = filters.to || (filters.toYear ? `${filters.toYear}-12-31` : "9999-12-31");
  return rows.filter((row) => {
    if (isPrototypeSellerScope(scope) && row.seller !== (scope === "seller" ? "AKR" : prototypeSellerInitials[scope])) return false;
    if (scope !== "backend" && !isPrototypeSellerScope(scope) && !prototypeRelationScope[scope].includes(row.dealer)) return false;
    if (row.date < from || row.date > to) return false;
    if (filters.countries.length && !filters.countries.includes(row.country)) return false;
    if (filters.sellers.length && !filters.sellers.includes(row.seller)) return false;
    if (filters.dealers.length && !filters.dealers.includes(row.dealer)) return false;
    if (filters.customers.length && !filters.customers.includes(row.customer)) return false;
    if (filters.machines.length && !filters.machines.includes(row.machine)) return false;
    if (filters.partnerType !== "all" && row.partnerType !== filters.partnerType) return false;
    if (filters.currency !== "both" && row.currency !== filters.currency) return false;
    return true;
  });
}

export function groupedSum<T extends string>(
  rows: DealerDashboardRow[],
  key: (row: DealerDashboardRow) => T,
  value: (row: DealerDashboardRow) => number,
) {
  return Array.from(rows.reduce((map, row) => {
    const label = key(row);
    map.set(label, (map.get(label) ?? 0) + value(row));
    return map;
  }, new Map<T, number>()).entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
