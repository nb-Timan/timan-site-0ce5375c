/**
 * Mock claims store for the Dealer Claims portal (preview/demo).
 *
 * No backend yet — purely client-side fixture data.
 */

export type ClaimStatus =
  | "open"
  /** Gemt / ikke afsendt (dealer draft, full edit) */
  | "in_progress"
  /** Afventer accept (submitted, dealer can still edit until Timan approves) */
  | "waiting"
  /** Godkendt af Timan (locked for dealer, awaits dealer action) */
  | "approved"
  /** I gang hos forhandler (dealer accepted approval) */
  | "dealer_in_progress"
  /** Afventer Timan afslutning (dealer finished, Timan must close) */
  | "awaiting_timan_close"
  /** Afventer Timan kommentar (dealer disagreed/commented) */
  | "awaiting_timan_comment"
  /** Afvist af Timan */
  | "rejected"
  /** Lukket — final */
  | "closed";

export interface ClaimPartLine {
  qty: string;
  partNo: string;
  desc: string;
  unitPrice: string; // DKK net
}

/** Full claim detail used to prefill the long claim form when opening/viewing. */
export interface ClaimDetail {
  /* Dealer */
  dealer: string;
  dealerCountry: string;
  dealerContact: string;
  dealerPhone: string;
  dealerEmail: string;
  /* Owner / customer */
  owner: string;
  ownerCountry: string;
  ownerAddress: string;
  ownerPostal: string;
  /* Machine */
  machineType: string;
  serialNo: string;
  hours: string;
  /* Dates (ISO yyyy-mm-dd) */
  saleDate: string;
  damageDate: string;
  approvedDate: string;
  repairDate: string;
  /* Descriptions */
  faultDesc: string;
  repairDesc: string;
  /* Parts & labor */
  parts: ClaimPartLine[];
  laborHours: string;
  drivingKm: string;
  currency: "DKK";
}

export interface ClaimRecord {
  /**
   * Unique storage id. For grouped claims this is `${groupId}-${subIndex}`,
   * e.g. "CL-9013-2". The user-facing display id uses a slash:
   * "CL-9013/2" — see {@link claimDisplayId}.
   */
  id: string;
  /**
   * Main case number shared by all connected claims in a group, e.g.
   * "CL-9013". A standalone claim has groupId = id and subIndex = 1.
   */
  groupId: string;
  /** 1-based position within the group. */
  subIndex: number;
  /** Warranty / guarantee number issued by Timan, e.g. "T-001234". */
  warrantyNo: string;
  title: string;
  dealer: string;
  country: string;
  customer: string;
  machineType: string;
  serial: string;
  createdAt: string; // ISO date — submitted/created
  damageDate: string; // ISO date
  approvedDate: string | null; // ISO date or null
  /** Total claim amount in DKK (parts + labor). */
  totalPrice: number;
  status: ClaimStatus;
  /** Full detail used to prefill the claim form. */
  detail: ClaimDetail;
  /**
   * Internal comment from Timan Admin. Visible to both Timan Admin and the
   * dealer when the claim is opened. Editable by Timan Admin only — useful for
   * documenting why a claim was rejected/closed or follow-up notes.
   */
  adminComment?: string;
  /**
   * Comments left by the dealer. Used in the disagreement/"Ikke accepteret"
   * flow and on rejected claims so the dealer can reply. Each comment is
   * surfaced to Timan Admin with a notification icon when the claim is in
   * a status that requires Timan attention.
   */
  dealerComments?: ClaimComment[];
  /**
   * Audit log of changes made by Timan Admin after the claim was approved.
   * Visible to both Timan Admin and the dealer so any later edits are
   * transparent.
   */
  auditLog?: ClaimAuditEntry[];
}

export interface ClaimComment {
  id: string;
  author: string;
  /** ISO timestamp */
  at: string;
  text: string;
}

export interface ClaimAuditEntry {
  id: string;
  /** ISO timestamp */
  at: string;
  by: string;
  field: string;
  oldValue: string;
  newValue: string;
}

/** Format the user-facing display id, e.g. "CL-9013/2". */
export function claimDisplayId(claim: Pick<ClaimRecord, "groupId" | "subIndex">): string {
  return `${claim.groupId}/${claim.subIndex}`;
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: "Åben",
  in_progress: "Gemt / ikke afsendt",
  waiting: "Afventer accept",
  approved: "Godkendt af Timan",
  dealer_in_progress: "I gang hos forhandler",
  awaiting_timan_close: "Afventer Timan afslutning",
  awaiting_timan_comment: "Afventer Timan kommentar",
  rejected: "Afvist",
  closed: "Lukket",
};

