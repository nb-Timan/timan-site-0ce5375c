/**
 * ============================================================================
 *  Customer Needs (Phase 5) — short pre-recommendation questionnaire
 * ============================================================================
 *
 *  Lightweight, optional inputs the user can fill in just before "Timan
 *  anbefaler" / "Fordele ved løsningen" is generated.  All answers are
 *  optional: empty needs == today's behaviour.
 *
 *  • Stored locally on ConfiguratorState (customerNeeds?).
 *  • Read by recommendationEngine + benefitsEngine to bias scoring/wording.
 *  • No database, no API, no ordering/pricing impact.
 * ============================================================================
 */

import type { Language } from "@/types/configurator";
import type { Industry, Season, WorkTask } from "@/data/productRecommendationMeta";

// ─── User-facing enums (Danish keys, localized labels) ──────────────────────

export type NeedsIndustry =
  | "kommune"
  | "entreprenor"
  | "anlaegsgartner"
  | "facility"
  | "landbrug"
  | "vej_park"
  | "andet";

export type NeedsTask =
  | "graes"
  | "grov"
  | "skraaning"
  | "ukrudt"
  | "fejning"
  | "snerydning"
  | "saltning"
  | "stier"
  | "parker"
  | "entreprenor";

export type NeedsSeason = "helar" | "forar_sommer" | "efterar_vinter" | "sesonbaseret";

export type NeedsFocus =
  | "pris"
  | "driftssikkerhed"
  | "effektivitet"
  | "komfort"
  | "sikkerhed"
  | "lav_vedligehold";

export interface CustomerNeeds {
  industry?: NeedsIndustry;
  tasks: NeedsTask[];
  season?: NeedsSeason;
  focus: NeedsFocus[];
}

export const EMPTY_CUSTOMER_NEEDS: CustomerNeeds = { tasks: [], focus: [] };

export function isCustomerNeedsAnswered(n?: CustomerNeeds | null): boolean {
  if (!n) return false;
  return Boolean(n.industry || n.season || n.tasks.length || n.focus.length);
}

// ─── Mappings to metadata vocabulary (used by engines) ──────────────────────

const INDUSTRY_MAP: Record<NeedsIndustry, Industry[]> = {
  kommune: ["municipality"],
  entreprenor: ["industrial_site", "landscaping"],
  anlaegsgartner: ["landscaping"],
  facility: ["facility_management"],
  landbrug: ["agriculture"],
  vej_park: ["highway_road", "municipality"],
  andet: [],
};

const TASK_MAP: Record<NeedsTask, WorkTask[]> = {
  graes: ["fine_grass"],
  grov: ["rough_vegetation"],
  skraaning: ["slope_mowing"],
  ukrudt: ["weed_brushing"],
  fejning: ["sweeping"],
  snerydning: ["snow_plowing", "snow_blowing"],
  saltning: ["de_icing"],
  stier: ["site_cleaning", "sweeping"],
  parker: ["fine_grass", "leaf_collection"],
  entreprenor: ["site_cleaning"],
};

const SEASON_MAP: Record<NeedsSeason, Season[]> = {
  helar: ["all_year"],
  forar_sommer: ["spring", "summer"],
  efterar_vinter: ["autumn", "winter"],
  sesonbaseret: [],
};

export function needsIndustries(n?: CustomerNeeds | null): Industry[] {
  if (!n?.industry) return [];
  return INDUSTRY_MAP[n.industry] ?? [];
}

export function needsTasks(n?: CustomerNeeds | null): WorkTask[] {
  if (!n?.tasks?.length) return [];
  const out = new Set<WorkTask>();
  for (const t of n.tasks) for (const m of TASK_MAP[t] ?? []) out.add(m);
  return [...out];
}

export function needsSeasons(n?: CustomerNeeds | null): Season[] {
  if (!n?.season) return [];
  return SEASON_MAP[n.season] ?? [];
}

// ─── Localized labels (DA / EN / DE / IT / HU) ──────────────────────────────

type LS = Record<Language, string>;

export const NEEDS_LABELS = {
  title: {
    da: "Forfin anbefalingerne (valgfrit)",
    en: "Refine the recommendations (optional)",
    de: "Empfehlungen verfeinern (optional)",
    it: "Affina le raccomandazioni (opzionale)",
    hu: "Ajánlások finomítása (opcionális)",
  } as LS,
  intro: {
    da: "Svar kort på kundens behov, så Timan anbefaler og fordele bliver mere relevante. Du kan altid springe over.",
    en: "Briefly answer the customer's needs so Timan's recommendation and benefits become more relevant. You can always skip.",
    de: "Beantworten Sie kurz die Kundenbedürfnisse, damit Empfehlungen und Vorteile relevanter werden. Sie können jederzeit überspringen.",
    it: "Rispondi brevemente alle esigenze del cliente per rendere più pertinenti raccomandazioni e vantaggi. Puoi sempre saltare.",
    hu: "Válaszoljon röviden az ügyfél igényeire a relevánsabb ajánlásokért. Bármikor kihagyhatja.",
  } as LS,
  skip: { da: "Spring over", en: "Skip", de: "Überspringen", it: "Salta", hu: "Kihagyás" } as LS,
  edit: { da: "Rediger", en: "Edit", de: "Bearbeiten", it: "Modifica", hu: "Szerkesztés" } as LS,
  apply: { da: "Anvend", en: "Apply", de: "Anwenden", it: "Applica", hu: "Alkalmaz" } as LS,
  clear: { da: "Nulstil", en: "Clear", de: "Zurücksetzen", it: "Cancella", hu: "Törlés" } as LS,
  industry: { da: "Branche", en: "Industry", de: "Branche", it: "Settore", hu: "Iparág" } as LS,
  tasks: { da: "Primære opgaver", en: "Primary tasks", de: "Hauptaufgaben", it: "Compiti principali", hu: "Fő feladatok" } as LS,
  season: { da: "Brugssæson", en: "Usage season", de: "Nutzungssaison", it: "Stagione d'uso", hu: "Használati szezon" } as LS,
  focus: { da: "Fokus", en: "Focus", de: "Fokus", it: "Focus", hu: "Fókusz" } as LS,
} as const;

