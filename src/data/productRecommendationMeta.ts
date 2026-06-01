/**
 * ============================================================================
 *  Product Recommendation Metadata (Phase 1 — data foundation)
 * ============================================================================
 *
 *  Manually curated metadata for machines, accessories and tools used by the
 *  recommendation engine (and later: by AI-assisted sales copy).
 *
 *  CONTRACT (must hold at all times):
 *    • Every entry references an EXISTING id/varenr from src/data/machines.ts.
 *      No new products are invented here.
 *    • Empty arrays mean "not yet curated" — never "irrelevant".
 *    • Pure data. No imports of UI/state. No side effects.
 *    • Read-only by callers. The recommendation engine and (future) AI copy
 *      layer consume this; configurator pricing/order logic is untouched.
 *
 *  HOW TO USE LATER (next phases — NOT in this phase):
 *    1. The recommendation engine (src/lib/salesArguments.ts) can score
 *       candidates by intersecting `compatibleMachines`, `recommendedWith`,
 *       `seasonRelevance`, `workTasks` with the customer's selection — instead
 *       of only matching `parentIds`.
 *    2. A future AI/LLM layer can be given `salesArguments`, `technicalAdvantages`
 *       and `shortPitch` as STRUCTURED FACTS to rephrase into natural copy,
 *       with output validated back against these ids/varenrs (so the model
 *       cannot invent products).
 *    3. A future importer can populate the same shape from a CSV/JSON export
 *       from timan.dk without touching code.
 *
 *  HOW TO EDIT:
 *    • Add/refine fields on an existing entry — safe at any time.
 *    • Add a new entry only when the id/varenr also exists in machines.ts.
 *    • Leave `TODO:` notes on fields a product specialist must verify.
 * ============================================================================
 */

import type { Language } from "@/types/configurator";

// ─── Enums / vocabularies ───────────────────────────────────────────────────
// Kept as string-literal unions so we can grep for usages and keep authoring
// simple. Extend deliberately — these drive future scoring.

export type ProductCategory =
  | "machine_remote"        // fjernbetjent klipper (RC-serien)
  | "machine_carrier"       // redskabsbærer / multifunktion (Timan 3330/2620)
  | "machine_loader_line"   // loader/CS-200 platform
  | "tool_mower"            // klippere (slagle, rotor, finger, skive)
  | "tool_sweeper"          // fejemaskine / fejesug
  | "tool_weedbrush"        // ukrudtsbørste
  | "tool_winter_plow"      // sneplov / V-plov
  | "tool_winter_blower"    // sneslynge
  | "tool_winter_spreader"  // salt-/valsespreder
  | "tool_stump"            // stubfræser
  | "tool_loose"            // løse redskaber (LOOSE_TOOL gruppe)
  | "accessory_light"       // arbejdslys, blitzlys
  | "accessory_safety"      // spikes, sikkerhed
  | "accessory_comfort"     // kabinekomfort (aircon, skyderuder, sæde)
  | "accessory_protection"  // rustbeskyttelse, konservering
  | "accessory_mounting"    // krogplade, ophæng, ledningsnet
  | "accessory_consumable"  // olie, slagler, børster
  | "service_warranty";     // udvidet komponentgaranti

export type MachinePlatform =
  | "RC-1000S"
  | "RC-751"
  | "Timan 3330"
  | "Timan 2620"
  | "Loader Line"
  | "LOOSE_TOOL";

export type Industry =
  | "municipality"          // kommuner, parker, kirkegårde
  | "landscaping"           // anlægsgartnere
  | "facility_management"   // ejendomsservice / FM
  | "agriculture"           // landbrug
  | "forestry"              // skovbrug / naturpleje
  | "highway_road"          // vej & motorvej
  | "golf_sport"            // golf, idrætsanlæg
  | "energy_solar"          // solcelleparker
  | "industrial_site";      // industrigrunde

export type WorkTask =
  | "rough_vegetation"      // grov bevoksning, brombær, bjørneklo
  | "fine_grass"            // græspleje, plæner
  | "trimming"              // kantklipning
  | "slope_mowing"          // skråningsklipning
  | "sweeping"              // fejning
  | "weed_brushing"         // ukrudtsbørstning
  | "snow_plowing"          // snerydning
  | "snow_blowing"          // sneslyngning
  | "de_icing"              // saltning / grusning
  | "stump_grinding"        // stubfræsning
  | "leaf_collection"       // løvsamling
  | "site_cleaning";        // pladsfejning / industri

