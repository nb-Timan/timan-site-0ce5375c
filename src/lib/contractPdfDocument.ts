import timanLogoUrl from '@/assets/timan-logo-transparent-trimmed.png';
import { renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import { getContractDiscountStructure } from '@/lib/contractCommercialTerms';
import { type ContractSnapshot } from '@/lib/contractFlow';
import { getContractPartnerTerms } from '@/lib/contractPartnerTerms';
import {
  renderGuidedContractSections,
  type GuidedContractSection,
} from '@/lib/contractSections';

export const CONTRACT_PDF_TEMPLATE_VERSION = '2026-09-12-v2';

export type ContractDocumentLanguage = 'da' | 'en' | 'de';
export type ContractDocumentMode = 'draft' | 'final';

type Pdf = any;

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
  between: string;
  contents: string;
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
    agreement: 'PARTNERAFTALE', between: 'mellem', contents: 'INDHOLDSFORTEGNELSE', parties: 'Parterne', appendices: 'Bilag', signature: 'Underskrift',
    contractNumber: 'Kontraktnummer', agreementDate: 'Aftaledato', partnerType: 'Partnertype', version: 'Version', accountNumber: 'Kontonr.',
    draft: 'UDKAST', final: 'ENDELIG', page: 'Side', of: 'af', timan: 'TIMAN A/S', partner: 'SAMARBEJDSPARTNER', name: 'Navn', title: 'Titel', date: 'Dato', signatureLine: 'Underskrift',
    signatureIntro: 'Kontrakten kan underskrives digitalt eller fysisk. En underskrevet version behandles som en separat, versioneret upload.',
    translationPending: 'Juridisk oversættelse af denne kontraktskabelon afventer godkendelse.',
  },
  en: {
    agreement: 'PARTNER AGREEMENT', between: 'between', contents: 'CONTENTS', parties: 'The parties', appendices: 'Appendices', signature: 'Signature',
    contractNumber: 'Contract number', agreementDate: 'Agreement date', partnerType: 'Partner type', version: 'Version', accountNumber: 'Account no.',
    draft: 'DRAFT', final: 'FINAL', page: 'Page', of: 'of', timan: 'TIMAN A/S', partner: 'PARTNER', name: 'Name', title: 'Title', date: 'Date', signatureLine: 'Signature',
    signatureIntro: 'The agreement may be signed digitally or physically. A signed version is handled as a separate, versioned upload.',
    translationPending: 'The approved legal translation for this contract template is pending review.',
  },
  de: {
    agreement: 'PARTNERVERTRAG', between: 'zwischen', contents: 'INHALTSVERZEICHNIS', parties: 'Die Parteien', appendices: 'Anhänge', signature: 'Unterschrift',
    contractNumber: 'Vertragsnummer', agreementDate: 'Vertragsdatum', partnerType: 'Partnertyp', version: 'Version', accountNumber: 'Kontonr.',
    draft: 'ENTWURF', final: 'ENDGÜLTIG', page: 'Seite', of: 'von', timan: 'TIMAN A/S', partner: 'PARTNER', name: 'Name', title: 'Titel', date: 'Datum', signatureLine: 'Unterschrift',
    signatureIntro: 'Der Vertrag kann digital oder physisch unterzeichnet werden. Eine unterzeichnete Version wird als separater, versionierter Upload verarbeitet.',
    translationPending: 'Die freigegebene juristische Übersetzung dieser Vertragsvorlage steht noch zur Prüfung aus.',
  },
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
  if (language === 'da' && Array.isArray(snapshot.legalSections)) return snapshot.legalSections as GuidedContractSection[];
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
  if (Object.values(snapshot.confirmations).some((confirmation) => !confirmation.confirmed)) issues.push('acknowledgements');
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

function isAppendixHeading(title: string) {
  return /^(?:bilag|appendix|anhang)\s+\d+/i.test(title.trim());
}

