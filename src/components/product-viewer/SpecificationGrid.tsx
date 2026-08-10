/**
 * SpecificationGrid — generic, data-driven technical specification layout.
 *
 * Used by the product viewer detail modal (Motor, Kabine, Hydraulik …) and
 * reusable for any future machine model (Timan 3200 / 3330 / 3400 …): just
 * pass a different `items` array — nothing is hardcoded here.
 *
 * Layout: two balanced columns (~40px gap) that collapse to a single column
 * on narrow screens. Each row is "Label ......... Value" with a subtle
 * divider — no HTML table.
 */
import type { ViewerHotspotTechnical } from './types';

export interface SpecificationGridProps {
  /** Section heading. Defaults to the Danish "Tekniske data". */
  title?: string;
  /** Flat list of label/value pairs, rendered in order down column 1, then 2. */
  items: ViewerHotspotTechnical[];
  /**
   * Number of rows placed in the left column.
   * Defaults to a balanced split (ceil(items / 2)).
   */
  splitAt?: number;
  /** Optional small label rendered next to the heading (e.g. "Tilvalg"). */
  badge?: string;
  /** Force the column count. Overrides the automatic layout. */
  columns?: 1 | 2;
  className?: string;
}

function SpecRow({ item }: { item: ViewerHotspotTechnical }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 py-2 last:border-b-0">
      <dt className="text-sm text-slate-500 leading-snug shrink-0">{item.label}</dt>
      <dd className="text-sm font-semibold text-slate-900 text-right leading-snug">
        {item.value}
      </dd>
    </div>
  );
}

export default function SpecificationGrid({
  title = 'Tekniske data',
  items,
  splitAt,
  badge,
  columns,
  className = '',
}: SpecificationGridProps) {
  if (!items || items.length === 0) return null;

  // Automatic layout: dense lists (6+) split into two columns, short lists
  // stay in one full-width column. An explicit `splitAt` always wins.
  const twoColumns =
    columns !== undefined
      ? columns === 2
      : splitAt !== undefined || items.length >= 6;
  const cut = twoColumns
    ? splitAt ?? Math.ceil(items.length / 2)
    : items.length;
  const left = items.slice(0, cut);
  const right = items.slice(cut);
  // A "two column" split that leaves the second column empty would squeeze the
  // single remaining column to half width and wrap text word-by-word.
  const renderTwoColumns = twoColumns && right.length > 0;

  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </span>
        {badge && (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 leading-none">
            {badge}
          </span>
        )}
      </div>
      <div
        className={`grid grid-cols-1 gap-x-10 gap-y-0 ${renderTwoColumns ? 'sm:grid-cols-2' : ''}`}
      >
        <dl className="min-w-0">
          {left.map((it, i) => (
            <SpecRow key={`l-${i}`} item={it} />
          ))}
        </dl>
        {right.length > 0 && (
          <dl className="min-w-0 sm:border-l sm:border-transparent">
            {right.map((it, i) => (
              <SpecRow key={`r-${i}`} item={it} />
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
