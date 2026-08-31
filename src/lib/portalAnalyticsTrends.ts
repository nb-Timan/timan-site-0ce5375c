export type PortalAnalyticsTrendTone = "positive" | "negative" | "neutral";

export interface PortalAnalyticsTrend {
  text: string;
  tone: PortalAnalyticsTrendTone;
  direction: "up" | "down" | "flat";
}

function signedNumber(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function formatPercentTrend(current: number, previous: number, label = "vs. sidste uge"): PortalAnalyticsTrend {
  if (previous === 0) {
    if (current > 0) return { text: `Ny aktivitet ${label}`, tone: "positive", direction: "up" };
    return { text: `Uændret ${label}`, tone: "neutral", direction: "flat" };
  }

  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { text: `+${pct} % ${label}`, tone: "positive", direction: "up" };
  if (pct < 0) return { text: `${pct} % ${label}`, tone: "negative", direction: "down" };
  return { text: `Uændret ${label}`, tone: "neutral", direction: "flat" };
}

export function formatCountTrend(current: number, previous: number, unit: string, label = "vs. sidste uge"): PortalAnalyticsTrend {
  const diff = current - previous;
  if (diff > 0) return { text: `${signedNumber(diff)} ${unit} ${label}`, tone: "positive", direction: "up" };
  if (diff < 0) return { text: `${diff} ${unit} ${label}`, tone: "negative", direction: "down" };
  return { text: `Uændret ${label}`, tone: "neutral", direction: "flat" };
}
