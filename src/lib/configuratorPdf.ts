import type { CalcResult, ConfiguratorState, DiscountDetail, Language, LineItem } from "@/types/configurator";
import { formatMoney } from "@/data/machines";
import { getPaymentTermsLabel, resolvePaymentTerms } from "@/lib/paymentTerms";

type ConfiguratorPdfFlowType = "quote" | "order";

type ConfiguratorPdfSection = {
  title: string;
  body: string;
};

type BuildConfiguratorPdfInput = {
  jsPDF: new (...args: unknown[]) => any;
  state: ConfiguratorState;
  calcResult: CalcResult;
  flowType: ConfiguratorPdfFlowType;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  sourceQuoteNumber?: string | null;
  showPrices: boolean;
  uiLanguage: Language;
  contentLanguage: Language;
  T: (key: string) => string;
  TC: (key: string) => string;
  includeSalesArgs?: boolean;
  salesArguments?: ConfiguratorPdfSection | null;
  includeRecommendation?: boolean;
  recommendation?: ConfiguratorPdfSection | null;
};

type MachinePdfSection = {
  title: string;
  rows: LineItem[];
  subtotal?: LineItem;
};

const PAGE = {
  marginX: 16,
  marginTop: 14,
  marginBottom: 18,
  width: 210,
  height: 297,
};

const COLORS = {
  text: [17, 24, 39],
  muted: [107, 114, 128],
  border: [209, 213, 219],
  green: [5, 150, 105],
  greenDark: [4, 120, 87],
  greenPale: [236, 253, 245],
  red: [220, 38, 38],
  softGray: [249, 250, 251],
} as const;

function setColor(pdf: any, kind: "text" | "draw" | "fill", color: readonly number[]) {
  if (kind === "text") pdf.setTextColor(color[0], color[1], color[2]);
  if (kind === "draw") pdf.setDrawColor(color[0], color[1], color[2]);
  if (kind === "fill") pdf.setFillColor(color[0], color[1], color[2]);
}

function money(value: number, language: Language, showPrices: boolean): string {
  return showPrices ? formatMoney(value, language) : "-";
}

function formatDate(value: string | undefined, language: Language): string {
  if (!value) return "-";
  const localeByLang: Partial<Record<Language, string>> = {
    da: "da-DK",
    en: "en-GB",
    de: "de-DE",
    it: "it-IT",
    hu: "hu-HU",
  };
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(localeByLang[language] ?? "en-GB");
}

function today(language: Language): string {
  const localeByLang: Partial<Record<Language, string>> = {
    da: "da-DK",
    en: "en-GB",
    de: "de-DE",
    it: "it-IT",
    hu: "hu-HU",
  };
  return new Date().toLocaleDateString(localeByLang[language] ?? "en-GB");
}

function cleanMachineTitle(text: string): string {
  const match = text.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() || text.replace(/^[-\s]+/, "").trim();
}

function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+/, "")
    .trim();
}

function groupMachineSections(lineItems: LineItem[]): MachinePdfSection[] {
  const sections: MachinePdfSection[] = [];
  let current: MachinePdfSection | null = null;

  for (const item of lineItems) {
    if (item.bold && item.isMachine) {
      current = {
        title: `${item.txt.replace(/\s*\([^)]*\)\s*$/, "")} - ${cleanMachineTitle(item.txt)}`,
        rows: [{ ...item, txt: cleanMachineTitle(item.txt) }],
      };
      sections.push(current);
      continue;
    }
    if (item.subtotal) {
      if (current) current.subtotal = item;
      continue;
    }
    if (!current) {
      current = { title: "Other lines", rows: [] };
      sections.push(current);
    }
    current.rows.push(item);
  }

  return sections.filter((section) => section.rows.length > 0 || section.subtotal);
}

