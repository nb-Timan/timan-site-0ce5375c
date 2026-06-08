/**
 * Timan2620Viewer — base machine + equipment configurator wrapping
 * ProductImageViewer for the Timan 2620.
 *
 * The viewer is split into two subcomponents that share state via context:
 *   - <Timan2620Viewer.Sidebar /> — base + equipment selection (compact pills)
 *   - <Timan2620Viewer.Stage />   — machine image with callout hotspots
 *
 * Default export still renders a self-contained "sidebar + stage" layout for
 * any caller that hasn't migrated to the split layout yet.
 *
 * Selection rules:
 *   - Basismaskine: single-select (Standard | Kabine)
 *   - Udstyr:       multi-select (V-plov, Saltspreder, Kost)
 *                   Kost cannot be combined with V-plov; selecting Kost while
 *                   V-plov is active opens a confirm dialog.
 *
 * Hotspot visibility is identical to the previous implementation: Motor and
 * Affjedring are always visible; Kabine, Redskaber, V-plov and Saltspreder
 * appear when their corresponding selection is active.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
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

function buildHotspots(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): ViewerHotspot[] {
  const hasAnyEquipment = equipment.size > 0;
  const list: ViewerHotspot[] = [];

  list.push({
    id: 'motor',
    frame: 0,
    x: 58, y: 38,
    title: 'Motor',
    subtitle: 'Kraftfuld og driftssikker',
    variant: 'callout',
    calloutPlacement: 'right',
    description:
      'Timan 2620 drives af en robust dieselmotor designet til lange driftstimer i krævende miljøer.',
    bullets: ['Lavt brændstofforbrug', 'Nem adgang til service', 'Stabil ydelse hele året'],
    technical: [
      { label: 'Effekt', value: '26 hk' },
      { label: 'Cylindere', value: '3' },
      { label: 'Brændstof', value: 'Diesel' },
    ],
  });
  list.push({
    id: 'affjedring',
    frame: 0,
    x: 38, y: 78,
    title: 'Affjedring',
    subtitle: 'Stabilitet og komfort',
    variant: 'callout',
    calloutPlacement: 'bottom',
    description: 'Affjedret undervogn giver godt vejgreb og komfort på ujævnt underlag.',
    bullets: ['Stort hjuldiameter', 'Optimal vægtfordeling', 'Mindre slitage på føreren'],
  });

  if (base === 'cab') {
    list.push({
      id: 'kabine',
      frame: 0,
      x: 48, y: 22,
      title: 'Kabine',
      subtitle: 'Komfort og godt udsyn',
      variant: 'callout',
      calloutPlacement: 'top',
      description: 'Lukket kabine med opvarmning og fuldt rundtomudsyn — ideel til vinterarbejde.',
      bullets: ['Varme og defrost', '360° udsyn', 'Støjdæmpet førerplads'],
    });
  }

  if (hasAnyEquipment) {
    list.push({
      id: 'redskaber',
      frame: 0,
      x: 18, y: 58,
      title: 'Redskaber',
      subtitle: 'Nem montering af udstyr',
      variant: 'callout',
      calloutPlacement: 'left',
      description:
        'Hurtigkobling i fronten gør det muligt at skifte mellem redskaber på under et minut.',
      bullets: ['Værktøjsfri skift', 'Bredt udvalg af tilbehør', 'Hydraulisk tilslutning'],
    });
  }

  if (equipment.has('v_plow')) {
    list.push({
      id: 'v_plow',
      frame: 0,
      x: 12, y: 68,
      title: 'V-plov',
      subtitle: 'Effektiv snerydning',
      variant: 'callout',
      calloutPlacement: 'left',
      description:
        'Hydraulisk V-plov rydder sne i smalle som brede passager — perfekt til byområder.',
      bullets: ['Hydraulisk justering', 'Slidstærke skær', 'Robust ophæng'],
    });
  }

  if (equipment.has('salt_spreader')) {
    list.push({
      id: 'salt_spreader',
      frame: 0,
      x: 86, y: 52,
      title: 'Saltspreder',
      subtitle: 'Præcis vinterbekæmpelse',
      variant: 'callout',
      calloutPlacement: 'right',
      description:
        'Tallerkenspreder med justerbar bredde og mængde — egnet til salt, grus eller sand.',
      bullets: ['Justerbar spredebredde', 'Stor beholder', 'Hurtig påfyldning'],
    });
  }

  return list;
}

interface Timan2620Ctx {
  base: Timan2620Base;
  setBase: (b: Timan2620Base) => void;
  equipment: Set<Timan2620Equipment>;
  toggleEquipment: (e: Timan2620Equipment) => void;
  conflict: { candidate: Timan2620Equipment; conflictsWith: Timan2620Equipment } | null;
  cancelConflict: () => void;
  confirmReplace: () => void;
  imageKey: string;
  configuration: ViewerConfiguration;
}

const Ctx = createContext<Timan2620Ctx | null>(null);

function useTiman2620() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Timan2620 subcomponent must be used inside <Timan2620Provider>');
  return ctx;
}

function Timan2620Provider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Timan2620Base>('standard');
  const [equipment, setEquipment] = useState<Set<Timan2620Equipment>>(() => new Set());
  const [conflict, setConflict] = useState<Timan2620Ctx['conflict']>(null);

  const imageKey = useMemo(() => deriveTiman2620ImageKey(base, equipment), [base, equipment]);
  const entry = TIMAN_2620_IMAGES[imageKey] ?? { imageSequence: [], hotspots: [] };
  const hotspots = useMemo(() => buildHotspots(base, equipment), [base, equipment]);

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

  const value: Timan2620Ctx = {
    base, setBase,
    equipment, toggleEquipment,
    conflict, cancelConflict: () => setConflict(null), confirmReplace,
    imageKey, configuration,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------- Subcomponents ------------------------- */

