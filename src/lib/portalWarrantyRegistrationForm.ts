export const PORTAL_WARRANTY_MACHINE_TYPES = [
  "Timan 3330",
  "RC-1000s",
  "Tool-Trac",
  "RC-751",
] as const;

const TIMAN_3330_REPLACEMENT_BRANDS = [
  "Nej", "Timan", "Kärcher", "Vitra", "Egholm", "Hako", "Fort", "Andet",
] as const;

const RC_1000S_REPLACEMENT_BRANDS = [
  "Nej", "Timan", "AS Motor", "Energreen", "X-Rot", "Husqvarna", "Fort Monolith", "Andet",
] as const;

export function replacementBrandsForMachine(machineModel: string): readonly string[] {
  if (machineModel === "Timan 3330") return TIMAN_3330_REPLACEMENT_BRANDS;
  if (machineModel === "RC-1000s") return RC_1000S_REPLACEMENT_BRANDS;
  return [];
}

export function splitPostalCity(value: string): { postalCode: string; city: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9A-Za-z-]+)\s+(.+)$/);
  return match ? { postalCode: match[1], city: match[2] } : { postalCode: trimmed, city: "" };
}
