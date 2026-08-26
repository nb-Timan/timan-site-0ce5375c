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
 *   - Udstyr:       multi-select (Skovl, V-plov, Dozerblad, Saltspreder)
 *                   All combinations are driven by the central image matrix.
 *
 * Hotspot visibility is identical to the previous implementation: Motor and
 * Affjedring are always visible; Kabine, Skovl, V-plov, Dozerblad and Saltspreder
 * appear when their corresponding selection is active.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import ProductImageViewer from './ProductImageViewer';
import HotspotDetailModal from './HotspotDetailModal';

import {
  TIMAN_2620_BASE_OPTIONS,
  TIMAN_2620_EQUIPMENT_OPTIONS,
  TIMAN_2620_IMAGES,
  deriveTiman2620ImageKey,
  getTiman2620EquipmentAfterToggle,
  getTiman2620NearestValidEquipment,
  isTiman2620EquipmentSelectable,
  type Timan2620Base,
  type Timan2620Equipment,
} from '@/data/timan2620Viewer';
import type { ViewerConfiguration, ViewerHotspot } from './types';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import vPlowDetailAsset from '@/assets/v-plov.png.asset.json';
import fodpedalDetailAsset from '@/assets/fodpedal.png.asset.json';
import kabineDetailAsset from '@/assets/kabine-detalje.png.asset.json';

const EQUIPMENT_LABEL_KEY: Record<Timan2620Equipment, string> = {
  bucket: 'm2620i_bucket_name',
  v_plow: 'm2620i_vplow_name',
  dozer_blade: 'm2620i_dozer_name',
  salt_spreader: 'm2620i_salt_name',
};

const BASE_LABEL_KEY: Record<Timan2620Base, string> = {
  standard: 'm2620_base_standard',
  cab: 'm2620_base_cab',
};

