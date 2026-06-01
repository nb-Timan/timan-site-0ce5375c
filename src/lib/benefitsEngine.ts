/**
 * ============================================================================
 *  Benefits engine (Phase 4) — "Fordele ved løsningen"
 * ============================================================================
 *
 *  Deterministic, metadata-driven generator for the bullets shown in the
 *  "Fordele ved løsningen" popup / PDF section.
 *
 *  Plugged into src/lib/salesArguments.ts as the PRIMARY path. If this
 *  engine returns fewer than 3 themed bullets, the caller falls back to the
 *  existing capability-based generator (T.bullet... / T.filler...).
 *
 *  Hard rules:
 *    • Read-only. No state mutations.
 *    • Never invents products; only uses metadata from
 *      src/data/productRecommendationMeta.ts (anchored to machines.ts ids).
 *    • Output is plain bullet strings, prefixed with a localized theme label
 *      so the existing modal/PDF can render them without UI changes.
 * ============================================================================
 */

import type { ConfiguratorState, Language } from "@/types/configurator";
import { getSelectedRecommendationMeta } from "@/lib/recommendationEngine";
import type { ProductRecommendationMeta } from "@/data/productRecommendationMeta";
import {
  needsIndustries,
  needsTasks,
  needsSeasons,
  type CustomerNeeds,
} from "@/lib/customerNeeds";

export type BenefitTheme =
  | "operation"      // Drift og effektivitet
  | "economy"        // Økonomi / TCO
  | "safety"         // Sikkerhed
  | "all_year"       // Helårsanvendelse / vinterdrift
  | "service"        // Service og vedligehold
  | "flexibility"    // Fleksibilitet
  | "work_env"       // Arbejdsmiljø / komfort
  | "customer_value"; // Kundespecifik værdi (industri)

const THEME_PREFIX: Record<BenefitTheme, Record<Language, string>> = {
  operation: { da: "Drift", en: "Operation", de: "Betrieb", it: "Operatività", hu: "Üzem" },
  economy: { da: "Økonomi", en: "Economics", de: "Wirtschaftlichkeit", it: "Economia", hu: "Gazdaságosság" },
  safety: { da: "Sikkerhed", en: "Safety", de: "Sicherheit", it: "Sicurezza", hu: "Biztonság" },
  all_year: { da: "Helår", en: "Year-round", de: "Ganzjährig", it: "Tutto l'anno", hu: "Egész év" },
  service: { da: "Service", en: "Service", de: "Service", it: "Assistenza", hu: "Szerviz" },
  flexibility: { da: "Fleksibilitet", en: "Flexibility", de: "Flexibilität", it: "Flessibilità", hu: "Rugalmasság" },
  work_env: { da: "Arbejdsmiljø", en: "Work environment", de: "Arbeitsumgebung", it: "Ambiente di lavoro", hu: "Munkakörnyezet" },
  customer_value: { da: "Kundeværdi", en: "Customer value", de: "Kundennutzen", it: "Valore cliente", hu: "Ügyfélérték" },
};

// ── Localized text bank (deterministic, no LLM) ──────────────────────────────

type LS = Record<Language, string>;
const t = (
  da: string,
  en: string,
  de: string = en,
  it: string = en,
  hu: string = en,
): LS => ({ da, en, de, it, hu });