/** Tailwind classes for the status pill, keyed by status. */
export const CLAIM_STATUS_PILL: Record<ClaimStatus, string> = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-slate-100 text-slate-700",
  waiting: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  dealer_in_progress: "bg-indigo-50 text-indigo-700",
  awaiting_timan_close: "bg-purple-50 text-purple-700",
  awaiting_timan_comment: "bg-orange-50 text-orange-700",
  rejected: "bg-red-50 text-red-700",
  closed: "bg-slate-100 text-slate-600",
};

/**
 * Whether the dealer is allowed to fully edit the claim form in this status.
 * Editable: in_progress (draft), waiting (Afventer accept).
 * After Timan approval the dealer is locked out of all claim data.
 */
export function isClaimEditable(status: ClaimStatus): boolean {
  return status === "in_progress" || status === "waiting";
}

/** Statuses that require Timan Admin attention because of a dealer comment. */
export const TIMAN_NEEDS_ATTENTION_STATUSES: ClaimStatus[] = [
  "awaiting_timan_comment",
  "awaiting_timan_close",
];

/** True if the claim should display a notification badge to Timan Admin. */
export function claimNeedsTimanAttention(claim: ClaimRecord): boolean {
  if (TIMAN_NEEDS_ATTENTION_STATUSES.includes(claim.status)) return true;
  // Dealer left a comment on a rejected claim — Timan should see the icon.
  if (claim.status === "rejected" && (claim.dealerComments?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

const NORDIC_DEALER = "Nordic Machinery Aps";

// Entries may omit groupId/subIndex; they are backfilled below so each
// standalone claim becomes its own single-machine group.
type SeedClaim = Omit<ClaimRecord, "groupId" | "subIndex"> &
  Partial<Pick<ClaimRecord, "groupId" | "subIndex">>;
const MOCK: SeedClaim[] = [
  {
    id: "CL-9013",
    warrantyNo: "T-001931",
    title: "Hydraulik lækage — RC-1000",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Aalborg Park & Vej",
    machineType: "RC-1000",
    serial: "RC1000-22841",
    createdAt: "2026-04-18",
    damageDate: "2026-04-12",
    approvedDate: null,
    totalPrice: 8420,
    status: "waiting",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Mads Holm",
      dealerPhone: "+45 22 14 88 02",
      dealerEmail: "service@nordicmachinery.dk",
      owner: "Aalborg Park & Vej",
      ownerCountry: "Denmark",
      ownerAddress: "Industrivej 14",
      ownerPostal: "9000 Aalborg",
      machineType: "RC-1000",
      serialNo: "RC1000-22841",
      hours: "1284",
      saleDate: "2024-05-12",
      damageDate: "2026-04-12",
      approvedDate: "",
      repairDate: "2026-04-15",
      faultDesc:
        "Olielækage ved hovedhydraulikblok. Operatøren bemærkede tab af tryk og synligt oliesvind under arbejde.",
      repairDesc:
        "Demontering af hydraulikblok, udskiftning af pakningssæt og O-ringe. Trykprøvet ved 210 bar uden lækager.",
      parts: [
        { qty: "1", partNo: "HYD-PK-220", desc: "Pakningssæt hovedblok", unitPrice: "1450.00" },
        { qty: "4", partNo: "OR-18x2", desc: "O-ring 18x2 NBR", unitPrice: "45.00" },
        { qty: "6", partNo: "HYD-OIL-46", desc: "Hydraulikolie HVLP46 (l)", unitPrice: "85.00" },
      ],
      laborHours: "5.5",
      drivingKm: "62",
      currency: "DKK",
    },
  },
  {
    id: "CL-9001",
    warrantyNo: "T-001902",
    title: "Defekt startmotor",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Bygge A/S",
    machineType: "Timan 3330",
    serial: "T3330-19002",
    createdAt: "2026-04-12",
    damageDate: "2026-04-04",
    approvedDate: "2026-04-14",
    totalPrice: 14250,
    status: "dealer_in_progress",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Kristina Riis",
      dealerPhone: "+45 22 14 88 11",
      dealerEmail: "claims@nordicmachinery.dk",
      owner: "Bygge A/S",
      ownerCountry: "Denmark",
      ownerAddress: "Havnegade 7",
      ownerPostal: "5000 Odense",
      machineType: "Timan 3330",
      serialNo: "T3330-19002",
      hours: "2740",
      saleDate: "2023-09-04",
      damageDate: "2026-04-04",
      approvedDate: "2026-04-14",
      repairDate: "2026-04-16",
      faultDesc:
        "Maskinen vil ikke starte. Startmotor giver klikkende lyd uden træk på krumtap. Batteri og kabler testet OK.",
      repairDesc:
        "Udskiftning af defekt startmotor inkl. solenoide. Test af opstart 5 gange uden fejl.",
      parts: [
        { qty: "1", partNo: "ST-3330-A", desc: "Startmotor 12V 3kW", unitPrice: "8950.00" },
        { qty: "1", partNo: "BOLT-M10x40", desc: "Bolt M10x40 8.8 zink", unitPrice: "12.00" },
        { qty: "2", partNo: "WSH-M10", desc: "Spændeskive M10", unitPrice: "4.00" },
      ],
      laborHours: "3.0",
      drivingKm: "180",
      currency: "DKK",
    },
  },
  {
    id: "CL-8987",
    warrantyNo: "T-001877",
    title: "Knækket redskabsarm",
    dealer: "Skandinavisk Maskinservice AB",
    country: "Sweden",
    customer: "Entreprenør H. Olsen",
    machineType: "Tool-Trac",
    serial: "TT-44120",
    createdAt: "2026-04-05",
    damageDate: "2026-03-30",
    approvedDate: null,
    totalPrice: 21100,
    status: "waiting",
    detail: {
      dealer: "Skandinavisk Maskinservice AB",
      dealerCountry: "Sweden",
      dealerContact: "Jonas Berg",
      dealerPhone: "+46 31 88 22 04",
      dealerEmail: "service@skandmaskin.se",
      owner: "Entreprenör H. Olsen",
      ownerCountry: "Sweden",
      ownerAddress: "Storgatan 22",
      ownerPostal: "411 38 Göteborg",
      machineType: "Tool-Trac",
      serialNo: "TT-44120",
      hours: "3110",
      saleDate: "2022-06-18",
      damageDate: "2026-03-30",
      approvedDate: "",
      repairDate: "2026-04-02",
      faultDesc:
        "Redskabsarmen knækket ved svejsesamling under normal drift med standardredskab. Ingen overbelastning rapporteret.",
      repairDesc:
        "Udskiftning af komplet redskabsarm samt kontrol af monteringsbeslag. Ingen følgeskader.",
      parts: [
        { qty: "1", partNo: "TT-ARM-44", desc: "Redskabsarm komplet TT-44", unitPrice: "16800.00" },
        { qty: "2", partNo: "BUSH-30x40", desc: "Bøsning 30x40 bronze", unitPrice: "320.00" },
        { qty: "1", partNo: "GREASE-EP2", desc: "Smørefedt EP2 (kg)", unitPrice: "180.00" },
      ],
      laborHours: "6.5",
      drivingKm: "95",
      currency: "DKK",
    },
  },
  {
    id: "CL-8951",
    warrantyNo: "T-001841",
    title: "Display fejl efter softwareopdatering",
    dealer: "Bayern Garten- und Kommunaltechnik GmbH",
    country: "Germany",
    customer: "Kommune Syd",
    machineType: "RC-1000s",
    serial: "RC1000S-31188",
    createdAt: "2026-03-28",
    damageDate: "2026-03-21",
    approvedDate: "2026-04-02",
    totalPrice: 5640,
    status: "awaiting_timan_comment",
    dealerComments: [
      {
        id: "c-8951-1",
        author: "Forhandler",
        at: "2026-04-03T09:14:00.000Z",
        text:
          "Vi er ikke enige i prisreduktionen for ECU-arbejdet — diagnose tog længere tid end aftalt. Bedes vurderet på ny.",
      },
    ],
    detail: {
      dealer: "Bayern Garten- und Kommunaltechnik GmbH",
      dealerCountry: "Germany",
      dealerContact: "Andreas Wagner",
      dealerPhone: "+49 89 4488 1102",
      dealerEmail: "service@bayern-gk.de",
      owner: "Kommune Syd",
      ownerCountry: "Germany",
      ownerAddress: "Rathausplatz 3",
      ownerPostal: "80331 München",
      machineType: "RC-1000s",
      serialNo: "RC1000S-31188",
      hours: "612",
      saleDate: "2025-02-10",
      damageDate: "2026-03-21",
      approvedDate: "2026-04-02",
      repairDate: "2026-04-05",
      faultDesc:
        "Display blevet sort efter softwareopdatering v3.4. Maskinen kører, men ingen menu eller diagnostik tilgængelig.",
      repairDesc:
        "Reflashet ECU med fabriksimage v3.3, efterfulgt af kontrolleret upgrade til v3.4.1. Display og menuer fungerer.",
      parts: [
        { qty: "1", partNo: "ECU-RC-S", desc: "ECU service kit RC-1000s", unitPrice: "3200.00" },
        { qty: "1", partNo: "CABLE-DIAG", desc: "Diagnose-kabel CAN", unitPrice: "640.00" },
      ],
      laborHours: "3.5",
      drivingKm: "44",
      currency: "DKK",
    },
  },
  {
    id: "CL-8902",
    warrantyNo: "T-001790",
    title: "Pumpedefekt under garanti",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Grus & Sand Aps",
    machineType: "Timan 3330",
    serial: "T3330-18733",
    createdAt: "2026-03-19",
    damageDate: "2026-03-12",
    approvedDate: "2026-03-25",
    totalPrice: 17890,
    status: "awaiting_timan_close",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Mads Holm",
      dealerPhone: "+45 22 14 88 02",
      dealerEmail: "service@nordicmachinery.dk",
      owner: "Grus & Sand Aps",
      ownerCountry: "Denmark",
      ownerAddress: "Sandvej 88",
      ownerPostal: "8700 Horsens",
      machineType: "Timan 3330",
      serialNo: "T3330-18733",
      hours: "1980",
      saleDate: "2024-01-22",
      damageDate: "2026-03-12",
      approvedDate: "2026-03-25",
      repairDate: "2026-03-28",
      faultDesc:
        "Hovedhydraulikpumpe lækker olie og leverer ikke fuldt tryk. Operatør rapporterer tab af løftekraft.",
      repairDesc:
        "Udskiftet hovedpumpe og hydraulikfilter. System trykprøvet og funktionstestet ved fuld belastning.",
      parts: [
        { qty: "1", partNo: "PUMP-3330-HD", desc: "Hovedhydraulikpumpe HD", unitPrice: "13200.00" },
        { qty: "1", partNo: "FLT-HYD-10", desc: "Hydraulikfilter 10 micron", unitPrice: "420.00" },
        { qty: "10", partNo: "HYD-OIL-46", desc: "Hydraulikolie HVLP46 (l)", unitPrice: "85.00" },
      ],
      laborHours: "4.5",
      drivingKm: "120",
      currency: "DKK",
    },
  },
  {
    id: "CL-8870",
    warrantyNo: "T-001755",
    title: "Manglende dokumentation — afvist",
    dealer: "Suomi Konepalvelut Oy",
    country: "Finland",
    customer: "Landbrug Nord",
    machineType: "RC-751",
    serial: "RC751-12044",
    createdAt: "2026-03-08",
    damageDate: "2026-02-28",
    approvedDate: null,
    totalPrice: 9300,
    status: "rejected",
    detail: {
      dealer: "Suomi Konepalvelut Oy",
      dealerCountry: "Finland",
      dealerContact: "Mika Korhonen",
      dealerPhone: "+358 9 4412 008",
      dealerEmail: "huolto@konepalvelut.fi",
      owner: "Landbrug Nord",
      ownerCountry: "Finland",
      ownerAddress: "Maatie 5",
      ownerPostal: "00100 Helsinki",
      machineType: "RC-751",
      serialNo: "RC751-12044",
      hours: "4200",
      saleDate: "2021-08-10",
      damageDate: "2026-02-28",
      approvedDate: "",
      repairDate: "2026-03-04",
      faultDesc:
        "Defekt transmission. Reklamation afvist pga. manglende serviceintervaldokumentation og udløbet garanti.",
      repairDesc:
        "Reparation udført efter aftale med ejer for egen regning. Transmissionsolie og tætninger udskiftet.",
      parts: [
        { qty: "1", partNo: "TR-SEAL-751", desc: "Transmissionstætning sæt", unitPrice: "2400.00" },
        { qty: "8", partNo: "TR-OIL-80W", desc: "Transmissionsolie 80W (l)", unitPrice: "120.00" },
      ],
      laborHours: "5.0",
      drivingKm: "210",
      currency: "DKK",
    },
    adminComment:
      "Afvist 2026-03-05: Service-historik mangler for perioden 2024-2025, og garantiperioden er udløbet. Ejer er informeret og har accepteret reparation for egen regning.",
  },
  {
    id: "CL-8801",
    warrantyNo: "T-001702",
    title: "Defekt gearkasse",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Park & Anlæg I/S",
    machineType: "Timan 3330",
    serial: "T3330-17440",
    createdAt: "2026-02-22",
    damageDate: "2026-02-15",
    approvedDate: "2026-03-02",
    totalPrice: 26500,
    status: "closed",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Kristina Riis",
      dealerPhone: "+45 22 14 88 11",
      dealerEmail: "claims@nordicmachinery.dk",
      owner: "Park & Anlæg I/S",
      ownerCountry: "Denmark",
      ownerAddress: "Skovbrynet 41",
      ownerPostal: "2800 Kongens Lyngby",
      machineType: "Timan 3330",
      serialNo: "T3330-17440",
      hours: "3120",
      saleDate: "2022-11-30",
      damageDate: "2026-02-15",
      approvedDate: "2026-03-02",
      repairDate: "2026-03-06",
      faultDesc:
        "Gearkassen springer ud af 2. gear under belastning. Mislyde hørt fra gearkasse ved skift.",
      repairDesc:
        "Komplet udskiftning af gearkasse til nyt fabriksaggregat. Ny olie, kontrol af monteringsbeslag.",
      parts: [
        { qty: "1", partNo: "GBX-3330-FAB", desc: "Gearkasse 3330 fabriksny", unitPrice: "21800.00" },
        { qty: "1", partNo: "GBX-MNT-KIT", desc: "Monteringskit gearkasse", unitPrice: "1450.00" },
        { qty: "6", partNo: "GBX-OIL-75", desc: "Gearolie 75W-90 (l)", unitPrice: "140.00" },
      ],
      laborHours: "8.0",
      drivingKm: "150",
      currency: "DKK",
    },
    adminComment:
      "Afsluttet 2026-03-10. Garantiarbejde udført komplet, kreditnota udstedt til forhandler. Sagen er lukket og arkiveret.",
  },
  {
    id: "CL-8775",
    warrantyNo: "T-001688",
    title: "Hydraulikslange sprunget",
    dealer: "Skandinavisk Maskinservice AB",
    country: "Sweden",
    customer: "Aarhus Kommune",
    machineType: "RC-1000",
    serial: "RC1000-21992",
    createdAt: "2026-02-09",
    damageDate: "2026-02-01",
    approvedDate: "2026-02-15",
    totalPrice: 4280,
    status: "closed",
    detail: {
      dealer: "Skandinavisk Maskinservice AB",
      dealerCountry: "Sweden",
      dealerContact: "Jonas Berg",
      dealerPhone: "+46 31 88 22 04",
      dealerEmail: "service@skandmaskin.se",
      owner: "Aarhus Kommune",
      ownerCountry: "Denmark",
      ownerAddress: "Rådhuspladsen 2",
      ownerPostal: "8000 Aarhus C",
      machineType: "RC-1000",
      serialNo: "RC1000-21992",
      hours: "1820",
      saleDate: "2024-04-08",
      damageDate: "2026-02-01",
      approvedDate: "2026-02-15",
      repairDate: "2026-02-18",
      faultDesc:
        "Hydraulikslange til løftearm sprunget under drift. Ingen følgeskader på cylinder eller ventil.",
      repairDesc:
        "Ny hydraulikslange monteret, system aftappet og påfyldt. Trykprøvet og funktionstestet.",
      parts: [
        { qty: "1", partNo: "HOSE-3/8-1500", desc: "Hydraulikslange 3/8\" 1500mm", unitPrice: "1850.00" },
        { qty: "2", partNo: "FIT-3/8-JIC", desc: "Fitting 3/8\" JIC", unitPrice: "240.00" },
        { qty: "5", partNo: "HYD-OIL-46", desc: "Hydraulikolie HVLP46 (l)", unitPrice: "85.00" },
      ],
      laborHours: "2.0",
      drivingKm: "55",
      currency: "DKK",
    },
  },
];

