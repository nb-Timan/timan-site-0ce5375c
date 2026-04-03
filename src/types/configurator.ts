// Types for the Timan machine configurator

export type DocumentType = 'quote' | 'order';
export type DeliveryMethod = 'pickup' | 'send' | 'deliver';
export type ConfigMode = 'shared' | 'individual';
export type Language = 'da' | 'en';

export interface Machine {
  id: string;
  name: string;
  itemNumber: string;
  basePrice: number;
  description: string;
  specs: Record<string, string>;
  imageUrl?: string;
  isLooseTool?: boolean;
  demoFee?: number;
  requiredGroups?: RequiredGroup[];
  accessories: Accessory[];
}

export interface RequiredGroup {
  id: string;
  label: string;
  accessories: string[]; // accessory ids that belong to this group
}

export interface Accessory {
  id: string;
  name: string;
  itemNumber: string;
  price: number;
  description?: string;
  isRequired?: boolean;
  groupId?: string; // links to RequiredGroup
  dependsOn?: string; // parent accessory id
  subItems?: SubItem[];
  hasQuantity?: boolean;
  maxQuantity?: number;
  hasRalInput?: boolean;
  autoAdd?: AutoAddRule;
  hidden?: boolean;
}

export interface SubItem {
  id: string;
  name: string;
  itemNumber: string;
  price: number;
  hasQuantity?: boolean;
}

export interface AutoAddRule {
  requiresAll: string[]; // accessory ids that must all be selected
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
  method: DeliveryMethod;
  date: Date | null;
  startupOption?: string; // for deliver method in Danish mode
}

export interface CustomerInfo {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  comment: string;
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

export interface PriceSummary {
  subtotal: number;
  discounts: DiscountBreakdown;
  totalDiscount: number;
  finalPrice: number;
}

export interface ConfiguratorState {
  currentStep: number;
  documentType: DocumentType;
  language: Language;
  machineSelections: MachineSelection[];
  unitConfigs: UnitConfig[];
  deliveryInfo: DeliveryInfo;
  customerInfo: CustomerInfo;
}

export interface LineItem {
  name: string;
  itemNumber: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  indent?: boolean;
}
