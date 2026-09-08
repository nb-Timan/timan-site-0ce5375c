import timanLogoUrl from '@/assets/timan-logo-transparent-trimmed.png';
import { renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import { getContractDiscountStructure } from '@/lib/contractCommercialTerms';
import { type ContractSnapshot } from '@/lib/contractFlow';
import { getContractPartnerTerms } from '@/lib/contractPartnerTerms';
import {
  renderGuidedContractSections,
  type GuidedContractSection,
} from '@/lib/contractSections';

export const CONTRACT_PDF_TEMPLATE_VERSION = '2026-09-08-v1';

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
  translationPending: string;
};

const PDF_LABELS: Record<ContractDocumentLanguage, PdfLabels> = {
  da: {
    agreement: 'PARTNERAFTALE', between: 'mellem', contents: 'INDHOLDSFORTEGNELSE', parties: 'Parterne', appendices: 'Bilag', signature: 'Underskrift',
    contractNumber: 'Kontraktnummer', agreementDate: 'Aftaledato', partnerType: 'Partnertype', version: 'Version', accountNumber: 'Kontonr.',
    draft: 'UDKAST', final: 'ENDELIG', page: 'Side', of: 'af', timan: 'TIMAN A/S', partner: 'SAMARBEJDSPARTNER', name: 'Navn', title: 'Titel', date: 'Dato', signatureLine: 'Underskrift',
    translationPending: 'Juridisk oversættelse af denne kontraktskabelon afventer godkendelse.',
  },
  en: {
    agreement: 'PARTNER AGREEMENT', between: 'between', contents: 'CONTENTS', parties: 'The parties', appendices: 'Appendices', signature: 'Signature',
    contractNumber: 'Contract number', agreementDate: 'Agreement date', partnerType: 'Partner type', version: 'Version', accountNumber: 'Account no.',
    draft: 'DRAFT', final: 'FINAL', page: 'Page', of: 'of', timan: 'TIMAN A/S', partner: 'PARTNER', name: 'Name', title: 'Title', date: 'Date', signatureLine: 'Signature',
    translationPending: 'The approved legal translation for this contract template is pending review.',
  },
  de: {
    agreement: 'PARTNERVERTRAG', between: 'zwischen', contents: 'INHALTSVERZEICHNIS', parties: 'Die Parteien', appendices: 'Anhänge', signature: 'Unterschrift',
    contractNumber: 'Vertragsnummer', agreementDate: 'Vertragsdatum', partnerType: 'Partnertyp', version: 'Version', accountNumber: 'Kontonr.',
    draft: 'ENTWURF', final: 'ENDGÜLTIG', page: 'Seite', of: 'von', timan: 'TIMAN A/S', partner: 'PARTNER', name: 'Name', title: 'Titel', date: 'Datum', signatureLine: 'Unterschrift',
    translationPending: 'Die freigegebene juristische Übersetzung dieser Vertragsvorlage steht noch zur Prüfung aus.',
  },
};

export function getContractPdfLanguageReadiness(language: ContractDocumentLanguage) {
  if (language === 'da') return { productionReady: true, reason: null };
  return {
    productionReady: false,
    reason: language === 'en'
      ? 'Den engelske juridiske kontrakttekst er ikke godkendt endnu.'
      : 'Den tyske juridiske kontrakttekst er ikke godkendt endnu.',
  };
}

export function getSnapshotLegalSections(snapshot: ContractSnapshot): GuidedContractSection[] {
  if (Array.isArray(snapshot.legalSections)) return snapshot.legalSections as GuidedContractSection[];
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
  });
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

function sectionTitle(section: GuidedContractSection, index: number) {
  return `${index + 2}. ${section.title.replace(/ og Bilag \d/g, '')}`;
}

function appendixTitle(section: GuidedContractSection) {
  const appendix = section.title.match(/Bilag (\d)/)?.[1];
  return appendix ? `Bilag ${appendix} - ${section.title.replace(/^.*? og Bilag \d\s*/, '')}` : null;
}

