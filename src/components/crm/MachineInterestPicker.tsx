import { cn } from '@/lib/utils';

const MACHINE_INTEREST_MAIN = [
  { label: 'RC-751', values: ['RC-751'] },
  { label: 'RC-1000s', values: ['RC-1000', 'RC-1000s'] },
  { label: 'Timan 2620', values: ['Timan 2620', 'New 2620'] },
  { label: 'Timan 3330', values: ['Timan 3330'] },
  { label: 'Loader line / traktor-redskaber', values: ['Loader line / Tractor Equipment'] },
] as const;

const MACHINE_INTEREST_EQUIPMENT = [
  {
    machine: 'RC-1000s',
    items: [
      'Slagleklipper inkl. Y-slagle sæt',
      'Rotorklipper 1350 mm',
      'Fingerklipper 1700 mm',
      'Skivehøster 1150mm',
      'Stubfræser m/hydraulisk sving',
      'V-plov m/gummiskær',
      'Centerdrevet fejemaskine',
      'Sneslynge 1100 mm',
      'WB-170 ukrudtsbørste basis enhed',
    ],
  },
  {
    machine: 'Timan 2620',
    items: ['Med kabine', 'Uden kabine', 'V-plov', 'Skovl', 'Skrabeblad/Dozerblad', 'DS-250 Saltspreder'],
  },
  {
    machine: 'Loader line / Tractor Equipment',
    groups: [
      {
        title: 'Loader line',
        items: [
          'CS-200 Valspreder, manuel reg. Inklusiv svingbar ophængs beslag',
          'CS-200 Combi, manuel reg. Inklusiv svingbar ophængs beslag til Weidemann',
          'CS-200 Combi, El. reg. Inklusiv svingbar ophængs beslag til Weidemann',
          'Timan hydr. fejemaskine D1316 med skrabeblad Ø600 mm børster',
          'Timan hydr. fejemaskine D1518 med skrabeblad Ø600 mm børster',
          'Flydende ophæng inklusiv 6/2 ventil til Weidemann',
          'Tornado 400 fejebredde 135 til 180 cm. 400 liter beholder, 50 liter vandtank',
        ],
      },
      {
        title: 'Tractor',
        items: [
          'CS-200 Valspreder, manuel reg.',
          'CS-200 Combi, manuel reg.',
          'CS-200 Combi, El. reg.',
        ],
      },
    ],
  },
  {
    machine: 'Timan 3330',
    groups: [
      {
        title: 'Feje/Sug Redskaber',
        items: [
          'T2 Opsamlingstank uden højtryksslange',
          'T2 Opsamlingstank inkl. højtryksrenser',
          'T3 Opsamlingstank med tørsug',
          'T3 Opsamlingstank med tørsug og højtryksrenser',
          'Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost',
        ],
      },
      { title: 'Ukrudtsbørste', items: ['WB-170 Ukrudtsbørste basisenhed'] },
      {
        title: 'Græs opgaver',
        items: [
          'Rotorklipper med 3 gatorknive og tilt-up, 135 cm klippebredde',
          'Rotorklipper 150 cm med hydraulisk højdejustering og tilt-up',
          'Rotorklipper 120 cm for opsamling til fejesugtank',
        ],
      },
      {
        title: 'Vinter redskaber',
        items: [
          'Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster',
          'V-plov 130-150 cm med gummiskær',
          'Dozerblad 130 cm med gummiskær',
          'Sneslynge, 110 cm arbejdsbredde',
          'CS-200 Valsespreder, for lad, manuel reg. Husk lad og vogn',
          'CS-200 Combi, for lad, manuel reg. Husk lad og vogn',
          'CS-200 Combi, for lad, el reg. Husk lad og vogn',
        ],
      },
      {
        title: 'Øvrige Redskaber',
        items: [
          'Fingerklipper for Termit-arm',
          'Multitrimmer for Termit-arm',
          'Skovl med hydraulisk tip',
          'Ramme for montering af udstyr bag - andre end Timan produkter',
          'Hurtigkobling for frontudstyr - andre end Timan produkter',
          'Fabriksmontering af centerslange for fejesug T2 og T3',
          'Ekstra vogn til afmontering af redskaber',
          'Ekstra lad med hydraulisk tip uden vogn',
          'Timan 3330 udvidet komponentgaranti med 12 mdr.',
        ],
      },
    ],
  },
] as const;

