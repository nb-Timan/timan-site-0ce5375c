import type { Accessory } from '@/types/configurator';

export type LooseToolGroup = NonNullable<Accessory['looseToolMachine']>;
export type LooseToolCategory = 'all' | 'attachments' | 'consumables';

/** Presentation membership only: identities, commercial data and parent relations stay in the catalog. */
export const CONSUMABLE_ASSORTMENT: Record<LooseToolGroup, readonly string[]> = {
  'RC-751': ['411687', '410106', '411571', '411866', '411867', '795015'],
  'RC-1000S': ['411701', '412585', '411594', '730276', '712901', '712900',
    '412603', '50101017', '50101018', '50101019', '50101020', '411891', '411906',
    '412594', '411630', '795016'],
  'Timan 3330': ['V35-502', 'V35-300', '795018', '712902', '725120', '725121',
    '725312', '725747', '712903', '725126', '712901', '730276', '712900',
    '720121', '720599', '720485', '720617', '730601',
    '50101017', '50101018', '50101019', '50101020', '721059'],
  'Timan 2620': ['1000-04', '1000-05', '1000-06', '2000-04', '2000-10',
    '2000-11', '2000-16', '774005', '3000-02', '3000-03', '3000-04',
    '3000-07', '4000-03', '4000-04', '5000-01'],
  'Loader Line': ['712902', '725312', '725120', '725747', '725121',
    '312015', '876185', '310461'],
};

export const CONSUMABLE_GROUPS = Object.keys(CONSUMABLE_ASSORTMENT) as LooseToolGroup[];

export function consumableGroups(itemNumber: string): LooseToolGroup[] {
  return CONSUMABLE_GROUPS.filter(group => CONSUMABLE_ASSORTMENT[group].includes(itemNumber));
}

export function isLooseConsumable(itemNumber: string): boolean {
  return consumableGroups(itemNumber).length > 0;
}