export const INDUSTRY_LABELS: Record<NeedsIndustry, LS> = {
  kommune: { da: "Kommune", en: "Municipality", de: "Kommune", it: "Comune", hu: "Önkormányzat" },
  entreprenor: { da: "Entreprenør", en: "Contractor", de: "Bauunternehmen", it: "Impresa edile", hu: "Vállalkozó" },
  anlaegsgartner: { da: "Anlægsgartner", en: "Landscaper", de: "Landschaftsgärtner", it: "Paesaggista", hu: "Kertépítő" },
  facility: { da: "Facility management", en: "Facility management", de: "Facility Management", it: "Facility management", hu: "Facility menedzsment" },
  landbrug: { da: "Landbrug", en: "Agriculture", de: "Landwirtschaft", it: "Agricoltura", hu: "Mezőgazdaság" },
  vej_park: { da: "Vej/park", en: "Road/park", de: "Straße/Park", it: "Strade/parchi", hu: "Út/park" },
  andet: { da: "Andet", en: "Other", de: "Andere", it: "Altro", hu: "Egyéb" },
};

export const TASK_LABELS: Record<NeedsTask, LS> = {
  graes: { da: "Græspleje", en: "Grass care", de: "Rasenpflege", it: "Cura del prato", hu: "Fűápolás" },
  grov: { da: "Grov bevoksning", en: "Rough vegetation", de: "Grober Bewuchs", it: "Vegetazione fitta", hu: "Sűrű növényzet" },
  skraaning: { da: "Skråninger", en: "Slopes", de: "Hänge", it: "Pendii", hu: "Lejtők" },
  ukrudt: { da: "Ukrudt", en: "Weeds", de: "Unkraut", it: "Erbacce", hu: "Gyom" },
  fejning: { da: "Fejning", en: "Sweeping", de: "Kehren", it: "Spazzamento", hu: "Seprés" },
  snerydning: { da: "Snerydning", en: "Snow clearing", de: "Schneeräumung", it: "Sgombero neve", hu: "Hóeltakarítás" },
  saltning: { da: "Saltning", en: "Salting", de: "Salzen", it: "Salatura", hu: "Sózás" },
  stier: { da: "Stier/fortove", en: "Paths/sidewalks", de: "Wege/Gehwege", it: "Sentieri/marciapiedi", hu: "Utak/járdák" },
  parker: { da: "Parker", en: "Parks", de: "Parks", it: "Parchi", hu: "Parkok" },
  entreprenor: { da: "Entreprenøropgaver", en: "Contractor work", de: "Bauarbeiten", it: "Lavori edili", hu: "Vállalkozói munkák" },
};

export const SEASON_LABELS: Record<NeedsSeason, LS> = {
  helar: { da: "Hele året", en: "All year", de: "Ganzjährig", it: "Tutto l'anno", hu: "Egész évben" },
  forar_sommer: { da: "Primært forår/sommer", en: "Mainly spring/summer", de: "Hauptsächlich Frühling/Sommer", it: "Principalmente primavera/estate", hu: "Főleg tavasz/nyár" },
  efterar_vinter: { da: "Primært efterår/vinter", en: "Mainly autumn/winter", de: "Hauptsächlich Herbst/Winter", it: "Principalmente autunno/inverno", hu: "Főleg ősz/tél" },
  sesonbaseret: { da: "Kun sæsonbaseret", en: "Seasonal only", de: "Nur saisonal", it: "Solo stagionale", hu: "Csak szezonális" },
};

export const FOCUS_LABELS: Record<NeedsFocus, LS> = {
  pris: { da: "Pris", en: "Price", de: "Preis", it: "Prezzo", hu: "Ár" },
  driftssikkerhed: { da: "Driftssikkerhed", en: "Reliability", de: "Betriebssicherheit", it: "Affidabilità", hu: "Üzembiztonság" },
  effektivitet: { da: "Effektivitet", en: "Efficiency", de: "Effizienz", it: "Efficienza", hu: "Hatékonyság" },
  komfort: { da: "Komfort", en: "Comfort", de: "Komfort", it: "Comfort", hu: "Kényelem" },
  sikkerhed: { da: "Sikkerhed", en: "Safety", de: "Sicherheit", it: "Sicurezza", hu: "Biztonság" },
  lav_vedligehold: { da: "Lav vedligeholdelse", en: "Low maintenance", de: "Geringer Wartungsaufwand", it: "Bassa manutenzione", hu: "Alacsony karbantartás" },
};

export const INDUSTRY_OPTIONS: NeedsIndustry[] = [
  "kommune", "entreprenor", "anlaegsgartner", "facility", "landbrug", "vej_park", "andet",
];
export const TASK_OPTIONS: NeedsTask[] = [
  "graes", "grov", "skraaning", "ukrudt", "fejning", "snerydning", "saltning", "stier", "parker", "entreprenor",
];
export const SEASON_OPTIONS: NeedsSeason[] = ["helar", "forar_sommer", "efterar_vinter", "sesonbaseret"];
export const FOCUS_OPTIONS: NeedsFocus[] = [
  "sikkerhed", "driftssikkerhed", "effektivitet", "komfort", "lav_vedligehold", "pris",
];

export function pickNeedsLabel(ls: LS, lang: Language): string {
  return ls[lang] ?? ls.da;
}
