import { PRODUCTS, getAccessoriesFlat } from '@/data/machines';

const DELIVERY_MACHINE_SPECS = [
  { id: 'RC-751', label: 'RC-751' },
  { id: 'RC-1000S', label: 'RC-1000s' },
  { id: 'Timan 3330', label: 'Timan 3330' },
  { id: 'Timan 2620', label: 'Timan 2620' },
  { id: 'Loader Line', label: 'CS-200 til traktor' },
] as const;

export interface PlanningDeliveryMachineFamily {
  id: string;
  itemNumber: string;
  label: string;
  equipmentItemNumbers: string[];
}

export function planningDeliveryMachineFamilies(): PlanningDeliveryMachineFamily[] {
  return DELIVERY_MACHINE_SPECS.map(({ id, label }) => ({
    id,
    label,
    itemNumber: PRODUCTS[id].varenr,
    equipmentItemNumbers: [...new Set(getAccessoriesFlat(id)
      .filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader && !item.hidden)
      .map((item) => item.varenr))],
  }));
}