const TEXT = {
  operationToolsTasks: (toolList: string, taskList: string): LS =>
    t(
      `${toolList} dækker arbejdsopgaver som ${taskList} effektivt på den valgte platform.`,
      `${toolList} efficiently covers tasks such as ${taskList} on the chosen platform.`,
    ),
  operationCarrier: (carrier: string): LS =>
    t(
      `Med ${carrier} som fælles bærer udnyttes maskinen optimalt på tværs af sæsoner.`,
      `With ${carrier} as the shared carrier, the machine is utilized across seasons.`,
    ),
  economySharedPlatform: t(
    "Samme platform året rundt reducerer kapitalbinding og driftsomkostninger.",
    "One platform all year reduces capital tie-up and operating costs.",
  ),
  economyMultiTool: t(
    "Flere redskaber til samme bærer giver lavere total-pris pr. opgave.",
    "Multiple tools on the same carrier lower the total cost per task.",
  ),
  safetyTrafficLights: t(
    "Blitzlys og synlighedsudstyr sikrer arbejde nær trafik og opfylder kravene til veje.",
    "Flashing lights and visibility equipment enable safe work near traffic and meet road requirements.",
  ),
  safetyWorkLights: t(
    "Arbejdslamper forlænger den effektive arbejdsdag i den mørke sæson.",
    "Work lights extend the productive working day during the dark season.",
  ),
  safetySlope: t(
    "Spikes giver sikkert greb på stejle og våde skråninger, hvor almindelige dæk mister fodfæste.",
    "Spikes provide secure grip on steep and wet slopes where standard tyres lose traction.",
  ),
  safetyRemote: t(
    "Fjernbetjent drift holder operatøren ude af risikoområdet på krævende terræn.",
    "Remote-controlled operation keeps the operator out of the danger zone on demanding terrain.",
  ),
  allYearWinter: (winterList: string): LS =>
    t(
      `Med ${winterList} er løsningen klar til snerydning og vinterdrift uden ekstra investering.`,
      `With ${winterList}, the solution is ready for snow clearing and winter operation without extra investment.`,
    ),
  allYearGreenWinter: t(
    "Samme maskine håndterer både grøn drift og vinterdrift – ét sæt nøgler hele året.",
    "The same machine handles both green and winter operation — one key set all year.",
  ),
  serviceWarranty: t(
    "Udvidet komponentgaranti reducerer risikoen for driftsstop og styrker totaløkonomien.",
    "Extended component warranty reduces downtime risk and strengthens total cost of ownership.",
  ),
  serviceProtection: t(
    "Rustbeskyttelse og konservering forlænger levetiden på redskaber, der arbejder i salt og vand.",
    "Rust protection and preservation extend the lifetime of tools exposed to salt and water.",
  ),
  flexibilityMulti: (n: number): LS =>
    t(
      `${n} maskiner i samme løsning giver fleksibel kapacitet, når opgaverne kommer samtidigt.`,
      `${n} machines in one solution give flexible capacity when tasks arrive at the same time.`,
    ),
  flexibilityMultiTools: t(
    "Hurtige redskabsskift gør det let at flytte mellem opgaver i løbet af dagen.",
    "Quick tool changes make it easy to move between tasks during the day.",
  ),
  workEnvComfort: (comfortList: string): LS =>
    t(
      `${comfortList} gør lange arbejdsdage mere komfortable og reducerer operatørbelastningen.`,
      `${comfortList} make long working days more comfortable and reduce operator strain.`,
    ),
  workEnvCamera: t(
    "Bakkamera giver overblik og tryghed ved arbejde tæt på mennesker og forhindringer.",
    "Reverse camera provides overview and confidence when working near people and obstacles.",
  ),
  customerMunicipality: t(
    "Løsningen matcher kommuners typiske helårsbehov for grøn pleje, fejning og vinterdrift.",
    "The solution matches the typical year-round needs of municipalities for green care, sweeping and winter service.",
  ),
  customerHighway: t(
    "Konfigurationen er klargjort til arbejde langs trafikerede veje med synlighed og sikkerhed i fokus.",
    "The configuration is prepared for work along trafficked roads with visibility and safety in focus.",
  ),
  customerLandscape: t(
    "Velegnet til anlægsgartnere, der har brug for samme bærer til mange forskellige opgaver.",
    "Well suited for landscapers needing one carrier for many different tasks.",
  ),
  customerFacility: t(
    "Klar til ejendomsservice med fokus på fejning, snerydning og pladsvedligehold året rundt.",
    "Ready for facility management focused on sweeping, snow clearing and year-round site upkeep.",
  ),
};

// ── Localized work-task labels for dynamic sentences ─────────────────────────