const SUSPENSION_DETAIL_IMAGE = '/images/timan-2620/fjeder.png';
const DOZER_BLADE_DETAIL_IMAGE = '/images/timan-2620/redskaber/dozer-blad.png';
const SALT_SPREADER_DETAIL_IMAGE = '/images/timan-2620/redskaber/ds-250.png';
const SHOVEL_DETAIL_IMAGE = '/images/timan-2620/redskaber/skovl.png';
const V_PLOW_DETAIL_IMAGE = vPlowDetailAsset.url;
const FODPEDAL_DETAIL_IMAGE = fodpedalDetailAsset.url;
const KABINE_DETAIL_IMAGE = kabineDetailAsset.url;
/** Display-only zoom for the four equipment detail images (Skovl, V-plov, Dozerblad, Saltspreder). */
const EQUIPMENT_DETAIL_IMAGE_SCALE = 1.18;

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
  | 'bucket'
  | 'v_plow'
  | 'dozer_blade'
  | 'salt_spreader'
  | 'fodpedal';

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
      description: t('m2620_motor_desc', lang),
      bullets: [
        t('m2620_motor_b1', lang),
        t('m2620_motor_b2', lang),
        t('m2620_motor_b3', lang),
      ],
      technical: [
        { label: t('m2620_spec_engine', lang), value: 'Perkins 403J-11' },
        { label: t('m2620_spec_power', lang), value: t('m2620_specv_power', lang) },
        { label: t('m2620_spec_cylinders', lang), value: '3' },
        { label: t('m2620_spec_fueltank', lang), value: t('m2620_specv_fueltank', lang) },
        { label: t('m2620_spec_topspeed', lang), value: t('m2620_specv_topspeed', lang) },
        { label: t('m2620_spec_eustandard', lang), value: 'Stage V' },
        { label: t('m2620_spec_transmission', lang), value: t('m2620_specv_transmission', lang) },
        { label: t('m2620_spec_brakes', lang), value: t('m2620_specv_brakes', lang) },
      ],
      technicalSplitAt: 4,

    },

    kabine: {
      title: t('m2620_hot_kabine_title', lang),
      subtitle: t('m2620_hot_kabine_sub', lang),
      description: t('m2620_cab_desc', lang),
      imageUrl: KABINE_DETAIL_IMAGE,
      bullets: [
        t('m2620_cab_b1', lang),
        t('m2620_cab_b2', lang),
        t('m2620_cab_b3', lang),
      ],
    },
    affjedring: {
      title: t('m2620_hot_affjedring_title', lang),
      subtitle: t('m2620_hot_affjedring_sub', lang),
      description: t('m2620_susp_desc', lang),
      bullets: [
        t('m2620_susp_b1', lang),
        t('m2620_susp_b2', lang),
        t('m2620_susp_b3', lang),
      ],
      imageUrl: SUSPENSION_DETAIL_IMAGE,
    },
    v_plow: {
      title: t('m2620i_vplow_name', lang),
      subtitle: t('m2620i_sub_winter_tool', lang),
      description: t('m2620i_vplow_desc', lang),
      bullets: [t('m2620i_vplow_b1', lang), t('m2620i_vplow_b2', lang), t('m2620i_vplow_b3', lang)],
      imageUrl: V_PLOW_DETAIL_IMAGE,
      imageScale: EQUIPMENT_DETAIL_IMAGE_SCALE,
    },
    salt_spreader: {
      title: t('m2620i_salt_name', lang),
      subtitle: t('m2620i_sub_winter_equip', lang),
      description: t('m2620i_salt_desc', lang),
      bullets: [t('m2620i_salt_b1', lang), t('m2620i_salt_b2', lang), t('m2620i_salt_b3', lang)],
      extraTitle: t('m2620_extra_badge', lang),
      extraSplitAt: 3,
      extra: [
        { label: t('m2620i_salt_x1_label', lang), value: t('m2620i_salt_x1_value', lang) },
        { label: t('m2620i_salt_x2_label', lang), value: t('m2620i_salt_x2_value', lang) },
        { label: t('m2620i_salt_x3_label', lang), value: t('m2620i_salt_x3_value', lang) },
      ],
      imageUrl: SALT_SPREADER_DETAIL_IMAGE,
      imageScale: EQUIPMENT_DETAIL_IMAGE_SCALE,
    },
    bucket: {
      title: t('m2620i_bucket_name', lang),
      subtitle: t('m2620i_sub_front', lang),
      description: t('m2620i_bucket_desc', lang),
      bullets: [t('m2620i_bucket_b1', lang), t('m2620i_bucket_b2', lang), t('m2620i_bucket_b3', lang)],
      imageUrl: SHOVEL_DETAIL_IMAGE,
      imageScale: EQUIPMENT_DETAIL_IMAGE_SCALE,
    },
    dozer_blade: {
      title: t('m2620i_dozer_name', lang),
      subtitle: t('m2620i_sub_front', lang),
      description: t('m2620i_dozer_desc', lang),
      bullets: [t('m2620i_dozer_b1', lang), t('m2620i_dozer_b2', lang), t('m2620i_dozer_b3', lang)],
      imageUrl: DOZER_BLADE_DETAIL_IMAGE,
      imageScale: EQUIPMENT_DETAIL_IMAGE_SCALE,
    },
    fodpedal: {
      title: t('m2620i_fodpedal_name', lang),
      subtitle: t('m2620i_sub_operation', lang),
      description: t('m2620i_fodpedal_desc', lang),
      bullets: [t('m2620i_fodpedal_b1', lang), t('m2620i_fodpedal_b2', lang), t('m2620i_fodpedal_b3', lang)],
      imageUrl: FODPEDAL_DETAIL_IMAGE,
    },
  };
}

/**
 * Per-view part positions. Coordinates are in percent of the rendered
 * image box (0..100). `anchor` sits on the machine part; `callout`
 * orbits around the silhouette so the card never overlaps the machine.
 *
 * Camera orientation per image (left = west side of frame):
 *   standard / cab / *_salt_spreader / *_salt_spreader_v_plow (frame 1)
 *     → machine faces LEFT (front = left, rear = right)
 *   rear frames
 *     → machine faces RIGHT (front = right, rear = left)
 */
// ONE global Affjedring bubble position, shared by every configuration and
// BOTH image views (front 1/2 and rear 2/2). Only the green target (anchor)
// may differ per image; the bubble must never jump when switching frames.
const AFFJEDRING_CALLOUT = { cx: 50, cy: 95 } as const;

