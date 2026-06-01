/**
 * ============================================================================
 *  Metadata-driven recommendation engine (Phase 2)
 * ============================================================================
 *
 *  Deterministic scoring of recommendation candidates using
 *  src/data/productRecommendationMeta.ts.
 *
 *  Plugged in by src/lib/salesArguments.ts as the PRIMARY path. If this
 *  engine returns zero candidates, the caller falls back to the existing
 *  RECOMMENDATION_RULES table.
 *
 *  Hard rules:
 *    • Only candidates that exist in PRODUCT_RECOMMENDATION_META are returned
 *      (every entry there is anchored to a real id/varenr in machines.ts).
 *    • Never recommend an id/varenr that is already selected.
 *    • compatibleMachines acts as a hard filter against selected platforms.
 *    • Never invents text — bullet text is built from meta.name + meta.shortPitch.
 *    • Read-only. No mutations of state or product data.
 * ============================================================================
 */

import type { ConfiguratorState, Language, MachineConfig } from "@/types/configurator";
import { PRODUCTS, ACCESSORIES, getLooseToolAccessories, LOOSE_TOOL_KEY } from "@/data/machines";
import {
  PRODUCT_RECOMMENDATION_META,
  getRecommendationMeta,
  pickLocalized,
  type ProductRecommendationMeta,
  type MachinePlatform,
} from "@/data/productRecommendationMeta";

export interface MetadataCandidate {
  meta: ProductRecommendationMeta;
  score: number;
  /** Human-debug breakdown (not shown to users). */
  reasons: string[];
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function collectSelectedIds(state: ConfiguratorState): Set<string> {
  const ids = new Set<string>();
  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    mc.acc.forEach((id) => ids.add(id));
    if (mc.configMode === "individual") {
      for (let i = 1; i <= mc.qty; i++) {
        const cfg = state.individualUnitConfigs[`${mc.id}_${i}`];
        if (cfg) cfg.acc.forEach((id) => ids.add(id));
      }
    }
  }
  return ids;
}

function collectSelectedPlatforms(state: ConfiguratorState): MachinePlatform[] {
  const out = new Set<MachinePlatform>();
  for (const mc of state.machineConfigs) {
    if (mc.qty < 1) continue;
    out.add(mc.type as MachinePlatform);
  }
  return Array.from(out);
}

/** All known valid product ids/varenrs in the catalogue. Anchor for safety. */
function buildCatalogueIndex(): Set<string> {
  const set = new Set<string>();
  for (const p of Object.values(PRODUCTS)) {
    if (p.id) set.add(p.id);
    if (p.varenr) set.add(p.varenr);
  }
  for (const list of Object.values(ACCESSORIES)) {
    for (const a of list) {
      if (a.id) set.add(a.id);
      if (a.varenr) set.add(a.varenr);
    }
  }
  for (const a of getLooseToolAccessories()) {
    if (a.id) set.add(a.id);
    if (a.varenr) set.add(a.varenr);
  }
  return set;
}

let _catalogueIndex: Set<string> | null = null;
function catalogueIndex(): Set<string> {
  if (!_catalogueIndex) _catalogueIndex = buildCatalogueIndex();
  return _catalogueIndex;
}

function overlapCount<T>(a: readonly T[], b: readonly T[] | Set<T>): number {
  const bSet = b instanceof Set ? b : new Set(b);
  let n = 0;
  for (const x of a) if (bSet.has(x)) n++;
  return n;
}

// ─── Public helpers (small, focused) ────────────────────────────────────────

