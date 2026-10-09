import {
  ACC_ID_WARRANTY_1000,
  ACC_ID_WARRANTY_3330,
  ACC_ID_WARRANTY_751,
} from "@/data/machines";

export const EXTENDED_WARRANTY_PRODUCT_IDS = [
  ACC_ID_WARRANTY_751,
  ACC_ID_WARRANTY_1000,
  ACC_ID_WARRANTY_3330,
] as const;

export type ExtendedWarrantyProductId = (typeof EXTENDED_WARRANTY_PRODUCT_IDS)[number];

const EXTENDED_WARRANTY_PRODUCTS = new Set<string>(EXTENDED_WARRANTY_PRODUCT_IDS);

export function isExtendedWarrantyProductId(value: string | null | undefined): value is ExtendedWarrantyProductId {
  return EXTENDED_WARRANTY_PRODUCTS.has((value ?? "").trim());
}

export function hasExtendedWarranty(machine: { hasExtendedWarranty?: boolean | null }): boolean {
  return machine.hasExtendedWarranty === true;
}
