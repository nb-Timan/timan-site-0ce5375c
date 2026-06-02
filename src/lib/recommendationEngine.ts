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
  getFunctionGroup,
  pickLocalized,
  type ProductRecommendationMeta,
  type MachinePlatform,
  type FunctionGroup,
} from "@/data/productRecommendationMeta";
import {
  needsIndustries,
  needsTasks,
  needsSeasons,
  type CustomerNeeds,
} from "@/lib/customerNeeds";

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

/** Optional needs bias (Phase 5). Pre-resolved to metadata vocab. */
export interface NeedsBias {
  industries: Set<string>;
  tasks: Set<string>;
  seasons: Set<string>;
  focus: Set<string>;
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
  needs?: NeedsBias,
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

  // ── Phase 5: customer needs bias (optional) ────────────────────────────
  if (needs) {
    // Industry stated by customer → boost candidates that target it.
    if (needs.industries.size > 0) {
      const hits = candidate.industries.filter((i) => needs.industries.has(i)).length;
      if (hits > 0) {
        const bonus = Math.min(hits * 6, 12);
        score += bonus;
        reasons.push(`needs.industry=${hits} (+${bonus})`);
      }
    }
    // Tasks stated by customer → strong boost.
    if (needs.tasks.size > 0) {
      const hits = candidate.workTasks.filter((t) => needs.tasks.has(t)).length;
      if (hits > 0) {
        const bonus = Math.min(hits * 10, 25);
        score += bonus;
        reasons.push(`needs.tasks=${hits} (+${bonus})`);
      }
    }
    // Season stated by customer.
    if (needs.seasons.size > 0) {
      const hits = candidate.seasonRelevance.filter((s) => needs.seasons.has(s)).length;
      if (hits > 0) {
        score += 8;
        reasons.push("needs.season match (+8)");
      } else if (
        candidate.seasonRelevance.includes("all_year") &&
        !needs.seasons.has("all_year")
      ) {
        score += 3;
        reasons.push("needs.season all_year fallback (+3)");
      }
    }
    // Focus → category boosts. Safety always wins ties.
    if (needs.focus.size > 0) {
      const cat = candidate.category;
      if (needs.focus.has("sikkerhed") && (cat === "accessory_safety" || cat === "accessory_light")) {
        score += 20;
        reasons.push("needs.focus=safety (+20)");
      }
      if (needs.focus.has("komfort") && cat === "accessory_comfort") {
        score += 18;
        reasons.push("needs.focus=comfort (+18)");
      }
      if (
        (needs.focus.has("driftssikkerhed") || needs.focus.has("lav_vedligehold")) &&
        (cat === "service_warranty" || cat === "accessory_protection")
      ) {
        score += 18;
        reasons.push("needs.focus=uptime (+18)");
      }
      if (
        needs.focus.has("effektivitet") &&
        (cat.startsWith("tool_") || cat === "accessory_mounting")
      ) {
        score += 10;
        reasons.push("needs.focus=efficiency (+10)");
      }
      // "pris" — neutral. We never down-score safety; keep the field as a
      // signal only (used by benefitsEngine wording).
    }
  }

  // Category breadth bonus: encourage cross-category coverage so the user
  // sees safety + service + winter etc., not three of the same kind.
  // Handled at selection time (see generateMetadataRecommendations).

  return { meta: candidate, score, reasons };
}



// ─── Grouping & reason text (Phase 3) ───────────────────────────────────────

/** Sales-oriented grouping shown to the customer (prefixed on the bullet). */
export type RecommendationGroup = "necessary" | "recommended" | "upsell";

const GROUP_PREFIX: Record<RecommendationGroup, Record<Language, string>> = {
  necessary: {
    da: "Nødvendigt",
    en: "Essential",
    de: "Notwendig",
    it: "Necessario",
    hu: "Szükséges",
  },
  recommended: {
    da: "Timan anbefaler",
    en: "Timan recommends",
    de: "Timan empfiehlt",
    it: "Timan consiglia",
    hu: "Timan ajánlja",
  },
  upsell: {
    da: "Ekstra værdi",
    en: "Added value",
    de: "Mehrwert",
    it: "Valore aggiunto",
    hu: "Plusz érték",
  },
};

/**
 * Assign a sales group based on category, priority and signals.
 * Deterministic — same inputs always yield the same group.
 */
