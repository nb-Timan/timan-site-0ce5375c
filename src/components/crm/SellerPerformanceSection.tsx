/**
 * Sælger Performance — admin-only seller overview.
 *
 * For each seller (derived from CrmActivity.assigned_owner_name / created_by_name),
 * shows for the active time filter:
 *   1. Lukkede ordrer  — count + value (won)
 *   2. Aktive tilbud   — count + value (open quote-stage)
 *   3. Forrige måned   — closed-order value last month + arrow vs month-before
 *   4. Næste måned forecast — expected open deals & value
 *
 * Time filters: Denne måned · Sidste måned · I år (default) · Næste måned forecast.
 */

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Crown, Trophy, Users } from 'lucide-react';
import { CrmActivity } from '@/lib/crmActivitiesService';
import { Language } from '@/types/configurator';

const COL_WINRATE: Record<Language, string> = {
  da: 'Win rate', en: 'Win rate', de: 'Win-Rate', it: 'Win rate', hu: 'Win rate',
};
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
}
function avatarGradient(name: string): string {
  // Stable per-name gradient
  const palette = [
    'from-emerald-500 to-emerald-700',
    'from-sky-500 to-indigo-600',
    'from-violet-500 to-fuchsia-600',
    'from-amber-500 to-rose-500',
    'from-teal-500 to-cyan-600',
    'from-rose-500 to-pink-600',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

type Filter = 'this_month' | 'last_month' | 'ytd' | 'forecast';

const T: Record<string, Record<Language, string>> = {
  title:        { da: 'Sælger Performance',     en: 'Seller performance',     de: 'Verkäufer-Performance', it: 'Performance venditori', hu: 'Értékesítői teljesítmény' },
  this_month:   { da: 'Denne måned',            en: 'This month',             de: 'Dieser Monat',          it: 'Questo mese',           hu: 'Ez a hónap' },
  last_month:   { da: 'Sidste måned',           en: 'Last month',             de: 'Letzter Monat',         it: 'Mese scorso',           hu: 'Múlt hónap' },
  ytd:          { da: 'I år',                   en: 'YTD',                    de: 'YTD',                   it: "Quest'anno",            hu: 'Idén' },
  forecast:     { da: 'Næste måned forecast',   en: 'Next month forecast',    de: 'Nächster Monat (Prognose)', it: 'Prossimo mese (previsione)', hu: 'Jövő havi előrejelzés' },

  col_seller:   { da: 'Sælger',                 en: 'Seller',                 de: 'Verkäufer',             it: 'Venditore',             hu: 'Értékesítő' },
  col_closed:   { da: 'Lukkede ordrer',         en: 'Closed orders',          de: 'Geschlossene Aufträge', it: 'Ordini chiusi',         hu: 'Lezárt rendelések' },
  col_active:   { da: 'Aktive tilbud',          en: 'Active quotes',          de: 'Aktive Angebote',       it: 'Preventivi attivi',     hu: 'Aktív árajánlatok' },
  col_prev:     { da: 'Forrige måned',          en: 'Previous month',         de: 'Vormonat',              it: 'Mese precedente',       hu: 'Előző hónap' },
  col_forecast: { da: 'Næste måned',            en: 'Next month',             de: 'Nächster Monat',        it: 'Prossimo mese',         hu: 'Jövő hónap' },

  stk:          { da: 'stk',                    en: 'pcs',                    de: 'St.',                   it: 'pz',                    hu: 'db' },
  empty:        { da: 'Ingen sælgerdata endnu.', en: 'No seller data yet.',   de: 'Noch keine Daten.',     it: 'Nessun dato.',          hu: 'Még nincs adat.' },
};

interface Props {
  activities: CrmActivity[];
  language: Language;
}

interface SellerRow {
  name: string;
  closedCount: number;
  closedValue: number;
  activeCount: number;
  activeValue: number;
  prevValue: number;
  prevPctChange: number;
  forecastCount: number;
  forecastValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
}

function fmtKr(n: number): string {
  return `${Math.round(n).toLocaleString('da-DK')} kr.`;
}

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfYear(d: Date): Date { return new Date(d.getFullYear(), 0, 1); }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

/** Rough quote-stage detection (mirrors dashboard pipeline classification). */
function isOpenQuote(a: CrmActivity): boolean {
  return a.activity_type === 'quote_created'
      || a.activity_type === 'quote_revised'
      || a.activity_type === 'quote_sent'
      || a.activity_type === 'order_created';
}
function isWon(a: CrmActivity): boolean {
  return a.activity_type === 'order_sent' && (a.status || '').toLowerCase() !== 'lost';
}

function buildRows(activities: CrmActivity[], filter: Filter): SellerRow[] {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const monthBeforeStart = addMonths(monthStart, -2);
  const yearStart = startOfYear(now);
  const nextMonthStart = addMonths(monthStart, 1);
  const nextMonthEnd = addMonths(monthStart, 2);

  let scopeFrom: Date;
  let scopeTo: Date;
  switch (filter) {
    case 'this_month': scopeFrom = monthStart;     scopeTo = now; break;
    case 'last_month': scopeFrom = lastMonthStart; scopeTo = monthStart; break;
    case 'forecast':   scopeFrom = yearStart;      scopeTo = now; break; // closed/active still YTD; forecast box is the highlight
    case 'ytd':
    default:           scopeFrom = yearStart;      scopeTo = now; break;
  }

  const sellers = new Map<string, SellerRow>();
  const ensure = (name: string): SellerRow => {
    let r = sellers.get(name);
    if (!r) {
      r = {
        name,
        closedCount: 0, closedValue: 0,
        activeCount: 0, activeValue: 0,
        prevValue: 0, prevPctChange: 0,
        forecastCount: 0, forecastValue: 0,
        wonCount: 0, lostCount: 0, winRate: 0,
      };
      sellers.set(name, r);
    }
    return r;
  };

  // Per-seller two-month-back closed values (for prevPctChange arrow)
  const monthBeforeClosed = new Map<string, number>();

  for (const a of activities) {
    const name = a.assigned_owner_name || a.created_by_name;
    if (!name) continue;
    const row = ensure(name);
    const date = new Date(a.activity_date);

    // ── Closed orders (in scope) ─────────────────────────
    if (isWon(a) && date >= scopeFrom && date <= scopeTo) {
      row.closedCount += 1;
      row.closedValue += a.value || 0;
    }

    // ── Active quotes (always "as of now", not date-bound) ───
    if (isOpenQuote(a)) {
      row.activeCount += 1;
      row.activeValue += a.value || 0;
    }

    // ── Last month closed (always last calendar month) ───
    if (isWon(a) && date >= lastMonthStart && date < monthStart) {
      row.prevValue += a.value || 0;
    }

    // ── Two-months-back closed for arrow ─────────────────
    if (isWon(a) && date >= monthBeforeStart && date < lastMonthStart) {
      monthBeforeClosed.set(name, (monthBeforeClosed.get(name) || 0) + (a.value || 0));
    }

    // ── Win rate (overall, in scope) ─────────────────────
    if (date >= scopeFrom && date <= scopeTo) {
      if (isWon(a)) row.wonCount += 1;
      if (a.activity_type === 'order_sent' && (a.status || '').toLowerCase() === 'lost') row.lostCount += 1;
      if (a.activity_type === 'lead_rejected') row.lostCount += 1;
    }

    // ── Forecast: open quotes with expected_close_date next month ─────────
    if (isOpenQuote(a)) {
      const meta = (a.meta || {}) as Record<string, unknown>;
      const expected = meta.expected_close_date ? new Date(String(meta.expected_close_date)) : null;
      if (expected && expected >= nextMonthStart && expected < nextMonthEnd) {
        row.forecastCount += 1;
        row.forecastValue += a.value || 0;
      }
    }
  }

  for (const r of sellers.values()) {
    if (r.forecastCount === 0 && r.activeCount > 0) {
      r.forecastCount = Math.max(1, Math.round(r.activeCount * 0.5));
      r.forecastValue = Math.round(r.activeValue * 0.5);
    }
    const prevPrev = monthBeforeClosed.get(r.name) || 0;
    if (prevPrev === 0) {
      r.prevPctChange = r.prevValue > 0 ? 100 : 0;
    } else {
      r.prevPctChange = Math.round(((r.prevValue - prevPrev) / prevPrev) * 100);
    }
    const tot = r.wonCount + r.lostCount;
    r.winRate = tot === 0 ? 0 : Math.round((r.wonCount / tot) * 100);
  }

  return Array.from(sellers.values()).sort((a, b) => b.closedValue - a.closedValue);
}

function TrendArrow({ pct }: { pct: number }) {
  if (pct > 2) return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />;
  if (pct < -2) return <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />;
  return <ArrowRight className="h-3.5 w-3.5 text-gray-400" />;
}

export default function SellerPerformanceSection({ activities, language }: Props) {
  const [filter, setFilter] = useState<Filter>('ytd');
  const rows = useMemo(() => buildRows(activities, filter), [activities, filter]);
  const isForecastView = filter === 'forecast';

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'this_month', label: T.this_month[language] },
    { key: 'last_month', label: T.last_month[language] },
    { key: 'ytd',        label: T.ytd[language] },
    { key: 'forecast',   label: T.forecast[language] },
  ];

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2">
          <Users className="h-5 w-5" />{T.title[language]}
        </h2>
        <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                'px-3 py-1.5 rounded-md text-xs font-medium transition ' +
                (filter === f.key
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:text-gray-900')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{T.empty[language]}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">{T.col_seller[language]}</th>
                <th className="py-2 pr-4">{T.col_closed[language]}</th>
                <th className="py-2 pr-4">{T.col_active[language]}</th>
                <th className="py-2 pr-4">{T.col_prev[language]}</th>
                <th className="py-2 pr-4">{T.col_forecast[language]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.name} className={isForecastView ? 'bg-violet-50/30' : undefined}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{r.name}</td>

                  {/* Closed (green) */}
                  <td className="py-3 pr-4">
                    <div className="text-emerald-700 font-semibold">{fmtKr(r.closedValue)}</div>
                    <div className="text-xs text-gray-500">{r.closedCount} {T.stk[language]}</div>
                  </td>

                  {/* Active offers (blue) */}
                  <td className="py-3 pr-4">
                    <div className="text-sky-700 font-semibold">{fmtKr(r.activeValue)}</div>
                    <div className="text-xs text-gray-500">{r.activeCount} {T.stk[language]}</div>
                  </td>

                  {/* Previous month (muted + trend arrow) */}
                  <td className="py-3 pr-4">
                    <div className="text-gray-500 font-medium inline-flex items-center gap-1">
                      <TrendArrow pct={r.prevPctChange} />
                      {fmtKr(r.prevValue)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {r.prevPctChange > 0 ? '+' : ''}{r.prevPctChange}%
                    </div>
                  </td>

                  {/* Forecast (purple) */}
                  <td className="py-3 pr-4">
                    <div className="text-violet-700 font-semibold">{fmtKr(r.forecastValue)}</div>
                    <div className="text-xs text-gray-500">{r.forecastCount} {T.stk[language]}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
