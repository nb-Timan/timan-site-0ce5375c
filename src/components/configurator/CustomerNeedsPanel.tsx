/**
 * CustomerNeedsPanel — Phase 5
 *
 * Compact, optional pre-questionnaire shown at the top of the
 * "Tilbud – valgmuligheder" modal. Lets the user answer up to 4 short
 * questions about the customer so the recommendation + benefits engines can
 * tailor their output. All answers are optional and can be skipped or
 * edited at any time.
 *
 * Design constraints:
 *  • No new dependencies — uses existing Tailwind tokens + button styling.
 *  • Does not alter pricing, ordering or save flow.
 *  • Localized via the customerNeeds label maps (DA/EN/DE/IT/HU).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/configurator";
import {
  CustomerNeeds,
  EMPTY_CUSTOMER_NEEDS,
  FOCUS_LABELS,
  FOCUS_OPTIONS,
  INDUSTRY_LABELS,
  INDUSTRY_OPTIONS,
  NEEDS_LABELS,
  NeedsFocus,
  NeedsIndustry,
  NeedsSeason,
  NeedsTask,
  SEASON_LABELS,
  SEASON_OPTIONS,
  TASK_LABELS,
  TASK_OPTIONS,
  isCustomerNeedsAnswered,
  pickNeedsLabel,
} from "@/lib/customerNeeds";

interface Props {
  value: CustomerNeeds | undefined;
  lang: Language;
  onChange: (next: CustomerNeeds) => void;
}

export default function CustomerNeedsPanel({ value, lang, onChange }: Props) {
  const needs = value ?? EMPTY_CUSTOMER_NEEDS;
  const answered = isCustomerNeedsAnswered(needs);
  const [expanded, setExpanded] = useState<boolean>(!answered);

  const setIndustry = (i: NeedsIndustry) =>
    onChange({ ...needs, industry: needs.industry === i ? undefined : i });
  const setSeason = (s: NeedsSeason) =>
    onChange({ ...needs, season: needs.season === s ? undefined : s });
  const toggleTask = (t: NeedsTask) => {
    const has = needs.tasks.includes(t);
    onChange({ ...needs, tasks: has ? needs.tasks.filter((x) => x !== t) : [...needs.tasks, t] });
  };
  const toggleFocus = (f: NeedsFocus) => {
    const has = needs.focus.includes(f);
    onChange({ ...needs, focus: has ? needs.focus.filter((x) => x !== f) : [...needs.focus, f] });
  };

  const summary = (() => {
    const parts: string[] = [];
    if (needs.industry) parts.push(pickNeedsLabel(INDUSTRY_LABELS[needs.industry], lang));
    if (needs.season) parts.push(pickNeedsLabel(SEASON_LABELS[needs.season], lang));
    if (needs.tasks.length) parts.push(needs.tasks.map((t) => pickNeedsLabel(TASK_LABELS[t], lang)).join(", "));
    if (needs.focus.length) parts.push(needs.focus.map((f) => pickNeedsLabel(FOCUS_LABELS[f], lang)).join(", "));
    return parts.join(" · ");
  })();

  if (!expanded) {
    return (
      <div className="border border-sky-200 rounded-lg p-3 bg-sky-50/60 flex items-center justify-between gap-3">
        <div className="text-xs text-sky-900">
          <div className="font-semibold mb-0.5">{pickNeedsLabel(NEEDS_LABELS.title, lang)}</div>
          <div className="text-sky-900/80">
            {answered ? summary : pickNeedsLabel(NEEDS_LABELS.intro, lang)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border border-sky-300 text-sky-800 hover:bg-sky-100 transition"
        >
          {pickNeedsLabel(answered ? NEEDS_LABELS.edit : NEEDS_LABELS.title, lang)}
        </button>
      </div>
    );
  }

  const chip = (active: boolean) =>
    cn(
      "px-3 py-1 text-xs rounded-full border transition select-none",
      active
        ? "bg-sky-600 text-white border-sky-600"
        : "border-border text-muted-foreground hover:border-sky-400",
    );

  return (
    <div className="border border-sky-200 rounded-lg p-4 bg-sky-50/60 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-sky-900">{pickNeedsLabel(NEEDS_LABELS.title, lang)}</div>
          <p className="text-xs text-sky-900/80 mt-0.5">{pickNeedsLabel(NEEDS_LABELS.intro, lang)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {answered && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_CUSTOMER_NEEDS)}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-border text-muted-foreground hover:border-border"
            >
              {pickNeedsLabel(NEEDS_LABELS.clear, lang)}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="px-3 py-1.5 text-xs font-medium rounded-full border border-sky-300 text-sky-800 hover:bg-sky-100"
          >
            {pickNeedsLabel(answered ? NEEDS_LABELS.apply : NEEDS_LABELS.skip, lang)}
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-sky-900/70 mb-1.5 uppercase tracking-wide">
          {pickNeedsLabel(NEEDS_LABELS.industry, lang)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INDUSTRY_OPTIONS.map((i) => (
            <button key={i} type="button" onClick={() => setIndustry(i)} className={chip(needs.industry === i)}>
              {pickNeedsLabel(INDUSTRY_LABELS[i], lang)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-sky-900/70 mb-1.5 uppercase tracking-wide">
          {pickNeedsLabel(NEEDS_LABELS.tasks, lang)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TASK_OPTIONS.map((t) => (
            <button key={t} type="button" onClick={() => toggleTask(t)} className={chip(needs.tasks.includes(t))}>
              {pickNeedsLabel(TASK_LABELS[t], lang)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-sky-900/70 mb-1.5 uppercase tracking-wide">
          {pickNeedsLabel(NEEDS_LABELS.season, lang)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SEASON_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setSeason(s)} className={chip(needs.season === s)}>
              {pickNeedsLabel(SEASON_LABELS[s], lang)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-sky-900/70 mb-1.5 uppercase tracking-wide">
          {pickNeedsLabel(NEEDS_LABELS.focus, lang)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_OPTIONS.map((f) => (
            <button key={f} type="button" onClick={() => toggleFocus(f)} className={chip(needs.focus.includes(f))}>
              {pickNeedsLabel(FOCUS_LABELS[f], lang)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
