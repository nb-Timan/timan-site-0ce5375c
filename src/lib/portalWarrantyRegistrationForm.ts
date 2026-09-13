export const PORTAL_WARRANTY_MACHINE_TYPES = [
  "Timan 3330",
  "RC-1000s",
  "Tool-Trac",
  "RC-751",
  "Timan 2620",
] as const;

export const PORTAL_WARRANTY_REPLACEMENT_BRANDS = [
  "Nej", "Timan", "Kärcher", "Vitra", "Egholm", "Hako", "Fort", "Andet",
] as const;

export function replacementBrandsForMachine(machineModel: string): readonly string[] {
  if (PORTAL_WARRANTY_MACHINE_TYPES.includes(machineModel as typeof PORTAL_WARRANTY_MACHINE_TYPES[number])) {
    return PORTAL_WARRANTY_REPLACEMENT_BRANDS;
  }
  return [];
}

export function splitPostalCity(value: string): { postalCode: string; city: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9A-Za-z-]+)\s+(.+)$/);
  return match ? { postalCode: match[1], city: match[2] } : { postalCode: trimmed, city: "" };
}