// ---------------------------------------------------------------------------
// Grouped / connected claims
// ---------------------------------------------------------------------------
//
// Demo case: a Danish municipality reports the same hydraulic-block leak on
// three identical RC-1000 machines from the same delivery batch. The dealer
// files one main case ("CL-9050") and adds two connected machines under it,
// resulting in CL-9050/1, CL-9050/2 and CL-9050/3.
const GROUP_DEMO: ClaimRecord[] = [
  {
    id: "CL-9050-1",
    groupId: "CL-9050",
    subIndex: 1,
    warrantyNo: "T-002010",
    title: "Hydraulik lækage — fælles batch RC-1000 (maskine 1)",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Vejle Park & Materielgård",
    machineType: "RC-1000",
    serial: "RC1000-23001",
    createdAt: "2026-04-20",
    damageDate: "2026-04-19",
    approvedDate: null,
    totalPrice: 8420,
    status: "waiting",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Mads Holm",
      dealerPhone: "+45 22 14 88 02",
      dealerEmail: "service@nordicmachinery.dk",
      owner: "Vejle Park & Materielgård",
      ownerCountry: "Denmark",
      ownerAddress: "Materielvej 4",
      ownerPostal: "7100 Vejle",
      machineType: "RC-1000",
      serialNo: "RC1000-23001",
      hours: "640",
      saleDate: "2025-09-02",
      damageDate: "2026-04-19",
      approvedDate: "",
      repairDate: "2026-04-22",
      faultDesc:
        "Olielækage ved hovedhydraulikblok. Samme fejlmønster konstateret på tre RC-1000 fra samme leveringsbatch.",
      repairDesc:
        "Udskiftning af pakningssæt og O-ringe på hovedblok. Trykprøvet ved 210 bar uden lækage.",
      parts: [
        { qty: "1", partNo: "HYD-PK-220", desc: "Pakningssæt hovedblok", unitPrice: "1450.00" },
        { qty: "4", partNo: "OR-18x2", desc: "O-ring 18x2 NBR", unitPrice: "45.00" },
        { qty: "6", partNo: "HYD-OIL-46", desc: "Hydraulikolie HVLP46 (l)", unitPrice: "85.00" },
      ],
      laborHours: "5.5",
      drivingKm: "40",
      currency: "DKK",
    },
  },
  {
    id: "CL-9050-2",
    groupId: "CL-9050",
    subIndex: 2,
    warrantyNo: "T-002010",
    title: "Hydraulik lækage — fælles batch RC-1000 (maskine 2)",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Vejle Park & Materielgård",
    machineType: "RC-1000",
    serial: "RC1000-23002",
    createdAt: "2026-04-20",
    damageDate: "2026-04-19",
    approvedDate: null,
    totalPrice: 8420,
    status: "waiting",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Mads Holm",
      dealerPhone: "+45 22 14 88 02",
      dealerEmail: "service@nordicmachinery.dk",
      owner: "Vejle Park & Materielgård",
      ownerCountry: "Denmark",
      ownerAddress: "Materielvej 4",
      ownerPostal: "7100 Vejle",
      machineType: "RC-1000",
      serialNo: "RC1000-23002",
      hours: "612",
      saleDate: "2025-09-02",
      damageDate: "2026-04-19",
      approvedDate: "",
      repairDate: "2026-04-22",
      faultDesc:
        "Identisk olielækage ved hovedhydraulikblok som søstermaskine RC1000-23001.",
      repairDesc:
        "Udskiftning af pakningssæt og O-ringe på hovedblok. Trykprøvet uden lækage.",
      parts: [
        { qty: "1", partNo: "HYD-PK-220", desc: "Pakningssæt hovedblok", unitPrice: "1450.00" },
        { qty: "4", partNo: "OR-18x2", desc: "O-ring 18x2 NBR", unitPrice: "45.00" },
        { qty: "6", partNo: "HYD-OIL-46", desc: "Hydraulikolie HVLP46 (l)", unitPrice: "85.00" },
      ],
      laborHours: "5.5",
      drivingKm: "0",
      currency: "DKK",
    },
  },
  {
    id: "CL-9050-3",
    groupId: "CL-9050",
    subIndex: 3,
    warrantyNo: "T-002010",
    title: "Hydraulik lækage — fælles batch RC-1000 (maskine 3)",
    dealer: NORDIC_DEALER,
    country: "Denmark",
    customer: "Vejle Park & Materielgård",
    machineType: "RC-1000",
    serial: "RC1000-23003",
    createdAt: "2026-04-20",
    damageDate: "2026-04-19",
    approvedDate: "2026-04-24",
    totalPrice: 8420,
    status: "in_progress",
    detail: {
      dealer: NORDIC_DEALER,
      dealerCountry: "Denmark",
      dealerContact: "Mads Holm",
      dealerPhone: "+45 22 14 88 02",
      dealerEmail: "service@nordicmachinery.dk",
      owner: "Vejle Park & Materielgård",
      ownerCountry: "Denmark",
      ownerAddress: "Materielvej 4",
      ownerPostal: "7100 Vejle",
      machineType: "RC-1000",
      serialNo: "RC1000-23003",
      hours: "705",
      saleDate: "2025-09-02",
      damageDate: "2026-04-19",
      approvedDate: "2026-04-24",
      repairDate: "2026-04-23",
      faultDesc:
        "Tredje maskine fra samme batch med identisk hydraulik-lækage.",
      repairDesc:
        "Udskiftning af pakningssæt og O-ringe. Funktionstestet ok.",
      parts: [
        { qty: "1", partNo: "HYD-PK-220", desc: "Pakningssæt hovedblok", unitPrice: "1450.00" },
        { qty: "4", partNo: "OR-18x2", desc: "O-ring 18x2 NBR", unitPrice: "45.00" },
        { qty: "6", partNo: "HYD-OIL-46", desc: "Hydraulikolie HVLP46 (l)", unitPrice: "85.00" },
      ],
      laborHours: "5.5",
      drivingKm: "0",
      currency: "DKK",
    },
  },
];
MOCK.push(...GROUP_DEMO);

