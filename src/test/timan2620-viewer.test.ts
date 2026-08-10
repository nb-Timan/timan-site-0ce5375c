import { describe, expect, it } from 'vitest';
import {
  TIMAN_2620_IMAGES,
  deriveTiman2620ImageKey,
  isTiman2620EquipmentSelectable,
  type Timan2620Equipment,
} from '../data/timan2620Viewer';

const equipmentSet = (...equipment: Timan2620Equipment[]) => new Set<Timan2620Equipment>(equipment);

describe('Timan 2620 cabin image matrix', () => {
  it('maps exact cabin configurations to the delivered images', () => {
    const cabinKey = deriveTiman2620ImageKey('cab', equipmentSet());
    expect(cabinKey).toBe('cab');
    expect(TIMAN_2620_IMAGES[cabinKey].imageSequence).toEqual([
      '/images/timan-2620/cab-config/a-kabine.png',
      '/images/timan-2620/cab-config/v-kabine-bagfra.png',
    ]);

    const bucketKey = deriveTiman2620ImageKey('cab', equipmentSet('bucket'));
    expect(bucketKey).toBe('cab_bucket');
    expect(TIMAN_2620_IMAGES[bucketKey].imageSequence).toContain(
      '/images/timan-2620/cab-config/c-kabine-skovl.png',
    );

    const saltKey = deriveTiman2620ImageKey('cab', equipmentSet('salt_spreader'));
    expect(saltKey).toBe('cab_salt_spreader');
    expect(TIMAN_2620_IMAGES[saltKey].imageSequence).toContain(
      '/images/timan-2620/cab-config/h-kabine-saltspreder.png',
    );

    const saltVPlowKey = deriveTiman2620ImageKey(
      'cab',
      equipmentSet('salt_spreader', 'v_plow'),
    );
    expect(saltVPlowKey).toBe('cab_salt_spreader_v_plow');
    expect(TIMAN_2620_IMAGES[saltVPlowKey].imageSequence).toContain(
      '/images/timan-2620/cab-config/i-kabine-saltspreder-vplov.png',
    );

    const saltDozerKey = deriveTiman2620ImageKey(
      'cab',
      equipmentSet('salt_spreader', 'dozer_blade'),
    );
    expect(saltDozerKey).toBe('cab_salt_spreader_dozer_blade');
    expect(TIMAN_2620_IMAGES[saltDozerKey].imageSequence).toContain(
      '/images/timan-2620/cab-config/j-kabine-saltspreder-dozerblad.png',
    );
  });

  it('blocks cabin combinations without exact image mappings', () => {
    expect(isTiman2620EquipmentSelectable('cab', equipmentSet('v_plow'), 'dozer_blade')).toBe(
      false,
    );
    expect(deriveTiman2620ImageKey('cab', equipmentSet('v_plow', 'dozer_blade'))).toBe(
      'cab_invalid',
    );
  });
});
