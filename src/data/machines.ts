import { Machine } from '@/types/configurator';

// Mock data — will be loaded from Supabase later
export const machines: Machine[] = [
  {
    id: 'rc1000s',
    name: 'RC-1000S',
    itemNumber: 'RC-1000S',
    basePrice: 289000,
    description: 'Fjernbetjent minigraver med stor ydelse og kompakte mål.',
    specs: {
      'Vægt': '1.050 kg',
      'Bredde': '780 mm',
      'Motor': 'Diesel 24 hk',
      'Grabedybde': '1.800 mm',
    },
    demoFee: 5000,
    requiredGroups: [
      { id: 'oil', label: 'Olievalg', accessories: ['std-oil', 'bio-oil'] },
    ],
    accessories: [
      { id: 'std-oil', name: 'Standard hydraulikolie', itemNumber: 'OIL-STD', price: 0, groupId: 'oil', isRequired: true },
      { id: 'bio-oil', name: 'Bio hydraulikolie', itemNumber: 'OIL-BIO', price: 3200, groupId: 'oil', isRequired: true },
      { id: 'led-lights', name: 'LED arbejdslys', itemNumber: 'RC-LED', price: 4500, description: 'Kraftig LED belysning' },
      { id: 'beacon', name: 'Rotorblink', itemNumber: 'RC-BEACON', price: 1800 },
      { id: 'radio', name: 'Ekstra radio', itemNumber: 'RC-RADIO', price: 12500 },
      { id: 'bucket-300', name: 'Graveskovl 300mm', itemNumber: 'RC-B300', price: 5800, hasQuantity: true, maxQuantity: 5 },
      { id: 'bucket-450', name: 'Graveskovl 450mm', itemNumber: 'RC-B450', price: 6200, hasQuantity: true, maxQuantity: 5 },
      { id: 'bucket-600', name: 'Graveskovl 600mm', itemNumber: 'RC-B600', price: 6800, hasQuantity: true, maxQuantity: 5 },
      { id: 'tilt-coupler', name: 'Tilt kobling', itemNumber: 'RC-TILT', price: 18500 },
      { id: 'ripper', name: 'Ripper tand', itemNumber: 'RC-RIP', price: 4200, dependsOn: 'tilt-coupler' },
      { id: 'breaker-hyd', name: 'Hydraulisk hammer', itemNumber: 'RC-BRK', price: 32000 },
      {
        id: 'wire-harness',
        name: 'Ekstra kabelsæt',
        itemNumber: 'RC-WIRE',
        price: 2800,
        hidden: true,
        autoAdd: { requiresAll: ['led-lights', 'breaker-hyd'] },
      },
      { id: 'custom-color', name: 'Special RAL farve', itemNumber: 'RC-RAL', price: 8500, hasRalInput: true },
      { id: 'trailer-pkg', name: 'Trailerpakke', itemNumber: 'RC-TRL', price: 15000,
        subItems: [
          { id: 'trl-ramp', name: 'Ramper', itemNumber: 'RC-TRL-R', price: 0 },
          { id: 'trl-strap', name: 'Surringssæt', itemNumber: 'RC-TRL-S', price: 0 },
        ]
      },
    ],
  },
  {
    id: 'rc751',
    name: 'RC-751',
    itemNumber: 'RC-751',
    basePrice: 219000,
    description: 'Kompakt fjernbetjent minigraver til trange adgangsforhold.',
    specs: {
      'Vægt': '750 kg',
      'Bredde': '680 mm',
      'Motor': 'Diesel 18 hk',
      'Grabedybde': '1.500 mm',
    },
    demoFee: 4000,
    requiredGroups: [],
    accessories: [
      { id: 'led-lights-751', name: 'LED arbejdslys', itemNumber: '751-LED', price: 4500 },
      { id: 'beacon-751', name: 'Rotorblink', itemNumber: '751-BEACON', price: 1800 },
      { id: 'radio-751', name: 'Ekstra radio', itemNumber: '751-RADIO', price: 12500 },
      { id: 'bucket-250-751', name: 'Graveskovl 250mm', itemNumber: '751-B250', price: 4800, hasQuantity: true, maxQuantity: 5 },
      { id: 'bucket-400-751', name: 'Graveskovl 400mm', itemNumber: '751-B400', price: 5400, hasQuantity: true, maxQuantity: 5 },
      { id: 'custom-color-751', name: 'Special RAL farve', itemNumber: '751-RAL', price: 8500, hasRalInput: true },
    ],
  },
  {
    id: 'timan3330',
    name: 'Timan 3330',
    itemNumber: 'T-3330',
    basePrice: 485000,
    description: 'Stor kompakt læsser med kabine og fuldhydraulisk styring.',
    specs: {
      'Vægt': '3.300 kg',
      'Bredde': '1.560 mm',
      'Motor': 'Diesel 50 hk',
      'Løftekapacitet': '1.200 kg',
    },
    demoFee: 8000,
    requiredGroups: [
      { id: 'aircon', label: 'Klimaanlæg', accessories: ['ac-none', 'ac-heat', 'ac-full'] },
      { id: 'doors', label: 'Døre', accessories: ['door-half', 'door-full'] },
      { id: 'seats', label: 'Sæde', accessories: ['seat-std', 'seat-air'] },
      { id: 'roof', label: 'Tag', accessories: ['roof-std', 'roof-open'] },
    ],
    accessories: [
      // Required groups
      { id: 'ac-none', name: 'Uden klimaanlæg', itemNumber: 'T-AC0', price: 0, groupId: 'aircon', isRequired: true },
      { id: 'ac-heat', name: 'Varme', itemNumber: 'T-ACH', price: 6500, groupId: 'aircon', isRequired: true },
      { id: 'ac-full', name: 'Fuld klima (varme+køl)', itemNumber: 'T-ACF', price: 18000, groupId: 'aircon', isRequired: true },
      { id: 'door-half', name: 'Halve døre', itemNumber: 'T-DH', price: 0, groupId: 'doors', isRequired: true },
      { id: 'door-full', name: 'Fulde døre', itemNumber: 'T-DF', price: 8500, groupId: 'doors', isRequired: true },
      { id: 'seat-std', name: 'Standard sæde', itemNumber: 'T-SS', price: 0, groupId: 'seats', isRequired: true },
      { id: 'seat-air', name: 'Luftaffjedret sæde', itemNumber: 'T-SA', price: 4200, groupId: 'seats', isRequired: true },
      { id: 'roof-std', name: 'Standard tag', itemNumber: 'T-RS', price: 0, groupId: 'roof', isRequired: true },
      { id: 'roof-open', name: 'Åbent tag (ROPS)', itemNumber: 'T-RO', price: -3500, groupId: 'roof', isRequired: true },
      // Optional accessories
      { id: 'led-3330', name: 'LED arbejdslys pakke', itemNumber: 'T-LED', price: 7200 },
      { id: 'beacon-3330', name: 'Rotorblink', itemNumber: 'T-BEACON', price: 1800 },
      { id: 'rev-camera', name: 'Bakkamera', itemNumber: 'T-CAM', price: 5500 },
      { id: 'fork-std', name: 'Gafler 1200mm', itemNumber: 'T-FORK', price: 8200 },
      { id: 'bucket-std-3330', name: 'Skovl 1600mm', itemNumber: 'T-BKT16', price: 12500, hasQuantity: true, maxQuantity: 3 },
      { id: 'sweeper', name: 'Fejemaskine', itemNumber: 'T-SWP', price: 28000 },
      { id: 'custom-color-3330', name: 'Special RAL farve', itemNumber: 'T-RAL', price: 12000, hasRalInput: true },
    ],
  },
  {
    id: 'loose-tool',
    name: 'Løst værktøj',
    itemNumber: 'LOOSE',
    basePrice: 0,
    description: 'Bestil løst værktøj og tilbehør uden maskine.',
    specs: {},
    isLooseTool: true,
    requiredGroups: [],
    accessories: [
      { id: 'lt-bucket-300', name: 'Graveskovl 300mm (RC)', itemNumber: 'LT-B300', price: 5800, hasQuantity: true, maxQuantity: 10 },
      { id: 'lt-bucket-450', name: 'Graveskovl 450mm (RC)', itemNumber: 'LT-B450', price: 6200, hasQuantity: true, maxQuantity: 10 },
      { id: 'lt-bucket-600', name: 'Graveskovl 600mm (RC)', itemNumber: 'LT-B600', price: 6800, hasQuantity: true, maxQuantity: 10 },
      { id: 'lt-ripper', name: 'Ripper tand', itemNumber: 'LT-RIP', price: 4200, hasQuantity: true, maxQuantity: 10 },
      { id: 'lt-breaker', name: 'Hydraulisk hammer', itemNumber: 'LT-BRK', price: 32000, hasQuantity: true, maxQuantity: 5 },
      { id: 'lt-tilt', name: 'Tilt kobling', itemNumber: 'LT-TILT', price: 18500, hasQuantity: true, maxQuantity: 5 },
      { id: 'lt-packaging', name: 'Emballeringsomkostning', itemNumber: 'LT-PKG', price: 1500, hidden: true },
    ],
  },
];

export function getMachineById(id: string): Machine | undefined {
  return machines.find((m) => m.id === id);
}
