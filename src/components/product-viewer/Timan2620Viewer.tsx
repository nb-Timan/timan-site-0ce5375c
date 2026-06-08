/**
 * Timan2620Viewer — base machine + equipment configurator wrapping
 * ProductImageViewer for the Timan 2620.
 *
 * UI sections:
 *   1. Basismaskine — single-select (Standard | Kabine)
 *   2. Udstyr       — multi-select (V-plov, Saltspreder, Kost)
 *      · Kost cannot be combined with V-plov. Selecting Kost while V-plov is
 *        active opens a confirm dialog offering to replace V-plov with Kost.
 *   3. Callout hotspots — large round chips on the image. Visibility depends
 *      on base + equipment (e.g. Kabine chip only when Kabine is active).
 *
 * The image shown is derived from the base + equipment combination via
 * `deriveTiman2620ImageKey` and resolved against `TIMAN_2620_IMAGES`.
 */
import { useMemo, useState } from 'react';
import ProductImageViewer from './ProductImageViewer';
import {
  TIMAN_2620_BASE_OPTIONS,
  TIMAN_2620_EQUIPMENT_OPTIONS,
  TIMAN_2620_INCOMPATIBLE,
  TIMAN_2620_IMAGES,
  deriveTiman2620ImageKey,
  type Timan2620Base,
  type Timan2620Equipment,
} from '@/data/timan2620Viewer';
import type { ViewerConfiguration, ViewerHotspot } from './types';

function findConflict(
  equipment: ReadonlySet<Timan2620Equipment>,
  candidate: Timan2620Equipment,
): Timan2620Equipment | null {
  for (const [a, b] of TIMAN_2620_INCOMPATIBLE) {
    if (a === candidate && equipment.has(b)) return b;
    if (b === candidate && equipment.has(a)) return a;
  }
  return null;
}

/**
 * Build the set of callout hotspots for the current base + equipment.
 * Positions are expressed in percent of the image stage (object-fit: contain).
 * Coordinates are approximate visual anchors on the machine and are tuned
 * so the callout cards float beside the relevant area without covering it.
 */
function buildHotspots(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): ViewerHotspot[] {
  const hasAnyEquipment = equipment.size > 0;
  const list: ViewerHotspot[] = [];

  // Always visible
  list.push({
    id: 'motor',
    frame: 0,
    x: 58,
    y: 38,
    title: 'Motor',
    subtitle: 'Kraftfuld og driftssikker',
    variant: 'callout',
    calloutPlacement: 'right',
    description:
      'Timan 2620 drives af en robust dieselmotor designet til lange driftstimer i krævende miljøer.',
    bullets: [
      'Lavt brændstofforbrug',
      'Nem adgang til service',
      'Stabil ydelse hele året',
    ],
    technical: [
      { label: 'Effekt', value: '26 hk' },
      { label: 'Cylindere', value: '3' },
      { label: 'Brændstof', value: 'Diesel' },
    ],
  });
  list.push({
    id: 'affjedring',
    frame: 0,
    x: 38,
    y: 78,
    title: 'Affjedring',
    subtitle: 'Stabilitet og komfort',
    variant: 'callout',
    calloutPlacement: 'bottom',
    description: 'Affjedret undervogn giver godt vejgreb og komfort på ujævnt underlag.',
    bullets: [
      'Stort hjuldiameter',
      'Optimal vægtfordeling',
      'Mindre slitage på føreren',
    ],
  });

  if (base === 'cab') {
    list.push({
      id: 'kabine',
      frame: 0,
      x: 48,
      y: 22,
      title: 'Kabine',
      subtitle: 'Komfort og godt udsyn',
      variant: 'callout',
      calloutPlacement: 'top',
      description:
        'Lukket kabine med opvarmning og fuldt rundtomudsyn — ideel til vinterarbejde.',
      bullets: [
        'Varme og defrost',
        '360° udsyn',
        'Støjdæmpet førerplads',
      ],
    });
  }

  if (hasAnyEquipment) {
    list.push({
      id: 'redskaber',
      frame: 0,
      x: 18,
      y: 58,
      title: 'Redskaber',
      subtitle: 'Nem montering af udstyr',
      variant: 'callout',
      calloutPlacement: 'left',
      description:
        'Hurtigkobling i fronten gør det muligt at skifte mellem redskaber på under et minut.',
      bullets: [
        'Værktøjsfri skift',
        'Bredt udvalg af tilbehør',
        'Hydraulisk tilslutning',
      ],
    });
  }

  if (equipment.has('v_plow')) {
    list.push({
      id: 'v_plow',
      frame: 0,
      x: 12,
      y: 68,
      title: 'V-plov',
      subtitle: 'Effektiv snerydning',
      variant: 'callout',
      calloutPlacement: 'left',
      description:
        'Hydraulisk V-plov rydder sne i smalle som brede passager — perfekt til byområder.',
      bullets: [
        'Hydraulisk justering',
        'Slidstærke skær',
        'Robust ophæng',
      ],
    });
  }

  if (equipment.has('salt_spreader')) {
    list.push({
      id: 'salt_spreader',
      frame: 0,
      x: 86,
      y: 52,
      title: 'Saltspreder',
      subtitle: 'Præcis vinterbekæmpelse',
      variant: 'callout',
      calloutPlacement: 'right',
      description:
        'Tallerkenspreder med justerbar bredde og mængde — egnet til salt, grus eller sand.',
      bullets: [
        'Justerbar spredebredde',
        'Stor beholder',
        'Hurtig påfyldning',
      ],
    });
  }

  return list;
}

