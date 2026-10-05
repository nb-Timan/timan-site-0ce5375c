import { describe, expect, it } from 'vitest';
import { planningDeliveryMachineFamilies } from '@/lib/planningDeliveryCatalog';

describe('Planning delivery catalogue', () => {
  it('uses the five canonical product families and their catalogue compatibility', () => {
    const families = planningDeliveryMachineFamilies();
    expect(families.map(({ id, itemNumber, label }) => ({ id, itemNumber, label }))).toEqual([
      { id: 'RC-751', itemNumber: '410040', label: 'RC-751' },
      { id: 'RC-1000S', itemNumber: '411000', label: 'RC-1000s' },
      { id: 'Timan 3330', itemNumber: '712000', label: 'Timan 3330' },
      { id: 'Timan 2620', itemNumber: '761000', label: 'Timan 2620' },
      { id: 'Loader Line', itemNumber: '666-333', label: 'CS-200 til traktor' },
    ]);

    const byId = Object.fromEntries(families.map((family) => [family.id, family]));
    expect(byId['RC-751'].equipmentItemNumbers).toContain('411687');
    expect(byId['RC-751'].equipmentItemNumbers).not.toContain('730035');
    expect(byId['Timan 3330'].equipmentItemNumbers).toContain('730035');
    expect(byId['Loader Line'].equipmentItemNumbers).toContain('725161');
    expect(byId['RC-1000S'].equipmentItemNumbers).not.toContain('412614');
    expect(families.every((family) => new Set(family.equipmentItemNumbers).size
      === family.equipmentItemNumbers.length)).toBe(true);
  });
});