const TASK_LABEL: Record<string, LS> = {
  rough_vegetation: t("grov bevoksning", "rough vegetation"),
  fine_grass: t("græspleje", "fine grass"),
  trimming: t("kantklipning", "edge trimming"),
  slope_mowing: t("skråningsklipning", "slope mowing"),
  sweeping: t("fejning", "sweeping"),
  weed_brushing: t("ukrudtsbørstning", "weed brushing"),
  snow_plowing: t("snerydning", "snow plowing"),
  snow_blowing: t("sneslyngning", "snow blowing"),
  de_icing: t("saltning og grusning", "de-icing"),
  stump_grinding: t("stubfræsning", "stump grinding"),
  leaf_collection: t("løvsamling", "leaf collection"),
  site_cleaning: t("pladsfejning", "site cleaning"),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function joinAnd(parts: string[], lang: Language): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const and = lang === "en" ? " and " : lang === "de" ? " und " : lang === "it" ? " e " : lang === "hu" ? " és " : " og ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

function namesByCategory(metas: ProductRecommendationMeta[], cats: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of metas) {
    if (cats.includes(m.category) && !seen.has(m.productId)) {
      seen.add(m.productId);
      out.push(m.name);
    }
  }
  return out;
}

function platformLabel(metas: ProductRecommendationMeta[]): string {
  const machines = metas.filter((m) =>
    m.category === "machine_remote" ||
    m.category === "machine_carrier" ||
    m.category === "machine_loader_line",
  );
  return joinAnd(machines.map((m) => m.name.replace(/\s*Basismaskine$/i, "")), "da");
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface BenefitBullet {
  theme: BenefitTheme;
  text: string;
}

export interface BenefitsResult {
  bullets: BenefitBullet[];
  /** Convenience: bullets with localized theme prefix already applied. */
  prefixedBullets: string[];
}

/**
 * Generate themed benefits bullets from the current configuration.
 * Returns null when no metadata-driven bullets can be produced; the caller
 * should then fall back to the existing capability-based generator.
 */
export function generateMetadataBenefits(
  state: ConfiguratorState,
  lang: Language = "da",
): BenefitsResult | null {
  const metas = getSelectedRecommendationMeta(state);
  if (metas.length === 0) return null;

  // Phase 5: merge optional customer needs into the signal sets so
  // industry/season/task wording also reflects what the user told us.
  const needs = (state.customerNeeds ?? null) as CustomerNeeds | null;
  const needsInd = needsIndustries(needs);
  const needsTsk = needsTasks(needs);
  const needsSsn = needsSeasons(needs);
  const focus = new Set(needs?.focus ?? []);

  const tasks = new Set([...metas.flatMap((m) => m.workTasks), ...needsTsk]);
  const seasons = new Set([...metas.flatMap((m) => m.seasonRelevance), ...needsSsn]);
  const industries = new Set([...metas.flatMap((m) => m.industries), ...needsInd]);
  const categories = new Set(metas.map((m) => m.category));

  const hasWinter =
    seasons.has("winter") ||
    [...categories].some((c) => c.startsWith("tool_winter"));
  const hasGreenOrSweep =
    tasks.has("rough_vegetation") ||
    tasks.has("fine_grass") ||
    tasks.has("sweeping") ||
    tasks.has("slope_mowing");

  const safetyNames = namesByCategory(metas, ["accessory_safety"]);
  const lightNames = namesByCategory(metas, ["accessory_light"]);
  const winterNames = namesByCategory(metas, [
    "tool_winter_plow",
    "tool_winter_blower",
    "tool_winter_spreader",
  ]);
  const warrantyNames = namesByCategory(metas, ["service_warranty"]);
  const protectionNames = namesByCategory(metas, ["accessory_protection"]);
  const comfortNames = namesByCategory(metas, ["accessory_comfort"]);
  const toolNames = namesByCategory(metas, [
    "tool_mower",
    "tool_sweeper",
    "tool_weedbrush",
    "tool_stump",
    "tool_loose",
    "tool_winter_plow",
    "tool_winter_blower",
    "tool_winter_spreader",
  ]);
  const machines = metas.filter((m) =>
    m.category === "machine_remote" ||
    m.category === "machine_carrier" ||
    m.category === "machine_loader_line",
  );
  const isRemote = machines.some((m) => m.category === "machine_remote");
  const isMultiMachine = machines.length > 1;
  const isMultiTool = toolNames.length > 1;

  const bullets: BenefitBullet[] = [];
  const push = (theme: BenefitTheme, ls: LS) => {
    const text = ls[lang] ?? ls.da;
    if (text && !bullets.some((b) => b.text === text)) bullets.push({ theme, text });
  };

  // ── Safety (high priority when present) ──────────────────────────────────
  if (safetyNames.some((n) => /blitz/i.test(n))) push("safety", TEXT.safetyTrafficLights);
  if (safetyNames.some((n) => /spike/i.test(n))) push("safety", TEXT.safetySlope);
  if (lightNames.length > 0) push("safety", TEXT.safetyWorkLights);
  if (isRemote && safetyNames.length === 0 && lightNames.length === 0) {
    push("safety", TEXT.safetyRemote);
  }

  // ── All-year / winter ────────────────────────────────────────────────────
  if (winterNames.length > 0) {
    push("all_year", TEXT.allYearWinter(joinAnd(winterNames, lang)));
  }
  if (hasWinter && hasGreenOrSweep) {
    push("all_year", TEXT.allYearGreenWinter);
  }

  // ── Service ──────────────────────────────────────────────────────────────
  if (warrantyNames.length > 0) push("service", TEXT.serviceWarranty);
  if (protectionNames.length > 0) push("service", TEXT.serviceProtection);

  // ── Work environment / comfort ───────────────────────────────────────────
  if (comfortNames.length > 0) {
    push("work_env", TEXT.workEnvComfort(joinAnd(comfortNames, lang)));
  }
  if (metas.some((m) => /bakkamera|camera/i.test(m.name))) {
    push("work_env", TEXT.workEnvCamera);
  }

  // ── Operation (concrete: tools + tasks on platform) ──────────────────────
  if (toolNames.length > 0 && tasks.size > 0) {
    const taskList = joinAnd(
      [...tasks]
        .slice(0, 3)
        .map((tk) => TASK_LABEL[tk]?.[lang] ?? TASK_LABEL[tk]?.da ?? tk),
      lang,
    );
    push("operation", TEXT.operationToolsTasks(joinAnd(toolNames.slice(0, 3), lang), taskList));
  } else if (machines.length > 0) {
    push("operation", TEXT.operationCarrier(platformLabel(metas)));
  }

  // ── Economy (TCO) ────────────────────────────────────────────────────────
  if ((hasWinter && hasGreenOrSweep) || isMultiTool) {
    push("economy", TEXT.economySharedPlatform);
  } else if (toolNames.length > 0) {
    push("economy", TEXT.economyMultiTool);
  }

  // ── Flexibility ──────────────────────────────────────────────────────────
  if (isMultiMachine) push("flexibility", TEXT.flexibilityMulti(machines.length));
  if (isMultiTool) push("flexibility", TEXT.flexibilityMultiTools);

  // ── Customer value (industry-driven) ─────────────────────────────────────
  if (industries.has("highway_road")) push("customer_value", TEXT.customerHighway);
  else if (industries.has("municipality")) push("customer_value", TEXT.customerMunicipality);
  else if (industries.has("facility_management")) push("customer_value", TEXT.customerFacility);
  else if (industries.has("landscaping")) push("customer_value", TEXT.customerLandscape);

  if (bullets.length < 3) return null;

  // Prioritization order — most concrete/actionable themes first.
  const themeRank: Record<BenefitTheme, number> = {
    safety: 0,
    all_year: 1,
    operation: 2,
    work_env: 3,
    service: 4,
    flexibility: 5,
    economy: 6,
    customer_value: 7,
  };
  bullets.sort((a, b) => themeRank[a.theme] - themeRank[b.theme]);

  // Cap to 7 default bullets to avoid long lists.
  const top = bullets.slice(0, 7);
  const prefixedBullets = top.map((b) => {
    const prefix = THEME_PREFIX[b.theme][lang] ?? THEME_PREFIX[b.theme].da;
    return `${prefix}: ${b.text}`;
  });

  return { bullets: top, prefixedBullets };
}
