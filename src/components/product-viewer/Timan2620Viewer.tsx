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
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';

const BASE_LABEL_KEY: Record<Timan2620Base, string> = {
  standard: 'm2620_base_standard',
  cab: 'm2620_base_cab',
};
const EQUIPMENT_LABEL_KEY: Record<Timan2620Equipment, string> = {
  v_plow: 'm2620_eq_v_plow',
  salt_spreader: 'm2620_eq_salt_spreader',
  brush: 'm2620_eq_brush',
};

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

/* --------------------------------------------------------------
 * View-aware hotspot system
 *
 * Each configuration is photographed from a different angle (some
 * mirrored). Hotspots must point at the correct machine part in
 * the *current* photo, so positions are defined per imageKey and
 * per frame — not as a single global layout.
 *
 * `PART_CONTENT` holds the descriptive payload (title, subtitle,
 * description, bullets, technical) for each machine part — it never
 * changes between views.
 *
 * `VIEW_POSITIONS` holds per-view anchor + callout coordinates for
 * each part visible in that view. A part missing from a view is
 * simply not rendered for that view. Multi-frame keys (e.g. the cab
 * full-winter-setup rotation) use an array of position entries with
 * an explicit `frame` (1-based).
 * -------------------------------------------------------------- */

type PartId =
  | 'motor'
  | 'kabine'
  | 'affjedring'
  | 'v_plow'
  | 'salt_spreader'
  | 'brush';

type PartContent = Omit<ViewerHotspot, 'id' | 'frame' | 'x' | 'y' | 'calloutCenter' | 'variant'>;

interface PosEntry {
  anchor: { x: number; y: number };
  callout: { cx: number; cy: number };
  /** 1-based frame index; defaults to 0 (always visible). */
  frame?: number;
}

function buildPartContent(lang: string): Record<PartId, PartContent> {
  return {
    motor: {
      title: t('m2620_hot_motor_title', lang),
      subtitle: t('m2620_hot_motor_sub', lang),
      description:
        'Timan 2620 drives af en robust dieselmotor designet til lange driftstimer i krævende miljøer.',
      bullets: ['Lavt brændstofforbrug', 'Nem adgang til service', 'Stabil ydelse hele året'],
      technical: [
        { label: 'Effekt', value: '26 hk' },
        { label: 'Cylindere', value: '3' },
        { label: 'Brændstof', value: 'Diesel' },
      ],
    },
    kabine: {
      title: t('m2620_hot_kabine_title', lang),
      subtitle: t('m2620_hot_kabine_sub', lang),
      description: 'Lukket kabine med opvarmning og fuldt rundtomudsyn — ideel til vinterarbejde.',
      bullets: ['Varme og defrost', '360° udsyn', 'Støjdæmpet førerplads'],
    },
    affjedring: {
      title: t('m2620_hot_affjedring_title', lang),
      subtitle: t('m2620_hot_affjedring_sub', lang),
      description: 'Affjedret undervogn giver godt vejgreb og komfort på ujævnt underlag.',
      bullets: ['Stort hjuldiameter', 'Optimal vægtfordeling', 'Mindre slitage på føreren'],
    },
    v_plow: {
      title: t('m2620_hot_vplow_title', lang),
      subtitle: t('m2620_hot_vplow_sub', lang),
      description:
        'Hydraulisk Dozer blad rydder sne i smalle som brede passager — perfekt til byområder.',
      bullets: ['Hydraulisk justering', 'Slidstærke skær', 'Robust ophæng'],
    },
    salt_spreader: {
      title: t('m2620_hot_salt_title', lang),
      subtitle: t('m2620_hot_salt_sub', lang),
      description:
        'Tallerkenspreder med justerbar bredde og mængde — egnet til salt, grus eller sand.',
      bullets: ['Justerbar spredebredde', 'Stor beholder', 'Hurtig påfyldning'],
    },
    brush: {
      title: t('m2620_hot_brush_title', lang),
      subtitle: t('m2620_hot_brush_sub', lang),
      description:
        'Roterende kost med stor arbejdsbredde — ideel til fejning af gårdspladser, stier og parkeringsarealer.',
      bullets: ['Justerbar arbejdsbredde', 'Effektiv opsamling', 'Nem montering og betjening'],
    },
  };
}

/**
 * Per-view part positions. Coordinates are in percent of the rendered
 * image box (0..100). `anchor` sits on the machine part; `callout`
 * orbits around the silhouette so the card never overlaps the machine.
 *
 * Camera orientation per image (left = west side of frame):
 *   standard / cab / *_salt_spreader / *_full_winter_setup (frame 1)
 *     → machine faces LEFT (front = left, rear = right)
 *   standard_v_plow / cab_full_winter_setup (frame 2)
 *     → machine faces RIGHT (front = right, rear = left)
 */
