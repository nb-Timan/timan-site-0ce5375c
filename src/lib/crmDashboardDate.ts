import type { PortalUiLanguage } from "@/lib/portalLanguages";

export type DashboardDateGrain = "day" | "month" | "year";
export type DashboardDateVariant = "axis" | "tooltip";

const LOCALES: Record<PortalUiLanguage, string> = {
  da: "da-DK",
  en: "en-GB",
  de: "de-DE",
  it: "it-IT",
  hu: "hu-HU",
  sv: "sv-SE",
  fr: "fr-FR",
  pl: "pl-PL",
  cs: "cs-CZ",
};

const METRIC_LABELS: Record<"revenue" | "machines", Record<PortalUiLanguage, string>> = {
  revenue: {
    da: "Omsætning",
    en: "Revenue",
    de: "Umsatz",
    it: "Fatturato",
    hu: "Árbevétel",
    sv: "Omsättning",
    fr: "Chiffre d’affaires",
    pl: "Przychód",
    cs: "Tržby",
  },
  machines: {
    da: "Maskiner",
    en: "Machines",
    de: "Maschinen",
    it: "Macchine",
    hu: "Gépek",
    sv: "Maskiner",
    fr: "Machines",
    pl: "Maszyny",
    cs: "Stroje",
  },
};

function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

function parseDashboardDate(value: string, grain: DashboardDateGrain): Date | null {
  if (grain === "year") return null;
  const match = grain === "day"
    ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    : /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  return utcDate(Number(match[1]), Number(match[2]), grain === "day" ? Number(match[3]) : 1);
}

export function formatDashboardDate(
  value: string,
  grain: DashboardDateGrain,
  language: PortalUiLanguage,
  variant: DashboardDateVariant = "axis",
): string {
  if (grain === "year") return value;
  const date = parseDashboardDate(value, grain);
  if (!date) return value;

  if (grain === "day" && language === "da") {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = String(date.getUTCFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  }

  return new Intl.DateTimeFormat(LOCALES[language], grain === "day"
    ? { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }
    : { month: variant === "tooltip" ? "long" : "short", year: variant === "tooltip" ? "numeric" : "2-digit", timeZone: "UTC" })
    .format(date);
}

export function formatDashboardMonthName(monthIndex: number, language: PortalUiLanguage): string {
  const date = utcDate(2000, monthIndex + 1, 1);
  if (!date) return String(monthIndex + 1);
  return new Intl.DateTimeFormat(LOCALES[language], { month: "short", timeZone: "UTC" }).format(date);
}

export function dashboardMetricLabel(metric: "revenue" | "machines", language: PortalUiLanguage): string {
  return METRIC_LABELS[metric][language];
}

export function formatRevenueSeriesPoint(
  point: { name: string; date?: string },
  language: PortalUiLanguage,
): { grain: "day" | "month"; axisLabel: string; tooltipLabel: string } {
  const canonicalDate = point.date && /^\d{4}-\d{2}-\d{2}/.test(point.date) ? point.date : null;
  const source = canonicalDate || point.name;
  const grain = canonicalDate || /^\d{4}-\d{2}-\d{2}/.test(source) ? "day" : "month";
  return {
    grain,
    axisLabel: formatDashboardDate(source, grain, language, "axis"),
    tooltipLabel: formatDashboardDate(source, grain, language, "tooltip"),
  };
}
