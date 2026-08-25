import { describe, expect, it } from 'vitest';
import {
  TIMAN_2620_IMAGES,
  deriveTiman2620ImageKey,
  getTiman2620EquipmentAfterToggle,
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

  it('keeps cabin tools selectable when they can switch to a valid image', () => {
    expect(isTiman2620EquipmentSelectable('cab', equipmentSet('v_plow'), 'dozer_blade')).toBe(
      true,
    );
    expect([...(getTiman2620EquipmentAfterToggle('cab', equipmentSet('v_plow'), 'dozer_blade') ?? [])]).toEqual([
      'dozer_blade',
    ]);
    expect(deriveTiman2620ImageKey('cab', equipmentSet('v_plow', 'dozer_blade'))).toBe(
      'cab_invalid',
    );
  });
});

describe('Timan 2620 standard image matrix', () => {
  it('maps exact standard configurations to the delivered images', () => {
    const standardKey = deriveTiman2620ImageKey('standard', equipmentSet());
    expect(standardKey).toBe('standard');
    expect(TIMAN_2620_IMAGES[standardKey].imageSequence).toEqual([
      '/images/timan-2620/standard-config/a-standard.png',
      '/images/timan-2620/standard-config/v-standard-bagfra.png',
    ]);

    const bucketKey = deriveTiman2620ImageKey('standard', equipmentSet('bucket'));
    expect(bucketKey).toBe('standard_bucket');
    expect(TIMAN_2620_IMAGES[bucketKey].imageSequence).toEqual([
      '/images/timan-2620/standard-config/i-standard-skovl.png',
    ]);

    const dozerKey = deriveTiman2620ImageKey('standard', equipmentSet('dozer_blade'));
    expect(dozerKey).toBe('standard_dozer_blade');
    expect(TIMAN_2620_IMAGES[dozerKey].imageSequence).toEqual([
      '/images/timan-2620/standard-config/b-standard-dozerblad.jpg',
      '/images/timan-2620/standard-config/x-standard-bagfra-dozerblad.png',
    ]);

    const saltKey = deriveTiman2620ImageKey('standard', equipmentSet('salt_spreader'));
    expect(saltKey).toBe('standard_salt_spreader');
    expect(TIMAN_2620_IMAGES[saltKey].imageSequence).toEqual([
      '/images/timan-2620/standard-config/c-standard-saltspreder.jpg',
      '/images/timan-2620/standard-config/ae-standard-bagfra-saltspreder.png',
    ]);

    const saltDozerKey = deriveTiman2620ImageKey(
      'standard',
      equipmentSet('salt_spreader', 'dozer_blade'),
    );
    expect(saltDozerKey).toBe('standard_salt_spreader_dozer_blade');
    expect(TIMAN_2620_IMAGES[saltDozerKey].imageSequence).toEqual([
      '/images/timan-2620/standard-config/h-standard-dozerblad-saltspreder.jpg',
    ]);

    const vPlowKey = deriveTiman2620ImageKey('standard', equipmentSet('v_plow'));
    expect(vPlowKey).toBe('standard_v_plow');
    expect(TIMAN_2620_IMAGES[vPlowKey].imageSequence).toEqual([
      '/images/timan-2620/standard-config/standard-v-plow.jpg',
    ]);
  });

  it('keeps standard tools selectable when they can switch or combine to a valid image', () => {
    expect(isTiman2620EquipmentSelectable('standard', equipmentSet('v_plow'), 'bucket')).toBe(
      true,
    );
    expect([...(getTiman2620EquipmentAfterToggle('standard', equipmentSet('v_plow'), 'bucket') ?? [])]).toEqual([
      'bucket',
    ]);
    expect(isTiman2620EquipmentSelectable('standard', equipmentSet('v_plow'), 'dozer_blade')).toBe(
      true,
    );
    expect([...(getTiman2620EquipmentAfterToggle('standard', equipmentSet('v_plow'), 'dozer_blade') ?? [])]).toEqual([
      'dozer_blade',
    ]);
    expect(isTiman2620EquipmentSelectable('standard', equipmentSet('bucket'), 'salt_spreader')).toBe(
      true,
    );
    expect(isTiman2620EquipmentSelectable('standard', equipmentSet('dozer_blade'), 'salt_spreader')).toBe(
      true,
    );
    expect(isTiman2620EquipmentSelectable('standard', equipmentSet('salt_spreader'), 'dozer_blade')).toBe(
      true,
    );
  });
});