const VIEW_POSITIONS: Record<string, Partial<Record<PartId, PosEntry | PosEntry[]>>> = {
  // Bare machines — front faces LEFT
  standard: {
    motor:      { anchor: { x: 58, y: 55 }, callout: { cx: 88, cy: 65 } },
    affjedring: { anchor: { x: 40, y: 75 }, callout: { cx: 15, cy: 90 } },
  },
  cab: {
    motor:      { anchor: { x: 60, y: 55 }, callout: { cx: 88, cy: 68 } },
    kabine:     { anchor: { x: 45, y: 30 }, callout: { cx: 78, cy: 12 } },
    affjedring: { anchor: { x: 40, y: 75 }, callout: { cx: 15, cy: 90 } },
  },

  // Saltspreder only — saltspreder bin dominates right side
  standard_salt_spreader: {
    motor:         { anchor: { x: 48, y: 55 }, callout: { cx: 15, cy: 65 } },
    affjedring:    { anchor: { x: 42, y: 75 }, callout: { cx: 15, cy: 92 } },
    salt_spreader: { anchor: { x: 65, y: 42 }, callout: { cx: 90, cy: 22 } },
  },
  cab_salt_spreader: {
    motor:         { anchor: { x: 50, y: 55 }, callout: { cx: 15, cy: 70 } },
    kabine:        { anchor: { x: 38, y: 30 }, callout: { cx: 12, cy: 12 } },
    affjedring:    { anchor: { x: 42, y: 75 }, callout: { cx: 50, cy: 95 } },
    salt_spreader: { anchor: { x: 65, y: 42 }, callout: { cx: 90, cy: 22 } },
  },

  // V-plov only — MIRRORED view, machine faces RIGHT, v-plov at right
  standard_v_plow: {
    motor:      { anchor: { x: 40, y: 55 }, callout: { cx: 12, cy: 65 } },
    affjedring: { anchor: { x: 50, y: 75 }, callout: { cx: 50, cy: 95 } },
    v_plow:     { anchor: { x: 68, y: 65 }, callout: { cx: 90, cy: 50 } },
  },

  // Full winter setup standard — front/side view: V-plov LEFT, saltspreder RIGHT
  standard_full_winter_setup: {
    v_plow:        { anchor: { x: 25, y: 62 }, callout: { cx: 8,  cy: 45 } },
    motor:         { anchor: { x: 50, y: 55 }, callout: { cx: 50, cy: 95 } },
    affjedring:    { anchor: { x: 42, y: 75 }, callout: { cx: 15, cy: 92 } },
    salt_spreader: { anchor: { x: 68, y: 42 }, callout: { cx: 92, cy: 22 } },
  },

  // Full winter setup cab — 2 frames (rotation)
  //   frame 1 (IMG 6): front/side — v-plov LEFT, cab centre, saltspreder RIGHT
  //   frame 2 (IMG 8): rear/mirrored — v-plov RIGHT, cab upper-right;
  //                    saltspreder hidden to avoid overlap & confusion
  cab_full_winter_setup: {
    // Frame 2 (IMG 8) is the rear/mirrored view:
    //   dozer blade → RIGHT, cab → centre, engine/rear body → LEFT.
    // Every frame-2 entry uses its own anchor + callout so the bubble
    // sits in empty background and the connector never crosses the body.
    v_plow: [
      { anchor: { x: 25, y: 62 }, callout: { cx: 8,  cy: 45 }, frame: 1 },
      // frame 2: anchor on the dozer blade (right-front), bubble in the
      // lower-right corner — short diagonal through empty background.
      { anchor: { x: 80, y: 68 }, callout: { cx: 96, cy: 82 }, frame: 2 },
    ],
    motor: [
      { anchor: { x: 58, y: 55 }, callout: { cx: 92, cy: 70 }, frame: 1 },
      // frame 2: anchor on the rear/engine body (left side of the
      // mirrored view), bubble pushed out to the left margin.
      { anchor: { x: 28, y: 58 }, callout: { cx: 6,  cy: 72 }, frame: 2 },
    ],
    kabine: [
      { anchor: { x: 48, y: 30 }, callout: { cx: 78, cy: 10 }, frame: 1 },
      // frame 2: anchor on the cab roof, bubble straight up — clean
      // vertical connector, no roof or body crossing.
      { anchor: { x: 50, y: 30 }, callout: { cx: 50, cy: 6  }, frame: 2 },
    ],
    affjedring: [
      { anchor: { x: 45, y: 75 }, callout: { cx: 50, cy: 95 }, frame: 1 },
      // frame 2: anchor on rear wheel/suspension area, bubble lower-left
      // along the bottom margin so it doesn't collide with the dozer bubble.
      { anchor: { x: 42, y: 80 }, callout: { cx: 22, cy: 96 }, frame: 2 },
    ],
    salt_spreader: [
      { anchor: { x: 68, y: 42 }, callout: { cx: 92, cy: 22 }, frame: 1 },
      // frame 2: anchor on the DS-250 spreader (rear of machine = LEFT
      // side in this mirrored view), bubble pushed up to the top-left
      // corner — connector stays in empty sky, never crosses the body.
      { anchor: { x: 22, y: 40 }, callout: { cx: 4,  cy: 18 }, frame: 2 },
    ],
  },
};