/** Metadata for everything currently selected (machines + accessories). */
export function getSelectedRecommendationMeta(
  state: ConfiguratorState,
): ProductRecommendationMeta[] {
  const ids = collectSelectedIds(state);
  const platforms = collectSelectedPlatforms(state);
  const out: ProductRecommendationMeta[] = [];

  for (const p of platforms) {
    const m = getRecommendationMeta(p);
    if (m && !out.includes(m)) out.push(m);
  }
  for (const id of ids) {
    const m = getRecommendationMeta(id);
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Score a single candidate against the customer's selected products.
 * Pure function — easy to unit test later.
 */
export function scoreRecommendationCandidate(
  candidate: ProductRecommendationMeta,
  selected: ProductRecommendationMeta[],
  selectedPlatforms: MachinePlatform[],
  selectedIds: Set<string>,
): MetadataCandidate | null {
  // Hard filter 1: never recommend something already chosen.
  if (selectedIds.has(candidate.productId) || selectedIds.has(candidate.varenr)) return null;

  // Hard filter 2: compatibleMachines must intersect with at least one selected
  // platform — unless the customer hasn't chosen any machine yet, in which
  // case we skip platform filtering. Items with empty compatibleMachines are
  // treated as universally compatible.
  if (selectedPlatforms.length > 0 && candidate.compatibleMachines.length > 0) {
    const compatible = candidate.compatibleMachines.some((p) => selectedPlatforms.includes(p));
    if (!compatible) return null;
  }

  let score = 0;
  const reasons: string[] = [];

  // Priority base score (1 = highest). Map 1..5 → 50..10.
  const prioBase = Math.max(0, 60 - candidate.recommendationPriority * 10);
  score += prioBase;
  reasons.push(`priority=${candidate.recommendationPriority} (+${prioBase})`);

  // Aggregate signals from the selected set.
  const allSelectedTasks = new Set(selected.flatMap((m) => m.workTasks));
  const allSelectedSeasons = new Set(selected.flatMap((m) => m.seasonRelevance));
  const allSelectedIndustries = new Set(selected.flatMap((m) => m.industries));
  const allRecommendedWith = new Set(selected.flatMap((m) => m.recommendedWith));

  // Strongest signal: explicitly recommended together (either direction).
  if (
    allRecommendedWith.has(candidate.productId) ||
    allRecommendedWith.has(candidate.varenr) ||
    candidate.recommendedWith.some(
      (id) => selectedIds.has(id) || selected.some((m) => m.productId === id || m.varenr === id),
    )
  ) {
    score += 40;
    reasons.push("recommendedWith match (+40)");
  }

  // Work task overlap — counts because vinter/grøn/fejning all live here.
  const taskHits = overlapCount(candidate.workTasks, allSelectedTasks);
  if (taskHits > 0) {
    const bonus = Math.min(taskHits * 8, 24);
    score += bonus;
    reasons.push(`workTasks overlap=${taskHits} (+${bonus})`);
  }

  // Season relevance: small bonus when seasons overlap with the customer's mix.
  const seasonHits = overlapCount(candidate.seasonRelevance, allSelectedSeasons);
  if (seasonHits > 0) {
    score += 5;
    reasons.push("season overlap (+5)");
  }
  // Year-round items get a small bonus when paired with any seasonal selection.
  if (
    candidate.seasonRelevance.includes("all_year") &&
    allSelectedSeasons.size > 0 &&
    seasonHits === 0
  ) {
    score += 3;
    reasons.push("all_year fallback (+3)");
  }

  // Industry overlap — weak signal (only matters if multiple matches).
  const indHits = overlapCount(candidate.industries, allSelectedIndustries);
  if (indHits >= 2) {
    score += 5;
    reasons.push(`industry overlap=${indHits} (+5)`);
  }

  // Category breadth bonus: encourage cross-category coverage so the user
  // sees safety + service + winter etc., not three of the same kind.
  // Handled at selection time (see generateMetadataRecommendations).

  return { meta: candidate, score, reasons };
}

// ─── Output shape (mirrors RecommendationStructured) ────────────────────────

export interface MetadataRecommendationOutput {
  /** Localized bullets in the form `${name} – ${shortPitch}`. */
  defaultBullets: string[];
  extraBullets: string[];
  /** Underlying scored candidates, in chosen order. Useful for debug/AI later. */
  picked: MetadataCandidate[];
}

/**
 * Build recommendation candidates from metadata.
 * Returns null when no usable candidates exist (caller should fall back).
 */
export function generateMetadataRecommendations(
  state: ConfiguratorState,
  lang: Language = "da",
): MetadataRecommendationOutput | null {
  const selectedIds = collectSelectedIds(state);
  const selectedPlatforms = collectSelectedPlatforms(state);
  // Treat selected machine platforms as "selected ids" so the base machine is
  // never recommended back, and add varenrs of selected accessory ids so
  // recommendedWith matching by varenr works even when ids differ.
  for (const p of selectedPlatforms) {
    selectedIds.add(p);
    const m = getRecommendationMeta(p);
    if (m?.varenr) selectedIds.add(m.varenr);
  }
  for (const list of Object.values(ACCESSORIES)) {
    for (const a of list) if (selectedIds.has(a.id) && a.varenr) selectedIds.add(a.varenr);
  }
  for (const a of getLooseToolAccessories()) {
    if (selectedIds.has(a.id) && a.varenr) selectedIds.add(a.varenr);
  }

  const selectedMeta = getSelectedRecommendationMeta(state);
  if (selectedMeta.length === 0 && selectedPlatforms.length === 0) return null;

  const catalogue = catalogueIndex();
  const scored: MetadataCandidate[] = [];

  for (const candidate of Object.values(PRODUCT_RECOMMENDATION_META)) {
    // Safety anchor: candidate must exist in the live product catalogue.
    if (!catalogue.has(candidate.productId) && !catalogue.has(candidate.varenr)) continue;

    const result = scoreRecommendationCandidate(
      candidate,
      selectedMeta,
      selectedPlatforms,
      selectedIds,
    );
    if (result && result.score > 0) scored.push(result);
  }

  if (scored.length === 0) return null;

  // Sort by score desc, then priority asc, then name for stability.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.meta.recommendationPriority !== b.meta.recommendationPriority) {
      return a.meta.recommendationPriority - b.meta.recommendationPriority;
    }
    return a.meta.name.localeCompare(b.meta.name);
  });

  // Diversify: prefer at most 2 picks per category in the top 5, so the
  // customer sees a mix (safety + winter + service + …) rather than three
  // identical-flavoured items.
  const picked: MetadataCandidate[] = [];
  const catCount = new Map<string, number>();
  const leftover: MetadataCandidate[] = [];

  for (const c of scored) {
    const n = catCount.get(c.meta.category) ?? 0;
    if (n < 2) {
      picked.push(c);
      catCount.set(c.meta.category, n + 1);
    } else {
      leftover.push(c);
    }
    if (picked.length >= 10) break;
  }
  // If still short, fill from leftover to reach up to 10.
  for (const c of leftover) {
    if (picked.length >= 10) break;
    picked.push(c);
  }

  const allBullets = picked.map((c) => {
    const label = c.meta.name;
    const reason = pickLocalized(c.meta.shortPitch, lang);
    return reason ? `${label} – ${reason}` : label;
  });

  const defaultBullets = allBullets.slice(0, Math.min(5, allBullets.length));
  const extraBullets = allBullets.slice(defaultBullets.length, defaultBullets.length + 5);

  return { defaultBullets, extraBullets, picked };
}
