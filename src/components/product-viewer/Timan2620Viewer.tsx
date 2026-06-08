/**
 * Timan2620Viewer — base machine + equipment configurator wrapping
 * ProductImageViewer for the Timan 2620.
 *
 * UI sections:
 *   1. Basismaskine — single-select (Standard | Kabine)
 *   2. Udstyr       — multi-select (V-plov, Saltspreder, Kost)
 *      · Kost cannot be combined with V-plov. Selecting Kost while V-plov is
 *        active opens a confirm dialog offering to replace V-plov with Kost.
 *   3. Active badges — current equipment chips, with an automatic
 *      "Fuldt vintersæt" badge when V-plov + Saltspreder are both selected.
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
import type { ViewerConfiguration } from './types';

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

export default function Timan2620Viewer() {
  const [base, setBase] = useState<Timan2620Base>('standard');
  const [equipment, setEquipment] = useState<Set<Timan2620Equipment>>(() => new Set());
  const [conflict, setConflict] = useState<{
    candidate: Timan2620Equipment;
    conflictsWith: Timan2620Equipment;
  } | null>(null);

  const imageKey = useMemo(() => deriveTiman2620ImageKey(base, equipment), [base, equipment]);
  const entry = TIMAN_2620_IMAGES[imageKey] ?? { imageSequence: [], hotspots: [] };

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
    hotspots: entry.hotspots,
    enabled: true,
  };

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-5">
        {/* Left control panel */}
        <aside className="w-full lg:w-[260px] xl:w-[280px] lg:flex-shrink-0 lg:sticky lg:top-4 lg:bg-white lg:rounded-lg lg:border lg:border-slate-200 lg:shadow-sm lg:p-3 lg:self-start">
          {/* Section 1 — Base machine */}
          <section className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 leading-tight">
              Basismaskine
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5" role="radiogroup" aria-label="Basismaskine">
              {TIMAN_2620_BASE_OPTIONS.map(o => {
                const active = base === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setBase(o.key)}
                    className={`w-full px-2.5 py-[6px] rounded-lg text-sm font-semibold border text-left transition ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow ring-2 ring-emerald-700/20'
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
          <section className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 leading-tight">
              Udstyr
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5" role="group" aria-label="Udstyr">
              {TIMAN_2620_EQUIPMENT_OPTIONS.map(o => {
                const active = equipment.has(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleEquipment(o.key)}
                    className={`w-full px-2.5 py-[6px] rounded-lg text-sm font-semibold border text-left transition ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow ring-2 ring-emerald-700/20'
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
          <ProductImageViewer key={imageKey} configuration={configuration} />
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