// Backfill standalone records (no explicit groupId): each becomes its own
// single-machine group where groupId == id and subIndex == 1.
for (const c of MOCK) {
  if (!c.groupId) {
    c.groupId = c.id;
    c.subIndex = 1;
  }
}

// Normalized array — every entry now satisfies the full ClaimRecord shape.
const RECORDS: ClaimRecord[] = MOCK as ClaimRecord[];

export function getAllClaims(): ClaimRecord[] {
  return RECORDS;
}

export function getClaimById(id: string): ClaimRecord | undefined {
  return RECORDS.find((c) => c.id === id);
}

/**
 * Generate the next claim number on the format `CL-YYYY-NNNN`, where NNNN
 * is a 4-digit zero-padded sequence number that is unique within the
 * current calendar year. The dealer never types the number manually — the
 * Claim form auto-generates it when opening "Ny claim".
 */
export function generateClaimNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `CL-${year}-`;
  let max = 0;
  for (const c of RECORDS) {
    if (c.groupId.startsWith(prefix)) {
      const tail = c.groupId.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  const next = (max + 1).toString().padStart(4, "0");
  return `${prefix}${next}`;
}

/**
 * Persist a brand-new dealer claim into the in-memory store.
 *
 * - `groupId` becomes the claim's auto-generated number (e.g. `CL-2026-0001`).
 * - `subIndex` is always 1 for a fresh case (grouped/connected machines are
 *   added separately via {@link addConnectedClaim}).
 * - `status` controls draft vs activated:
 *     - `in_progress` → "Gem til senere redigering" (still editable by dealer)
 *     - `waiting`     → "Aktiver claim og afvent Timan"
 */
export function createDealerClaim(args: {
  groupId: string;
  warrantyNo: string;
  status: Extract<ClaimStatus, "in_progress" | "waiting">;
  detail: ClaimDetail;
  totalPrice: number;
}): ClaimRecord {
  const today = new Date().toISOString().slice(0, 10);
  const titleSeed =
    args.detail.faultDesc.trim().split(/\r?\n/)[0]?.slice(0, 80) ||
    `Reklamation ${args.detail.machineType || ""}`.trim();
  const created: ClaimRecord = {
    id: `${args.groupId}-1`,
    groupId: args.groupId,
    subIndex: 1,
    warrantyNo: args.warrantyNo || args.groupId,
    title: titleSeed,
    dealer: args.detail.dealer,
    country: args.detail.dealerCountry,
    customer: args.detail.owner,
    machineType: args.detail.machineType,
    serial: args.detail.serialNo,
    createdAt: today,
    damageDate: args.detail.damageDate || today,
    approvedDate: null,
    totalPrice: Math.round(args.totalPrice),
    status: args.status,
    detail: args.detail,
  };
  RECORDS.push(created);
  return created;
}

/**
 * True when the claim is part of a multi-machine grouped case (has siblings).
 */
export function isClaimGrouped(claim: Pick<ClaimRecord, "groupId">): boolean {
  return RECORDS.filter((c) => c.groupId === claim.groupId).length > 1;
}

/**
 * All claims that share a main-case number (groupId), sorted by sub-index.
 * For a standalone claim this returns just that single record.
 */
export function getGroupClaims(groupId: string): ClaimRecord[] {
  return RECORDS.filter((c) => c.groupId === groupId).sort(
    (a, b) => a.subIndex - b.subIndex,
  );
}

/**
 * Create a new connected claim under the same main case as `sourceId`,
 * copying common dealer/owner/machine-type/dates/description data from the
 * source so the dealer doesn't have to retype everything. Per-machine fields
 * (serialNo, hours) are intentionally cleared so the dealer must fill them
 * in for the new machine. Returns the newly created record.
 */
export function addConnectedClaim(sourceId: string): ClaimRecord | undefined {
  const source = RECORDS.find((c) => c.id === sourceId);
  if (!source) return undefined;
  const siblings = getGroupClaims(source.groupId);
  const nextIndex = siblings.reduce((max, c) => Math.max(max, c.subIndex), 0) + 1;
  const newId = `${source.groupId}-${nextIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const created: ClaimRecord = {
    id: newId,
    groupId: source.groupId,
    subIndex: nextIndex,
    warrantyNo: source.warrantyNo,
    title: source.title,
    dealer: source.dealer,
    country: source.country,
    customer: source.customer,
    machineType: source.machineType,
    serial: "",
    createdAt: today,
    damageDate: source.damageDate,
    approvedDate: null,
    totalPrice: 0,
    status: "waiting",
    detail: {
      ...source.detail,
      // Per-machine fields the dealer must review/update:
      serialNo: "",
      hours: "",
      approvedDate: "",
      // Reset price-overview fields for the new machine.
      laborHours: "0",
      drivingKm: "0",
      parts: source.detail.parts.map((p) => ({ ...p })),
    },
  };
  RECORDS.push(created);
  return created;
}

/**
 * Persist Timan-Admin-only changes back to the in-memory mock store.
 * Updates the admin comment plus the editable price-overview fields
 * (working hours, driving km, total price). When the claim is already
 * past Timan approval and a tracked field actually changes value,
 * appends entries to the audit log so the dealer can see what changed.
 * Returns the updated record or undefined if not found.
 */
export function updateAdminFields(
  id: string,
  fields: {
    adminComment?: string;
    laborHours?: string;
    drivingKm?: string;
    totalPrice?: number;
  },
  /** Display name for the audit log entry, e.g. "Timan Admin". */
  changedBy = "Timan Admin",
): ClaimRecord | undefined {
  const claim = RECORDS.find((c) => c.id === id);
  if (!claim) return undefined;
  const trackAudit = isPastApproval(claim.status);
  const log = (field: string, oldValue: string, newValue: string) => {
    if (oldValue === newValue) return;
    if (!claim.auditLog) claim.auditLog = [];
    claim.auditLog.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      by: changedBy,
      field,
      oldValue,
      newValue,
    });
  };
  if (fields.adminComment !== undefined) claim.adminComment = fields.adminComment;
  if (fields.laborHours !== undefined) {
    if (trackAudit) log("Arbejdstimer", claim.detail.laborHours, fields.laborHours);
    claim.detail.laborHours = fields.laborHours;
  }
  if (fields.drivingKm !== undefined) {
    if (trackAudit) log("Kørte km", claim.detail.drivingKm, fields.drivingKm);
    claim.detail.drivingKm = fields.drivingKm;
  }
  if (fields.totalPrice !== undefined) {
    if (trackAudit) log("Samlet pris", String(claim.totalPrice), String(fields.totalPrice));
    claim.totalPrice = fields.totalPrice;
  }
  return claim;
}

/**
 * True once Timan has approved the claim — i.e. the dealer is locked out
 * and any later edits made by Timan must appear in the audit log.
 */
export function isPastApproval(status: ClaimStatus): boolean {
  return (
    status === "approved" ||
    status === "dealer_in_progress" ||
    status === "awaiting_timan_close" ||
    status === "awaiting_timan_comment" ||
    status === "rejected" ||
    status === "closed"
  );
}

/**
 * Mutate the claim status. Used by both Dealer and Timan workflows.
 * Returns the updated record or undefined if not found.
 */
export function setClaimStatus(id: string, status: ClaimStatus): ClaimRecord | undefined {
  const claim = RECORDS.find((c) => c.id === id);
  if (!claim) return undefined;
  claim.status = status;
  if (status === "approved" && !claim.approvedDate) {
    claim.approvedDate = new Date().toISOString().slice(0, 10);
  }
  return claim;
}

/**
 * Append a dealer comment. Used by the "Ikke accepteret" / disagreement
 * flow and on rejected claims so the dealer can reply to Timan.
 */
export function addDealerComment(
  id: string,
  text: string,
  author = "Forhandler",
): ClaimRecord | undefined {
  const claim = RECORDS.find((c) => c.id === id);
  if (!claim) return undefined;
  if (!claim.dealerComments) claim.dealerComments = [];
  claim.dealerComments.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    author,
    text: text.trim(),
  });
  return claim;
}

export function getDealerClaims(dealerName: string): ClaimRecord[] {
  if (!dealerName) return RECORDS;
  const needle = dealerName.toLowerCase();
  const scoped = RECORDS.filter((c) => c.dealer.toLowerCase() === needle);
  // In preview, if the current dealer has no records yet, fall back to the
  // demo dealer so the page is not empty.
  return scoped.length > 0 ? scoped : RECORDS.filter((c) => c.dealer === NORDIC_DEALER);
}

export interface DealerClaimsSummary {
  total: number;
  open: number; // open + waiting + in_progress
  approved: number;
  rejected: number;
  latest: ClaimRecord[];
}

const OPEN_STATUSES: ClaimStatus[] = [
  "open",
  "in_progress",
  "waiting",
  "approved",
  "dealer_in_progress",
  "awaiting_timan_close",
  "awaiting_timan_comment",
];

export function summarizeDealerClaims(records: ClaimRecord[]): DealerClaimsSummary {
  const open = records.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const approved = records.filter((r) => r.status === "approved").length;
  const rejected = records.filter((r) => r.status === "rejected").length;
  const latest = [...records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  return { total: records.length, open, approved, rejected, latest };
}

export interface AdminClaimsSummary {
  total: number;
  open: number;
  approved: number;
  totalAmount: number;
}

export function summarizeAdminClaims(records: ClaimRecord[]): AdminClaimsSummary {
  const open = records.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const approved = records.filter((r) => r.status === "approved").length;
  const totalAmount = records.reduce((sum, r) => sum + (r.totalPrice || 0), 0);
  return { total: records.length, open, approved, totalAmount };
}

export function formatDkk(amount: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(amount);
}