export async function generateContractPdf(input: ContractPdfInput): Promise<GeneratedContractPdf> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const labels = PDF_LABELS[input.language];
  const legalSections = input.language === 'da' ? getSnapshotLegalSections(input.snapshot) : [];
  const partnerTerms = getContractPartnerTerms(input.snapshot.dealer.partnerType) ?? getContractPartnerTerms('dealer')!;
  const left = 18;
  const right = 192;
  const width = right - left;
  const top = 28;
  const bottom = 270;
  const tocPage = 2;
  const sectionPages: Array<{ title: string; page: number; appendix: boolean }> = [];
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
    ensure(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(17, 24, 39);
    wrapped(title, left, width, 5.8);
    y += 2;
  };
  const block = (heading: string | undefined, paragraphs: string[] = [], bullets: string[] = []) => {
    const body = [...paragraphs, ...bullets];
    const previewLines = heading ? pdf.splitTextToSize(heading, width) : [];
    ensure(Math.max(17, previewLines.length * 4.5 + (body.length ? 9 : 0)));
    if (heading) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(17, 24, 39);
      wrapped(heading, left, width, 4.4);
      y += 1.4;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.4);
    pdf.setTextColor(45, 55, 72);
    paragraphs.forEach((paragraph) => {
      wrapped(paragraph, left, width, 4.15);
      y += 1.4;
    });
    bullets.forEach((bullet) => {
      wrapped(`• ${bullet}`, left + 2.5, width - 2.5, 4.15);
      y += 1;
    });
    y += 2.4;
  };

  addPage();
  sectionPages.push({ title: labels.parties, page: pdf.getNumberOfPages(), appendix: false });
  mainHeading(`1. ${labels.parties}`);
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

  if (input.language !== 'da') {
    sectionPages.push({ title: labels.translationPending, page: pdf.getNumberOfPages(), appendix: false });
    mainHeading(labels.translationPending);
    block(undefined, [
      labels.translationPending,
      'This document is a non-production draft only. Final generation is blocked until all legal sections for the selected language have been approved.',
    ]);
  } else {
    legalSections.forEach((section, index) => {
      const appendix = appendixTitle(section);
      if (appendix) addPage();
      sectionPages.push({ title: appendix ?? sectionTitle(section, index), page: pdf.getNumberOfPages(), appendix: Boolean(appendix) });
      mainHeading(appendix ?? sectionTitle(section, index));
      section.blocks.forEach((item) => block(item.heading, item.paragraphs, item.bullets));
      if (section.stepId === 'discount_structure') {
        addPage();
        sectionPages.push({ title: 'Bilag 2 - Rabatstruktur', page: pdf.getNumberOfPages(), appendix: true });
        mainHeading('Bilag 2 - Rabatstruktur');
        const appendixParagraphs = Array.isArray((input.snapshot.appendices as { appendix2Paragraphs?: unknown } | null)?.appendix2Paragraphs)
          ? (input.snapshot.appendices as { appendix2Paragraphs: string[] }).appendix2Paragraphs
          : renderAppendix2Paragraphs(
            input.snapshot.dealer.partnerType,
            getContractDiscountStructure(input.snapshot.dealer.partnerType, input.snapshot.commercialTerms, { preserveStoredDiscounts: true }),
          );
        appendixParagraphs.forEach((paragraph) => block(undefined, [paragraph]));
      }
    });
  }

  addPage();
  sectionPages.push({ title: labels.signature, page: pdf.getNumberOfPages(), appendix: false });
  mainHeading(labels.signature);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(45, 55, 72);
  wrapped('Kontrakten kan underskrives digitalt eller fysisk. En underskrevet version behandles som en separat, versioneret upload.', left, width, 4.5);
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
    const prefix = entry.appendix ? `${labels.appendices}: ` : '';
    const title = `${prefix}${entry.title}`;
    const dotSpace = Math.max(2, Math.floor((80 - title.length) / 2));
    pdf.text(`${title} ${'.'.repeat(dotSpace)} ${entry.page}`, left, tocY);
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
      pdf.text(`${labels.page} ${page} ${labels.of} ${pageCount}`, right, 283, { align: 'right' });
    }
    if (input.mode === 'draft') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(36);
      pdf.setTextColor(225, 231, 229);
      pdf.text(labels.draft, 105, 151, { align: 'center', angle: 35 });
    }
  }

  return {
    blob: pdf.output('blob'),
    fileName: buildContractPdfFileName(input.snapshot.dealer.name, input.contractNumber),
    pageCount,
    templateVersion: CONTRACT_PDF_TEMPLATE_VERSION,
    language: input.language,
    mode: input.mode,
  };
}