export async function generateContractPdf(input: ContractPdfInput): Promise<GeneratedContractPdf> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const labels = PDF_LABELS[input.language];
  const legalSections = getSnapshotLegalSections(input.snapshot, input.language);
  const partnerTerms = getContractPartnerTerms(input.snapshot.dealer.partnerType, input.language)
    ?? getContractPartnerTerms('dealer', input.language)!;
  const left = 18;
  const right = 192;
  const width = right - left;
  const top = 28;
  const bottom = 270;
  const tocPage = 2;
  const sectionPages: Array<{ title: string; page: number }> = [];
  let y = top;

  const logo = await loadPdfImage(timanLogoUrl);
  if (logo) pdf.addImage(logo, 'PNG', left, 18, 42, 13);

  pdf.setTextColor(20, 59, 35);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(27);
  pdf.text('TIMAN', left, 61);
  pdf.setFontSize(17);
  pdf.setTextColor(17, 24, 39);
  pdf.text(labels.agreement, left, 72);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(90, 99, 110);
  pdf.text(labels.between, left, 89);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(17, 24, 39);
  pdf.text('Timan A/S', left, 99);
  pdf.text(input.snapshot.dealer.name || '-', left, 110);
  pdf.setDrawColor(43, 120, 69);
  pdf.setLineWidth(0.8);
  pdf.line(left, 122, right, 122);
  const coverRows = [
    [labels.contractNumber, input.contractNumber],
    [labels.agreementDate, formatDate(input.snapshot.contractDate, input.language)],
    [labels.partnerType, partnerTerms.label],
    [labels.version, `${CONTRACT_PDF_TEMPLATE_VERSION} · ${input.documentVersion}`],
  ];
  if (input.dealerAccountNumber) coverRows.splice(1, 0, [labels.accountNumber, input.dealerAccountNumber]);
  pdf.setFontSize(9.5);
  coverRows.forEach(([label, value], index) => {
    const rowY = 139 + index * 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(75, 85, 99);
    pdf.text(label, left, rowY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(17, 24, 39);
    pdf.text(value, 72, rowY);
  });
  pdf.setFontSize(8);
  pdf.setTextColor(107, 114, 128);
  pdf.text(`Timan A/S · ${input.snapshot.timan.address} · ${input.snapshot.timan.postalCity}`, left, 275);

  pdf.addPage();
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(17, 24, 39);
  pdf.setFontSize(16);
  pdf.text(labels.contents, left, top);

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
  const mainHeading = (title: string) => {
    const lines = pdf.splitTextToSize(title, width) as string[];
    ensure(Math.max(20, lines.length * 5.8 + 11));
    const page = pdf.getNumberOfPages();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(17, 24, 39);
    wrapped(title, left, width, 5.8);
    y += 2;
    return page;
  };
  const block = (heading: string | undefined, paragraphs: string[] = [], bullets: string[] = []) => {
    const body = [...paragraphs, ...bullets];
    const previewLines = heading ? pdf.splitTextToSize(heading, width) : [];
    const firstBody = body[0] ? pdf.splitTextToSize(body[0], width) as string[] : [];
    const paragraphLines = paragraphs.reduce((count, paragraph) => count + (pdf.splitTextToSize(paragraph, width) as string[]).length, 0);
    const bulletLines = bullets.reduce((count, bullet) => count + (pdf.splitTextToSize(`- ${bullet}`, width - 2.5) as string[]).length, 0);
    const totalHeight = previewLines.length * 4.6
      + paragraphLines * 4.35
      + bulletLines * 4.35
      + paragraphs.length * 1.4
      + bullets.length
      + 6;
    const minimumHeight = Math.max(22, previewLines.length * 4.6 + firstBody.length * 4.35 + (body.length ? 10 : 0));
    ensure(totalHeight <= bottom - top ? Math.max(minimumHeight, totalHeight) : minimumHeight);
    const page = pdf.getNumberOfPages();
    if (heading) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.8);
      pdf.setTextColor(17, 24, 39);
      wrapped(heading, left, width, 4.6);
      y += 1.4;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.8);
    pdf.setTextColor(45, 55, 72);
    paragraphs.forEach((paragraph) => {
      wrapped(paragraph, left, width, 4.35);
      y += 1.4;
    });
    bullets.forEach((bullet) => {
      wrapped(`- ${bullet}`, left + 2.5, width - 2.5, 4.35);
      y += 1;
    });
    y += 2.4;
    return page;
  };

  const recordTocEntry = (title: string, page: number) => {
    if (!sectionPages.some((entry) => entry.title === title)) {
      sectionPages.push({ title, page });
    }
  };

  addPage();
  const partiesTitle = `1. ${labels.parties}`;
  recordTocEntry(partiesTitle, mainHeading(partiesTitle));
  block(labels.timan, [
    input.snapshot.timan.company,
    `CVR: ${input.snapshot.timan.cvr}`,
    input.snapshot.timan.address,
    input.snapshot.timan.postalCity,
    input.snapshot.timan.sellerName ? `${labels.name}: ${input.snapshot.timan.sellerName}` : '',
    input.snapshot.timan.sellerEmail ? `E-mail: ${input.snapshot.timan.sellerEmail}` : '',
  ].filter(Boolean));
  block(labels.partner, [
    input.snapshot.dealer.name,
    `CVR/VAT: ${input.snapshot.dealer.cvr || '-'}`,
    input.snapshot.dealer.address,
    `${input.snapshot.dealer.postalCode} ${input.snapshot.dealer.city}`.trim(),
    input.snapshot.dealer.country,
    input.snapshot.dealer.contactPerson ? `${labels.name}: ${input.snapshot.dealer.contactPerson}` : '',
    input.snapshot.dealer.contactTitle ? `${labels.title}: ${input.snapshot.dealer.contactTitle}` : '',
  ].filter(Boolean));

  legalSections.forEach((section) => {
    section.blocks.forEach((item) => {
      if (item.heading && isAppendixHeading(item.heading)) addPage();
      const page = block(item.heading, item.paragraphs ? [...item.paragraphs] : undefined, item.bullets ? [...item.bullets] : undefined);
      if (item.heading) recordTocEntry(item.heading, page);
    });

    if (section.stepId === 'discount_structure') {
      addPage();
      const appendixParagraphs = Array.isArray((input.snapshot.appendices as { appendix2Paragraphs?: unknown } | null)?.appendix2Paragraphs)
        ? (input.snapshot.appendices as { appendix2Paragraphs: string[] }).appendix2Paragraphs
        : renderAppendix2Paragraphs(
          input.snapshot.dealer.partnerType,
          getContractDiscountStructure(input.snapshot.dealer.partnerType, input.snapshot.commercialTerms, { preserveStoredDiscounts: true }),
          input.language,
        );
      const title = appendixParagraphs[0] || `${labels.appendices} 2`;
      recordTocEntry(title, mainHeading(title));
      appendixParagraphs.slice(1).forEach((paragraph) => block(undefined, [paragraph]));
    }
  });

  addPage();
  recordTocEntry(labels.signature, mainHeading(labels.signature));
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(45, 55, 72);
  wrapped(labels.signatureIntro, left, width, 4.5);
  y += 14;
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

  pdf.setPage(tocPage);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.2);
  pdf.setTextColor(45, 55, 72);
  let tocY = 43;
  sectionPages.forEach((entry) => {
    const title = entry.title;
    pdf.text(title, left, tocY);
    const pageText = String(entry.page);
    const dotsStart = left + pdf.getTextWidth(title) + 3;
    const dotsEnd = right - pdf.getTextWidth(pageText) - 3;
    if (dotsEnd > dotsStart) {
      pdf.setDrawColor(156, 163, 175);
      pdf.setLineDashPattern([0.5, 1.2], 0);
      pdf.line(dotsStart, tocY - 1.2, dotsEnd, tocY - 1.2);
      pdf.setLineDashPattern([], 0);
    }
    pdf.text(pageText, right, tocY, { align: 'right' });
    tocY += 7;
  });

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
    pdf.text(`${labels.page} ${page} ${labels.of} ${pageCount}`, right, 283, { align: 'right' });
    if (input.mode === 'draft') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(36);
      pdf.setTextColor(225, 231, 229);
      pdf.text(labels.draft, 105, 151, { align: 'center', angle: 35 });
    }
  }

  pdf.setProperties({
    title: `Timan Partneraftale – ${input.snapshot.dealer.name || input.contractNumber}`,
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