function groupOf(c: MetadataCandidate): RecommendationGroup {
  const { meta, reasons } = c;
  const hasRecWith = reasons.some((r) => r.startsWith("recommendedWith"));

  // Safety + high-priority lights count as "essential" for road/site work.
  if (meta.category === "accessory_safety" && meta.recommendationPriority <= 2) return "necessary";
  if (meta.category === "accessory_light" && meta.recommendationPriority === 1 && hasRecWith) {
    return "necessary";
  }

  // Service/warranty and pure comfort/protection are framed as upsell.
  if (
    meta.category === "service_warranty" ||
    meta.category === "accessory_comfort" ||
    meta.category === "accessory_protection"
  ) {
    return "upsell";
  }

  // Strong pairing or high priority → "Timan recommends".
  if (hasRecWith || meta.recommendationPriority <= 2) return "recommended";

  return "upsell";
}

// ── Reason snippets (localized, deterministic) ──────────────────────────────

const REASON_SNIPPETS: Record<string, Record<Language, string>> = {
  safety_traffic: {
    da: "Øger sikkerheden ved arbejde tæt på trafik og mennesker.",
    en: "Increases safety when working close to traffic and people.",
    de: "Erhöht die Sicherheit bei Arbeiten in der Nähe von Verkehr und Personen.",
    it: "Aumenta la sicurezza vicino a traffico e persone.",
    hu: "Növeli a biztonságot forgalom és emberek közelében.",
  },
  light_dark_season: {
    da: "Forlænger den effektive arbejdsdag i den mørke sæson.",
    en: "Extends the productive working day during the dark season.",
    de: "Verlängert den produktiven Arbeitstag in der dunklen Jahreszeit.",
    it: "Prolunga la giornata lavorativa nei mesi bui.",
    hu: "Meghosszabbítja a hatékony munkanapot a sötét időszakban.",
  },
  winter_ready: {
    da: "Gør løsningen klar til vinterdrift.",
    en: "Makes the solution ready for winter operation.",
    de: "Macht die Lösung winterfest.",
    it: "Prepara la soluzione all'uso invernale.",
    hu: "Felkészíti a megoldást a téli üzemre.",
  },
  warranty_uptime: {
    da: "Reducerer risikoen for driftsstop og styrker totaløkonomien.",
    en: "Reduces downtime risk and strengthens total cost of ownership.",
    de: "Reduziert Ausfallrisiken und stärkt die Gesamtwirtschaftlichkeit.",
    it: "Riduce i fermi macchina e migliora il costo totale di esercizio.",
    hu: "Csökkenti az állásidő kockázatát és javítja a teljes üzemeltetési költséget.",
  },
  comfort_long_days: {
    da: "Gør lange arbejdsdage mere komfortable for operatøren.",
    en: "Makes long working days more comfortable for the operator.",
    de: "Macht lange Arbeitstage komfortabler für den Bediener.",
    it: "Rende più confortevoli le lunghe giornate di lavoro.",
    hu: "Kényelmesebbé teszi a hosszú munkanapokat.",
  },
  protection_lifetime: {
    da: "Beskytter mod korrosion og forlænger levetiden.",
    en: "Protects against corrosion and extends service life.",
    de: "Schützt vor Korrosion und verlängert die Lebensdauer.",
    it: "Protegge dalla corrosione ed estende la durata.",
    hu: "Védi a korróziótól és növeli az élettartamot.",
  },
  task_match: {
    da: "Matcher de valgte maskiners opgaver.",
    en: "Matches the work tasks of the chosen machines.",
    de: "Passt zu den Aufgaben der gewählten Maschinen.",
    it: "Corrisponde ai compiti delle macchine scelte.",
    hu: "Illeszkedik a kiválasztott gépek feladataihoz.",
  },
  pairs_with: {
    da: "Anbefales sammen med den valgte løsning.",
    en: "Recommended together with your selection.",
    de: "Wird zusammen mit Ihrer Auswahl empfohlen.",
    it: "Consigliato insieme alla selezione.",
    hu: "A kiválasztással együtt ajánlott.",
  },
};

function pickSnippet(key: keyof typeof REASON_SNIPPETS, lang: Language): string {
  return REASON_SNIPPETS[key][lang] ?? REASON_SNIPPETS[key].da;
}

/**
 * Build a short, sales-style reason from metadata signals.
 * One sentence, deterministic, never invents products.
 */