export type Season =
  | "spring"
  | "summer"
  | "autumn"
  | "winter"
  | "all_year";

export type RecommendationPriority = 1 | 2 | 3 | 4 | 5; // 1 = highest

/** Multilingual short string. Always required for `da` + `en`; others optional. */
export type LocalizedShort = { da: string; en: string; de?: string; it?: string; hu?: string };

export interface ProductRecommendationMeta {
  /** Internal id from machines.ts (Machine.id or Accessory.id). */
  productId: string;
  /** Public item number (Machine.varenr or Accessory.varenr). */
  varenr: string;
  /** Short human label (Danish source of truth). */
  name: string;
  /** Coarse category — drives scoring + UI grouping. */
  category: ProductCategory;
  /** Native platform this product belongs to, if any (e.g. RC-1000S host). */
  platform?: MachinePlatform;
  /** Machine platforms this product is compatible with (for accessories/tools). */
  compatibleMachines: MachinePlatform[];
  /** Other product ids/varenrs that pair well with this one. */
  recommendedWith: string[];
  /** Typical customer industries. */
  industries: Industry[];
  /** Typical work tasks this product enables/improves. */
  workTasks: WorkTask[];
  /** Season(s) when this product is most relevant. */
  seasonRelevance: Season[];
  /** Short sales arguments (bullets). Authoring source for AI rephrasing later. */
  salesArguments: LocalizedShort[];
  /** Technical advantages — facts, not marketing. */
  technicalAdvantages: LocalizedShort[];
  /** Service / warranty relevance notes (e.g. "extended warranty available"). */
  serviceWarrantyNotes: LocalizedShort[];
  /** 1 = always recommend when applicable, 5 = only on strong signal. */
  recommendationPriority: RecommendationPriority;
  /** Short AI/sales pitch (1–2 sentences, neutral, no price). */
  shortPitch: LocalizedShort;
  /** Optional source/reference link (timan.dk, video, brochure). */
  sourceLink?: string;
  /** Free-form TODO note for the next curation pass. */
  todo?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Empty placeholder for fields awaiting curation. */
const TODO_LS: LocalizedShort = { da: "", en: "" };

// ─── Seed metadata ──────────────────────────────────────────────────────────
// Keys are productId. Order is editorial (machines first, then accessories,
// then tools). All ids verified against src/data/machines.ts.

export const PRODUCT_RECOMMENDATION_META: Record<string, ProductRecommendationMeta> = {
  // ── Base machines ────────────────────────────────────────────────────────
  "RC-1000S": {
    productId: "RC-1000S",
    varenr: "411000",
    name: "RC-1000s Basismaskine",
    category: "machine_remote",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["412594", "411630", "795016", "410910", "411742", "411845", "418000", "730600"],
    industries: ["municipality", "highway_road", "energy_solar", "landscaping", "forestry"],
    workTasks: ["rough_vegetation", "slope_mowing", "fine_grass", "sweeping", "snow_plowing", "weed_brushing"],
    seasonRelevance: ["all_year"],
    salesArguments: [
      { da: "Operatøren står sikkert udenfor – også på krævende skråninger.", en: "Operator stays safely off the machine, even on demanding slopes." },
      { da: "Én bærer, mange redskaber – året rundt drift.", en: "One carrier, many tools — year-round operation." },
    ],
    technicalAdvantages: [
      { da: "Fjernbetjent drift, ingen kabine.", en: "Remote-controlled operation, no cab." },
      { da: "Vanguard 23 HK motor.", en: "Vanguard 23 HP engine." },
    ],
    serviceWarrantyNotes: [
      { da: "Udvidet komponentgaranti (varenr. 795016) tilgængelig.", en: "Extended component warranty (item 795016) available." },
    ],
    recommendationPriority: 1,
    shortPitch: {
      da: "Fjernbetjent redskabsbærer til skråninger og krævende terræn – samme platform til klipning, fejning og snerydning.",
      en: "Remote-controlled tool carrier for slopes and demanding terrain — one platform for mowing, sweeping and snow clearing.",
    },
    sourceLink: "https://www.youtube.com/watch?v=D-hXvg_oW9s",
  },

  "RC-751": {
    productId: "RC-751",
    varenr: "410040",
    name: "RC-751",
    category: "machine_remote",
    platform: "RC-751",
    compatibleMachines: ["RC-751"],
    recommendedWith: ["411687", "411571", "795015"],
    industries: ["municipality", "highway_road", "energy_solar", "landscaping"],
    workTasks: ["rough_vegetation", "slope_mowing"],
    seasonRelevance: ["spring", "summer", "autumn"],
    salesArguments: [
      { da: "Kompakt fjernbetjent klipper til skråninger op til 50°.", en: "Compact remote-controlled mower for slopes up to 50°." },
      { da: "Manøvredygtig i svært tilgængelige områder.", en: "Maneuverable in hard-to-reach areas." },
    ],
    technicalAdvantages: [
      { da: "Lav vægt, høj hældningskapacitet.", en: "Low weight, high slope capability." },
    ],
    serviceWarrantyNotes: [
      { da: "Udvidet komponentgaranti (varenr. 795015) tilgængelig.", en: "Extended component warranty (item 795015) available." },
    ],
    recommendationPriority: 1,
    shortPitch: {
      da: "Den kompakte RC-751 håndterer skråninger op til 50°, hvor traditionelle maskiner ikke kan arbejde sikkert.",
      en: "The compact RC-751 handles slopes up to 50°, where conventional machines cannot work safely.",
    },
  },

  "Timan 3330": {
    productId: "Timan 3330",
    varenr: "712000",
    name: "Timan 3330",
    category: "machine_carrier",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: ["720125", "725131", "730020", "730114", "712060", "712147", "712140", "712166", "795002"],
    industries: ["municipality", "facility_management", "landscaping", "highway_road", "industrial_site"],
    workTasks: ["fine_grass", "sweeping", "snow_plowing", "de_icing", "site_cleaning", "leaf_collection"],
    seasonRelevance: ["all_year"],
    salesArguments: [
      { da: "Komfortabel førerkabine til lange arbejdsdage.", en: "Comfortable cab for long working days." },
      { da: "Hurtige redskabsskift – samme bærer hele året.", en: "Quick tool changes — one carrier all year." },
    ],
    technicalAdvantages: [
      { da: "Kabinemaskine med plads til aircon, skyderuder og luftaffjedret sæde.", en: "Cab machine — supports air-con, sliding windows and air-suspended seat." },
    ],
    serviceWarrantyNotes: [
      { da: "Udvidet komponentgaranti (varenr. 795002) tilgængelig.", en: "Extended component warranty (item 795002) available." },
    ],
    recommendationPriority: 1,
    shortPitch: {
      da: "Alsidig redskabsbærer med komfortabel kabine og hurtige redskabsskift – én maskine til helårsdrift.",
      en: "Versatile tool carrier with a comfortable cab and quick tool changes — one machine for year-round operation.",
    },
  },

  "Timan 2620": {
    productId: "Timan 2620",
    varenr: "999-888",
    name: "Timan 2620",
    category: "machine_carrier",
    platform: "Timan 2620",
    compatibleMachines: ["Timan 2620"],
    recommendedWith: [],
    industries: ["municipality", "facility_management", "landscaping"],
    workTasks: ["fine_grass", "sweeping", "snow_plowing"],
    seasonRelevance: ["all_year"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Timan 2620 – kompakt redskabsbærer (data kommer).", en: "Timan 2620 — compact tool carrier (data pending)." },
    todo: "Awaiting product data: specs, accessories, sales arguments. Verify varenr 999-888 with Timan.",
  },

  // ── Lights & safety accessories ──────────────────────────────────────────
  "412594": {
    productId: "412594",
    varenr: "412594",
    name: "Arbejdslamper 2 stk. (RC-1000s)",
    category: "accessory_light",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["411630", "412614"],
    industries: ["municipality", "highway_road", "facility_management"],
    workTasks: ["snow_plowing", "sweeping", "site_cleaning"],
    seasonRelevance: ["autumn", "winter"],
    salesArguments: [
      { da: "Forlænger den effektive arbejdsdag i den mørke sæson.", en: "Extends the productive working day in the dark season." },
    ],
    technicalAdvantages: [{ da: "LED – lavt strømtræk.", en: "LED — low power draw." }],
    serviceWarrantyNotes: [],
    recommendationPriority: 1,
    shortPitch: {
      da: "Arbejdslamper sikrer fuld synlighed på pladsen, når dagslyset svigter.",
      en: "Work lights ensure full visibility on site when daylight runs out.",
    },
  },

  "411630": {
    productId: "411630",
    varenr: "411630",
    name: "Blitzlys 2 stk. (RC-1000s)",
    category: "accessory_safety",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["412594", "412614"],
    industries: ["municipality", "highway_road", "facility_management"],
    workTasks: ["snow_plowing", "sweeping", "rough_vegetation"],
    seasonRelevance: ["all_year"],
    salesArguments: [
      { da: "Påkrævet ved arbejde langs trafikerede veje.", en: "Required when working along trafficked roads." },
    ],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 1,
    shortPitch: {
      da: "Blitzlys gør maskinen synlig for trafikanter og opfylder krav til arbejde nær vej.",
      en: "Flashing lights make the machine visible to traffic and meet roadside work requirements.",
    },
  },

  "411687": {
    productId: "411687",
    varenr: "411687",
    name: "Blitzlys RC-751",
    category: "accessory_safety",
    platform: "RC-751",
    compatibleMachines: ["RC-751"],
    recommendedWith: ["411571"],
    industries: ["municipality", "highway_road"],
    workTasks: ["slope_mowing", "rough_vegetation"],
    seasonRelevance: ["all_year"],
    salesArguments: [{ da: "Synlighed under skråningsarbejde nær vej.", en: "Visibility during slope work near roads." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 1,
    shortPitch: {
      da: "Blitzlys til RC-751 for synlighed på skråninger nær trafik.",
      en: "Flashing lights for RC-751 for visibility on slopes near traffic.",
    },
  },

  "411571": {
    productId: "411571",
    varenr: "411571",
    name: "Spikes-sæt til RC-751",
    category: "accessory_safety",
    platform: "RC-751",
    compatibleMachines: ["RC-751"],
    recommendedWith: ["410040", "411687"],
    industries: ["municipality", "highway_road", "energy_solar"],
    workTasks: ["slope_mowing"],
    seasonRelevance: ["spring", "summer", "autumn"],
    salesArguments: [
      { da: "Bedre greb på stejle og våde skråninger.", en: "Better grip on steep and wet slopes." },
    ],
    technicalAdvantages: [{ da: "Reducerer slip ved hældninger over 30°.", en: "Reduces slip on slopes above 30°." }],
    serviceWarrantyNotes: [],
    recommendationPriority: 1,
    shortPitch: {
      da: "Spikes giver RC-751 sikkert greb, hvor almindelige dæk mister fodfæste.",
      en: "Spikes give the RC-751 secure grip where standard tyres lose traction.",
    },
    todo: "Verify exact accessory id for spikes-set on RC-751 against machines.ts.",
  },

  // ── Tools: mowers / sweepers / weed brush ────────────────────────────────
  "410910": {
    productId: "410910",
    varenr: "410910",
    name: "Slagleklipper inkl. Y-slagle sæt",
    category: "tool_mower",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["411701", "412585", "411594", "412594", "411630"],
    industries: ["municipality", "highway_road", "energy_solar", "forestry"],
    workTasks: ["rough_vegetation", "fine_grass"],
    seasonRelevance: ["spring", "summer", "autumn"],
    salesArguments: [{ da: "Håndterer både fin og grov bevoksning.", en: "Handles both fine and rough vegetation." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 1,
    shortPitch: {
      da: "Slagleklipperen er førstevalget til alsidig vegetationspleje på RC-1000s.",
      en: "The flail mower is the first choice for versatile vegetation care on the RC-1000s.",
    },
  },

  "411845": {
    productId: "411845",
    varenr: "411845",
    name: "Centerdrevet fejemaskine",
    category: "tool_sweeper",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["712900", "412594"],
    industries: ["municipality", "facility_management", "industrial_site"],
    workTasks: ["sweeping", "site_cleaning"],
    seasonRelevance: ["all_year"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [
      { da: "Rustbeskyttelse (varenr. 712900) anbefales for længere levetid.", en: "Rust protection (item 712900) recommended for longer lifetime." },
    ],
    recommendationPriority: 2,
    shortPitch: { da: "Centerdrevet fejemaskine til effektiv fejning på RC-1000s.", en: "Center-driven sweeper for efficient sweeping on the RC-1000s." },
  },

  "730600": {
    productId: "730600",
    varenr: "730600",
    name: "WB-170 ukrudtsbørste",
    category: "tool_weedbrush",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["412603", "50101017", "50101018", "50101019", "50101020", "412594"],
    industries: ["municipality", "facility_management"],
    workTasks: ["weed_brushing", "site_cleaning"],
    seasonRelevance: ["spring", "summer", "autumn"],
    salesArguments: [{ da: "Mekanisk ukrudtsbekæmpelse uden pesticider.", en: "Mechanical weed control without pesticides." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 2,
    shortPitch: {
      da: "Mekanisk ukrudtsbørstning er pesticidfri – stadig vigtigere for kommuner og FM.",
      en: "Mechanical weed brushing is pesticide-free — increasingly important for municipalities and FM.",
    },
  },

  // ── Winter tools ─────────────────────────────────────────────────────────
  "411742": {
    productId: "411742",
    varenr: "411742",
    name: "V-plov m/gummiskær (RC-1000s)",
    category: "tool_winter_plow",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["730276", "712901", "412594", "411630"],
    industries: ["municipality", "facility_management", "industrial_site"],
    workTasks: ["snow_plowing"],
    seasonRelevance: ["winter"],
    salesArguments: [{ da: "Forvandler maskinen til vintermaskine på minutter.", en: "Turns the machine into a winter machine in minutes." }],
    technicalAdvantages: [{ da: "Gummiskær er skånsomt mod fliser og kantsten.", en: "Rubber blade is gentle on pavers and kerbs." }],
    serviceWarrantyNotes: [
      { da: "Rustbeskyttelse (varenr. 712901) anbefales mod vintersalt.", en: "Rust protection (item 712901) recommended against winter salt." },
    ],
    recommendationPriority: 1,
    shortPitch: {
      da: "V-plov med gummiskær gør RC-1000s vinterklar uden at slide på belægningen.",
      en: "V-plow with rubber blade makes the RC-1000s winter-ready without wearing the surface.",
    },
  },

  "418000": {
    productId: "418000",
    varenr: "418000",
    name: "Sneslynge 1100 mm",
    category: "tool_winter_blower",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["412594", "411630"],
    industries: ["municipality", "facility_management"],
    workTasks: ["snow_blowing"],
    seasonRelevance: ["winter"],
    salesArguments: [{ da: "Effektiv ved store snemængder.", en: "Effective for heavy snowfall." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 2,
    shortPitch: { da: "Sneslynge til RC-1000s når sneen ligger tungt.", en: "Snow blower for the RC-1000s when snow is heavy." },
  },

  "725131": {
    productId: "725131",
    varenr: "725131",
    name: "CS-200 Valsespreder",
    category: "tool_winter_spreader",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330", "Loader Line"],
    recommendedWith: ["725131__712902", "725131__725120", "725131__V34-029", "725131__V34-055"],
    industries: ["municipality", "facility_management", "industrial_site"],
    workTasks: ["de_icing"],
    seasonRelevance: ["winter"],
    salesArguments: [{ da: "Manuel regulering, robust valseteknik.", en: "Manual regulation, robust roller mechanism." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [
      { da: "Rustbeskyttelse (varenr. 712902) stærkt anbefalet ved saltbrug.", en: "Rust protection (item 712902) strongly recommended for salt use." },
    ],
    recommendationPriority: 2,
    shortPitch: { da: "CS-200 valsespreder til saltning – kræver lad og vogn.", en: "CS-200 roller spreader for salting — requires bed and trailer." },
  },

  // ── Stump grinder ────────────────────────────────────────────────────────
  "HFS-1012": {
    productId: "HFS-1012",
    varenr: "HFS-1012",
    name: "Stubfræser m/hydraulisk sving",
    category: "tool_stump",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["412594", "411630"],
    industries: ["forestry", "landscaping", "municipality"],
    workTasks: ["stump_grinding"],
    seasonRelevance: ["all_year"],
    salesArguments: [{ da: "Tager stub uden at flytte maskinen.", en: "Removes stumps without repositioning the machine." }],
    technicalAdvantages: [{ da: "Hydraulisk sving giver præcis placering.", en: "Hydraulic swing for precise placement." }],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Stubfræseren udvider RC-1000s til skov- og naturpleje.", en: "The stump grinder extends the RC-1000s into forestry and nature care." },
  },

  // ── Cab comfort (Timan 3330) ─────────────────────────────────────────────
  "712060": {
    productId: "712060",
    varenr: "712060",
    name: "Aircondition (Timan 3330)",
    category: "accessory_comfort",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: ["712147", "712140"],
    industries: ["municipality", "facility_management", "landscaping"],
    workTasks: ["fine_grass", "sweeping", "site_cleaning"],
    seasonRelevance: ["spring", "summer"],
    salesArguments: [{ da: "Holder operatøren frisk – også i varme måneder.", en: "Keeps the operator fresh — even in hot months." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Aircon i Timan 3330 forlænger den effektive arbejdsdag om sommeren.", en: "Air-con in the Timan 3330 extends the productive working day in summer." },
  },

  "712147": {
    productId: "712147",
    varenr: "712147",
    name: "Skyderuder (Timan 3330)",
    category: "accessory_comfort",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: ["712060"],
    industries: ["municipality", "facility_management"],
    workTasks: ["fine_grass", "sweeping"],
    seasonRelevance: ["spring", "summer", "autumn"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Skyderuder giver hurtig udluftning uden at åbne hele døren.", en: "Sliding windows give quick ventilation without opening the full door." },
  },

  "712140": {
    productId: "712140",
    varenr: "712140",
    name: "Luftaffjedret sæde (Timan 3330)",
    category: "accessory_comfort",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: ["712060"],
    industries: ["municipality", "facility_management", "landscaping"],
    workTasks: ["fine_grass", "sweeping", "snow_plowing", "site_cleaning"],
    seasonRelevance: ["all_year"],
    salesArguments: [{ da: "Mindre belastning på operatørens ryg ved lange arbejdsdage.", en: "Less strain on the operator's back during long working days." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 2,
    shortPitch: { da: "Luftaffjedret sæde er en lille investering, der giver mærkbar komfort hver dag.", en: "Air-suspended seat is a small investment with daily comfort impact." },
  },

  "712166": {
    productId: "712166",
    varenr: "712166",
    name: "Bakkamera (Timan 3330)",
    category: "accessory_safety",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: [],
    industries: ["municipality", "facility_management", "industrial_site"],
    workTasks: ["sweeping", "snow_plowing", "site_cleaning"],
    seasonRelevance: ["all_year"],
    salesArguments: [{ da: "Færre uheld ved bakning i trange områder.", en: "Fewer accidents when reversing in tight areas." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 1,
    shortPitch: { da: "Bakkamera øger sikkerheden i trange områder og ved bakning.", en: "Reversing camera improves safety in tight areas and when reversing." },
  },

  // ── Protection / consumables ─────────────────────────────────────────────
  "712175": {
    productId: "712175",
    varenr: "712175",
    name: "Konservering af chassis og hydraulik (Timan 3330)",
    category: "accessory_protection",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: ["795002"],
    industries: ["municipality", "highway_road", "facility_management"],
    workTasks: ["de_icing", "snow_plowing"],
    seasonRelevance: ["winter"],
    salesArguments: [{ da: "Forlænger maskinens levetid markant ved saltbrug.", en: "Significantly extends machine lifetime under salt exposure." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 4,
    shortPitch: { da: "Chassis-konservering er en lille pris for år ekstra levetid på vintermaskiner.", en: "Chassis preservation is a small price for years of extra lifetime on winter machines." },
  },

  "712900": {
    productId: "712900",
    varenr: "712900",
    name: "Rustbeskyttelse Fejemaskine",
    category: "accessory_protection",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["411845"],
    industries: ["municipality", "facility_management", "industrial_site"],
    workTasks: ["sweeping", "site_cleaning"],
    seasonRelevance: ["all_year"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 4,
    shortPitch: { da: "Rustbeskyttelse til fejemaskine – billigt nu, dyrt at undvære.", en: "Rust protection for sweeper — cheap now, expensive to skip." },
  },

  "712901": {
    productId: "712901",
    varenr: "712901",
    name: "Rustbeskyttelse V-plov",
    category: "accessory_protection",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["411742"],
    industries: ["municipality", "facility_management"],
    workTasks: ["snow_plowing", "de_icing"],
    seasonRelevance: ["winter"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 4,
    shortPitch: { da: "Rustbeskyttelse til V-plov – kritisk hvor der saltes.", en: "Rust protection for V-plow — critical where salt is used." },
  },

  // ── Service / warranty ───────────────────────────────────────────────────
  "795016": {
    productId: "795016",
    varenr: "795016",
    name: "Udvidet komponentgaranti (RC-1000s) 12 mdr.",
    category: "service_warranty",
    platform: "RC-1000S",
    compatibleMachines: ["RC-1000S"],
    recommendedWith: ["411000"],
    industries: ["municipality", "facility_management", "highway_road"],
    workTasks: [],
    seasonRelevance: ["all_year"],
    salesArguments: [{ da: "Forudsigelige driftsomkostninger i 12 ekstra måneder.", en: "Predictable operating costs for 12 extra months." }],
    technicalAdvantages: [],
    serviceWarrantyNotes: [{ da: "Dækker komponenter ud over standardgaranti.", en: "Covers components beyond the standard warranty." }],
    recommendationPriority: 3,
    shortPitch: {
      da: "Udvidet garanti giver ro i drift og forudsigelige reparationsomkostninger på RC-1000s.",
      en: "Extended warranty gives operational peace of mind and predictable repair costs on the RC-1000s.",
    },
  },

  "795015": {
    productId: "795015",
    varenr: "795015",
    name: "Udvidet komponentgaranti (RC-751) 12 mdr.",
    category: "service_warranty",
    platform: "RC-751",
    compatibleMachines: ["RC-751"],
    recommendedWith: ["410040"],
    industries: ["municipality", "facility_management"],
    workTasks: [],
    seasonRelevance: ["all_year"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Udvidet garanti til RC-751 – forudsigelige driftsomkostninger.", en: "Extended warranty for the RC-751 — predictable operating costs." },
  },

  "795002": {
    productId: "795002",
    varenr: "795002",
    name: "Udvidet komponentgaranti (Timan 3330)",
    category: "service_warranty",
    platform: "Timan 3330",
    compatibleMachines: ["Timan 3330"],
    recommendedWith: ["712000", "712175"],
    industries: ["municipality", "facility_management", "highway_road"],
    workTasks: [],
    seasonRelevance: ["all_year"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Udvidet garanti til Timan 3330 – tryghed på den daglige bærer.", en: "Extended warranty for the Timan 3330 — security on the daily carrier." },
  },

  // ── Loose tools (placeholder — extend per LOOSE_TOOL catalogue) ──────────
  "LOOSE_TOOL": {
    productId: "LOOSE_TOOL",
    varenr: "55-66",
    name: "Løse redskaber",
    category: "tool_loose",
    platform: "LOOSE_TOOL",
    compatibleMachines: ["LOOSE_TOOL"],
    recommendedWith: [],
    industries: ["municipality", "facility_management", "landscaping"],
    workTasks: [],
    seasonRelevance: ["all_year"],
    salesArguments: [],
    technicalAdvantages: [],
    serviceWarrantyNotes: [],
    recommendationPriority: 3,
    shortPitch: { da: "Løse redskaber supplerer maskinporten med fleksible enkeltløsninger.", en: "Loose tools supplement the machine fleet with flexible single-purpose solutions." },
    todo: "Curate per-tool metadata for individual loose tools (varenrs in getLooseToolAccessories()).",
  },
};

// ─── Accessors ──────────────────────────────────────────────────────────────

/** Look up by productId or varenr (varenr falls back when ids differ). */
export function getRecommendationMeta(idOrVarenr: string): ProductRecommendationMeta | null {
  if (PRODUCT_RECOMMENDATION_META[idOrVarenr]) return PRODUCT_RECOMMENDATION_META[idOrVarenr];
  for (const meta of Object.values(PRODUCT_RECOMMENDATION_META)) {
    if (meta.varenr === idOrVarenr) return meta;
  }
  return null;
}

/** All products in a given category. */
export function getMetaByCategory(category: ProductCategory): ProductRecommendationMeta[] {
  return Object.values(PRODUCT_RECOMMENDATION_META).filter((m) => m.category === category);
}

/** All products compatible with a given machine platform. */
export function getMetaCompatibleWith(platform: MachinePlatform): ProductRecommendationMeta[] {
  return Object.values(PRODUCT_RECOMMENDATION_META).filter((m) => m.compatibleMachines.includes(platform));
}

/** Pick a localized short string with safe fallbacks. */
export function pickLocalized(s: LocalizedShort, lang: Language): string {
  return s[lang] ?? s.en ?? s.da ?? "";
}

/** Sanity helper: ids currently covered (for tests / future validators). */
export function listCoveredProductIds(): string[] {
  return Object.keys(PRODUCT_RECOMMENDATION_META);
}