function buildHotspots(
  imageKey: string,
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
  lang: string,
): ViewerHotspot[] {
  void base; // base is encoded in imageKey
  const view = VIEW_POSITIONS[imageKey];
  if (!view) return [];

  const partContent = buildPartContent(lang);
  const visibleParts = new Set<PartId>(['motor', 'affjedring']);
  if (imageKey.startsWith('cab')) visibleParts.add('kabine');
  if (equipment.has('v_plow')) visibleParts.add('v_plow');
  if (equipment.has('salt_spreader')) visibleParts.add('salt_spreader');
  if (equipment.has('brush')) visibleParts.add('brush');

  const list: ViewerHotspot[] = [];
  for (const part of visibleParts) {
    const entry = view[part];
    if (!entry) continue;
    const positions = Array.isArray(entry) ? entry : [entry];
    positions.forEach((pos, i) => {
      list.push({
        id: positions.length > 1 ? `${part}-f${pos.frame ?? i + 1}` : part,
        frame: pos.frame ?? 0,
        x: pos.anchor.x,
        y: pos.anchor.y,
        variant: 'callout',
        calloutCenter: { cx: pos.callout.cx, cy: pos.callout.cy },
        ...partContent[part],
      });
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
  const { uiLanguage } = useLanguage();
  const [base, setBase] = useState<Timan2620Base>('standard');
  const [equipment, setEquipment] = useState<Set<Timan2620Equipment>>(() => new Set());
  const [conflict, setConflict] = useState<Timan2620Ctx['conflict']>(null);

  const imageKey = useMemo(() => deriveTiman2620ImageKey(base, equipment), [base, equipment]);
  const entry = TIMAN_2620_IMAGES[imageKey] ?? { imageSequence: [], hotspots: [] };
  const hotspots = useMemo(
    () => buildHotspots(imageKey, base, equipment, uiLanguage),
    [imageKey, base, equipment, uiLanguage],
  );

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
  const { uiLanguage } = useLanguage();
  const baseLabel = t('m2620_basismaskine', uiLanguage);
  const equipmentLabel = t('m2620_udstyr', uiLanguage);
  // Fixed width sized to longest label "Saltspreder"
  const pillClass =
    'w-[150px] px-4 py-1.5 rounded-full text-sm font-semibold border transition text-center';
  return (
    <aside className="lg:sticky lg:top-24">
      <section className="mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {baseLabel}
        </div>
        <div className="flex flex-col items-start gap-4" role="radiogroup" aria-label={baseLabel}>
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
                {t(BASE_LABEL_KEY[o.key], uiLanguage)}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {equipmentLabel}
        </div>
        <div className="flex flex-col items-start gap-4" role="group" aria-label={equipmentLabel}>
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
                {t(EQUIPMENT_LABEL_KEY[o.key], uiLanguage)}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function Stage({ disableZoom = false }: { disableZoom?: boolean } = {}) {
  const { imageKey, configuration, conflict, cancelConflict, confirmReplace } = useTiman2620();
  const { uiLanguage } = useLanguage();
  const labelOfEquipment = (eq: Timan2620Equipment) =>
    t(EQUIPMENT_LABEL_KEY[eq], uiLanguage);

  return (
    <>
      <div>
        <ProductImageViewer
          key={imageKey}
          configuration={configuration}
          hideControls
          disableZoom={disableZoom}
        />
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
              {labelOfEquipment(conflict.candidate)}{' '}
              {t('m2620_conflict_cannot_combine_with', uiLanguage)}{' '}
              {labelOfEquipment(conflict.conflictsWith)}.
            </div>
            <p className="text-sm text-slate-600 mb-4">
              {t('m2620_conflict_replace_prefix', uiLanguage)}{' '}
              {labelOfEquipment(conflict.conflictsWith)}{' '}
              {t('m2620_conflict_with', uiLanguage)}{' '}
              {labelOfEquipment(conflict.candidate)}?
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={cancelConflict}
                className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50"
              >
                {t('cancel', uiLanguage)}
              </button>
              <button
                type="button"
                onClick={confirmReplace}
                className="px-3 py-1.5 rounded-md bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
              >
                {t('m2620_replace', uiLanguage)} {labelOfEquipment(conflict.conflictsWith)}{' '}
                {t('m2620_conflict_with', uiLanguage)} {labelOfEquipment(conflict.candidate)}
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
