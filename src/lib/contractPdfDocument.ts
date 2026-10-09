import timanLogoUrl from '@/assets/timan-logo-transparent-trimmed.png';
import type { jsPDF } from 'jspdf';
import { renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import { getContractDiscountStructure } from '@/lib/contractCommercialTerms';
import {
  getRequiredContractConfirmationIds,
  TIMAN_COMPANY_INFO,
  type ContractSnapshot,
} from '@/lib/contractFlow';
import { getContractPartnerTerms } from '@/lib/contractPartnerTerms';
import {
  buildContractPdfPresentation,
  loadContractPdfTerritoryMaps,
  stripContractPdfHeadingPrefix,
  type ContractPdfJsonLoader,
  type ContractPdfMapModel,
} from '@/lib/contractPdfPresentation';
import {
  renderGuidedContractSections,
  type GuidedContractSection,
} from '@/lib/contractSections';

export const CONTRACT_PDF_TEMPLATE_VERSION = '2026-09-12-v2';

export type ContractDocumentLanguage = 'da' | 'en' | 'de';
export type ContractDocumentMode = 'draft' | 'final';

type Pdf = jsPDF;

export type ContractPdfInput = {
  snapshot: ContractSnapshot;
  contractNumber: string;
  dealerAccountNumber?: string | null;
  language: ContractDocumentLanguage;
  mode: ContractDocumentMode;
  documentVersion: number;
};

export type GeneratedContractPdf = {
  blob: Blob;
  fileName: string;
  pageCount: number;
  templateVersion: string;
  language: ContractDocumentLanguage;
  mode: ContractDocumentMode;
};

type PdfLabels = {
  agreement: string;
  parties: string;
  appendices: string;
  signature: string;
  contractNumber: string;
  agreementDate: string;
  partnerType: string;
  version: string;
  accountNumber: string;
  draft: string;
  final: string;
  page: string;
  of: string;
  timan: string;
  partner: string;
  name: string;
  title: string;
  date: string;
  signatureLine: string;
  signatureIntro: string;
  translationPending: string;
};

const PDF_LABELS: Record<ContractDocumentLanguage, PdfLabels> = {
  da: {
    agreement: 'PARTNERAFTALE', parties: 'Parterne', appendices: 'Bilag', signature: 'Underskrift',
    contractNumber: 'Kontraktnummer', agreementDate: 'Aftaledato', partnerType: 'Partnertype', version: 'Version', accountNumber: 'Kontonr.',
    draft: 'UDKAST', final: 'ENDELIG', page: 'Side', of: 'af', timan: 'TIMAN A/S', partner: 'SAMARBEJDSPARTNER', name: 'Navn', title: 'Titel', date: 'Dato', signatureLine: 'Underskrift',
    signatureIntro: 'Kontrakten kan underskrives digitalt eller fysisk. En underskrevet version behandles som en separat, versioneret upload.',
    translationPending: 'Juridisk oversættelse af denne kontraktskabelon afventer godkendelse.',
  },
  en: {
    agreement: 'PARTNER AGREEMENT', parties: 'The parties', appendices: 'Appendices', signature: 'Signature',
    contractNumber: 'Contract number', agreementDate: 'Agreement date', partnerType: 'Partner type', version: 'Version', accountNumber: 'Account no.',
    draft: 'DRAFT', final: 'FINAL', page: 'Page', of: 'of', timan: 'TIMAN A/S', partner: 'PARTNER', name: 'Name', title: 'Title', date: 'Date', signatureLine: 'Signature',
    signatureIntro: 'The agreement may be signed digitally or physically. A signed version is handled as a separate, versioned upload.',
    translationPending: 'The approved legal translation for this contract template is pending review.',
  },
  de: {
    agreement: 'PARTNERVERTRAG', parties: 'Die Parteien', appendices: 'Anhänge', signature: 'Unterschrift',
    contractNumber: 'Vertragsnummer', agreementDate: 'Vertragsdatum', partnerType: 'Partnertyp', version: 'Version', accountNumber: 'Kontonr.',
    draft: 'ENTWURF', final: 'ENDGÜLTIG', page: 'Seite', of: 'von', timan: 'TIMAN A/S', partner: 'PARTNER', name: 'Name', title: 'Titel', date: 'Datum', signatureLine: 'Unterschrift',
    signatureIntro: 'Der Vertrag kann digital oder physisch unterzeichnet werden. Eine unterzeichnete Version wird als separater, versionierter Upload verarbeitet.',
    translationPending: 'Die freigegebene juristische Übersetzung dieser Vertragsvorlage steht noch zur Prüfung aus.',
  },
};

export type ContractPdfGenerationOptions = {
  loadJson?: ContractPdfJsonLoader;
  logoDataUrl?: string | null;
};

export function getContractPdfLanguageReadiness(language: ContractDocumentLanguage) {
  return { productionReady: ['da', 'en', 'de'].includes(language), reason: null };
}

export function getSnapshotLegalSections(
  snapshot: ContractSnapshot,
  language: ContractDocumentLanguage = 'da',
): GuidedContractSection[] {
  // Existing Danish snapshots are immutable source material. Localized PDFs use
  // the same frozen business data with the approved language rendering.
  if (Array.isArray(snapshot.legalSections) && (language === 'da' || !Array.isArray(snapshot.applicableStepIds))) {
    return snapshot.legalSections as GuidedContractSection[];
  }
  return renderGuidedContractSections({
    companyName: snapshot.dealer.name,
    partnerType: snapshot.dealer.partnerType,
    primaryTerritory: snapshot.territory?.primaryTerritory,
    secondaryTerritory: snapshot.territory?.secondaryTerritory,
    serviceHourlyRateDkk: snapshot.serviceTerms?.hourlyRateDkk,
    paymentTerm: snapshot.paymentTerms?.paymentTerm,
    machineDiscountPct: snapshot.commercialTerms?.machineDiscountPct,
    equipmentDiscountPct: snapshot.commercialTerms?.equipmentDiscountPct,
    sparePartsDiscountPct: snapshot.commercialTerms?.sparePartsDiscountPct,
    preserveDiscountSnapshot: true,
  }, language);
}

export function buildContractPdfFileName(partnerName: string, contractNumber: string) {
  const safe = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'partner';
  return `Timan-Partneraftale-${safe(partnerName)}-${safe(contractNumber)}.pdf`;
}

export async function sha256Hex(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function loadPdfImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function formatDate(value: string, language: ContractDocumentLanguage) {
  if (!value) return '-';
  const locale = language === 'da' ? 'da-DK' : language === 'de' ? 'de-DE' : 'en-GB';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
}

export type ContractPdfPreflightIssue =
  | 'contract_number'
  | 'dealer_account_number'
  | 'partner_name'
  | 'partner_contact'
  | 'partner_type'
  | 'agreement_date'
  | 'timan_contact'
  | 'territory'
  | 'payment_terms'
  | 'acknowledgements';

const PREFLIGHT_LABELS: Record<ContractDocumentLanguage, Record<ContractPdfPreflightIssue, string>> = {
  da: {
    contract_number: 'kontraktnummer', dealer_account_number: 'kontonummer', partner_name: 'partnernavn', partner_contact: 'partnerkontakt', partner_type: 'partnertype',
    agreement_date: 'aftaledato', timan_contact: 'Timan-kontakt', territory: 'område', payment_terms: 'betalingsbetingelser', acknowledgements: 'bekræftelser',
  },
  en: {
    contract_number: 'contract number', dealer_account_number: 'account number', partner_name: 'partner name', partner_contact: 'partner contact', partner_type: 'partner type',
    agreement_date: 'agreement date', timan_contact: 'Timan contact', territory: 'territory', payment_terms: 'payment terms', acknowledgements: 'acknowledgements',
  },
  de: {
    contract_number: 'Vertragsnummer', dealer_account_number: 'Kontonummer', partner_name: 'Partnername', partner_contact: 'Partnerkontakt', partner_type: 'Partnertyp',
    agreement_date: 'Vertragsdatum', timan_contact: 'Timan-Kontakt', territory: 'Gebiet', payment_terms: 'Zahlungsbedingungen', acknowledgements: 'Bestätigungen',
  },
};

export function getContractPdfPreflightIssues(input: Pick<ContractPdfInput, 'snapshot' | 'contractNumber' | 'dealerAccountNumber'>): ContractPdfPreflightIssue[] {
  const { snapshot } = input;
  const issues: ContractPdfPreflightIssue[] = [];
  if (!input.contractNumber.trim()) issues.push('contract_number');
  if (!input.dealerAccountNumber?.trim()) issues.push('dealer_account_number');
  if (!snapshot.dealer.name.trim()) issues.push('partner_name');
  if (!snapshot.dealer.contactPerson.trim()) issues.push('partner_contact');
  if (!snapshot.dealer.partnerType) issues.push('partner_type');
  if (!snapshot.contractDate) issues.push('agreement_date');
  if (!snapshot.timan.sellerName.trim() || !snapshot.timan.sellerEmail.trim()) issues.push('timan_contact');
  if (!snapshot.territory?.primaryTerritory) issues.push('territory');
  if (!snapshot.paymentTerms?.paymentTerm) issues.push('payment_terms');
  const confirmationPartnerType = Array.isArray(snapshot.applicableStepIds) ? snapshot.dealer.partnerType : 'dealer';
  if (getRequiredContractConfirmationIds(confirmationPartnerType).some((confirmationId) => !snapshot.confirmations[confirmationId]?.confirmed)) {
    issues.push('acknowledgements');
  }
  return issues;
}

export function formatContractPdfPreflightIssues(
  issues: readonly ContractPdfPreflightIssue[],
  language: ContractDocumentLanguage,
) {
  const prefix = language === 'da'
    ? 'PDF kan ikke genereres. Mangler:'
    : language === 'de'
      ? 'PDF kann nicht erstellt werden. Fehlend:'
      : 'PDF cannot be generated. Missing:';
  return `${prefix} ${issues.map((issue) => PREFLIGHT_LABELS[language][issue]).join(', ')}.`;
}

type PdfPoint = [number, number];

function geometryRings(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(geometryRings);
  return [];
}

function simplifyRing(points: readonly GeoJSON.Position[], maxPoints = 320) {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const simplified = points.filter((_, index) => index % stride === 0);
  const last = points[points.length - 1];
  if (simplified[simplified.length - 1] !== last) simplified.push(last);
  return simplified;
}

function getContractPdfMapBounds(model: ContractPdfMapModel) {
  const coordinates = model.features.flatMap((feature) => geometryRings(feature.geometry)).flat();
  if (!coordinates.length) return null;
  const latitudes = coordinates.map((position) => Number(position[1]));
  const middleLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const longitudeScale = Math.max(0.1, Math.cos((middleLatitude * Math.PI) / 180));
  const projected = coordinates.map((position) => [Number(position[0]) * longitudeScale, Number(position[1])] as PdfPoint);
  return {
    minX: Math.min(...projected.map(([pointX]) => pointX)),
    maxX: Math.max(...projected.map(([pointX]) => pointX)),
    minY: Math.min(...projected.map(([, pointY]) => pointY)),
    maxY: Math.max(...projected.map(([, pointY]) => pointY)),
    longitudeScale,
  };
}

export function getContractPdfMapFrame(model: ContractPdfMapModel, maxWidth = 174, maxHeight = 70) {
  const bounds = getContractPdfMapBounds(model);
  if (!bounds) return { width: maxWidth, height: maxHeight, aspectRatio: maxWidth / maxHeight };
  const aspectRatio = Math.max((bounds.maxX - bounds.minX) / Math.max(bounds.maxY - bounds.minY, 0.001), 0.1);
  const contentWidth = Math.min(maxWidth, maxHeight * aspectRatio);
  return {
    width: Math.min(maxWidth, Math.max(64, contentWidth + 16)),
    height: maxHeight,
    aspectRatio,
  };
}

function drawContractTerritoryMap(
  pdf: Pdf,
  model: ContractPdfMapModel,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const rings = model.features.flatMap((feature) => geometryRings(feature.geometry));
  const bounds = getContractPdfMapBounds(model);
  if (!bounds) return;
  const { minX, maxX, minY, maxY, longitudeScale } = bounds;
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  const padding = 4;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY);
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = x + padding + (availableWidth - drawnWidth) / 2;
  const offsetY = y + padding + (availableHeight - drawnHeight) / 2;
  const project = (position: GeoJSON.Position): PdfPoint => [
    offsetX + (Number(position[0]) * longitudeScale - minX) * scale,
    offsetY + drawnHeight - (Number(position[1]) - minY) * scale,
  ];

  pdf.setFillColor(248, 250, 249);
  pdf.setDrawColor(203, 213, 205);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');

  model.features.forEach((feature) => {
    if (feature.selected) {
      if (model.variant === 'secondary') {
        pdf.setFillColor(246, 235, 197);
        pdf.setDrawColor(166, 124, 29);
      } else {
        pdf.setFillColor(220, 239, 226);
        pdf.setDrawColor(40, 122, 72);
      }
      pdf.setLineWidth(0.45);
    } else {
      pdf.setFillColor(241, 245, 242);
      pdf.setDrawColor(156, 163, 175);
      pdf.setLineWidth(0.18);
    }

    geometryRings(feature.geometry).forEach((sourceRing) => {
      const ring = simplifyRing(sourceRing);
      if (ring.length < 3) return;
      const projected = ring.map(project);
      const [startX, startY] = projected[0];
      const deltas = projected.slice(1).map(([pointX, pointY], index) => {
        const [previousX, previousY] = projected[index];
        return [pointX - previousX, pointY - previousY];
      });
      pdf.lines(deltas, startX, startY, [1, 1], 'FD', true);
    });
  });
}

export async function generateContractPdf(
  input: ContractPdfInput,
  options: ContractPdfGenerationOptions = {},
): Promise<GeneratedContractPdf> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const labels = PDF_LABELS[input.language];
  const legalSections = getSnapshotLegalSections(input.snapshot, input.language);
  const presentation = buildContractPdfPresentation(input.snapshot, legalSections, input.language);
  const territoryMaps = await loadContractPdfTerritoryMaps(
    input.snapshot.territory,
    input.language,
    options.loadJson,
  );
  const partnerTerms = getContractPartnerTerms(input.snapshot.dealer.partnerType, input.language)
    ?? getContractPartnerTerms('dealer', input.language)!;
  const left = 18;
  const right = 192;
  const width = right - left;
  const top = 25;
  const bottom = 269;
  const sectionPages: Array<{ title: string; page: number }> = [];
  let y = top;

  const logo = options.logoDataUrl === undefined ? await loadPdfImage(timanLogoUrl) : null;
  if (options.logoDataUrl) pdf.addImage(options.logoDataUrl, 'PNG', left, 18, 44, 14);
  else if (logo) pdf.addImage(logo, 'PNG', left, 18, 44, 14);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(21);
  pdf.setTextColor(17, 24, 39);
  pdf.text(labels.agreement, left, 62);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(40, 122, 72);
  pdf.text(partnerTerms.label, left, 73);
  pdf.setDrawColor(43, 120, 69);
  pdf.setLineWidth(0.6);
  pdf.line(left, 91, right, 91);
  const coverRows = [
    [labels.contractNumber, input.contractNumber],
    [labels.agreementDate, formatDate(input.snapshot.contractDate, input.language)],
    [labels.partnerType, partnerTerms.label],
    [labels.version, `${CONTRACT_PDF_TEMPLATE_VERSION} / ${input.documentVersion}`],
  ];
  if (input.dealerAccountNumber) coverRows.splice(1, 0, [labels.accountNumber, input.dealerAccountNumber]);
  pdf.setFontSize(9.5);
  coverRows.forEach(([label, value], index) => {
    const rowY = 111 + index * 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(75, 85, 99);
    pdf.text(label, left, rowY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(17, 24, 39);
    pdf.text(value, 72, rowY);
  });
  const addPage = () => {
    pdf.addPage();
    y = top;
  };
  const ensure = (needed: number) => {
    if (y + needed > bottom) addPage();
  };
  const wrapped = (text: string, x: number, maxWidth: number, lineHeight: number) => {
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    lines.forEach((line) => {
      ensure(lineHeight);
      pdf.text(line, x, y);
      y += lineHeight;
    });
  };
  const getBlockRequiredHeight = (
    heading: string | undefined,
    paragraphs: string[] = [],
    bullets: string[] = [],
  ) => {
    const body = [...paragraphs, ...bullets];
    const headingLines = heading ? pdf.splitTextToSize(heading, width) as string[] : [];
    const firstBodyLines = body[0] ? pdf.splitTextToSize(body[0], width) as string[] : [];
    const paragraphLines = paragraphs.reduce((count, paragraph) => count + (pdf.splitTextToSize(paragraph, width) as string[]).length, 0);
    const bulletLines = bullets.reduce((count, bullet) => count + (pdf.splitTextToSize(`- ${bullet}`, width - 2.5) as string[]).length, 0);
    const totalHeight = headingLines.length * 5
      + paragraphLines * 4.45
      + bulletLines * 4.45
      + paragraphs.length * 1.4
      + bullets.length
      + 6;
    const minimumHeight = Math.max(18, headingLines.length * 5 + firstBodyLines.length * 4.45 + (body.length ? 8 : 0));
    return totalHeight <= bottom - top ? Math.max(minimumHeight, totalHeight) : minimumHeight;
  };
  const mainHeading = (title: string, followingContentHeight = 0) => {
    const lines = pdf.splitTextToSize(title, width) as string[];
    ensure(Math.max(36, lines.length * 6.5 + followingContentHeight + 7));
    const page = pdf.getNumberOfPages();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(20, 89, 51);
    wrapped(title, left, width, 6.5);
    y += 3;
    return page;
  };
  const block = (heading: string | undefined, paragraphs: string[] = [], bullets: string[] = []) => {
    ensure(getBlockRequiredHeight(heading, paragraphs, bullets));
    if (heading) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.8);
      pdf.setTextColor(17, 24, 39);
      wrapped(heading, left, width, 5);
      y += 1.6;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.2);
    pdf.setTextColor(45, 55, 72);
    paragraphs.forEach((paragraph) => {
      wrapped(paragraph, left, width, 4.45);
      y += 1.4;
    });
    bullets.forEach((bullet) => {
      wrapped(`- ${bullet}`, left + 2.5, width - 2.5, 4.45);
      y += 1;
    });
    y += 2.4;
  };

  const recordSectionEntry = (title: string, page: number) => {
    if (!sectionPages.some((entry) => entry.title === title)) {
      sectionPages.push({ title, page });
    }
  };

  addPage();
  const partiesTitle = `${presentation.parties.number}. ${presentation.parties.title}`;
  recordSectionEntry(partiesTitle, mainHeading(partiesTitle));
  const partyTop = y;
  const columnWidth = 80;
  const partyColumn = (x: number, heading: string, lines: string[]) => {
    let columnY = partyTop;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.8);
    pdf.setTextColor(17, 24, 39);
    pdf.text(heading, x, columnY);
    columnY += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.9);
    pdf.setTextColor(45, 55, 72);
    lines.filter(Boolean).forEach((line) => {
      const wrappedLines = pdf.splitTextToSize(line, columnWidth) as string[];
      pdf.text(wrappedLines, x, columnY);
      columnY += wrappedLines.length * 4.4 + 0.8;
    });
    return columnY;
  };
  const timanColumnBottom = partyColumn(left, labels.timan, [
    TIMAN_COMPANY_INFO.company,
    `CVR: ${TIMAN_COMPANY_INFO.cvr}`,
    TIMAN_COMPANY_INFO.address,
    TIMAN_COMPANY_INFO.postalCity,
    TIMAN_COMPANY_INFO.country,
    input.snapshot.timan.sellerName ? `${labels.name}: ${input.snapshot.timan.sellerName}` : '',
    input.snapshot.timan.sellerEmail ? `E-mail: ${input.snapshot.timan.sellerEmail}` : '',
  ]);
  const partnerColumnBottom = partyColumn(108, labels.partner, [
    input.snapshot.dealer.name,
    `CVR/VAT: ${input.snapshot.dealer.cvr || '-'}`,
    input.snapshot.dealer.address,
    `${input.snapshot.dealer.postalCode} ${input.snapshot.dealer.city}`.trim(),
    input.snapshot.dealer.country,
    input.snapshot.dealer.contactPerson ? `${labels.name}: ${input.snapshot.dealer.contactPerson}` : '',
    input.snapshot.dealer.contactTitle ? `${labels.title}: ${input.snapshot.dealer.contactTitle}` : '',
  ]);
  pdf.setDrawColor(213, 220, 214);
  pdf.setLineWidth(0.2);
  pdf.line(101, partyTop, 101, Math.max(timanColumnBottom, partnerColumnBottom));
  y = Math.max(timanColumnBottom, partnerColumnBottom) + 8;

  presentation.sections.forEach((section) => {
    const sectionTitle = `${section.number}. ${section.title}`;
    const firstBlock = section.blocks[0];
    const firstBlockRequiredHeight = firstBlock
      ? getBlockRequiredHeight(firstBlock.heading, firstBlock.paragraphs, firstBlock.bullets)
      : 0;
    recordSectionEntry(sectionTitle, mainHeading(sectionTitle, firstBlockRequiredHeight));
    section.blocks.forEach((item) => {
      block(item.heading, item.paragraphs, item.bullets);
    });

    if (section.stepId === 'discount_structure') {
      const appendixParagraphs = Array.isArray((input.snapshot.appendices as { appendix2Paragraphs?: unknown } | null)?.appendix2Paragraphs)
        ? (input.snapshot.appendices as { appendix2Paragraphs: string[] }).appendix2Paragraphs
        : renderAppendix2Paragraphs(
          input.snapshot.dealer.partnerType,
          getContractDiscountStructure(input.snapshot.dealer.partnerType, input.snapshot.commercialTerms, { preserveStoredDiscounts: true }),
          input.language,
        );
      const subsectionNumber = section.blocks.filter((item) => item.heading).length + 1;
      const title = stripContractPdfHeadingPrefix(appendixParagraphs[0] || labels.appendices);
      block(`${section.number}.${subsectionNumber} ${title}`, appendixParagraphs.slice(1));
    }

    if (section.stepId === 'territory') {
      territoryMaps.forEach((map) => {
        const mapFrame = getContractPdfMapFrame(map, width, 70);
        const mapHeight = mapFrame.height;
        const mapWidth = mapFrame.width;
        const mapX = left + (width - mapWidth) / 2;
        ensure(mapHeight + 18);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.4);
        pdf.setTextColor(17, 24, 39);
        pdf.text(map.title, left, y);
        y += 4;
        drawContractTerritoryMap(pdf, map, mapX, y, mapWidth, mapHeight);
        y += mapHeight + 3.5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8);
        pdf.setTextColor(107, 114, 128);
        pdf.text(map.attribution, left, y);
        y += 8;
      });
    }
  });

  ensure(88);
  const signatureTitle = `${presentation.signature.number}. ${presentation.signature.title}`;
  recordSectionEntry(signatureTitle, mainHeading(signatureTitle));
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(45, 55, 72);
  wrapped(labels.signatureIntro, left, width, 4.5);
  y += 10;
  const signatureColumn = (x: number, heading: string, name: string, title: string) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(17, 24, 39);
    pdf.text(heading, x, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(`${labels.name}: ${name || '-'}`, x, y + 10);
    pdf.text(`${labels.title}: ${title || '-'}`, x, y + 19);
    pdf.text(`${labels.date}:`, x, y + 35);
    pdf.line(x, y + 40, x + 68, y + 40);
    pdf.text(`${labels.signatureLine}:`, x, y + 54);
    pdf.line(x, y + 59, x + 68, y + 59);
  };
  signatureColumn(left, labels.timan, input.snapshot.timan.sellerName, 'Timan A/S');
  signatureColumn(108, labels.partner, input.snapshot.dealer.contactPerson, input.snapshot.dealer.contactTitle);

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    if (page > 1) {
      pdf.setDrawColor(213, 220, 214);
      pdf.setLineWidth(0.2);
      pdf.line(left, 14, right, 14);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.setTextColor(90, 99, 110);
      pdf.text(`Timan A/S · ${input.contractNumber} · ${CONTRACT_PDF_TEMPLATE_VERSION}`, left, 11);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    pdf.setTextColor(90, 99, 110);
    pdf.text(`${TIMAN_COMPANY_INFO.company} · ${TIMAN_COMPANY_INFO.address} · ${TIMAN_COMPANY_INFO.postalCity}`, left, 283);
    pdf.text(`${labels.page} ${page} ${labels.of} ${pageCount}`, right, 283, { align: 'right' });
    if (input.mode === 'draft') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(36);
      pdf.setTextColor(225, 231, 229);
      pdf.text(labels.draft, 105, 151, { align: 'center', angle: 35 });
    }
  }

  if (pdf.outline?.add) {
    const root = pdf.outline.add(null, labels.agreement, { pageNumber: 1 });
    sectionPages.forEach((entry) => {
      pdf.outline.add(root, entry.title, { pageNumber: entry.page });
    });
  }

  pdf.setProperties({
    title: `Timan Partneraftale - ${input.snapshot.dealer.name || input.contractNumber}`,
    subject: `Contract ${input.contractNumber}`,
    author: 'Timan A/S',
    keywords: `Timan, Partneraftale, ${input.contractNumber}`,
    creator: 'Timan Partner Portal',
  });

  return {
    blob: pdf.output('blob'),
    fileName: buildContractPdfFileName(input.snapshot.dealer.name, input.contractNumber),
    pageCount,
    templateVersion: CONTRACT_PDF_TEMPLATE_VERSION,
    language: input.language,
    mode: input.mode,
  };
}