function Sidebar() {
  const { base, setBase, equipment, toggleEquipment } = useTiman2620();
  // Fixed width sized to longest label "Saltspreder"
  const pillClass =
    'w-[150px] px-4 py-1.5 rounded-full text-sm font-semibold border transition text-center';
  return (
    <aside className="lg:sticky lg:top-24">
      <section className="mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Basismaskine
        </div>
        <div className="flex flex-col items-start gap-4" role="radiogroup" aria-label="Basismaskine">
          {TIMAN_2620_BASE_OPTIONS.map(o => {
            const active = base === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBase(o.key)}
                className={`${pillClass} ${
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

      <section>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Udstyr
        </div>
        <div className="flex flex-col items-start gap-4" role="group" aria-label="Udstyr">
          {TIMAN_2620_EQUIPMENT_OPTIONS.map(o => {
            const active = equipment.has(o.key);
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleEquipment(o.key)}
                className={`${pillClass} ${
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
  );
}

function Stage() {
  const { imageKey, configuration, conflict, cancelConflict, confirmReplace } = useTiman2620();
  const labelOfEquipment = (eq: Timan2620Equipment) =>
    TIMAN_2620_EQUIPMENT_OPTIONS.find(o => o.key === eq)?.label ?? eq;

  return (
    <>
      <div>
        <ProductImageViewer key={imageKey} configuration={configuration} />
      </div>

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
                onClick={cancelConflict}
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
    </>
  );
}

/* ------------------------- Default layout ------------------------- */

function Timan2620Viewer() {
  return (
    <Timan2620Provider>
      <div className="w-full flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="w-full lg:w-[260px] lg:flex-shrink-0">
          <Sidebar />
        </div>
        <div className="flex-1 min-w-0 w-full">
          <Stage />
        </div>
      </div>
    </Timan2620Provider>
  );
}

/**
 * Subcomponents are exposed for kiosk layouts (e.g. MesseTiman2620Page) that
 * need to position the configuration panel and machine stage independently
 * while still sharing selection state. Wrap them in <Timan2620Viewer.Provider>.
 */
Timan2620Viewer.Provider = Timan2620Provider;
Timan2620Viewer.Sidebar = Sidebar;
Timan2620Viewer.Stage = Stage;


export default Timan2620Viewer;