function addHeader(pdf: any, title: string, reference: string) {
  setColor(pdf, "text", COLORS.greenDark);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Timan", PAGE.marginX, 18);

  setColor(pdf, "text", COLORS.text);
  pdf.setFontSize(15);
  pdf.text(title, PAGE.width - PAGE.marginX, 18, { align: "right" });

  if (reference) {
    setColor(pdf, "text", COLORS.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(reference, PAGE.width - PAGE.marginX, 24, { align: "right" });
  }

  setColor(pdf, "draw", COLORS.green);
  pdf.setLineWidth(0.35);
  pdf.line(PAGE.marginX, 28, PAGE.width - PAGE.marginX, 28);
}

function addFooters(pdf: any) {
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    setColor(pdf, "draw", COLORS.border);
    pdf.setLineWidth(0.2);
    pdf.line(PAGE.marginX, 282, PAGE.width - PAGE.marginX, 282);
    setColor(pdf, "text", COLORS.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("Timan A/S · Fabriksvej 13 · 6980 Tim · Danmark", PAGE.marginX, 287);
    pdf.text(`Side ${page} af ${pageCount}`, PAGE.width - PAGE.marginX, 287, { align: "right" });
  }
}

function ensureSpace(pdf: any, y: number, needed: number, onNewPage?: () => number | void): number {
  if (y + needed <= PAGE.height - PAGE.marginBottom) return y;
  pdf.addPage();
  const nextY = onNewPage?.();
  return typeof nextY === "number" ? nextY : 34;
}

function drawLabelValueGrid(pdf: any, title: string, items: Array<[string, string | null | undefined]>, y: number): number {
  const visible = items.filter(([, value]) => String(value ?? "").trim());
  if (visible.length === 0) return y;

  y = ensureSpace(pdf, y, 18 + visible.length * 5);
  setColor(pdf, "text", COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(title, PAGE.marginX, y);
  y += 5;

  const colW = (PAGE.width - PAGE.marginX * 2 - 6) / 2;
  const rowH = 10;
  visible.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE.marginX + col * (colW + 6);
    const yy = y + row * rowH;
    setColor(pdf, "fill", COLORS.softGray);
    setColor(pdf, "draw", COLORS.border);
    pdf.roundedRect(x, yy, colW, 8, 1.5, 1.5, "FD");
    setColor(pdf, "text", COLORS.muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.text(label.toUpperCase(), x + 2, yy + 3);
    setColor(pdf, "text", COLORS.text);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.8);
    const text = pdf.splitTextToSize(String(value ?? "-"), colW - 4)[0] ?? "-";
    pdf.text(text, x + 2, yy + 6.5);
  });

  return y + Math.ceil(visible.length / 2) * rowH + 6;
}

function drawTableHeader(pdf: any, y: number, labels: { itemNo: string; description: string; price: string }) {
  const left = PAGE.marginX;
  const width = PAGE.width - PAGE.marginX * 2;
  setColor(pdf, "fill", COLORS.greenPale);
  setColor(pdf, "draw", COLORS.green);
  pdf.roundedRect(left, y, width, 8, 1.5, 1.5, "FD");
  setColor(pdf, "text", COLORS.greenDark);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(labels.itemNo, left + 2, y + 5.2);
  pdf.text(labels.description, left + 28, y + 5.2);
  pdf.text(labels.price, left + width - 2, y + 5.2, { align: "right" });
}

function drawLineRow(
  pdf: any,
  item: LineItem,
  y: number,
  input: Pick<BuildConfiguratorPdfInput, "uiLanguage" | "showPrices" | "TC">,
): number {
  const left = PAGE.marginX;
  const width = PAGE.width - PAGE.marginX * 2;
  const itemNoW = 24;
  const priceW = 34;
  const descW = width - itemNoW - priceW - 6;
  const description = `${plainText(item.txt)}${item.isAutoAdded ? ` (${input.TC("autoAdded")})` : ""}`;
  const descLines = pdf.splitTextToSize(description, descW);
  const rowH = Math.max(7, descLines.length * 4.2 + 3);

  y = ensureSpace(pdf, y, rowH + 2, () => {
    drawTableHeader(pdf, 34, {
      itemNo: input.TC("pdfItemNo"),
      description: input.TC("confirmDescription"),
      price: input.TC("pdfPrice"),
    });
    return 44;
  });

  setColor(pdf, "draw", COLORS.border);
  pdf.setLineWidth(0.15);
  pdf.line(left, y + rowH, left + width, y + rowH);
  setColor(pdf, "text", item.bold ? COLORS.text : COLORS.muted);
  pdf.setFont("helvetica", item.bold ? "bold" : "normal");
  pdf.setFontSize(item.bold ? 8 : 7.5);
  pdf.text(item.varenr || "-", left + 2, y + 5);
  pdf.text(descLines, left + itemNoW + 3, y + 5);
  pdf.text(money(item.price, input.uiLanguage, input.showPrices), left + width - 2, y + 5, { align: "right" });
  return y + rowH;
}