function equipmentValue(machine: string, item: string, group?: string): string {
  return group ? `Equipment: ${machine} - ${group} - ${item}` : `Equipment: ${machine} - ${item}`;
}

function MultiChip({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onChange(active ? value.filter(v => v !== o) : [...value, o])}
            className={cn(
              'text-[12px] px-2.5 py-1.5 rounded-lg border transition',
              active
                ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function MachineInterestPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggleValue = (item: string) => {
    onChange(value.includes(item) ? value.filter(v => v !== item) : [...value, item]);
  };
  const toggleMain = (entry: typeof MACHINE_INTEREST_MAIN[number]) => {
    const active = entry.values.some(v => value.includes(v));
    const without = value.filter(v => !(entry.values as readonly string[]).includes(v));
    onChange(active ? without : [...without, entry.values[0]]);
  };
  const knownEquipment = new Set<string>();
  for (const group of MACHINE_INTEREST_EQUIPMENT) {
    if ('groups' in group) {
      for (const sub of group.groups) for (const item of sub.items) knownEquipment.add(equipmentValue(group.machine, item, sub.title));
    } else {
      for (const item of group.items) knownEquipment.add(equipmentValue(group.machine, item));
    }
  }
  const knownMain = new Set<string>(MACHINE_INTEREST_MAIN.flatMap(m => [...m.values]));
  const otherSelected = value.filter(v => !knownMain.has(v) && !knownEquipment.has(v));
  const hasSelectedEquipmentContext = value.some(v => v.startsWith('Equipment:'))
    || value.some(v => ['RC-1000', 'RC-1000s', 'Timan 2620', 'New 2620', 'Timan 3330', 'Loader line / Tractor Equipment'].includes(v));
  const isEquipmentGroupActive = (machine: string) => {
    if (machine === 'RC-1000s') return value.includes('RC-1000') || value.includes('RC-1000s');
    if (machine === 'Timan 2620') return value.includes('Timan 2620') || value.includes('New 2620');
    if (machine === 'Timan 3330') return value.includes('Timan 3330');
    if (machine === 'Loader line / Tractor Equipment') return value.includes('Loader line / Tractor Equipment');
    return false;
  };
  const equipmentGroupClass = (active: boolean) => cn(
    'rounded-xl border p-3 shadow-sm transition',
    active
      ? 'border-emerald-700 bg-emerald-100/80 ring-2 ring-emerald-200'
      : 'border-slate-300 bg-white',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MACHINE_INTEREST_MAIN.map(entry => {
          const active = entry.values.some(v => value.includes(v));
          return (
            <button
              type="button"
              key={entry.label}
              onClick={() => toggleMain(entry)}
              className={cn(
                'text-[12px] px-3 py-1.5 rounded-lg border transition',
                active
                  ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <details className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3" open={hasSelectedEquipmentContext}>
        <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Redskaber under maskiner</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {MACHINE_INTEREST_EQUIPMENT.map(group => (
            <div key={group.machine} className={equipmentGroupClass(isEquipmentGroupActive(group.machine))}>
              <h4 className="mb-2 text-sm font-bold text-slate-900">{group.machine}</h4>
              {'groups' in group ? (
                <div className="space-y-3">
                  {group.groups.map(sub => (
                    <div key={sub.title} className="space-y-2">
                      <div className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{sub.title}</div>
                      {sub.items.map(item => {
                        const val = equipmentValue(group.machine, item, sub.title);
                        return (
                          <label key={val} className="flex items-start gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={value.includes(val)} onChange={() => toggleValue(val)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                            <span>{item}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {group.items.map(item => {
                    const val = equipmentValue(group.machine, item);
                    return (
                      <label key={val} className="flex items-start gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={value.includes(val)} onChange={() => toggleValue(val)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      {otherSelected.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <div className="mb-2 text-xs font-bold text-amber-900">Andre valgte CRM-interesser</div>
          <MultiChip options={otherSelected} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
