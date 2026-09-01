import { ACCESSORIES, getAccessoriesFlat, getLocalizedName, PRODUCTS } from "@/data/machines";
import type { Accessory, Machine } from "@/types/configurator";
import type { PortalUiLanguage } from "@/lib/portalLanguages";

export interface VideoProductOption {
  productKey: string;
  itemNumber: string;
  label: string;
  machineKey: string;
  machineLabel: string;
  kind: "machine" | "accessory";
}

function languageForCatalog(lang: PortalUiLanguage) {
  if (lang === "sv" || lang === "fr" || lang === "pl" || lang === "cs") return "en";
  return lang;
}

function labelOf(item: Machine | Accessory, lang: PortalUiLanguage) {
  return getLocalizedName(item.name, languageForCatalog(lang));
}

export function listVideoProductOptions(lang: PortalUiLanguage = "da"): VideoProductOption[] {
  const rows: VideoProductOption[] = [];
  const seen = new Set<string>();

  for (const [machineKey, machine] of Object.entries(PRODUCTS)) {
    if (!machine.varenr) continue;
    rows.push({
      productKey: machine.id || machineKey,
      itemNumber: machine.varenr,
      label: labelOf(machine, lang),
      machineKey,
      machineLabel: machineKey,
      kind: "machine",
    });
    seen.add(machine.id || machineKey);

    for (const accessory of getAccessoriesFlat(machineKey)) {
      const productKey = accessory.id;
      if (!productKey || seen.has(productKey) || !accessory.varenr) continue;
      seen.add(productKey);
      rows.push({
        productKey,
        itemNumber: accessory.varenr,
        label: labelOf(accessory, lang),
        machineKey,
        machineLabel: machineKey,
        kind: "accessory",
      });
    }
  }

  for (const [machineKey, accessories] of Object.entries(ACCESSORIES)) {
    for (const accessory of accessories) {
      const productKey = accessory.id;
      if (!productKey || seen.has(productKey) || !accessory.varenr) continue;
      seen.add(productKey);
      rows.push({
        productKey,
        itemNumber: accessory.varenr,
        label: labelOf(accessory, lang),
        machineKey,
        machineLabel: machineKey,
        kind: "accessory",
      });
    }
  }

  return rows.sort((a, b) => {
    const itemDiff = a.itemNumber.localeCompare(b.itemNumber, "da", { numeric: true });
    if (itemDiff !== 0) return itemDiff;
    return a.label.localeCompare(b.label, "da");
  });
}

export function findVideoProductOption(productKey: string, lang: PortalUiLanguage = "da") {
  return listVideoProductOptions(lang).find((item) => item.productKey === productKey) ?? null;
}

export function productSearchText(option: VideoProductOption) {
  return [
    option.productKey,
    option.itemNumber,
    option.label,
    option.machineKey,
    option.machineLabel,
    option.kind,
  ].join(" ").toLowerCase();
}