function drawMachineSection(
  pdf: any,
  section: MachinePdfSection,
  y: number,
  input: Pick<BuildConfiguratorPdfInput, "uiLanguage" | "showPrices" | "TC">,
): number {
  y = ensureSpace(pdf, y, 24);
  setColor(pdf, "text", COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(section.title, PAGE.marginX, y);
  y += 5;

  const labels = { itemNo: input.TC("pdfItemNo"), description: input.TC("confirmDescription"), price: input.TC("pdfPrice") };
  drawTableHeader(pdf, y, labels);
  y += 9;
  section.rows.forEach((row) => {
    y = drawLineRow(pdf, row, y, input);
  });

  if (section.subtotal) {
    y = ensureSpace(pdf, y, 10);
    setColor(pdf, "text", COLORS.text);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(section.subtotal.txt, PAGE.width - PAGE.marginX - 42, y + 5);
    pdf.text(money(section.subtotal.price, input.uiLanguage, input.showPrices), PAGE.width - PAGE.marginX, y + 5, { align: "right" });
    y += 12;
  }

  return y + 2;
}

function drawPriceSummary(
  pdf: any,
  calc: CalcResult,
  discounts: DiscountDetail[],
  y: number,
  input: Pick<BuildConfiguratorPdfInput, "uiLanguage" | "showPrices" | "TC">,
): number {
  const lines: Array<{ label: string; value: string; red?: boolean; bold?: boolean; large?: boolean }> = [
    { label: input.TC("confirmSubtotal"), value: money(calc.subtotal, input.uiLanguage, input.showPrices) },
    ...discounts.filter((d) => d.amount > 0).map((d) => ({
      label: d.varenr ? `${d.txt} (${d.varenr})` : d.txt,
      value: `-${money(d.amount, input.uiLanguage, input.showPrices)}`,
      red: true,
    })),
  ];
  if (calc.totalDiscount > 0) {
    lines.push({
      label: `${input.TC("confirmTotalDiscount")} (${calc.totalPct.toFixed(2).replace(".", ",")}%)`,
      value: `-${money(calc.totalDiscount, input.uiLanguage, input.showPrices)}`,
      red: true,
      bold: true,
    });
  }
  lines.push({ label: input.TC("confirmTotal"), value: money(calc.currentPrice, input.uiLanguage, input.showPrices), bold: true, large: true });

  y = ensureSpace(pdf, y, 16 + lines.length * 7);
  const boxW = 92;
  const x = PAGE.width - PAGE.marginX - boxW;
  setColor(pdf, "fill", COLORS.softGray);
  setColor(pdf, "draw", COLORS.border);
  pdf.roundedRect(x, y, boxW, 12 + lines.length * 6.5, 2, 2, "FD");
  y += 7;

  lines.forEach((line) => {
    setColor(pdf, "text", line.red ? COLORS.red : COLORS.text);
    pdf.setFont("helvetica", line.bold ? "bold" : "normal");
    pdf.setFontSize(line.large ? 10 : 7.5);
    pdf.text(line.label, x + 3, y);
    pdf.text(line.value, x + boxW - 3, y, { align: "right" });
    y += line.large ? 8 : 6;
  });

  return y + 8;
}

function drawTextSection(pdf: any, title: string, body: string, y: number): number {
  const cleanBody = body.trim();
  if (!cleanBody) return y;
  const lines = pdf.splitTextToSize(cleanBody, PAGE.width - PAGE.marginX * 2 - 6);
  y = ensureSpace(pdf, y, 14 + lines.length * 4);
  setColor(pdf, "fill", COLORS.softGray);
  setColor(pdf, "draw", COLORS.border);
  const boxH = 12 + lines.length * 4;
  pdf.roundedRect(PAGE.marginX, y, PAGE.width - PAGE.marginX * 2, boxH, 2, 2, "FD");
  setColor(pdf, "text", COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(title, PAGE.marginX + 3, y + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text(lines, PAGE.marginX + 3, y + 11);
  return y + boxH + 6;
}

export function buildConfiguratorPdf(input: BuildConfiguratorPdfInput): any {
  const pdf = new input.jsPDF("p", "mm", "a4");
  const title = input.flowType === "quote" ? input.TC("quoteRequestTitle") : input.TC("orderRequestTitle");
  const ref = input.orderNumber || input.quoteNumber || "";
  addHeader(pdf, title, ref);

  let y = 36;
  const deliveryMethodText = input.state.deliveryMethod ? input.TC(input.state.deliveryMethod) : "-";
  const metadata: Array<[string, string | null | undefined]> = input.flowType === "quote"
    ? [
        [input.TC("pdfQuoteNo"), input.quoteNumber || "-"],
        [input.TC("confirmDate").replace(":", ""), today(input.contentLanguage)],
        [input.TC("pdfValidUntil"), "-"],
        [input.TC("deliveryMethod"), deliveryMethodText],
        [input.TC("confirmDelivery").replace(":", ""), formatDate(input.state.date, input.contentLanguage)],
      ]
    : [
        [input.TC("pdfOrderNo"), input.orderNumber || "-"],
        [input.TC("confirmDate").replace(":", ""), today(input.contentLanguage)],
        [input.TC("confirmDelivery").replace(":", ""), formatDate(input.state.date, input.contentLanguage)],
        [input.TC("deliveryMethod"), deliveryMethodText],
        input.sourceQuoteNumber ? [input.TC("pdfCreatedFromQuote"), input.sourceQuoteNumber] : ["", ""],
      ];

  y = drawLabelValueGrid(pdf, input.TC("pdfDocument"), metadata, y);
  y = drawLabelValueGrid(pdf, input.TC("confirmCustInfo").replace(":", ""), [
    [input.TC("confirmFirm").replace(":", ""), input.state.firmanavn || "-"],
    [input.TC("confirmContact").replace(":", ""), input.state.kontaktperson || "-"],
    [input.TC("confirmPhone").replace(":", ""), input.state.telefon || "-"],
    [input.TC("confirmEmailSender").replace(":", ""), input.state.email || "-"],
    [input.TC("confirmEmailRecipient").replace(":", ""), (input.state.emailRecipient || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).join(", ") || "-"],
    input.state.comment ? [input.TC("confirmComment").replace(":", ""), input.state.comment] : ["", ""],
  ], y);

  const sections = groupMachineSections(input.calcResult.lineItems);
  sections.forEach((section) => {
    y = drawMachineSection(pdf, section, y, input);
  });

  y = drawPriceSummary(pdf, input.calcResult, input.calcResult.discountDetails, y, input);

  const terms = [
    `${getPaymentTermsLabel(input.contentLanguage)}: ${resolvePaymentTerms(input.state.paymentTerms)}`,
    `${input.TC("confirmDelivery")} ${formatDate(input.state.date, input.contentLanguage)}`,
    `${input.TC("deliveryMethod")}: ${deliveryMethodText}`,
    input.TC("confirmExVat"),
  ].join("\n");
  y = drawTextSection(pdf, input.TC("pdfTradeTerms"), terms, y);

  if (input.includeSalesArgs && input.salesArguments) {
    y = drawTextSection(pdf, input.salesArguments.title, input.salesArguments.body, y);
  }
  if (input.includeRecommendation && input.recommendation) {
    y = drawTextSection(pdf, input.recommendation.title, input.recommendation.body, y);
  }

  addFooters(pdf);
  return pdf;
}

export function buildConfiguratorPdfFilename(input: {
  flowType: ConfiguratorPdfFlowType;
  refNumber?: string | null;
  date?: Date;
  T: (key: string) => string;
}): string {
  const pdfTitle = input.flowType === "quote" ? input.T("quote") : input.T("order");
  const refSuffix = input.refNumber ? `_${input.refNumber}` : "";
  const date = (input.date ?? new Date()).toISOString().slice(0, 10);
  return `Timan_${pdfTitle}${refSuffix}_${date}.pdf`;
}
