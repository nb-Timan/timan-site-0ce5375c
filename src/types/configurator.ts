// Types for the Timan machine configurator

export type DocumentType = 'quote' | 'order';
export type FlowType = 'quote' | 'order';
export type DeliveryMethod = 'pickup' | 'send' | 'deliver';
export type ConfigMode = 'shared' | 'individual';
export type Language = 'da' | 'en' | 'de' | 'it' | 'hu';

// Role system
export type UserRole = 'slutkunde' | 'partner' | 'timan_saelger';
export type PartnerType = 'service_partner' | 'forhandler' | 'importoer';
export type TimanWorkingFor = 'slutkunde' | 'partner';

export interface RolePermissions {
  canSeePrices: boolean;
  canSubmitOrder: boolean;
  canSubmitQuote: boolean;
  canDownloadPdf: boolean;
  canSetDiscount: boolean;
  canChooseDiscountForQuotes: boolean;
  usesFixedDiscountForOrders: boolean;
  canChooseWorkingFor: boolean;
}

export interface AuthState {
  role: UserRole | null;
  partnerSubRole: PartnerType | null; // only for partner role
  workingFor: TimanWorkingFor | null; // only for timan_saelger
  isAuthenticated: boolean;
  email?: string;
}

export function getRolePermissions(role: UserRole | null, workingFor?: TimanWorkingFor | null): RolePermissions {
  if (!role) return { canSeePrices: false, canSubmitOrder: false, canSubmitQuote: false, canDownloadPdf: false, canSetDiscount: false, canChooseDiscountForQuotes: false, usesFixedDiscountForOrders: false, canChooseWorkingFor: false };
  switch (role) {
    case 'slutkunde':
      return { canSeePrices: false, canSubmitOrder: false, canSubmitQuote: true, canDownloadPdf: true, canSetDiscount: false, canChooseDiscountForQuotes: false, usesFixedDiscountForOrders: false, canChooseWorkingFor: false };
    case 'partner':
      return { canSeePrices: true, canSubmitOrder: true, canSubmitQuote: true, canDownloadPdf: true, canSetDiscount: false, canChooseDiscountForQuotes: true, usesFixedDiscountForOrders: true, canChooseWorkingFor: false };
    case 'timan_saelger':
      return { canSeePrices: true, canSubmitOrder: true, canSubmitQuote: true, canDownloadPdf: true, canSetDiscount: true, canChooseDiscountForQuotes: true, usesFixedDiscountForOrders: false, canChooseWorkingFor: true };
    default:
      return { canSeePrices: false, canSubmitOrder: false, canSubmitQuote: false, canDownloadPdf: false, canSetDiscount: false, canChooseDiscountForQuotes: false, usesFixedDiscountForOrders: false, canChooseWorkingFor: false };
  }
}

export interface LocalizedString {
  da: string;
  en: string;
  de?: string;
  it?: string;
  hu?: string;
  [key: string]: string | undefined;
}

export interface TechSpec {
  label: string;
  value?: string | LocalizedString;
  isHeader?: boolean;
}

export interface MachineDetails {
  main: LocalizedString;
  bullets: Record<string, string[]>;
  dimensions: TechSpec[];
}

export interface MediaLink {
  url: string | null;
  label?: string;
}

export interface SubItem {
  id: string;
  varenr: string;
  name: string | LocalizedString;
  priceDKK: number;
  priceEUR: number;
  isSub?: boolean;
  parentId?: string;
  videoUrl?: string;
  imageUrl?: string;
  specs?: TechSpec[];
  subItems?: SubItem[];
}

export interface Accessory {
  id: string;
  varenr: string;
  name: string | LocalizedString;
  priceDKK: number;
  priceEUR: number;
  group?: string; // for mandatory group selection (oil_1000, aircon, doors, seats, roof)
  requires?: string; // parent accessory id dependency
  hidden?: boolean;
  auto?: boolean; // auto-added items
  isHeader?: boolean;
  isRAL?: boolean;
  isQtyInput?: boolean;
  sectionStart?: string;
  videoUrl?: string;
  imageUrl?: string;
  videos?: MediaLink[];
  images?: MediaLink[];
  specs?: TechSpec[];
  subItems?: SubItem[];
}

export interface Machine {
  id: string; // key like 'RC-1000S'
  name: string | LocalizedString;
  nameShort?: string;
  priceDKK: number;
  priceEUR: number;
  varenr: string;
  videoUrl?: string;
  imageUrl?: string;
  images?: MediaLink[];
  techSpecs: TechSpec[];
  machineDetails?: MachineDetails;
  isLooseTool?: boolean;
}

export interface MachineConfig {
  id: string; // internal id like 'm0', 'm1'
  type: string; // machine key like 'RC-1000S'
  qty: number;
  configMode: ConfigMode;
  acc: string[]; // selected accessory ids (for shared mode)
}

export interface ConfiguratorState {
  step: number;
  flowType: FlowType;
  language: Language;
  machineConfigs: MachineConfig[];
  individualUnitConfigs: Record<string, { acc: string[] }>;
  ralCodes: Record<string, string>;
  accQty: Record<string, number>;
  date: string;
  deliveryMethod: DeliveryMethod | '';
  deliveryDeliverStartup: string | null;
  manualDealerDiscountPct: number;
  demoMachines: Record<string, boolean>;
  reqNumbers: Record<string, string>;
  currentMachineIndex: number;
  // Customer info
  firmanavn: string;
  kontaktperson: string;
  telefon: string;
  email: string;
  emailRecipient: string;
  comment: string;
  internalNote: string;
}

export interface LineItem {
  txt: string;
  price: number;
  varenr: string;
  bold?: boolean;
  sub?: boolean;
  subtotal?: boolean;
  isMachine?: boolean;
  isSectionHeader?: boolean;
  isDependentAccessory?: boolean;
  isPrimaryAccessory?: boolean;
  isAutoAdded?: boolean;
  index?: number;
  isLastSubtotal?: boolean;
  subText?: string;
}

export interface DiscountDetail {
  txt: string;
  amount: number;
}

export interface CalcResult {
  lineItems: LineItem[];
  subtotal: number;
  discountDetails: DiscountDetail[];
  totalDiscount: number;
  currentPrice: number;
  totalPct: number;
  qtyPct: number;
}

export interface MachineUnit {
  globalIndex: number;
  modelId: string;
  modelType: string;
  configKey: string;
  isSharedUnit: boolean;
  isBaseUnit: boolean;
  unitNumber: number;
}

// Legacy compatibility types
export interface PriceSummary {
  subtotal: number;
  discounts: DiscountBreakdown;
  totalDiscount: number;
  finalPrice: number;
}

export interface DiscountBreakdown {
  baseDiscount: number;
  baseDiscountPercent: number;
  quantityDiscount: number;
  quantityDiscountPercent: number;
  deliveryDiscount: number;
  deliveryDiscountPercent: number;
  manualDiscount: number;
  manualDiscountPercent: number;
}

export interface MachineSelection {
  machineId: string;
  quantity: number;
  configMode: ConfigMode;
}

export interface UnitConfig {
  machineId: string;
  unitIndex: number;
  selectedAccessories: Record<string, boolean>;
  accessoryQuantities: Record<string, number>;
  ralColors: Record<string, string>;
  subItemSelections: Record<string, Record<string, boolean>>;
}

export interface DeliveryInfo {
  method: DeliveryMethod | '';
  date: Date | null;
  startupOption?: string;
}

export interface CustomerInfo {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  comment: string;
}