const affjedring = (anchor: { x: number; y: number }, frame?: number): PosEntry => ({
  anchor,
  callout: { ...AFFJEDRING_CALLOUT },
  ...(frame ? { frame } : {}),
});

// Shared REAR (page 2/2) target: chassis/suspension between the wheels,
// just behind the front mudguard — above the tyre, never on the rim.
const AFFJEDRING_REAR: PosEntry = affjedring({ x: 57, y: 70 }, 2);


const STANDARD_AFFJEDRING: PosEntry[] = [
  affjedring({ x: 62, y: 79 }, 1),
  AFFJEDRING_REAR,
];


// Approved Standard Motor placement (from Standard + Saltspreder).
const STANDARD_MOTOR: PosEntry = {
  anchor: { x: 67, y: 62 },
  callout: { cx: 90, cy: 82 },
};

// Approved Cabin Motor placement (source of truth:
// Kabine + Dozerblad + Saltspreder). Reused by all cabin views below.
const CAB_MOTOR: PosEntry[] = [
  { anchor: { x: 67, y: 62 }, callout: { cx: 91, cy: 82 }, frame: 1 },
  // frame 2 (rear view): target sits on the red rear body panel, just
  // left of the "TIMAN 2620" badge. Bubble position unchanged.
  { anchor: { x: 35, y: 70 }, callout: { cx: 22, cy: 94 }, frame: 2 },

];


// Shared Saltspreder placement for all Standard saltspreder views, so
// Standard + Saltspreder and Standard + Dozerblad + Saltspreder match.
const STANDARD_SALT_SPREADER: PosEntry = {
  anchor: { x: 65, y: 42 },
  callout: { cx: 90, cy: 22 },
};

// Shared Saltspreder placement for rear views (page 2/2). Source of truth is
// Kabine + Dozerblad + Saltspreder: bubble on the LEFT, target nudged forward
// onto the grey DS-250 spreader body.
// Shared Affjedring REAR target (page 2/2, all configurations): chassis /
// suspension area between the wheels, just behind the front mudguard —
// above the tyre, never on the rim. Bubble uses the global position.



const SALT_SPREADER_REAR: PosEntry = {
  anchor: { x: 26, y: 44 },
  callout: { cx: 4, cy: 18 },
  frame: 2,
};


// Shared Dozerblad bubble placement (front views). Moved inward/up so it
// no longer collides with the left image-navigation arrow. Green target
// (anchor) stays on the blade.
const DOZER_BLADE_FRONT: PosEntry = {
  anchor: { x: 25, y: 62 },
  callout: { cx: 16, cy: 41 },
};

// Shared layout for the Standard + dozerblad views (with or without
// saltspreder) so both configurations stay perfectly synchronized.
// Fodpedal (rear view, page 2/2 only) — bubble in the open area above/right
// of the machine, target on the footwell/pedal area in front of the seat.
const FODPEDAL_REAR: PosEntry = {
  anchor: { x: 62, y: 60 },
  callout: { cx: 82, cy: 16 },
  frame: 2,
};

// Fodpedal (front view, page 1/2) — bubble in the open sky area above/left of
// the machine, target on the physical footwell/pedal in front of the steering
// column.
const FODPEDAL_FRONT: PosEntry = {
  anchor: { x: 36, y: 62 },
  callout: { cx: 32, cy: 27 },
  frame: 1,
};

const STANDARD_FODPEDAL: PosEntry[] = [FODPEDAL_FRONT, FODPEDAL_REAR];

const CAB_FRONT_MOTOR: PosEntry = {
  anchor: { x: 67, y: 62 },
  callout: { cx: 91, cy: 82 },
  frame: 1,
};

const STANDARD_FRONT_BLADE_LAYOUT: Partial<Record<PartId, PosEntry | PosEntry[]>> = {
  dozer_blade: DOZER_BLADE_FRONT,
  fodpedal:   STANDARD_FODPEDAL,
  motor:      { anchor: { x: 67, y: 62 }, callout: { cx: 90, cy: 82 } },
  affjedring: STANDARD_AFFJEDRING,
};

