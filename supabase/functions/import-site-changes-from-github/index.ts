import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-change-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_REPOSITORY = "nb-Timan/timan-site-0ce5375c";
const DEFAULT_BRANCH = "main";
const DEFAULT_LIMIT = 25;
const PORTAL_LANGUAGES = ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"] as const;

type PortalLanguage = typeof PORTAL_LANGUAGES[number];

type GitHubCommitInput = {
  id?: string;
  sha?: string;
  message?: string;
  timestamp?: string;
  url?: string;
  added?: string[];
  modified?: string[];
  removed?: string[];
  commit?: {
    message?: string;
    author?: { date?: string };
  };
  html_url?: string;
  files?: Array<{ filename?: string; status?: string }>;
};

type RequestBody = {
  mode?: "manual";
  repository?: { full_name?: string; name?: string };
  commits?: GitHubCommitInput[];
  head_commit?: GitHubCommitInput | null;
  ref?: string;
  limit?: number;
};

type SiteChangeInsert = {
  source: string;
  source_ref: string;
  implemented_at: string;
  title_internal: string;
  description_internal: string;
  technical_description: string;
  title_public: string | null;
  description_public: string | null;
  localized_content: Record<string, Record<string, string>>;
  module: string;
  change_type: string;
  affected_roles: string[];
  user_impact_score: number;
  technical_impact_score: number;
  publish_recommendation: "publish" | "maybe" | "internal";
  is_important: boolean;
  status: "new";
  is_group?: boolean;
  group_parent_id?: string | null;
  group_suggestion_status?: "none" | "suggested";
  grouped_at?: string | null;
};

type SiteChangeGroupSuggestion = {
  group: SiteChangeInsert;
  sourceRefs: string[];
};

const MODULE_LABELS: Record<string, Partial<Record<PortalLanguage, string>>> = {
  crm: { da: "CRM", en: "CRM", de: "CRM", it: "CRM", hu: "CRM", sv: "CRM", fr: "CRM", pl: "CRM", cs: "CRM" },
  dealer_data: { da: "Partnerdata", en: "Partner data", de: "Partnerdaten", it: "Dati partner", hu: "Partneradatok", sv: "Partnerdata", fr: "Données partenaire", pl: "Dane partnera", cs: "Data partnera" },
  dealer_portal: { da: "Forhandlerportal", en: "Dealer portal", de: "Händlerportal", it: "Portale rivenditore", hu: "Kereskedői portál", sv: "Återförsäljarportal", fr: "Portail revendeur", pl: "Portal dealera", cs: "Portál prodejce" },
  service: { da: "Service & Teknik", en: "Service & Technical", de: "Service & Technik", it: "Assistenza e tecnica", hu: "Szerviz és műszaki", sv: "Service och teknik", fr: "Service et technique", pl: "Serwis i technika", cs: "Servis a technika" },
  messe: { da: "Messe", en: "Exhibition", de: "Messe", it: "Fiera", hu: "Kiállítás", sv: "Mässa", fr: "Salon", pl: "Targi", cs: "Veletrh" },
  marketing: { da: "Marketing", en: "Marketing", de: "Marketing", it: "Marketing", hu: "Marketing", sv: "Marketing", fr: "Marketing", pl: "Marketing", cs: "Marketing" },
  map: { da: "Kort / Kontrakt", en: "Map / Contract", de: "Karte / Vertrag", it: "Mappa / Contratto", hu: "Térkép / Szerződés", sv: "Karta / Avtal", fr: "Carte / Contrat", pl: "Mapa / Umowa", cs: "Mapa / Smlouva" },
  warranty: { da: "Garantiregistrering", en: "Warranty registration", de: "Garantieregistrierung", it: "Registrazione garanzia", hu: "Garanciaregisztráció", sv: "Garantiregistrering", fr: "Enregistrement de garantie", pl: "Rejestracja gwarancji", cs: "Registrace záruky" },
  claims: { da: "Reklamationer", en: "Claims", de: "Reklamationen", it: "Reclami", hu: "Reklamációk", sv: "Reklamationer", fr: "Réclamations", pl: "Reklamacje", cs: "Reklamace" },
  budget: { da: "Budget", en: "Budget", de: "Budget", it: "Budget", hu: "Költségvetés", sv: "Budget", fr: "Budget", pl: "Budżet", cs: "Rozpočet" },
  quotes: { da: "Tilbud", en: "Quotes", de: "Angebote", it: "Offerte", hu: "Ajánlatok", sv: "Offerter", fr: "Devis", pl: "Oferty", cs: "Nabídky" },
  orders: { da: "Ordrer", en: "Orders", de: "Aufträge", it: "Ordini", hu: "Megrendelések", sv: "Order", fr: "Commandes", pl: "Zamówienia", cs: "Objednávky" },
  backend: { da: "Backend", en: "Backend", de: "Backend", it: "Backend", hu: "Backend", sv: "Backend", fr: "Backend", pl: "Backend", cs: "Backend" },
};