function buildReason(c: MetadataCandidate, lang: Language): string {
  const { meta } = c;

  // Category-driven primary value statement (single sentence).
  switch (meta.category) {
    case "accessory_safety":
      return pickSnippet("safety_traffic", lang);
    case "accessory_light":
      return pickSnippet("light_dark_season", lang);
    case "service_warranty":
      return pickSnippet("warranty_uptime", lang);
    case "accessory_comfort":
      return pickSnippet("comfort_long_days", lang);
    case "accessory_protection":
      return pickSnippet("protection_lifetime", lang);
    case "tool_winter_plow":
    case "tool_winter_blower":
    case "tool_winter_spreader":
      return pickSnippet("winter_ready", lang);
    default: {
      const sa = meta.salesArguments[0];
      const saText = sa ? pickLocalized(sa, lang) : "";
      if (saText) return saText;
      return pickLocalized(meta.shortPitch, lang);
    }
  }
}

// ─── Output shape (mirrors RecommendationStructured) ────────────────────────

export interface MetadataRecommendationOutput {
  /** Localized bullets prefixed with the sales group (e.g. "Nødvendigt: …"). */
  defaultBullets: string[];
  extraBullets: string[];
  /** Underlying scored candidates, in chosen order (matches `groups`). */
  picked: MetadataCandidate[];
  /** Group per picked candidate, same order as `picked`. */
  groups: RecommendationGroup[];
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

  // Phase 5: derive bias from optional customer needs on state.
  const needs: NeedsBias | undefined = state.customerNeeds
    ? {
        industries: new Set(needsIndustries(state.customerNeeds as CustomerNeeds)),
        tasks: new Set(needsTasks(state.customerNeeds as CustomerNeeds)),
        seasons: new Set(needsSeasons(state.customerNeeds as CustomerNeeds)),
        focus: new Set((state.customerNeeds.focus ?? []) as string[]),
      }
    : undefined;

  const catalogue = catalogueIndex();
  const scored: MetadataCandidate[] = [];

  // ── Dedup: collect function groups already covered by the user's basket ──
  // Two products that solve the same job (e.g. CS-200 Combi vs CS-200
  // Valsespreder both = saltspredning) should not both be recommended.
  // Safety / lights are kept separately by virtue of being distinct groups.
  const coveredGroups = new Set<FunctionGroup>();
  for (const m of selectedMeta) coveredGroups.add(getFunctionGroup(m));

  for (const candidate of Object.values(PRODUCT_RECOMMENDATION_META)) {
    // Safety anchor: candidate must exist in the live product catalogue.
    if (!catalogue.has(candidate.productId) && !catalogue.has(candidate.varenr)) continue;

    // Function-group dedup against the user's basket.
    if (coveredGroups.has(getFunctionGroup(candidate))) continue;

    const result = scoreRecommendationCandidate(
      candidate,
      selectedMeta,
      selectedPlatforms,
      selectedIds,
      needs,
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

  // Within the candidate list: keep at most one pick per functionGroup so the
  // user never sees two products that solve the same job. Lights/safety stay
  // distinct because they map to different function groups.
  const picked: MetadataCandidate[] = [];
  const usedGroups = new Set<FunctionGroup>();
  const MAX_TOTAL = 7; // 5 default + 2 extra

  for (const c of scored) {
    const g = getFunctionGroup(c.meta);
    if (usedGroups.has(g)) continue;
    picked.push(c);
    usedGroups.add(g);
    if (picked.length >= MAX_TOTAL) break;
  }

  // Order picks: "necessary" first, then "recommended", then "upsell".
  const groupRank: Record<RecommendationGroup, number> = {
    necessary: 0,
    recommended: 1,
    upsell: 2,
  };
  const withGroups = picked.map((c, idx) => ({ c, idx, g: groupOf(c) }));
  withGroups.sort((a, b) => {
    const r = groupRank[a.g] - groupRank[b.g];
    return r !== 0 ? r : a.idx - b.idx;
  });

  const orderedPicked = withGroups.map((x) => x.c);
  const groups = withGroups.map((x) => x.g);

  const allBullets = withGroups.map(({ c, g }) => {
    const prefix = GROUP_PREFIX[g][lang] ?? GROUP_PREFIX[g].da;
    const reason = buildReason(c, lang);
    const tail = reason ? ` – ${reason}` : "";
    return `${prefix}: ${c.meta.name}${tail}`;
  });

  // Caps: max 5 primary + max 2 optional.
  const defaultBullets = allBullets.slice(0, Math.min(5, allBullets.length));
  const extraBullets = allBullets.slice(defaultBullets.length, defaultBullets.length + 2);

  return { defaultBullets, extraBullets, picked: orderedPicked, groups };
}