const VIEW_POSITIONS: Record<string, Partial<Record<PartId, PosEntry | PosEntry[]>>> = {
  // Bare machines — front faces LEFT
  standard: {
    // Frame 1 keeps the approved Standard placement; frame 2 (rear view)
    // reuses the approved Kabine + Dozerblad + Saltspreder rear Motor spot.
    motor:      [
      { ...STANDARD_MOTOR, frame: 1 },
      { ...CAB_MOTOR[1] },
    ],
    fodpedal:   STANDARD_FODPEDAL,
    affjedring: STANDARD_AFFJEDRING,
  },


  cab: {
    motor:      CAB_MOTOR,
    kabine: [
      // frame 1: target moved rearward onto the cabin structure so the
      // connector no longer reads as pointing at the mirror arm.
      { anchor: { x: 53, y: 33 }, callout: { cx: 78, cy: 12 }, frame: 1 },
      { anchor: { x: 45, y: 30 }, callout: { cx: 78, cy: 12 }, frame: 2 },
    ],
    affjedring: [
      affjedring({ x: 56, y: 72 }, 1),
      AFFJEDRING_REAR,
    ],
  },

  // Kabine + skovl — full annotation set, reusing the approved cabin
  // placements (Kabine, Motor, Affjedring) and the approved Skovl spot.
  cab_bucket: {
    motor: CAB_MOTOR,
    kabine: [
      { anchor: { x: 53, y: 33 }, callout: { cx: 78, cy: 12 }, frame: 1 },
      { anchor: { x: 50, y: 30 }, callout: { cx: 50, cy: 6  }, frame: 2 },
    ],
    affjedring: [
      affjedring({ x: 56, y: 72 }, 1),
      AFFJEDRING_REAR,
    ],
    bucket: [
      { anchor: { x: 25, y: 62 }, callout: { cx: 8,  cy: 45 }, frame: 1 },
      { anchor: { x: 80, y: 68 }, callout: { cx: 96, cy: 82 }, frame: 2 },
    ],
  },


  // Saltspreder only — saltspreder bin dominates right side
  standard_salt_spreader: {
    motor: [
      { ...STANDARD_MOTOR, frame: 1 },
      { anchor: { x: 39, y: 66 }, callout: { cx: 30, cy: 89 }, frame: 2 },
    ],
    affjedring:    STANDARD_AFFJEDRING,
    salt_spreader: [{ ...STANDARD_SALT_SPREADER, frame: 1 }, SALT_SPREADER_REAR],
    fodpedal:      STANDARD_FODPEDAL,
  },
  cab_salt_spreader: {
    motor: [
      { anchor: { x: 67, y: 62 }, callout: { cx: 91, cy: 82 }, frame: 1 },
      { anchor: { x: 39, y: 66 }, callout: { cx: 30, cy: 89 }, frame: 2 },
    ],
    kabine: [
      { anchor: { x: 38, y: 30 }, callout: { cx: 12, cy: 12 }, frame: 1 },
      { anchor: { x: 44, y: 27 }, callout: { cx: 18, cy: 12 }, frame: 2 },
    ],
    affjedring:    [
      affjedring({ x: 61, y: 68 }, 1),
      AFFJEDRING_REAR,
    ],
    salt_spreader: [
      { anchor: { x: 65, y: 42 }, callout: { cx: 90, cy: 22 }, frame: 1 },
      SALT_SPREADER_REAR,
    ],
  },

  // Standard + skovl.
  standard_bucket: {
    bucket:     { anchor: { x: 25, y: 62 }, callout: { cx: 8,  cy: 45 } },
    fodpedal:   STANDARD_FODPEDAL,
    motor:      { anchor: { x: 67, y: 62 }, callout: { cx: 90, cy: 82 } },
    affjedring: STANDARD_AFFJEDRING,
  },

  standard_dozer_blade: { ...STANDARD_FRONT_BLADE_LAYOUT },

  standard_v_plow: {
    v_plow:     { anchor: { x: 25, y: 62 }, callout: { cx: 14, cy: 54 } },
    fodpedal:   STANDARD_FODPEDAL,
    motor:      STANDARD_MOTOR,
    affjedring: STANDARD_AFFJEDRING,
  },

  cab_v_plow: {
    v_plow:     { anchor: { x: 24, y: 62 }, callout: { cx: 12, cy: 52 }, frame: 1 },
    kabine:     { anchor: { x: 48, y: 30 }, callout: { cx: 72, cy: 12 }, frame: 1 },
    motor:      CAB_FRONT_MOTOR,
    affjedring: affjedring({ x: 56, y: 72 }, 1),
  },

  cab_dozer_blade: {
    dozer_blade: { ...DOZER_BLADE_FRONT, frame: 1 },
    kabine:      { anchor: { x: 48, y: 30 }, callout: { cx: 72, cy: 12 }, frame: 1 },
    motor:       CAB_FRONT_MOTOR,
    affjedring:  affjedring({ x: 56, y: 72 }, 1),
  },

  // Standard + dozerblad + saltspreder.
  standard_salt_spreader_dozer_blade: {
    ...STANDARD_FRONT_BLADE_LAYOUT,
    salt_spreader: STANDARD_SALT_SPREADER,
  },

  // Cab + saltspreder + V-plov — 2 frames (rotation)
  //   frame 1 (IMG 6): front/side — v-plov LEFT, cab centre, saltspreder RIGHT
  //   frame 2 (IMG 8): rear/mirrored — v-plov RIGHT, cab upper-right;
  //                    saltspreder hidden to avoid overlap & confusion
  cab_salt_spreader_v_plow: {
    // Frame 2 (IMG 8) is the rear/mirrored view:
    //   dozer blade → RIGHT, cab → centre, engine/rear body → LEFT.
    // Every frame-2 entry uses its own anchor + callout so the bubble
    // sits in empty background and the connector never crosses the body.
    v_plow: [
      { anchor: { x: 25, y: 62 }, callout: { cx: 14, cy: 54 }, frame: 1 },
      // frame 2: anchor on the dozer blade (right-front), bubble in the
      // lower-right corner — short diagonal through empty background.
      { anchor: { x: 80, y: 68 }, callout: { cx: 96, cy: 82 }, frame: 2 },
    ],
    motor: CAB_MOTOR,

    kabine: [
      { anchor: { x: 48, y: 30 }, callout: { cx: 63, cy: 10 }, frame: 1 },
      // frame 2: anchor on the cab roof, bubble straight up — clean
      // vertical connector, no roof or body crossing.
      { anchor: { x: 50, y: 30 }, callout: { cx: 50, cy: 6  }, frame: 2 },
    ],
    affjedring: [
      affjedring({ x: 61, y: 68 }, 1),
      // frame 2: anchor on the front wheel / front-axle suspension,
      // bubble in the lower-right area beneath the machine.
      AFFJEDRING_REAR,
    ],
    salt_spreader: [
      { anchor: { x: 68, y: 42 }, callout: { cx: 92, cy: 22 }, frame: 1 },
      // frame 2: anchor on the DS-250 spreader (rear of machine = LEFT
      // side in this mirrored view), bubble pushed up to the top-left
      // corner — connector stays in empty sky, never crosses the body.
      { anchor: { x: 22, y: 40 }, callout: { cx: 4,  cy: 18 }, frame: 2 },
    ],
  },

  // Cab + saltspreder + dozerblad — 2 frames (rotation)
  cab_salt_spreader_dozer_blade: {
    dozer_blade: [
      { ...DOZER_BLADE_FRONT, frame: 1 },
      { anchor: { x: 80, y: 68 }, callout: { cx: 96, cy: 82 }, frame: 2 },
    ],
    motor: CAB_MOTOR,

    kabine: [
      { anchor: { x: 48, y: 30 }, callout: { cx: 78, cy: 10 }, frame: 1 },
      { anchor: { x: 50, y: 30 }, callout: { cx: 50, cy: 6  }, frame: 2 },
    ],
    affjedring: [
      affjedring({ x: 61, y: 68 }, 1),
      AFFJEDRING_REAR,
    ],
    salt_spreader: [
      { anchor: { x: 68, y: 42 }, callout: { cx: 92, cy: 22 }, frame: 1 },
      SALT_SPREADER_REAR,
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
  if (equipment.has('bucket')) visibleParts.add('bucket');
  if (equipment.has('v_plow')) visibleParts.add('v_plow');
  if (equipment.has('dozer_blade')) visibleParts.add('dozer_blade');
  if (equipment.has('salt_spreader')) visibleParts.add('salt_spreader');
  // Fodpedal is only shown on standard/open versions.
  if (imageKey.startsWith('standard')) {
    visibleParts.add('fodpedal');
  }

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

  const imageKey = useMemo(() => deriveTiman2620ImageKey(base, equipment), [base, equipment]);
  const entry = TIMAN_2620_IMAGES[imageKey] ?? { imageSequence: [], hotspots: [] };
  const hotspots = useMemo(
    () => buildHotspots(imageKey, base, equipment, uiLanguage),
    [imageKey, base, equipment, uiLanguage],
  );

  function setBaseSafely(nextBase: Timan2620Base) {
    setBase(nextBase);
    setEquipment((current) => getTiman2620NearestValidEquipment(nextBase, current));
  }

  function toggleEquipment(eq: Timan2620Equipment) {
    const next = getTiman2620EquipmentAfterToggle(base, equipment, eq);
    if (!next) return;
    setEquipment(next);
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
    base, setBase: setBaseSafely,
    equipment, toggleEquipment,
    imageKey, configuration,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------- Subcomponents ------------------------- */

/** Attachments that can open an existing technical detail modal. */
const REDSKAB_LINKS: { part: PartId; labelKey: string }[] = [
  { part: 'bucket', labelKey: 'm2620i_bucket_name' },
  { part: 'v_plow', labelKey: 'm2620i_vplow_name' },
  { part: 'dozer_blade', labelKey: 'm2620i_dozer_name' },
  { part: 'salt_spreader', labelKey: 'm2620i_salt_name' },
];

/** Not available yet — shown as muted, struck-through, non-interactive text. */
const REDSKAB_COMING_SOON: { labelKey: string; gapBefore?: boolean }[] = [
  { labelKey: 'm2620i_soon_rotorklipper' },
  { labelKey: 'm2620i_soon_multiklipper' },
  { labelKey: 'm2620i_soon_skivehoester' },
  { labelKey: 'm2620i_soon_graesopsamler' },
  { labelKey: 'm2620i_soon_sugetank', gapBefore: true },
  { labelKey: 'm2620i_soon_ukrudtsboerste' },
  { labelKey: 'm2620i_soon_svingbarkost' },
];

/** Machine components shown in the Udstyrsinformation browser. */
const UDSTYR_LINKS: { part: PartId; labelKey: string }[] = [
  { part: 'fodpedal', labelKey: 'm2620i_fodpedal_name' },
  { part: 'affjedring', labelKey: 'm2620_hot_affjedring_title' },
  { part: 'motor', labelKey: 'm2620_hot_motor_title' },
  { part: 'kabine', labelKey: 'm2620_hot_kabine_title' },
];

/** Not available yet — same muted, struck-through treatment as REDSKAB_COMING_SOON. */
const UDSTYR_COMING_SOON: { labelKey: string; gapBefore?: boolean }[] = [
  { labelKey: 'm2620i_uso_comfortseat' },
  { labelKey: 'm2620i_uso_deluxeseat' },
  { labelKey: 'm2620i_uso_cruise' },
  { labelKey: 'm2620i_uso_biooil' },
  { labelKey: 'm2620i_uso_monitor' },
  { labelKey: 'm2620i_uso_camera_nozzle' },
  { labelKey: 'm2620i_uso_rearcam' },
  { labelKey: 'm2620i_uso_reversealarm' },
  { labelKey: 'm2620i_uso_towhitch' },
  { labelKey: 'm2620i_uso_rearlift' },
  { labelKey: 'm2620i_uso_holder' },
  { labelKey: 'm2620i_uso_mudflaps' },
  { labelKey: 'm2620i_uso_underseal' },
  { labelKey: 'm2620i_uso_cab', gapBefore: true },
  { labelKey: 'm2620i_uso_ac' },
  { labelKey: 'm2620i_uso_radio' },
  { labelKey: 'm2620i_uso_sunshade' },
  { labelKey: 'm2620i_uso_heatedmirrors' },
  { labelKey: 'm2620i_uso_worklights_front' },
  { labelKey: 'm2620i_uso_worklights_rear' },
  { labelKey: 'm2620i_uso_beacon' },
  { labelKey: 'm2620i_uso_strobes' },
  { labelKey: 'm2620i_uso_slidingwindows' },
  { labelKey: 'm2620i_uso_extinguisher' },
  { labelKey: 'm2620i_uso_plateholder' },
];

type InfoBrowser = 'redskab' | 'udstyr';

function Sidebar() {
  const { base, setBase, equipment, toggleEquipment } = useTiman2620();
  const { uiLanguage } = useLanguage();
  const [infoBrowser, setInfoBrowser] = useState<InfoBrowser | null>(null);
  const [infoPart, setInfoPart] = useState<PartId | null>(null);
  const partContent = useMemo(() => buildPartContent(uiLanguage), [uiLanguage]);
  const baseLabel = t('m2620_basismaskine', uiLanguage);

  const equipmentLabel = t('m2620_udstyr', uiLanguage);
  // Fixed width with wrapping for longer translated labels.
  const pillClass =
    'w-[170px] px-4 py-1.5 rounded-full text-sm font-semibold leading-tight border transition text-center whitespace-normal break-words';
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
            const selectable = active || isTiman2620EquipmentSelectable(base, equipment, o.key);
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={active}
                aria-disabled={!selectable}
                disabled={!selectable}
                onClick={() => toggleEquipment(o.key)}
                className={`${pillClass} ${
                  active
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : !selectable
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                }`}
              >
                {t(EQUIPMENT_LABEL_KEY[o.key], uiLanguage)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {t('m2620i_information', uiLanguage)}
        </div>
        <div className="flex flex-col items-start gap-4">
          <button
            type="button"
            onClick={() => {
              setInfoBrowser('redskab');
              setInfoPart('bucket');
            }}
            className={`${pillClass} bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700`}
          >
            {t('m2620i_redskab_title', uiLanguage)}
          </button>
          <button
            type="button"
            onClick={() => {
              setInfoBrowser('udstyr');
              setInfoPart('fodpedal');
            }}
            className={`${pillClass} bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700`}
          >
            {t('m2620i_udstyr_title', uiLanguage)}
          </button>
        </div>
      </section>

      <HotspotDetailModal
        hotspot={
          infoBrowser && infoPart
            ? {
                ...partContent[infoPart],
                id: `${infoBrowser}-${infoPart}`,
                frame: 0,
                x: 0,
                y: 0,
                variant: 'callout',
              }
            : null
        }
        imageZoom={infoBrowser === 'udstyr' ? 0.92 : undefined}
        sizeVariant={infoBrowser === 'udstyr' ? 'compact' : 'default'}
        onClose={() => {
          setInfoBrowser(null);
          setInfoPart(null);
        }}
        nav={{
          title: t(infoBrowser === 'udstyr' ? 'm2620i_udstyr_title' : 'm2620i_redskab_title', uiLanguage),
          items: (infoBrowser === 'udstyr' ? UDSTYR_LINKS : REDSKAB_LINKS).map(i => ({
            id: i.part,
            label: t(i.labelKey, uiLanguage),
          })),
          activeId: infoPart ?? 'bucket',
          onSelect: id => setInfoPart(id as PartId),
          comingSoon: (infoBrowser === 'udstyr' ? UDSTYR_COMING_SOON : REDSKAB_COMING_SOON).map(i => ({
            label: t(i.labelKey, uiLanguage),
            gapBefore: i.gapBefore,
          })),
        }}
      />

    </aside>
  );
}


function Stage({ disableZoom = false, largeArrows = false }: { disableZoom?: boolean; largeArrows?: boolean } = {}) {
  const { configuration } = useTiman2620();

  return (
    <div>
      <ProductImageViewer
        configuration={configuration}
        stageOverlayClassName="bg-[linear-gradient(115deg,rgba(255,255,255,0)_0%,rgba(248,250,252,0.08)_34%,rgba(226,232,240,0.28)_68%,rgba(203,213,225,0.46)_100%)]"
        hideControls
        disableZoom={disableZoom}
        largeArrows={largeArrows}
      />
    </div>
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