const AREA_PREFIX: Record<PortalLanguage, string> = {
  da: "Område",
  en: "Area",
  de: "Bereich",
  it: "Area",
  hu: "Terület",
  sv: "Område",
  fr: "Zone",
  pl: "Obszar",
  cs: "Oblast",
};

const MODULE_PUBLIC_TEXT: Record<string, Record<PortalLanguage, { title: string; description: string; note: string }>> = {
  crm: {
    da: { title: "CRM er forbedret", description: "CRM-arbejdet er blevet gjort mere overskueligt, så leads, opfølgning og salgsarbejde er lettere at holde styr på.", note: "CRM forbedret" },
    en: { title: "CRM has been improved", description: "CRM work has been made clearer, so leads, follow-up and sales activity are easier to manage.", note: "CRM improved" },
    de: { title: "CRM wurde verbessert", description: "Die CRM-Arbeit ist übersichtlicher geworden, damit Leads, Nachverfolgung und Verkauf leichter gesteuert werden können.", note: "CRM verbessert" },
    it: { title: "CRM migliorato", description: "Il lavoro CRM è più chiaro, così lead, follow-up e attività commerciali sono più facili da gestire.", note: "CRM migliorato" },
    hu: { title: "A CRM továbbfejlesztve", description: "A CRM-munka áttekinthetőbb lett, így a leadek, utánkövetések és értékesítési feladatok könnyebben kezelhetők.", note: "CRM fejlesztve" },
    sv: { title: "CRM har förbättrats", description: "CRM-arbetet har blivit tydligare, så leads, uppföljning och försäljning blir lättare att hantera.", note: "CRM förbättrat" },
    fr: { title: "Le CRM a été amélioré", description: "Le travail CRM est plus clair, afin de mieux gérer les leads, le suivi et les activités commerciales.", note: "CRM amélioré" },
    pl: { title: "CRM został ulepszony", description: "Praca w CRM jest bardziej przejrzysta, dzięki czemu leady, działania następcze i sprzedaż są łatwiejsze do obsługi.", note: "CRM ulepszony" },
    cs: { title: "CRM bylo vylepšeno", description: "Práce v CRM je přehlednější, takže leady, následné kroky a prodejní aktivity se snáze řídí.", note: "CRM vylepšeno" },
  },
  dealer_data: {
    da: { title: "Partnerdata er forbedret", description: "Partneroplysninger og kontaktdata er blevet lettere at finde, vedligeholde og bruge i det daglige arbejde.", note: "Partnerdata forbedret" },
    en: { title: "Partner data has been improved", description: "Partner information and contact data are easier to find, maintain and use in daily work.", note: "Partner data improved" },
    de: { title: "Partnerdaten wurden verbessert", description: "Partnerinformationen und Kontaktdaten sind leichter zu finden, zu pflegen und im Alltag zu nutzen.", note: "Partnerdaten verbessert" },
    it: { title: "Dati partner migliorati", description: "Le informazioni partner e i dati di contatto sono più facili da trovare, mantenere e usare nel lavoro quotidiano.", note: "Dati partner migliorati" },
    hu: { title: "Partneradatok továbbfejlesztve", description: "A partnerinformációk és kapcsolattartási adatok könnyebben megtalálhatók, karbantarthatók és használhatók.", note: "Partneradatok fejlesztve" },
    sv: { title: "Partnerdata har förbättrats", description: "Partnerinformation och kontaktdata är lättare att hitta, underhålla och använda i det dagliga arbetet.", note: "Partnerdata förbättrat" },
    fr: { title: "Les données partenaires ont été améliorées", description: "Les informations partenaires et les coordonnées sont plus faciles à trouver, maintenir et utiliser au quotidien.", note: "Données partenaires améliorées" },
    pl: { title: "Dane partnera zostały ulepszone", description: "Informacje o partnerach i dane kontaktowe są łatwiejsze do znalezienia, utrzymania i użycia na co dzień.", note: "Dane partnera ulepszone" },
    cs: { title: "Data partnerů byla vylepšena", description: "Informace o partnerech a kontaktní údaje se snáze hledají, udržují a používají v každodenní práci.", note: "Data partnerů vylepšena" },
  },
  map: {
    da: { title: "Forbedret områdekort", description: "Kort og områdevalg er blevet mere overskuelige, så geografiske områder kan aflæses og bruges mere sikkert.", note: "Områdekort forbedret" },
    en: { title: "Improved territory map", description: "Maps and territory selection are clearer, so geographic areas can be reviewed and used more reliably.", note: "Territory map improved" },
    de: { title: "Verbesserte Gebietskarte", description: "Karten und Gebietsauswahl sind übersichtlicher, sodass geografische Bereiche zuverlässiger geprüft und genutzt werden können.", note: "Gebietskarte verbessert" },
    it: { title: "Mappa aree migliorata", description: "Mappe e selezione delle aree sono più chiare, così le aree geografiche possono essere controllate e usate meglio.", note: "Mappa aree migliorata" },
    hu: { title: "Továbbfejlesztett területtérkép", description: "A térképek és területválasztás áttekinthetőbbek, így a földrajzi területek megbízhatóbban használhatók.", note: "Területtérkép fejlesztve" },
    sv: { title: "Förbättrad områdeskarta", description: "Kartor och områdesval är tydligare, så geografiska områden kan granskas och användas mer säkert.", note: "Områdeskarta förbättrad" },
    fr: { title: "Carte des zones améliorée", description: "Les cartes et la sélection de zones sont plus claires, afin d’examiner et d’utiliser les zones géographiques plus sûrement.", note: "Carte des zones améliorée" },
    pl: { title: "Ulepszona mapa obszarów", description: "Mapy i wybór obszarów są bardziej przejrzyste, więc obszary geograficzne można sprawdzać i używać pewniej.", note: "Mapa obszarów ulepszona" },
    cs: { title: "Vylepšená mapa oblastí", description: "Mapy a výběr oblastí jsou přehlednější, takže geografické oblasti lze spolehlivěji kontrolovat a používat.", note: "Mapa oblastí vylepšena" },
  },
  marketing: {
    da: { title: "Marketing-indhold er forbedret", description: "Marketing kan lettere styre publiceret indhold, sprog og visning i portalen.", note: "Marketing forbedret" },
    en: { title: "Marketing content has been improved", description: "Marketing can manage published content, languages and portal display more easily.", note: "Marketing improved" },
    de: { title: "Marketing-Inhalte wurden verbessert", description: "Marketing kann veröffentlichte Inhalte, Sprachen und Portalanzeige einfacher steuern.", note: "Marketing verbessert" },
    it: { title: "Contenuti marketing migliorati", description: "Il Marketing può gestire più facilmente contenuti pubblicati, lingue e visualizzazione nel portale.", note: "Marketing migliorato" },
    hu: { title: "Marketingtartalom továbbfejlesztve", description: "A Marketing könnyebben kezelheti a közzétett tartalmat, nyelveket és portálmegjelenítést.", note: "Marketing fejlesztve" },
    sv: { title: "Marketinginnehåll har förbättrats", description: "Marketing kan enklare styra publicerat innehåll, språk och visning i portalen.", note: "Marketing förbättrat" },
    fr: { title: "Le contenu marketing a été amélioré", description: "Le marketing peut gérer plus facilement les contenus publiés, les langues et l’affichage du portail.", note: "Marketing amélioré" },
    pl: { title: "Treści marketingowe zostały ulepszone", description: "Marketing może łatwiej zarządzać opublikowanymi treściami, językami i widokiem portalu.", note: "Marketing ulepszony" },
    cs: { title: "Marketingový obsah byl vylepšen", description: "Marketing může snadněji spravovat zveřejněný obsah, jazyky a zobrazení v portálu.", note: "Marketing vylepšen" },
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() || value.trim();
}

function changedFiles(commit: GitHubCommitInput): string[] {
  const fromArrays = [
    ...(commit.added || []),
    ...(commit.modified || []),
    ...(commit.removed || []),
  ];
  const fromDetails = (commit.files || [])
    .map((file) => file.filename)
    .filter((file): file is string => Boolean(file));
  return [...new Set([...fromArrays, ...fromDetails])].sort();
}

function inferModule(files: string[], message: string): string {
  const haystack = `${files.join("\n")}\n${message}`.toLowerCase();
  if (haystack.includes("crm") || haystack.includes("lead")) return "crm";
  if (haystack.includes("partnermap") || haystack.includes("partner-map") || haystack.includes("map")) return "map";
  if (haystack.includes("dealer") || haystack.includes("forhandler")) return "dealer_data";
  if (haystack.includes("messe")) return "messe";
  if (haystack.includes("tsb")) return "tsb";
  if (haystack.includes("warranty") || haystack.includes("garanti")) return "warranty";
  if (haystack.includes("claim") || haystack.includes("reklamation")) return "claims";
  if (haystack.includes("marketing") || haystack.includes("news") || haystack.includes("changelog")) return "marketing";
  if (haystack.includes("budget")) return "budget";
  if (haystack.includes("quote") || haystack.includes("tilbud")) return "quotes";
  if (haystack.includes("order") || haystack.includes("ordre")) return "orders";
  if (haystack.includes("supabase") || haystack.includes("backend")) return "backend";
  return "backend";
}

function inferChangeType(files: string[], message: string): string {
  const haystack = `${files.join("\n")}\n${message}`.toLowerCase();
  if (haystack.includes("security") || haystack.includes("permission") || haystack.includes("rls")) return "security";
  if (haystack.includes("fix") || haystack.includes("ret ") || haystack.includes("bug")) return "bugfix";
  if (haystack.includes("performance") || haystack.includes("speed")) return "performance";
  if (haystack.includes("migration") || haystack.includes("supabase")) return "backend";
  if (haystack.includes("ui") || haystack.includes("layout") || haystack.includes("design")) return "ui_ux";
  if (haystack.includes("add") || haystack.includes("new") || haystack.includes("feature")) return "feature";
  return "improvement";
}

function inferRoles(module: string): string[] {
  if (module === "backend" || module === "users" || module === "marketing") return ["timan_backend"];
  if (["crm", "leads", "budget", "quotes", "orders"].includes(module)) return ["timan_backend", "timan_seller"];
  if (["dealer_data", "dealer_portal", "map"].includes(module)) {
    return ["timan_backend", "timan_seller", "timan_dealer", "timan_importer", "timan_service_partner"];
  }
  if (["service", "tsb", "warranty", "claims"].includes(module)) return ["timan_backend", "timan_service", "timan_dealer"];
  if (module === "messe") return ["exhibition_user", "timan_seller"];
  return ["all"];
}

function impactFor(type: string, module: string): { user: number; technical: number; recommendation: "publish" | "maybe" | "internal" } {
  if (type === "security" || module === "backend") return { user: 2, technical: 8, recommendation: "internal" };
  if (type === "feature") return { user: 7, technical: 5, recommendation: "maybe" };
  if (type === "bugfix") return { user: 5, technical: 4, recommendation: "maybe" };
  return { user: 4, technical: 4, recommendation: "maybe" };
}

function moduleLabel(module: string, language: PortalLanguage): string {
  const labels = MODULE_LABELS[module] || {};
  return labels[language] || labels.en || labels.da || module;
}

function cleanPublicTitle(value: string): string {
  return value
    .replace(/^(feat|fix|chore|refactor|style|test|docs|build|ci)(\([^)]+\))?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackPublicText(module: string, changeType: string, language: PortalLanguage): { title: string; description: string; note: string } {
  const area = moduleLabel(module, language);
  const bugfix: Record<PortalLanguage, string> = {
    da: `${area} er blevet rettet, så funktionen virker mere stabilt for brugerne.`,
    en: `${area} has been corrected so the feature works more reliably for users.`,
    de: `${area} wurde korrigiert, damit die Funktion für Benutzer zuverlässiger arbeitet.`,
    it: `${area} è stato corretto, così la funzione è più stabile per gli utenti.`,
    hu: `${area} javítva lett, így a funkció megbízhatóbban működik a felhasználók számára.`,
    sv: `${area} har rättats, så funktionen fungerar mer stabilt för användarna.`,
    fr: `${area} a été corrigé afin que la fonction soit plus fiable pour les utilisateurs.`,
    pl: `${area} został poprawiony, dzięki czemu funkcja działa stabilniej dla użytkowników.`,
    cs: `${area} bylo opraveno, takže funkce pracuje pro uživatele spolehlivěji.`,
  };
  const improvement: Record<PortalLanguage, string> = {
    da: `${area} er blevet forbedret, så hverdagsarbejdet i portalen bliver mere overskueligt.`,
    en: `${area} has been improved to make everyday portal work clearer.`,
    de: `${area} wurde verbessert, damit die tägliche Arbeit im Portal übersichtlicher wird.`,
    it: `${area} è stato migliorato per rendere più chiaro il lavoro quotidiano nel portale.`,
    hu: `${area} továbbfejlesztve, hogy a mindennapi portálmunka áttekinthetőbb legyen.`,
    sv: `${area} har förbättrats så det dagliga arbetet i portalen blir tydligare.`,
    fr: `${area} a été amélioré pour rendre le travail quotidien dans le portail plus clair.`,
    pl: `${area} został ulepszony, aby codzienna praca w portalu była bardziej przejrzysta.`,
    cs: `${area} bylo vylepšeno, aby každodenní práce v portálu byla přehlednější.`,
  };
  const title: Record<PortalLanguage, string> = {
    da: `${area} er opdateret`,
    en: `${area} has been updated`,
    de: `${area} wurde aktualisiert`,
    it: `${area} è stato aggiornato`,
    hu: `${area} frissítve`,
    sv: `${area} har uppdaterats`,
    fr: `${area} a été mis à jour`,
    pl: `${area} został zaktualizowany`,
    cs: `${area} bylo aktualizováno`,
  };
  const note: Record<PortalLanguage, string> = {
    da: `${area} opdateret`,
    en: `${area} updated`,
    de: `${area} aktualisiert`,
    it: `${area} aggiornato`,
    hu: `${area} frissítve`,
    sv: `${area} uppdaterat`,
    fr: `${area} mis à jour`,
    pl: `${area} zaktualizowany`,
    cs: `${area} aktualizováno`,
  };
  return {
    title: title[language],
    description: changeType === "bugfix" ? bugfix[language] : improvement[language],
    note: note[language],
  };
}

function buildPublishedSuggestion(module: string, changeType: string): Record<string, Record<string, string>> {
  return PORTAL_LANGUAGES.reduce((acc, language) => {
    const template = MODULE_PUBLIC_TEXT[module]?.[language] || fallbackPublicText(module, changeType, language);
    const area = moduleLabel(module, language);
    acc[language] = {
      title: template.title,
      description: `${template.description}\n\n${AREA_PREFIX[language]}: ${area}`,
      note: template.note,
      module_label: area,
      change_type_label: changeType,
    };
    return acc;
  }, {} as Record<string, Record<string, string>>);
}

function isGroupable(entry: SiteChangeInsert): boolean {
  return !entry.is_important &&
    ["improvement", "ui_ux", "bugfix", "performance"].includes(entry.change_type) &&
    entry.user_impact_score <= 6 &&
    !["security", "feature", "backend"].includes(entry.change_type);
}

function semanticKey(entry: SiteChangeInsert): string {
  const text = `${entry.title_internal}\n${entry.technical_description || ""}`.toLowerCase();
  if (entry.module === "crm" && /\b(partner|dealer|detail|overview|overblik|kpi|note|quick-card|quick card)\b/.test(text)) return "crm-partner-overview";
  if (/\b(layout|ui|ux|design|kompakt|compact)\b/.test(text)) return `${entry.module}-ui`;
  if (/\b(i18n|language|translation|sprog|oversætt)\b/.test(text)) return `${entry.module}-i18n`;
  return `${entry.module}-general`;
}

function dayKey(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function buildGroupSuggestion(entries: SiteChangeInsert[]): SiteChangeGroupSuggestion | null {
  if (entries.length < 2) return null;
  const module = entries[0].module;
  const changeType = entries.every((entry) => entry.change_type === entries[0].change_type) ? entries[0].change_type : "improvement";
  const localizedContent = buildPublishedSuggestion(module, changeType);
  const crmPartnerOverview = module === "crm" && entries.some((entry) => semanticKey(entry) === "crm-partner-overview");
  if (crmPartnerOverview) {
    localizedContent.da.title = "CRM-overblikket er forbedret";
    localizedContent.en.title = "The CRM overview has been improved";
    localizedContent.de.title = "Die CRM-Übersicht wurde verbessert";
    localizedContent.da.description = "Partneroversigten er blevet gjort mere kompakt og overskuelig. Kontaktoplysninger, KPI-kort, noter og øvrige partnerdata er blevet organiseret bedre, så de vigtigste oplysninger er lettere at finde og arbejde med.\n\nOmråde: CRM";
    localizedContent.en.description = "The partner overview has been made more compact and easier to scan. Contact details, KPI cards, notes and other partner data are organized more clearly, so the most important information is easier to find and work with.\n\nArea: CRM";
    localizedContent.de.description = "Die Partnerübersicht wurde kompakter und übersichtlicher gestaltet. Kontaktdaten, KPI-Karten, Notizen und weitere Partnerdaten sind klarer organisiert, damit wichtige Informationen leichter zu finden und zu bearbeiten sind.\n\nBereich: CRM";
  }
  const sourceRefs = entries.map((entry) => entry.source_ref).filter(Boolean);
  const implementedAt = entries.map((entry) => entry.implemented_at).sort().at(-1) || new Date().toISOString();
  const roles = Array.from(new Set(entries.flatMap((entry) => entry.affected_roles)));
  const group = {
    source: "github_group_suggestion",
    source_ref: `github-group:${module}:${changeType}:${dayKey(implementedAt)}:${semanticKey(entries[0])}`,
    implemented_at: implementedAt,
    title_internal: `${entries.length} ændringer samlet: ${localizedContent.da.title}`,
    description_internal: `Automatisk gruppeforslag fra GitHub-sync. Publiceringsteksten er foreslået ud fra ${entries.length} relaterede commits.`,
    technical_description: [
      `Denne publicering består af ${entries.length} commits.`,
      `Commits: ${sourceRefs.join(", ")}`,
      "",
      ...entries.map((entry, index) => `${index + 1}. ${entry.title_internal}\n${entry.source_ref || ""}\n${entry.technical_description || ""}`),
    ].join("\n"),
    title_public: localizedContent.da.title,
    description_public: localizedContent.da.description,
    localized_content: localizedContent,
    module,
    change_type: changeType,
    affected_roles: roles.length ? roles : ["all"],
    user_impact_score: Math.max(...entries.map((entry) => entry.user_impact_score), 3),
    technical_impact_score: Math.max(...entries.map((entry) => entry.technical_impact_score), 3),
    publish_recommendation: "maybe",
    is_important: false,
    status: "new",
    is_group: true,
    group_parent_id: null,
    group_suggestion_status: "suggested",
    grouped_at: new Date().toISOString(),
  };
  return {
    group,
    sourceRefs: sourceRefs.filter((ref): ref is string => Boolean(ref)),
  };
}

function suggestGroups(entries: SiteChangeInsert[]): SiteChangeGroupSuggestion[] {
  const buckets = new Map<string, SiteChangeInsert[]>();
  for (const entry of entries.filter(isGroupable)) {
    const key = `${entry.module}:${entry.change_type}:${dayKey(entry.implemented_at)}:${semanticKey(entry)}`;
    buckets.set(key, [...(buckets.get(key) || []), entry]);
  }
  return Array.from(buckets.values())
    .map(buildGroupSuggestion)
    .filter((entry): entry is SiteChangeGroupSuggestion => Boolean(entry));
}

function toEntry(commit: GitHubCommitInput, repository: string): SiteChangeInsert | null {
  const sha = cleanText(commit.id || commit.sha);
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) return null;
  const message = cleanText(commit.message || commit.commit?.message);
  const title = cleanPublicTitle(firstLine(message || `GitHub ændring ${sha.slice(0, 7)}`));
  const files = changedFiles(commit);
  const module = inferModule(files, message);
  const changeType = inferChangeType(files, message);
  const impact = impactFor(changeType, module);
  const localizedContent = buildPublishedSuggestion(module, changeType);
  const fileText = files.length ? files.map((file) => `- ${file}`).join("\n") : "- Ingen fil-liste modtaget.";
  const url = cleanText(commit.url || commit.html_url);

  return {
    source: "github",
    source_ref: `github:${sha}`,
    implemented_at: cleanText(commit.timestamp || commit.commit?.author?.date) || new Date().toISOString(),
    title_internal: title,
    description_internal: `Automatisk importeret fra GitHub. Publiceringsteksten er foreslået ud fra område og ændringstype.`,
    technical_description: [
      `Kilde: GitHub`,
      `Repository: ${repository}`,
      `Commit: ${sha}`,
      url ? `URL: ${url}` : null,
      "",
      "Commit message:",
      message || "(tom)",
      "",
      "Ændrede filer:",
      fileText,
    ].filter((line) => line !== null).join("\n"),
    title_public: localizedContent.da.title,
    description_public: localizedContent.da.description,
    localized_content: localizedContent,
    module,
    change_type: changeType,
    affected_roles: inferRoles(module),
    user_impact_score: impact.user,
    technical_impact_score: impact.technical,
    publish_recommendation: impact.recommendation,
    is_important: false,
    status: "new",
    is_group: false,
    group_parent_id: null,
    group_suggestion_status: "none",
    grouped_at: null,
  };
}

async function fetchJson(url: string, token: string | null): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "timan-site-change-importer",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API fejlede (${response.status}): ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function fetchRecentCommits(repository: string, branch: string, limit: number, token: string | null): Promise<GitHubCommitInput[]> {
  const base = `https://api.github.com/repos/${repository}`;
  const list = await fetchJson(`${base}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`, token);
  if (!Array.isArray(list)) throw new Error("GitHub API returnerede ikke en commit-liste.");

  const detailed: GitHubCommitInput[] = [];
  for (const item of list.slice(0, limit) as GitHubCommitInput[]) {
    const sha = cleanText(item.sha);
    if (!sha) continue;
    try {
      detailed.push(await fetchJson(`${base}/commits/${sha}`, token) as GitHubCommitInput);
    } catch {
      detailed.push(item);
    }
  }
  return detailed;
}

async function callerCanManageNews(req: Request, supabaseUrl: string, anonKey: string, serviceRole: string): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return false;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user?.email) return false;

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller } = await admin
    .from("app_users")
    .select("portal_role, approved, is_active, permissions")
    .eq("email", userData.user.email.toLowerCase())
    .maybeSingle();
  const permissions = (caller?.permissions ?? {}) as Record<string, unknown>;
  return caller?.approved === true &&
    caller?.is_active === true &&
    (caller.portal_role === "timan_backend" || permissions.news_manage === true);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SYNC_SECRET = Deno.env.get("SITE_CHANGE_SYNC_SECRET");
  const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || null;
  const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY") || DEFAULT_REPOSITORY;
  const GITHUB_BRANCH = Deno.env.get("GITHUB_BRANCH") || DEFAULT_BRANCH;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ error: "Edge Function mangler Supabase miljøvariabler." }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON body." }, 400);
  }

  const syncSecret = req.headers.get("x-site-change-sync-secret");
  const calledByGitHub = Boolean(SYNC_SECRET && syncSecret && syncSecret === SYNC_SECRET);
  const calledByUser = await callerCanManageNews(req, SUPABASE_URL, ANON_KEY, SERVICE_ROLE);
  if (!calledByGitHub && !calledByUser) {
    return json({ error: "Adgang nægtet. Kræver GitHub sync-secret eller Marketing/Backend adgang." }, 403);
  }

  const repository = cleanText(body.repository?.full_name) || GITHUB_REPOSITORY;
  const ref = cleanText(body.ref);
  if (calledByGitHub && ref && ref !== `refs/heads/${GITHUB_BRANCH}`) {
    return json({ ok: true, imported: 0, skipped: 0, message: "Ikke main branch." });
  }

  let commits = Array.isArray(body.commits) ? body.commits : [];
  if (body.head_commit && commits.length === 0) commits = [body.head_commit];
  if (body.mode === "manual") {
    commits = await fetchRecentCommits(repository, GITHUB_BRANCH, Math.min(Math.max(body.limit || DEFAULT_LIMIT, 1), 50), GITHUB_TOKEN);
  }

  const entries = commits
    .map((commit) => toEntry(commit, repository))
    .filter((entry): entry is SiteChangeInsert => Boolean(entry));

  if (entries.length === 0) {
    return json({ ok: true, imported: 0, skipped: 0, message: "Ingen commits at importere." });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sourceRefs = entries.map((entry) => entry.source_ref);
  const { data: existingRows, error: existingError } = await admin
    .from("site_change_entries")
    .select("source_ref")
    .in("source_ref", sourceRefs);
  if (existingError) return json({ error: `Kunne ikke tjekke dubletter: ${existingError.message}` }, 500);

  const existing = new Set((existingRows || []).map((row: { source_ref: string | null }) => row.source_ref).filter(Boolean));
  const newEntries = entries.filter((entry) => !existing.has(entry.source_ref));
  if (newEntries.length === 0) {
    return json({ ok: true, imported: 0, skipped: entries.length, message: "Alle commits findes allerede." });
  }

  const { data: insertedRows, error: insertError } = await admin.from("site_change_entries").insert(newEntries).select("id,source_ref,module,change_type,user_impact_score,is_important,implemented_at,title_internal,technical_description");
  if (insertError) return json({ error: `Import fejlede: ${insertError.message}` }, 500);

  let groupsSuggested = 0;
  const groupSuggestions = suggestGroups(newEntries);
  for (const suggestion of groupSuggestions) {
    const groupedSourceRefs = new Set(suggestion.sourceRefs);
    const childIds = (insertedRows || [])
      .filter((row: { id: string; source_ref: string | null }) => row.source_ref && groupedSourceRefs.has(row.source_ref))
      .map((row: { id: string }) => row.id);
    if (childIds.length < 2) continue;

    const { data: existingGroup, error: existingGroupError } = await admin
      .from("site_change_entries")
      .select("id")
      .eq("source_ref", suggestion.group.source_ref)
      .maybeSingle();
    if (existingGroupError) continue;

    let groupId = existingGroup?.id as string | undefined;
    if (!groupId) {
      const { data: groupRow, error: groupError } = await admin
        .from("site_change_entries")
        .insert(suggestion.group)
        .select("id")
        .maybeSingle();
      if (groupError || !groupRow?.id) continue;
      groupId = groupRow.id;
    }

    const { error: childError } = await admin
      .from("site_change_entries")
      .update({ group_parent_id: groupId, group_suggestion_status: "suggested", grouped_at: new Date().toISOString() })
      .in("id", childIds);
    if (!childError) groupsSuggested += 1;
  }

  return json({
    ok: true,
    imported: newEntries.length,
    skipped: entries.length - newEntries.length,
    groupsSuggested,
    commits: newEntries.map((entry) => entry.source_ref.replace("github:", "").slice(0, 7)),
  });
});