export default function Timan2620Viewer() {
  const [base, setBase] = useState<Timan2620Base>('standard');
  const [equipment, setEquipment] = useState<Set<Timan2620Equipment>>(() => new Set());
  const [conflict, setConflict] = useState<{
    candidate: Timan2620Equipment;
    conflictsWith: Timan2620Equipment;
  } | null>(null);

  const imageKey = useMemo(() => deriveTiman2620ImageKey(base, equipment), [base, equipment]);
  const entry = TIMAN_2620_IMAGES[imageKey] ?? { imageSequence: [], hotspots: [] };
  const hotspots = useMemo(() => buildHotspots(base, equipment), [base, equipment]);

  const labelOfEquipment = (eq: Timan2620Equipment) =>
    TIMAN_2620_EQUIPMENT_OPTIONS.find(o => o.key === eq)?.label ?? eq;

  function toggleEquipment(eq: Timan2620Equipment) {
    const next = new Set(equipment);
    if (next.has(eq)) {
      next.delete(eq);
      setEquipment(next);
      return;
    }
    const conflictsWith = findConflict(equipment, eq);
    if (conflictsWith) {
      setConflict({ candidate: eq, conflictsWith });
      return;
    }
    next.add(eq);
    setEquipment(next);
  }

  function confirmReplace() {
    if (!conflict) return;
    const next = new Set(equipment);
    next.delete(conflict.conflictsWith);
    next.add(conflict.candidate);
    setEquipment(next);
    setConflict(null);
  }

  const configuration: ViewerConfiguration = {
    key: imageKey,
    label: imageKey,
    badges: [],
    imageSequence: entry.imageSequence,
    hotspots,
    enabled: true,
  };

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
        {/* Left control panel */}
        <aside className="w-full lg:w-[260px] lg:flex-shrink-0 lg:sticky lg:top-4 bg-white rounded-2xl border border-slate-200 shadow-md p-5 lg:self-start">
          {/* Section 1 — Base machine */}
          <section className="mb-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Basismaskine
            </div>
            <div className="inline-flex flex-col items-stretch gap-2 w-full" role="radiogroup" aria-label="Basismaskine">
              {TIMAN_2620_BASE_OPTIONS.map(o => {
                const active = base === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setBase(o.key)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition text-center ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2 — Equipment */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Udstyr
            </div>
            <div className="inline-flex flex-col items-stretch gap-2 w-full" role="group" aria-label="Udstyr">
              {TIMAN_2620_EQUIPMENT_OPTIONS.map(o => {
                const active = equipment.has(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleEquipment(o.key)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition text-center ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        {/* Right viewer column */}
        <div className="flex-1 min-w-0 w-full">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-5 lg:p-6">
            <h2 className="text-2xl lg:text-3xl font-bold text-slate-900">Timan 2620</h2>
            <p className="text-slate-600 mt-1 mb-4">
              Udforsk Timan 2620 og se forskellige konfigurationer.
            </p>
            <ProductImageViewer key={imageKey} configuration={configuration} />
          </div>
        </div>
      </div>

      {/* Incompatibility confirm dialog */}
      {conflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timan-2620-conflict-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full">
            <div id="timan-2620-conflict-title" className="text-base font-bold text-slate-900 mb-2">
              {labelOfEquipment(conflict.candidate)} kan ikke kombineres med{' '}
              {labelOfEquipment(conflict.conflictsWith)}.
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Vil du erstatte {labelOfEquipment(conflict.conflictsWith)} med{' '}
              {labelOfEquipment(conflict.candidate)}?
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={confirmReplace}
                className="px-3 py-1.5 rounded-md bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
              >
                Erstat {labelOfEquipment(conflict.conflictsWith)} med{' '}
                {labelOfEquipment(conflict.candidate)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
