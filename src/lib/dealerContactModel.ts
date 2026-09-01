import type { ProfileI18nKey } from "@/lib/dealerProfileI18n";
import type { DealerContactArea } from "@/lib/dealerContactsService";

export const ROLE_KEYS_SALES: ProfileI18nKey[] = [
  "roleSalesDirector", "roleSalesManager", "roleSalesRep", "roleSalesCoordinator", "roleKeyAccount", "roleOther",
];

export const ROLE_KEYS_FINANCE: ProfileI18nKey[] = [
  "roleFinanceManager", "roleBookkeeper", "roleInvoicing", "roleAccountsPayableReceivable", "roleAdministration", "roleOther",
];

export const ROLE_KEYS_PURCHASING: ProfileI18nKey[] = [
  "rolePurchasingManager", "rolePurchaser", "rolePartsPurchasing", "roleLogisticsManager", "roleLogisticsCoordinator", "roleOther",
];

export const ROLE_KEYS_WORKSHOP: ProfileI18nKey[] = [
  "roleWorkshopManager", "roleServiceManager", "roleServiceTechnician", "roleMechanic",
  "roleServiceCoord", "rolePartsManager", "roleOther",
];

export const ROLE_KEYS_DIRECTOR: ProfileI18nKey[] = [
  "roleDirector", "roleOwner", "roleManagingDirector", "roleAdministration", "roleOther",
];

export const ROLE_KEYS_MARKETING: ProfileI18nKey[] = [
  "roleMarketingManager", "roleMarketingCoordinator", "roleSocialMedia", "roleWebsiteManager", "roleCommunications", "roleOther",
];

export const CONTACT_AREA_CONFIG: Array<{
  area: DealerContactArea;
  labelKey: ProfileI18nKey;
  roleKeys: ProfileI18nKey[];
}> = [
  { area: "director", labelKey: "sec1", roleKeys: ROLE_KEYS_DIRECTOR },
  { area: "finance", labelKey: "sec2", roleKeys: ROLE_KEYS_FINANCE },
  { area: "parts", labelKey: "sec3", roleKeys: ROLE_KEYS_PURCHASING },
  { area: "sales", labelKey: "sec4", roleKeys: ROLE_KEYS_SALES },
  { area: "workshop", labelKey: "sec5", roleKeys: ROLE_KEYS_WORKSHOP },
  { area: "marketing", labelKey: "sec6", roleKeys: ROLE_KEYS_MARKETING },
];

export function roleKeysForContactArea(area: DealerContactArea): ProfileI18nKey[] {
  return CONTACT_AREA_CONFIG.find((config) => config.area === area)?.roleKeys ?? ROLE_KEYS_SALES;
}
