import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSignature, FileText, Lock, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { ContractTerritoryMap } from '@/components/contracts/ContractTerritoryMap';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  buildContractSnapshot,
  canLeaveContractStep,
  canPrepareContractForSignature,
  CONTRACT_STEPS,
  getContractAppendixLabel,
  getContractStepLabel,
  getContractWorkflowStatusLabel,
  hasReachedContractStatus,
  type ContractSnapshot,
  type ContractStatus,
  type ContractWorkflowStatus,
  ContractConfirmations,
  ContractFormData,
  EMPTY_CONTRACT_CONFIRMATIONS,
  TIMAN_COMPANY_INFO,
  getContractStatus,
  getRequiredConfirmationForStep,
  hasRequiredPartyData,
  normalizeContractStepId,
} from '@/lib/contractFlow';
import {
  addSignedUrlsToUploadVersions,
  completeDealerContractGuidedReview,
  createDealerContractUploadVersion,
  deleteDealerContractUploadFile,
  fetchDealerContractDraft,
  fetchDealerContractUploadVersions,
  getCurrentStepId,
  markDealerContractPdfGenerated,
  reorderDealerContractUploadFiles,
  saveDealerContractDraft,
  submitDealerContractUpload,
  uploadDealerContractFile,
  type DealerContractRecord,
  type DealerContractUploadFile,
  type DealerContractUploadVersion,
} from '@/lib/dealerContractsService';
import { fetchDealerAccountByNumber } from '@/lib/dealerAccountsService';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess } from '@/lib/portalAccess';
import { supabase } from '@/lib/supabase';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { APPENDIX_2_EXAMPLE_LINES, renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import {
  getGuidedContractDisplayHeading,
  getRenderedGuidedContractSection,
  renderGuidedContractSections,
  shouldHideGuidedContractUiText,
  type GuidedContractSection,
  type ContractTextBlock,
} from '@/lib/contractSections';
import {
  CONTRACT_PARTNER_TYPES,
  getContractPartnerTerms,
  getContractPartnerTypeLabel,
  inferContractPartnerTypeFromDealerAccount,
  type ContractPartnerType,
} from '@/lib/contractPartnerTerms';
import {
  CONTRACT_TERRITORY_COUNTRIES,
  createEmptyContractTerritoryArea,
  createEmptySecondaryContractTerritoryArea,
  getContractTerritoryDisplayItems,
  getContractTerritoryCountryLabel,
  getContractTerritoryPostalLabel,
  hasValidContractTerritory,
  isValidContractTerritoryArea,
  buildContractTerritoryAreaFromPostalFields,
  normalizeContractSecondaryTerritoryArea,
  normalizeContractTerritoryArea,
  serializeContractPostalInput,
  type ContractSecondaryTerritoryArea,
  type ContractTerritoryArea,
} from '@/lib/contractTerritory';
import {
  DEFAULT_CONTRACT_SERVICE_HOURLY_RATE_DKK,
  formatContractServiceHourlyRatePerHourDkk,
  isValidContractServiceHourlyRateDkk,
  shouldResetContractServiceConfirmation,
} from '@/lib/contractServiceTerms';
import {
  CONTRACT_PAYMENT_TERM_OPTIONS,
  DEFAULT_CONTRACT_PAYMENT_TERM,
  contractPaymentTermHasMissingLegalText,
  getContractPaymentTermLabel,
  normalizeContractPaymentTerm,
  shouldResetContractPaymentConfirmation,
  type ContractPaymentTermId,
} from '@/lib/contractPaymentTerms';
import { t } from '@/lib/i18n/translations';

const CONTRACT_DOCS = [
  { title: 'Forhandlerkontrakt Timan', href: '/contracts/forhandlerkontrakt-timan.pdf', section: 'Hovedaftale' },
  { title: 'Bilag 3 - Salgsområde', href: '/contracts/bilag-3-salgsomraade-kontrakt-timan.pdf', section: 'Samarbejde' },
  { title: 'Bilag 2 - Rabat', href: '/contracts/bilag-2-rabat-kontrakt-timan.pdf', section: 'Rabatstruktur' },
  { title: 'Bilag 1 - Service', href: '/contracts/bilag-1-service-kontrakt-timan.pdf', section: 'Service' },
  { title: 'Bilag 4 - Salgs- og leveringsbetingelser', href: '/contracts/bilag-4-salgs-og-leveringsbetingelser-timan.pdf', section: 'Kommercielle vilkår' },
];

const SPARE_PARTS_PORTAL_URL = 'https://cloud.interactivespares.com/timan/categorie/0000+-+Front+page';
const SPARE_PARTS_PORTAL_BULLET = "Reservedele bestilles via Timan A/S' webshop.";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateDa(value: string) {
  if (!value) return '';
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString('da-DK');
  } catch {
    return value;
  }
}

function safeFilePart(value: string) {
  return (value || 'forhandler')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function splitPostalCity(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\S+)\s+(.+)$/);
  return {
    postalCode: match?.[1] ?? trimmed,
    city: match?.[2] ?? '',
  };
}

function drawWrappedPdfText(pdf: any, text: string, x: number, y: number, maxWidth: number, lineHeight = 4.2) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function ensurePdfSpace(pdf: any, y: number, needed = 18) {
  if (y + needed <= 282) return y;
  pdf.addPage();
  return 18;
}

function addPhysicalSignatureFieldsToPdf(pdf: any, snapshot: ContractSnapshot) {
  const partnerTerms = getContractPartnerTerms(snapshot.dealer.partnerType) ?? getContractPartnerTerms('dealer')!;
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    const isLastPage = page === pageCount;
    const y = isLastPage ? 246 : 266;
    pdf.setDrawColor(156, 163, 175);
    pdf.setTextColor(55, 65, 81);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(isLastPage ? 'Fysisk underskrift' : 'Initialer', 16, y - 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);

    const fields = isLastPage
      ? [
        { label: 'Navn', value: snapshot.dealer.contactPerson || '', x: 16, w: 39 },
        { label: 'Dato', value: formatDateDa(snapshot.contractDate), x: 60, w: 28 },
        { label: 'Firma', value: snapshot.dealer.name || '', x: 93, w: 45 },
        { label: 'Underskrift', value: '', x: 143, w: 51 },
      ]
      : [
        { label: `${partnerTerms.label} initialer`, value: snapshot.dealer.contactPerson || '', x: 16, w: 60 },
        { label: 'Dato', value: formatDateDa(snapshot.contractDate), x: 82, w: 36 },
      ];

    fields.forEach((field) => {
      pdf.text(field.label, field.x, y);
      if (field.value) pdf.text(String(field.value).slice(0, 32), field.x, y + 5);
      pdf.line(field.x, y + 8, field.x + field.w, y + 8);
    });

    pdf.setFontSize(6.4);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Side ${page} af ${pageCount}`, 194, 286, { align: 'right' });
  }
}

function drawContractTextBlockPdf(pdf: any, block: ContractTextBlock, left: number, right: number, y: number) {
  const width = right - left;
  y = ensurePdfSpace(pdf, y, 18);

  if (block.heading) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(17, 24, 39);
    y = drawWrappedPdfText(pdf, block.heading, left, y, width, 4.2);
    y += 1.8;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.6);
  pdf.setTextColor(31, 41, 55);

  block.paragraphs?.forEach((paragraph) => {
    y = ensurePdfSpace(pdf, y, 12);
    y = drawWrappedPdfText(pdf, paragraph, left, y, width, 3.7);
    y += 1.4;
  });

  block.bullets?.forEach((bullet) => {
    y = ensurePdfSpace(pdf, y, 10);
    y = drawWrappedPdfText(pdf, `- ${bullet}`, left + 3, y, width - 3, 3.7);
    y += 1.2;
  });

  return y + 2;
}

function getSnapshotLegalSections(snapshot: ContractSnapshot): GuidedContractSection[] {
  if (Array.isArray(snapshot.legalSections)) return snapshot.legalSections as GuidedContractSection[];
  return renderGuidedContractSections({
    companyName: snapshot.dealer.name,
    partnerType: snapshot.dealer.partnerType,
    primaryTerritory: snapshot.territory?.primaryTerritory,
    secondaryTerritory: snapshot.territory?.secondaryTerritory,
    serviceHourlyRateDkk: snapshot.serviceTerms?.hourlyRateDkk,
    paymentTerm: snapshot.paymentTerms?.paymentTerm,
  });
}

function drawGuidedContractSectionsPdf(pdf: any, left: number, right: number, sections: GuidedContractSection[], appendix2Paragraphs: string[]) {
  let y = 18;

  sections.forEach((section, index) => {
    y = ensurePdfSpace(pdf, y, 24);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(17, 24, 39);
    y = drawWrappedPdfText(pdf, `${index + 2}. ${section.title}`, left, y, right - left, 4.8);
    y += 2;

    section.blocks.forEach((block) => {
      y = drawContractTextBlockPdf(pdf, block, left, right, y);
    });

    if (section.stepId === 'discount_structure') {
      y = ensurePdfSpace(pdf, y, 124);
      if (y > 30) {
        pdf.addPage();
      }
      drawAppendix2Pdf(pdf, left, right, appendix2Paragraphs);
      y = 132;
    }
  });

  return y;
}

function drawAppendix2Pdf(pdf: any, left: number, right: number, paragraphs: string[]) {
  let y = 16;
  const width = right - left;

  paragraphs.forEach((paragraph, index) => {
    const isHeading = index === 0 || /^\d+\./.test(paragraph);
    pdf.setFont('helvetica', isHeading ? 'bold' : 'normal');
    pdf.setFontSize(isHeading ? 9.5 : 8);
    pdf.setTextColor(17, 24, 39);
    y = drawWrappedPdfText(pdf, paragraph, left, y, width, isHeading ? 4.6 : 4);
    y += isHeading ? 2 : 1.5;
  });

  y += 2;
  pdf.setDrawColor(46, 125, 23);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(left, y, width, 107, 3, 3, 'FD');

  const machineX = left + 2;
  const machineW = 128;
  const refundX = left + 136;
  const refundW = width - 138;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.7);
  pdf.setTextColor(17, 24, 39);
  pdf.text('Hele maskinordren inkl. redskaber.', machineX + machineW / 2, y + 9, { align: 'center' });
  pdf.text('Refusion ved garantiregistrering.', refundX + refundW / 2, y + 9, { align: 'center' });

  pdf.setDrawColor(46, 125, 23);
  pdf.line(machineX, y + 13, machineX, y + 18);
  pdf.line(machineX, y + 13, machineX + machineW, y + 13);
  pdf.line(machineX + machineW, y + 13, machineX + machineW, y + 18);
  pdf.line(refundX, y + 13, refundX, y + 18);
  pdf.line(refundX, y + 13, refundX + refundW, y + 13);
  pdf.line(refundX + refundW, y + 13, refundX + refundW, y + 18);

  const headerY = y + 30;
  pdf.setFontSize(7.8);
  pdf.text('Grundrabat', left + 20, headerY);
  pdf.text('Stk. rabat', left + 68, headerY);
  pdf.text('Leveringsrabat', left + 111, headerY);
  pdf.text('Demonstrationsrabat', left + 155, headerY);
  pdf.line(left + 2, headerY + 5, right - 2, headerY + 5);

  const contentY = headerY + 22;
  pdf.setDrawColor(111, 148, 75);
  pdf.circle(left + 20, contentY + 12, 13, 'S');
  pdf.setTextColor(46, 125, 23);
  pdf.setFontSize(19);
  pdf.text('25%', left + 20, contentY + 14, { align: 'center' });
  pdf.setTextColor(17, 24, 39);
  pdf.setFontSize(6.7);
  pdf.text('Grund rabat', left + 20, contentY + 22, { align: 'center' });

  pdf.setDrawColor(46, 125, 23);
  pdf.line(left + 35, contentY + 12, left + 43, contentY + 12);
  pdf.text('>', left + 44, contentY + 14);

  const stairX = left + 50;
  const stairBaseY = contentY + 33;
  pdf.setLineWidth(1.2);
  pdf.line(stairX, stairBaseY, stairX + 18, stairBaseY);
  pdf.line(stairX + 18, stairBaseY, stairX + 18, stairBaseY - 14);
  pdf.line(stairX + 18, stairBaseY - 14, stairX + 37, stairBaseY - 14);
  pdf.line(stairX + 37, stairBaseY - 14, stairX + 37, stairBaseY - 28);
  pdf.line(stairX + 37, stairBaseY - 28, stairX + 57, stairBaseY - 28);
  pdf.setLineWidth(0.2);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.4);
  pdf.setTextColor(17, 24, 39);
  pdf.text('1 stk.', stairX + 10, stairBaseY - 8, { align: 'center' });
  pdf.text('2-3 stk.', stairX + 29, stairBaseY - 22, { align: 'center' });
  pdf.text('4 stk. og >', stairX + 48, stairBaseY - 36, { align: 'center' });
  pdf.setTextColor(46, 125, 23);
  pdf.setFontSize(10);
  pdf.text('+0%', stairX + 10, stairBaseY - 1, { align: 'center' });
  pdf.text('+2%', stairX + 29, stairBaseY - 15, { align: 'center' });
  pdf.text('+4%', stairX + 48, stairBaseY - 29, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.line(left + 110, contentY + 12, left + 118, contentY + 12);
  pdf.text('>', left + 119, contentY + 14);

  const deliveryX = left + 123;
  pdf.setDrawColor(111, 148, 75);
  pdf.setFillColor(253, 255, 250);
  pdf.roundedRect(deliveryX, contentY - 9, 35, 46, 3, 3, 'FD');
  pdf.circle(deliveryX + 17.5, contentY + 12, 12, 'S');
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('Leveringstid:', deliveryX + 17.5, contentY + 8, { align: 'center' });
  pdf.text('Over 3 mdr.', deliveryX + 17.5, contentY + 14, { align: 'center' });
  pdf.setTextColor(46, 125, 23);
  pdf.setFontSize(10);
  pdf.text('+2%', deliveryX + 17.5, contentY + 21, { align: 'center' });
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.2);
  pdf.text('Rabatten gives ved', deliveryX + 17.5, contentY + 32, { align: 'center' });
  pdf.text('leveringstid over 3 måneder.', deliveryX + 17.5, contentY + 38, { align: 'center' });

  pdf.setDrawColor(46, 125, 23);
  pdf.line(deliveryX + 38, contentY + 12, deliveryX + 46, contentY + 12);
  pdf.text('>', deliveryX + 47, contentY + 14);

  const demoX = left + 167;
  pdf.setDrawColor(111, 148, 75);
  pdf.setFillColor(253, 255, 250);
  pdf.roundedRect(demoX, contentY - 8, 25, 45, 3, 3, 'FD');
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.6);
  pdf.text('Egen', demoX + 14, contentY + 3);
  pdf.text('demonstrationsrabat', demoX + 14, contentY + 10);
  pdf.setTextColor(46, 125, 23);
  pdf.setFontSize(11);
  pdf.text('3100 kr.', demoX + 14, contentY + 19);
  pdf.setDrawColor(167, 191, 139);
  pdf.line(demoX + 3, contentY + 26, demoX + 22, contentY + 26);
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(5.9);
  pdf.text('Udbetales som kreditnota', demoX + 12.5, contentY + 33, { align: 'center' });
  pdf.text('ved garantiregistrering.', demoX + 12.5, contentY + 39, { align: 'center' });

  const exampleY = y + 90;
  pdf.setDrawColor(67, 160, 71);
  pdf.setFillColor(250, 253, 250);
  pdf.roundedRect(left + 2, exampleY, width - 4, 14, 2, 2, 'FD');
  pdf.circle(left + 13, exampleY + 7, 5, 'S');
  pdf.setTextColor(46, 125, 23);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('%', left + 13, exampleY + 9, { align: 'center' });
  pdf.text('Eksempel:', left + 26, exampleY + 6);
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.7);
  pdf.text('Den maksimale rabat, som kan opnås på en maskine og redskaber er:', left + 26, exampleY + 11);
  pdf.setTextColor(46, 125, 23);
  pdf.setFont('helvetica', 'bold');
  pdf.text('25% + 4% + 2% = 29,44 %', left + 103, exampleY + 11);
}

export default function ContractsPage() {
  const { appUser, loading, logout } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [signatureName, setSignatureName] = useState('');
  const [contractRowId, setContractRowId] = useState<string | null>(null);
  const [contractRecord, setContractRecord] = useState<DealerContractRecord | null>(null);
  const [contractLoaded, setContractLoaded] = useState(false);
  const [contractLoadError, setContractLoadError] = useState<string | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<ContractSnapshot | null>(null);
  const [uploadVersions, setUploadVersions] = useState<DealerContractUploadVersion[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const dealerAccountNumber = (searchParams.get('accountNumber') || searchParams.get('dealer') || '').trim();

  const draftKey = useMemo(() => (
    `${effectiveUser?.email?.toLowerCase() ?? 'anonymous'}:${dealerAccountNumber || 'manual'}`
  ), [dealerAccountNumber, effectiveUser?.email]);

  const [form, setForm] = useState<ContractFormData>(() => ({
    dealerName: '',
    dealerAddress: '',
    dealerPostalCode: '',
    dealerCity: '',
    dealerCvr: '',
    contactPerson: '',
    contactTitle: '',
    timanSellerName: '',
    timanSellerEmail: '',
    timanSellerPhone: '',
    contractDate: todayIso(),
    primaryTerritory: createEmptyContractTerritoryArea(),
    secondaryTerritory: createEmptySecondaryContractTerritoryArea(),
    serviceHourlyRateDkk: DEFAULT_CONTRACT_SERVICE_HOURLY_RATE_DKK,
    paymentTerm: DEFAULT_CONTRACT_PAYMENT_TERM,
    signatureDataUrl: null,
    partnerType: '',
  }));

  const [confirmations, setConfirmations] = useState<ContractConfirmations>(EMPTY_CONTRACT_CONFIRMATIONS);

  useEffect(() => {
    if (!effectiveUser?.email) return;
    let cancelled = false;
    setContractLoaded(false);
    setContractLoadError(null);

    fetchDealerContractDraft({
      ownerEmail: effectiveUser.email,
      dealerAccountNumber,
    }).then(({ row, error }) => {
      if (cancelled) return;
      if (error) {
        setContractLoadError(error);
        toast.error('Kunne ikke hente gemt kontraktkladde.');
        setContractLoaded(true);
        return;
      }
      if (row) {
        setContractRowId(row.id);
        setContractRecord(row);
        setForm((current) => ({
          ...current,
          ...row.form_data,
          signatureDataUrl: row.signature_data_url,
        }));
        setConfirmations({ ...EMPTY_CONTRACT_CONFIRMATIONS, ...row.confirmations });
        setFinalSnapshot(row.final_snapshot);
        const stepIndex = CONTRACT_STEPS.findIndex((step) => step.id === normalizeContractStepId(row.current_step));
        setActiveStepIndex(stepIndex >= 0 ? stepIndex : 0);
        if (row.signature_data_url) setSignatureName('Gemt signatur');
      } else {
        setContractRowId(null);
        setContractRecord(null);
        setFinalSnapshot(null);
        setSignatureName('');
      }
      setContractLoaded(true);
    });

    return () => { cancelled = true; };
  }, [dealerAccountNumber, draftKey, effectiveUser?.email]);

  useEffect(() => {
    if (!effectiveUser) return;
    let cancelled = false;

    const applySeller = (phone = '') => {
      if (cancelled) return;
      setForm((current) => ({
        ...current,
        timanSellerName: current.timanSellerName || effectiveUser.display_name || effectiveUser.email || '',
        timanSellerEmail: current.timanSellerEmail || effectiveUser.email || '',
        timanSellerPhone: current.timanSellerPhone || phone,
      }));
    };

    const userPhone = (effectiveUser as unknown as Record<string, unknown>).phone
      || (effectiveUser as unknown as Record<string, unknown>).phone_number
      || (effectiveUser as unknown as Record<string, unknown>).mobile
      || (effectiveUser as unknown as Record<string, unknown>).telephone;
    if (typeof userPhone === 'string' && userPhone.trim()) {
      applySeller(userPhone.trim());
      return () => { cancelled = true; };
    }

    supabase
      .from('app_users')
      .select('*')
      .eq('email', effectiveUser.email.toLowerCase())
      .maybeSingle()
      .then(({ data }) => {
        const row = (data ?? {}) as Record<string, unknown>;
        const phone = row.phone || row.phone_number || row.mobile || row.telephone;
        applySeller(typeof phone === 'string' ? phone.trim() : '');
      })
      .catch(() => applySeller(''));

    return () => { cancelled = true; };
  }, [effectiveUser]);

  useEffect(() => {
    if (!dealerAccountNumber) return;
    let cancelled = false;
    fetchDealerAccountByNumber(dealerAccountNumber).then(({ row, error }) => {
      if (cancelled) return;
      if (error) {
        toast.error('Kunne ikke hente forhandlerdata til kontrakten.');
        return;
      }
      if (!row) return;
      const postalCity = [row.postal_code, row.city].filter(Boolean).join(' ') || row.zip_city_raw || '';
      const split = splitPostalCity(postalCity);
      setForm((current) => ({
        ...current,
        dealerName: row.company_name || current.dealerName,
        dealerAddress: [row.address_line_1 || row.address, row.address_line_2].filter(Boolean).join(', ') || current.dealerAddress,
        dealerPostalCode: row.postal_code || split.postalCode || current.dealerPostalCode,
        dealerCity: row.city || split.city || current.dealerCity,
        dealerCvr: row.vat_number || current.dealerCvr,
        contactPerson: row.primary_contact_name || row.sales_contact_name || current.contactPerson,
        partnerType: current.partnerType || inferContractPartnerTypeFromDealerAccount(row) || '',
      }));
    });
    return () => { cancelled = true; };
  }, [dealerAccountNumber]);

  const portalRole = derivePortalRole(effectiveUser);
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);
  const hasAccess = portalRole === 'timan_backend' || hasModuleAccess(portalRole, 'contracts', moduleOverride);
  const activeStep = CONTRACT_STEPS[activeStepIndex];
  const activeStepLabel = getContractStepLabel(activeStep.id, uiLanguage);
  const appendixLabel = getContractAppendixLabel(uiLanguage);
  const showActiveStepAppendixBadge = activeStep.appendix && activeStep.id !== 'territory' && activeStep.id !== 'discount_structure';
  const status = getContractStatus(form, confirmations);
  const workflowStatus: ContractWorkflowStatus = contractRecord?.contract_status ?? (status === 'Draft' ? 'draft' : status === 'In review' ? 'guided_review' : 'ready_for_signature');
  const workflowStatusLabel = getContractWorkflowStatusLabel(workflowStatus);
  const isLockedContract = hasReachedContractStatus(workflowStatus, 'ready_for_signature');
  const isSigned = workflowStatus === 'approved' || workflowStatus === 'archived';
  const readyForSignature = canPrepareContractForSignature(form, confirmations);
  const currentConfirmationId = getRequiredConfirmationForStep(activeStep.id);
  const validPrimaryTerritory = hasValidContractTerritory(form);
  const validServiceHourlyRate = isValidContractServiceHourlyRateDkk(form.serviceHourlyRateDkk);
  const currentStepValid = activeStep.id === 'territory'
    ? validPrimaryTerritory
    : activeStep.id === 'spare_parts_service'
      ? validServiceHourlyRate
      : true;
  const currentStepConfirmed = currentStepValid
    && (!currentConfirmationId || Boolean(confirmations[currentConfirmationId]?.confirmed));

  const update = (key: keyof ContractFormData, value: string | null) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateForm = (patch: Partial<ContractFormData>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateServiceHourlyRate = (value: number) => {
    setConfirmations((current) => {
      if (!shouldResetContractServiceConfirmation(
        form.serviceHourlyRateDkk,
        value,
        Boolean(current.spare_parts_service?.confirmed),
      )) {
        return current;
      }
      return {
        ...current,
        spare_parts_service: { confirmed: false },
      };
    });
    setForm((current) => ({ ...current, serviceHourlyRateDkk: value }));
  };

  const updatePaymentTerm = (value: ContractPaymentTermId) => {
    const nextTerm = normalizeContractPaymentTerm(value);
    setConfirmations((current) => {
      if (!shouldResetContractPaymentConfirmation(
        form.paymentTerm,
        nextTerm,
        Boolean(current.payment_delivery?.confirmed),
      )) {
        return current;
      }
      return {
        ...current,
        payment_delivery: { confirmed: false },
      };
    });
    setForm((current) => ({ ...current, paymentTerm: nextTerm }));
  };

  const saveDraft = () => {
    void persistContract({ showToast: true });
  };

  const getSnapshotForStatus = (nextStatus: ContractStatus): ContractSnapshot | null => {
    if (finalSnapshot?.status === 'Signed') return finalSnapshot;
    if (nextStatus !== 'Signed') return finalSnapshot;
    return buildContractSnapshot(form, confirmations);
  };

  const persistContract = async (options: { showToast?: boolean; snapshot?: ContractSnapshot | null } = {}) => {
    if (!effectiveUser?.email || !contractLoaded) return;
    if (!['draft', 'guided_review'].includes(workflowStatus)) return;
    const snapshot = options.snapshot ?? getSnapshotForStatus(status);
    const { row, error } = await saveDealerContractDraft({
      id: contractRowId,
      ownerEmail: effectiveUser.email,
      ownerName: effectiveUser.display_name || effectiveUser.email,
      dealerAccountNumber,
      activeStepIndex,
      form,
      confirmations,
      status,
      finalSnapshot: snapshot,
    });
    if (error) {
      toast.error('Kontraktkladde kunne ikke gemmes.');
      return;
    }
    if (row) {
      setContractRowId(row.id);
      setContractRecord(row);
      setFinalSnapshot(row.final_snapshot);
    }
    if (options.showToast) toast.success('Kontraktkladde gemt.');
  };

  useEffect(() => {
    if (!effectiveUser?.email || !contractLoaded) return;
    if (status === 'Signed' && finalSnapshot?.status === 'Signed') return;
    const timer = window.setTimeout(() => {
      void persistContract();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeStepIndex, confirmations, contractLoaded, dealerAccountNumber, effectiveUser?.email, form, status, workflowStatus]);

  const refreshUploadVersions = async (contractId = contractRowId) => {
    if (!contractId) return;
    const { rows, error } = await fetchDealerContractUploadVersions(contractId);
    if (error) {
      toast.error('Kunne ikke hente uploadede kontraktdokumenter.');
      return;
    }
    setUploadVersions(await addSignedUrlsToUploadVersions(rows));
  };

  useEffect(() => {
    if (!contractRowId || !hasReachedContractStatus(workflowStatus, 'awaiting_signed_upload')) {
      setUploadVersions([]);
      return;
    }
    void refreshUploadVersions(contractRowId);
  }, [contractRowId, workflowStatus]);

  const confirmSection = () => {
    if (!currentConfirmationId || !effectiveUser) return;
    setConfirmations((current) => ({
      ...current,
      [currentConfirmationId]: {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedBy: effectiveUser.display_name || effectiveUser.email,
      },
    }));
  };

  const goNext = () => {
    if (!canLeaveContractStep(activeStep.id, confirmations)) {
      toast.error('Bekræft dette afsnit, før du går videre.');
      return;
    }
    if (activeStep.id === 'territory' && !validPrimaryTerritory) {
      toast.error('Vælg et gyldigt primært område, før du går videre.');
      return;
    }
    if (activeStep.id === 'spare_parts_service' && !validServiceHourlyRate) {
      toast.error('Angiv en gyldig timetakst for reklamationsarbejde, før du går videre.');
      return;
    }
    if (activeStep.id === 'parties' && !hasRequiredPartyData(form)) {
      toast.error('Vælg partnertype og udfyld Timan-sælger samt virksomhedsoplysninger, før du går videre.');
      return;
    }
    setActiveStepIndex((current) => Math.min(current + 1, CONTRACT_STEPS.length - 1));
  };

  const goPrevious = () => setActiveStepIndex((current) => Math.max(current - 1, 0));

  const completeGuidedReview = async () => {
    if (!readyForSignature) {
      toast.error('Udfyld parterne og bekræft alle kontraktafsnit først.');
      return;
    }
    let id = contractRowId;
    if (!id) {
      const saved = await saveDealerContractDraft({
        ownerEmail: effectiveUser?.email || form.timanSellerEmail,
        ownerName: effectiveUser?.display_name || effectiveUser?.email || form.timanSellerName,
        dealerAccountNumber,
        activeStepIndex,
        form,
        confirmations,
        status: 'Ready for signature',
        finalSnapshot: null,
      });
      if (saved.error || !saved.row) {
        toast.error('Kontrakten kunne ikke gemmes før låsning.');
        return;
      }
      id = saved.row.id;
      setContractRowId(id);
      setContractRecord(saved.row);
    }

    const legalSections = renderGuidedContractSections({
      companyName: form.dealerName,
      partnerType: form.partnerType,
      primaryTerritory: form.primaryTerritory,
      secondaryTerritory: form.secondaryTerritory,
      serviceHourlyRateDkk: form.serviceHourlyRateDkk,
      paymentTerm: form.paymentTerm,
    });
    const appendix2Paragraphs = renderAppendix2Paragraphs(form.partnerType);
    const completedAt = new Date().toISOString();
    const snapshot = buildContractSnapshot(form, confirmations, {
      contractId: id,
      contractNumber: contractRecord?.contract_number,
      workflowStatus: 'ready_for_signature',
      legalSections,
      appendices: { appendix2Paragraphs, appendix2ExampleLines: APPENDIX_2_EXAMPLE_LINES },
      completedGuidedReviewAt: completedAt,
      completedGuidedReviewBy: effectiveUser?.display_name || effectiveUser?.email || form.timanSellerName,
      completedGuidedReviewByEmail: effectiveUser?.email || form.timanSellerEmail,
      expectedSignedPages: 1,
    });
    const { row, error } = await completeDealerContractGuidedReview({
      contractId: id,
      snapshot,
      expectedSignedPages: 1,
    });
    if (error || !row) {
      toast.error('Kontraktgennemgangen kunne ikke afsluttes.');
      return;
    }
    setContractRecord(row);
    setContractRowId(row.id);
    setFinalSnapshot(row.final_snapshot);
    setActiveStepIndex(CONTRACT_STEPS.length - 1);
    toast.success('Kontraktgennemgangen er afsluttet og låst.');
  };

  const handleSignatureUpload = (file: File | undefined) => {
    if (!file) {
      update('signatureDataUrl', null);
      setSignatureName('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Upload signaturen som billede, fx PNG eller JPG.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update('signatureDataUrl', String(reader.result));
      setSignatureName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const generatePdf = async () => {
    if (!readyForSignature) {
      toast.error('Gennemgå og bekræft alle obligatoriske afsnit først.');
      return;
    }

    if (!contractRowId || !hasReachedContractStatus(workflowStatus, 'ready_for_signature')) {
      toast.error('Afslut kontraktgennemgangen, før PDF’en genereres.');
      return;
    }

    const snapshot = finalSnapshot?.workflowStatus === 'ready_for_signature' || finalSnapshot?.workflowStatus === 'awaiting_signed_upload' || finalSnapshot?.workflowStatus === 'approved'
      ? finalSnapshot
      : buildContractSnapshot(form, confirmations, { contractId: contractRowId, workflowStatus: 'ready_for_signature' });

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pdfSnapshot = snapshot;
    const partnerTerms = getContractPartnerTerms(pdfSnapshot.dealer.partnerType) ?? getContractPartnerTerms('dealer')!;
    const legalSections = getSnapshotLegalSections(pdfSnapshot);
    const appendix2Paragraphs = Array.isArray((pdfSnapshot.appendices as { appendix2Paragraphs?: unknown } | null)?.appendix2Paragraphs)
      ? (pdfSnapshot.appendices as { appendix2Paragraphs: string[] }).appendix2Paragraphs
      : renderAppendix2Paragraphs(pdfSnapshot.dealer.partnerType);
    const timan = pdfSnapshot.timan;
    const dealer = pdfSnapshot.dealer;
    const left = 16;
    const right = 194;
    let y = 18;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(43, 85, 140);
    pdf.text('FORHANDLERKONTRAKT - GENNEMGANG OG UNDERSKRIFT', left, y);
    y += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Kontraktversion: ${pdfSnapshot.version}`, left, y);
    y += 5;
    pdf.text(`Snapshot oprettet: ${new Date(pdfSnapshot.createdAt).toLocaleString('da-DK')}`, left, y);
    y += 9;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(17, 24, 39);
    pdf.text('Timan', left, y);
    pdf.text(partnerTerms.label, 112, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.text(timan.company, left, y);
    pdf.text(dealer.name.trim(), 112, y);
    y += 5;
    pdf.text(`CVR: ${timan.cvr}`, left, y);
    pdf.text(`CVR: ${dealer.cvr.trim()}`, 112, y);
    y += 5;
    pdf.text(timan.address, left, y);
    pdf.text(dealer.address.trim(), 112, y);
    y += 5;
    pdf.text(timan.postalCity, left, y);
    pdf.text(`${dealer.postalCode.trim()} ${dealer.city.trim()}`.trim(), 112, y);
    y += 8;
    pdf.text(`Timan sælger: ${timan.sellerName.trim()}`, left, y);
    pdf.text(`Kontakt: ${dealer.contactPerson.trim()}`, 112, y);
    y += 5;
    pdf.text(`E-mail: ${timan.sellerEmail.trim()}`, left, y);
    pdf.text(`Titel: ${dealer.contactTitle.trim() || '-'}`, 112, y);
    if (timan.sellerPhone.trim()) {
      y += 5;
      pdf.text(`Telefon: ${timan.sellerPhone.trim()}`, left, y);
    }

    y += 10;
    pdf.setDrawColor(81, 127, 202);
    pdf.line(left, y, right, y);
    y += 8;

    pdf.setFont('helvetica', 'bold');
    pdf.text('1. Oplysninger', left, y);
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Timan-oplysninger, aktiv Timan-sælger, ${partnerTerms.singular}oplysninger og kontaktperson er vist ovenfor.`, left, y);

    pdf.addPage();
    drawGuidedContractSectionsPdf(pdf, left, right, legalSections, appendix2Paragraphs);

    pdf.addPage();
    y = 18;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(17, 24, 39);
    pdf.text('Bekræftelser', left, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    CONTRACT_STEPS
      .filter((step) => step.confirmationId)
      .forEach((step) => {
        const confirmation = pdfSnapshot.confirmations[step.confirmationId!];
        const confirmedAt = confirmation.confirmedAt ? new Date(confirmation.confirmedAt).toLocaleString('da-DK') : '-';
        pdf.text(`${getContractStepLabel(step.id, 'da').title}: ${confirmation.confirmed ? 'Bekræftet' : 'Ikke bekræftet'} · ${confirmedAt} · ${confirmation.confirmedBy || '-'}`, left, y);
        y += 6;
      });

    y = 222;
    pdf.setDrawColor(81, 127, 202);
    pdf.line(left, y, right, y);
    y += 9;

    pdf.setFont('helvetica', 'bold');
    pdf.text('Underskrifter', left, y);
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${timan.company} · ${timan.sellerName.trim()}`, left, y);
    pdf.text(`${dealer.name.trim()} · ${dealer.contactPerson.trim()}`, 112, y);
    y += 8;
    pdf.text(`Dato: ${formatDateDa(pdfSnapshot.contractDate)}`, left, y);
    pdf.text(`Dato: ${formatDateDa(pdfSnapshot.contractDate)}`, 112, y);
    pdf.text('Timan underskrift______________________', left, y + 24);
    pdf.text(`${partnerTerms.signatureLabel}_________________`, 112, y + 24);

    addPhysicalSignatureFieldsToPdf(pdf, pdfSnapshot);
    const pageCount = pdf.getNumberOfPages();
    const marked = await markDealerContractPdfGenerated(contractRowId, pageCount);
    if (marked.error || !marked.row) {
      toast.error('PDF’en blev ikke markeret som genereret i databasen.');
      return;
    }
    setContractRecord(marked.row);
    setFinalSnapshot(marked.row.final_snapshot ?? pdfSnapshot);

    const fileName = `Timan_Forhandlerkontrakt_${safeFilePart(dealer.name)}_${pdfSnapshot.contractDate}.pdf`;
    pdf.save(fileName);
    toast.success('PDF genereret. Kontrakten afventer nu underskrevet upload.');
  };

  const activeUploadVersion = uploadVersions.find((version) => version.status === 'draft')
    ?? uploadVersions.find((version) => version.status === 'changes_requested')
    ?? null;

  const latestSubmittedUploadVersion = uploadVersions.find((version) => version.status === 'submitted')
    ?? uploadVersions.find((version) => version.status === 'approved')
    ?? uploadVersions[0]
    ?? null;

  const ensureDraftUploadVersion = async () => {
    if (!contractRowId) return null;
    const existing = uploadVersions.find((version) => version.status === 'draft');
    if (existing) return existing;
    const { row, error } = await createDealerContractUploadVersion(contractRowId);
    if (error || !row) {
      toast.error('Kunne ikke starte en ny uploadversion.');
      return null;
    }
    await refreshUploadVersions(contractRowId);
    return row;
  };

  const handleSignedFilesUpload = async (files: FileList | null) => {
    if (!files?.length || !contractRowId) return;
    const version = await ensureDraftUploadVersion();
    if (!version) return;
    setUploadBusy(true);
    try {
      const currentCount = version.files.length;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const { error } = await uploadDealerContractFile({
          contractId: contractRowId,
          uploadVersionId: version.id,
          file,
          sortOrder: currentCount + index,
        });
        if (error) throw new Error(error);
      }
      await refreshUploadVersions(contractRowId);
      toast.success('Upload gemt.');
    } catch {
      toast.error('En eller flere filer kunne ikke uploades.');
    } finally {
      setUploadBusy(false);
    }
  };

  const removeSignedFile = async (file: DealerContractUploadFile) => {
    setUploadBusy(true);
    const error = await deleteDealerContractUploadFile(file);
    if (error) toast.error('Filen kunne ikke fjernes.');
    else {
      await refreshUploadVersions();
      toast.success('Filen er fjernet.');
    }
    setUploadBusy(false);
  };

  const moveSignedFile = async (file: DealerContractUploadFile, direction: -1 | 1) => {
    const version = uploadVersions.find((item) => item.id === file.upload_version_id);
    if (!version) return;
    const files = [...version.files];
    const index = files.findIndex((item) => item.id === file.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= files.length) return;
    [files[index], files[nextIndex]] = [files[nextIndex], files[index]];
    setUploadBusy(true);
    const error = await reorderDealerContractUploadFiles(files);
    if (error) toast.error('Rækkefølgen kunne ikke gemmes.');
    else await refreshUploadVersions();
    setUploadBusy(false);
  };

  const submitUpload = async () => {
    const version = uploadVersions.find((item) => item.status === 'draft');
    if (!version || !contractRowId) return;
    const expectedPages = contractRecord?.expected_signed_pages ?? 0;
    const hasPdf = version.files.some((file) => file.mime_type === 'application/pdf');
    if (!hasPdf && expectedPages > 1 && version.files.length < expectedPages) {
      toast.error(`Der mangler sider: ${version.files.length} af ${expectedPages} sider uploadet.`);
      return;
    }
    const { error } = await submitDealerContractUpload(version.id);
    if (error) {
      toast.error('Uploaden kunne ikke sendes til Timan.');
      return;
    }
    const reloaded = await fetchDealerContractDraft({ ownerEmail: effectiveUser?.email || form.timanSellerEmail, dealerAccountNumber });
    if (reloaded.row) setContractRecord(reloaded.row);
    await refreshUploadVersions(contractRowId);
    toast.success('Kontrakten er sendt til Timan-godkendelse.');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">...</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  if (!hasAccess) return <Navigate to="/portal/salg-marketing" replace />;
  if (!contractLoaded && effectiveUser?.email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Henter kontraktkladde...</div>
      </div>
    );
  }
  if (contractLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-bold">Kontraktkladde kunne ikke hentes</p>
          <p className="mt-2">Prøv at genindlæse siden. Hvis fejlen fortsætter, mangler kontrakt-persistence muligvis at blive deployet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      <header className="bg-white border-b border-gray-200 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Guidet forhandlerkontrakt</h1>
                  <p className="text-sm text-gray-500 mt-1">Gennemgå aftalen trin for trin, før den gøres klar til underskrift og PDF.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={saveDraft}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
              >
                <Save className="h-4 w-4" />
                Gem kladde
              </button>
            </div>
            <ProgressSteps activeStepIndex={activeStepIndex} confirmations={confirmations} language={uiLanguage} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        <div className="grid grid-cols-1 gap-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="mb-6">
              <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Trin {activeStepIndex + 1} af {CONTRACT_STEPS.length}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-950">{activeStepLabel.title}</h2>
                {showActiveStepAppendixBadge && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                    {appendixLabel}
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">{activeStepLabel.intro}</p>
            </div>

            {activeStep.id === 'parties' && (
              <PartiesStep form={form} update={update} locked={isLockedContract} />
            )}

            {activeStep.id !== 'parties' && activeStep.id !== 'signature' && (
              <>
                <ReviewStep
                  stepId={activeStep.id}
                  confirmationId={currentConfirmationId}
                  confirmation={currentConfirmationId ? confirmations[currentConfirmationId] : undefined}
                  onConfirm={confirmSection}
                  form={form}
                  onFormPatch={updateForm}
                  onServiceHourlyRateChange={updateServiceHourlyRate}
                  onPaymentTermChange={updatePaymentTerm}
                  workflowStatusLabel={workflowStatusLabel}
                  readyForSignature={readyForSignature}
                  locked={isLockedContract}
                />
                {activeStep.id === 'full_contract' && (
                  <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <p className="text-sm font-bold text-emerald-950">Når alt er gennemlæst, kan kontraktversionen låses.</p>
                    <p className="mt-1 text-sm text-emerald-900">Herefter bygger PDF og upload på dette faste snapshot.</p>
                    <button
                      type="button"
                      onClick={completeGuidedReview}
                      disabled={!readyForSignature || isLockedContract}
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      <Lock className="h-4 w-4" />
                      {isLockedContract ? 'Kontraktgennemgang afsluttet' : 'Afslut kontraktgennemgang'}
                    </button>
                  </div>
                )}
              </>
            )}

            {activeStep.id === 'signature' && (
              <SignatureStep
                form={form}
                status={status}
                readyForSignature={readyForSignature}
                signatureName={signatureName}
                onSignatureUpload={handleSignatureUpload}
                onGeneratePdf={generatePdf}
                locked={isLockedContract}
                workflowStatus={workflowStatus}
                contract={contractRecord}
                uploadVersions={uploadVersions}
                activeUploadVersion={activeUploadVersion}
                latestSubmittedUploadVersion={latestSubmittedUploadVersion}
                uploadBusy={uploadBusy}
                workflowStatusLabel={workflowStatusLabel}
                onSignedFilesUpload={handleSignedFilesUpload}
                onRemoveSignedFile={removeSignedFile}
                onMoveSignedFile={moveSignedFile}
                onSubmitUpload={submitUpload}
              />
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={goPrevious}
                disabled={activeStepIndex === 0}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Forrige
              </button>
              {activeStepIndex < CONTRACT_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!currentStepConfirmed}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Næste trin
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <span className="text-sm font-semibold text-gray-500">Sidste trin</span>
              )}
            </div>
          </section>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function PartiesStep({
  form,
  update,
  locked,
}: {
  form: ContractFormData;
  update: (key: keyof ContractFormData, value: string | null) => void;
  locked: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900 mb-4">Timan-oplysninger</h3>
        <div className="space-y-5">
          <div>
            <p className="text-lg font-bold text-emerald-950">{TIMAN_COMPANY_INFO.company}</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoField label="Firma" value={TIMAN_COMPANY_INFO.company} />
              <InfoField label="CVR" value={TIMAN_COMPANY_INFO.cvr} />
              <InfoField label="Adresse" value={TIMAN_COMPANY_INFO.address} />
              <InfoField label="Postnr. og by" value={TIMAN_COMPANY_INFO.postalCity} />
            </div>
          </div>
          <div className="border-t border-emerald-200 pt-4">
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-900">Timan sælger</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoField label="Navn" value={form.timanSellerName || '-'} />
              <InfoField label="E-mail" value={form.timanSellerEmail || '-'} />
              {form.timanSellerPhone.trim() && (
                <InfoField label="Telefon" value={form.timanSellerPhone} />
              )}
            </div>
            {!form.timanSellerPhone.trim() && (
              <p className="mt-2 text-xs text-emerald-800/70">Telefon vises automatisk, hvis den er registreret på brugerprofilen.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900 mb-3">Samarbejdspartner</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Partnertype *</span>
            <select
              value={form.partnerType}
              disabled={locked}
              onChange={(e) => update('partnerType', e.target.value as ContractPartnerType | '')}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Vælg partnertype...</option>
              {CONTRACT_PARTNER_TYPES.map((partnerType) => (
                <option key={partnerType} value={partnerType}>
                  {getContractPartnerTypeLabel(partnerType, 'da')}
                </option>
              ))}
            </select>
          </label>
          <TextField label="Firmanavn *" value={form.dealerName} onChange={(value) => update('dealerName', value)} placeholder="Fx ABC Maschinen GmbH" disabled={locked} />
          <TextField label="CVR *" value={form.dealerCvr} onChange={(value) => update('dealerCvr', value)} disabled={locked} />
          <TextField label="Adresse *" value={form.dealerAddress} onChange={(value) => update('dealerAddress', value)} disabled={locked} />
          <TextField label="Postnr. *" value={form.dealerPostalCode} onChange={(value) => update('dealerPostalCode', value)} disabled={locked} />
          <TextField label="By *" value={form.dealerCity} onChange={(value) => update('dealerCity', value)} disabled={locked} />
          <TextField label="Kontaktperson *" value={form.contactPerson} onChange={(value) => update('contactPerson', value)} placeholder="Navn på kontaktperson" disabled={locked} />
          <TextField label="Titel" value={form.contactTitle} onChange={(value) => update('contactTitle', value)} placeholder="Fx ejer, salgschef eller direktør" disabled={locked} />
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Dato *</span>
            <input
              type="date"
              value={form.contractDate}
              disabled={locked}
              onChange={(e) => update('contractDate', e.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            />
          </label>
        </div>
        {locked && (
          <p className="mt-3 text-xs font-semibold text-amber-900">
            Kontrakten er underskrevet. Opret en ny kladde, hvis oplysningerne skal ændres.
          </p>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  stepId,
  confirmationId,
  confirmation,
  onConfirm,
  form,
  onFormPatch,
  onServiceHourlyRateChange,
  onPaymentTermChange,
  workflowStatusLabel,
  readyForSignature,
  locked,
}: {
  stepId: (typeof CONTRACT_STEPS)[number]['id'];
  confirmationId?: string;
  confirmation?: { confirmed: boolean; confirmedAt?: string; confirmedBy?: string };
  onConfirm: () => void;
  form: ContractFormData;
  onFormPatch: (patch: Partial<ContractFormData>) => void;
  onServiceHourlyRateChange: (value: number) => void;
  onPaymentTermChange: (value: ContractPaymentTermId) => void;
  workflowStatusLabel: string;
  readyForSignature: boolean;
  locked?: boolean;
}) {
  const { uiLanguage } = useLanguage();
  const fullContract = stepId === 'full_contract';
  const isTerritoryStep = stepId === 'territory';
  const isServiceStep = stepId === 'spare_parts_service';
  const territoryValid = !isTerritoryStep || hasValidContractTerritory(form);
  const serviceHourlyRateValid = !isServiceStep || isValidContractServiceHourlyRateDkk(form.serviceHourlyRateDkk);
  const stepValid = territoryValid && serviceHourlyRateValid;
  const contractTextContext = {
    companyName: form.dealerName,
    partnerType: form.partnerType,
    primaryTerritory: form.primaryTerritory,
    secondaryTerritory: form.secondaryTerritory,
    serviceHourlyRateDkk: form.serviceHourlyRateDkk,
    paymentTerm: form.paymentTerm,
  };
  const section = getRenderedGuidedContractSection(stepId, contractTextContext);
  const contractSections = renderGuidedContractSections(contractTextContext);

  return (
    <div className="space-y-5">
      {fullContract && (
        <ContractReviewTopArea
          form={form}
          workflowStatusLabel={workflowStatusLabel}
          readyForSignature={readyForSignature}
        />
      )}

      {fullContract && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xl font-black text-gray-950">{t('contractFullTextHeading', uiLanguage)}</h3>
            <p className="mt-1 text-sm leading-6 text-gray-600">{t('contractFullTextIntro', uiLanguage)}</p>
          </div>
          {contractSections.map((contractSection) => (
            <div key={contractSection.stepId} className="space-y-5">
              {contractSection.stepId === 'spare_parts_service' ? (
                <SparePartsServiceSection
                  section={contractSection}
                  serviceHourlyRateDkk={form.serviceHourlyRateDkk}
                  locked
                  showEditableRate={false}
                />
              ) : contractSection.stepId === 'payment_delivery' ? (
                <PaymentDeliverySection
                  section={contractSection}
                  paymentTerm={form.paymentTerm}
                  locked
                  showEditableTerm={false}
                />
              ) : (
                <ContractLegalSection section={contractSection} />
              )}
              {contractSection.stepId === 'discount_structure' && <Appendix2DiscountSection partnerType={form.partnerType} language={uiLanguage} />}
            </div>
          ))}
        </div>
      )}

      {section && (
        <>
          {isTerritoryStep && (
            <TerritoryStepFields
              form={form}
              onChange={onFormPatch}
              locked={locked}
            />
          )}
          {section.stepId === 'spare_parts_service' ? (
            <SparePartsServiceSection
              section={section}
              serviceHourlyRateDkk={form.serviceHourlyRateDkk}
              onServiceHourlyRateChange={onServiceHourlyRateChange}
              locked={locked}
            />
          ) : section.stepId === 'payment_delivery' ? (
            <PaymentDeliverySection
              section={section}
              paymentTerm={form.paymentTerm}
              onPaymentTermChange={onPaymentTermChange}
              locked={locked}
            />
          ) : (
            <ContractLegalSection section={section} />
          )}
        </>
      )}

      {stepId === 'discount_structure' && !fullContract && (
        <Appendix2DiscountSection partnerType={form.partnerType} language={uiLanguage} />
      )}

      {confirmationId && (
        <div className={`rounded-2xl border p-5 ${confirmation?.confirmed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          {isTerritoryStep && !territoryValid && (
            <p className="mb-3 text-sm font-semibold text-amber-900">
              Vælg et gyldigt primært område, før dette trin kan bekræftes.
            </p>
          )}
          {isServiceStep && !serviceHourlyRateValid && (
            <p className="mb-3 text-sm font-semibold text-amber-900">
              Angiv en gyldig timetakst for reklamationsarbejde, før dette trin kan bekræftes.
            </p>
          )}
          <label className={`flex items-start gap-3 ${stepValid && !locked ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
            <input
              type="checkbox"
              checked={Boolean(confirmation?.confirmed)}
              disabled={locked || !stepValid}
              onChange={onConfirm}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:cursor-not-allowed"
            />
            <span>
              <span className="block text-sm font-bold text-gray-950">Vi har gennemgået og forstået dette afsnit.</span>
              {confirmation?.confirmedAt && (
                <span className="mt-1 block text-xs text-gray-600">
                  Bekræftet {new Date(confirmation.confirmedAt).toLocaleString('da-DK')} af {confirmation.confirmedBy}
                </span>
              )}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function TerritoryStepFields({
  form,
  onChange,
  locked,
}: {
  form: ContractFormData;
  onChange: (patch: Partial<ContractFormData>) => void;
  locked?: boolean;
}) {
  const { uiLanguage } = useLanguage();
  const primaryTerritory = normalizeContractTerritoryArea(form.primaryTerritory);
  const secondaryTerritory = normalizeContractSecondaryTerritoryArea(form.secondaryTerritory, primaryTerritory.country);
  const primaryValid = isValidContractTerritoryArea(primaryTerritory);

  const setPrimaryTerritory = (territory: ContractTerritoryArea) => {
    onChange({ primaryTerritory: normalizeContractTerritoryArea(territory) });
  };
  const setSecondaryTerritory = (territory: ContractSecondaryTerritoryArea) => {
    onChange({ secondaryTerritory: normalizeContractSecondaryTerritoryArea(territory, primaryTerritory.country) });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
        <div className="space-y-5">
          <TerritoryAreaEditor
            title="Primært område"
            territory={primaryTerritory}
            onChange={setPrimaryTerritory}
            locked={locked}
            required
          />

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label className="flex items-center gap-3 text-sm font-bold text-gray-950">
              <input
                type="checkbox"
                checked={secondaryTerritory.enabled}
                disabled={locked}
                onChange={(event) => setSecondaryTerritory({
                  ...secondaryTerritory,
                  enabled: event.target.checked,
                  country: secondaryTerritory.country || primaryTerritory.country,
                })}
                className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:cursor-not-allowed"
              />
              Tilføj sekundært område
            </label>

            {secondaryTerritory.enabled && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <TerritoryAreaEditor
                  title="Sekundært område"
                  territory={secondaryTerritory}
                  onChange={(territory) => setSecondaryTerritory({ ...territory, enabled: true })}
                  locked={locked}
                />
              </div>
            )}
          </div>

          {!primaryValid && (
            <p className="text-sm font-semibold text-amber-800">
              Primært område er obligatorisk. Vælg hele landet eller angiv mindst ét gyldigt postnummer/postnummerinterval.
            </p>
          )}
        </div>

        <ContractTerritoryMap
          primaryTerritory={primaryTerritory}
          secondaryTerritory={secondaryTerritory}
          language={uiLanguage}
        />
      </div>
    </div>
  );
}

function TerritoryAreaEditor({
  title,
  territory,
  onChange,
  locked,
  required,
}: {
  title: string;
  territory: ContractTerritoryArea;
  onChange: (territory: ContractTerritoryArea) => void;
  locked?: boolean;
  required?: boolean;
}) {
  const { uiLanguage } = useLanguage();
  const postalLabel = getContractTerritoryPostalLabel(territory.country, uiLanguage);
  const [postalFields, setPostalFields] = useState(() => getContractPostalFieldValues(territory));

  useEffect(() => {
    setPostalFields(getContractPostalFieldValues(territory));
  }, [territory.country, territory.wholeCountry, serializeContractPostalInput(territory)]);

  const setCountry = (country: ContractTerritoryArea['country']) => {
    onChange({
      ...createEmptyContractTerritoryArea(country),
      wholeCountry: territory.wholeCountry,
    });
  };

  const setPostalField = (index: number, input: string) => {
    const nextFields = [...postalFields];
    nextFields[index] = input;
    setPostalFields(nextFields);
    onChange(buildContractTerritoryAreaFromPostalFields(territory, nextFields));
  };

  const addPostalFieldRow = () => {
    const nextFields = [...postalFields, ...Array(6).fill('')];
    setPostalFields(nextFields);
    onChange(buildContractTerritoryAreaFromPostalFields(territory, nextFields));
  };

  const removePostalFieldRow = (rowIndex: number) => {
    if (rowIndex === 0) return;
    const nextFields = postalFields.filter((_, index) => Math.floor(index / 6) !== rowIndex);
    setPostalFields(nextFields);
    onChange(buildContractTerritoryAreaFromPostalFields(territory, nextFields));
  };

  return (
    <section className="space-y-4">
      <h3 className="text-base font-black text-gray-950">
        {title}{required ? ' *' : ''}
      </h3>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-gray-700">Land</span>
          <select
            value={territory.country}
            disabled={locked}
            onChange={(event) => setCountry(event.target.value as ContractTerritoryArea['country'])}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
          >
            {CONTRACT_TERRITORY_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {getContractTerritoryCountryLabel(country.code, uiLanguage)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-sm font-semibold text-gray-700">Område</span>
          <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-xl border border-gray-300 bg-white text-sm">
            <button
              type="button"
              disabled={locked}
              onClick={() => onChange({ ...territory, wholeCountry: true, postalEntries: [], postalCodes: [], postalRanges: [] })}
              className={`px-3 py-3 font-bold transition disabled:cursor-not-allowed ${territory.wholeCountry ? 'bg-emerald-700 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Hele landet
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => onChange({ ...territory, wholeCountry: false })}
              className={`border-l border-gray-300 px-3 py-3 font-bold transition disabled:cursor-not-allowed ${!territory.wholeCountry ? 'bg-emerald-700 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Afgrænset
            </button>
          </div>
        </div>
      </div>

      {!territory.wholeCountry && (
        <div className="block">
          <span className="text-sm font-semibold text-gray-700">{postalLabel}</span>
          <div className="mt-2 space-y-3">
            {chunkPostalFields(postalFields).map((row, rowIndex) => (
              <div key={rowIndex} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {row.map((value, columnIndex) => {
                    const fieldIndex = rowIndex * 6 + columnIndex;
                    return (
                      <label key={fieldIndex} className="block">
                        <span className="text-xs font-semibold text-gray-600">
                          Postnr. {fieldIndex + 1}{fieldIndex === 0 && required ? ' *' : ''}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={value}
                          disabled={locked}
                          onChange={(event) => setPostalField(fieldIndex, event.target.value)}
                          placeholder={territory.country === 'DE' ? (fieldIndex === 0 ? '10115' : '20000-29999') : (fieldIndex === 0 ? '5000' : '5000-5999')}
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </label>
                    );
                  })}
                </div>
                {rowIndex > 0 && !locked && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removePostalFieldRow(rowIndex)}
                      className="text-xs font-bold text-gray-500 hover:text-red-700"
                    >
                      Fjern række
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <span className="mt-1 block text-xs text-gray-500">
            Angiv mindst ét postnummer. Du kan tilføje flere felter efter behov.
          </span>
          {!locked && (
            <button
              type="button"
              onClick={addPostalFieldRow}
              className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
            >
              + Tilføj flere postnumre
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function getContractPostalFieldValues(territory: ContractTerritoryArea) {
  const values = territory.postalEntries.length > 0
    ? territory.postalEntries.map((entry) => entry.input)
    : serializeContractPostalInput(territory).split(',').map((value) => value.trim()).filter(Boolean);
  const minFields = Math.max(6, Math.ceil(Math.max(values.length, 1) / 6) * 6);
  return [...values, ...Array(Math.max(0, minFields - values.length)).fill('')];
}

function chunkPostalFields(fields: string[]) {
  const rows: string[][] = [];
  for (let index = 0; index < fields.length; index += 6) {
    rows.push(fields.slice(index, index + 6));
  }
  return rows;
}

function SparePartsServiceSection({
  section,
  serviceHourlyRateDkk,
  onServiceHourlyRateChange,
  locked,
  showEditableRate = true,
}: {
  section: GuidedContractSection;
  serviceHourlyRateDkk: number;
  onServiceHourlyRateChange?: (value: number) => void;
  locked?: boolean;
  showEditableRate?: boolean;
}) {
  const sparePartsBlocks = section.blocks.slice(0, 1);
  const serviceBlocks = section.blocks.slice(1);
  const validRate = isValidContractServiceHourlyRateDkk(serviceHourlyRateDkk);
  const compactSparePartsBlocks = sparePartsBlocks.map((block) => ({
    ...block,
    bullets: block.bullets?.filter((bullet) => bullet !== 'Levering af reservedele er – Frit leveret med transportøren der vælges af Timan.'),
  }));
  const importantServiceTerms = [
    ['Reklamation', 'Reklamationsarbejde må først påbegyndes, når Timan har udstedt et reklamationsnummer.'],
    ['Garantiregistrering', 'Garantiregistreringen skal ske med korrekt fakturadato til slutkunden i henhold til eksisterende kontraktvilkår.'],
    ['Demomaskiner', 'Demomaskiner har særlige garantiregler, og maksimal garanti er 24 måneder i henhold til servicebetingelser.'],
    ['Reklamationsdele', 'Reklamationsdelen skal opbevares i minimum 6 måneder eller fremsendes efter anmodning fra Timans serviceafdeling.'],
    ['Fragt og levering', 'Levering af reservedele er frit leveret med den transportør, der vælges af Timan. Timan betaler fragt tur/retur for reklamationsdele i forbindelse med godkendt reklamation.'],
  ] as const;

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <ContractLegalSectionHeader section={section} />
      <div className="mt-5 space-y-5">
        {compactSparePartsBlocks.map((block, index) => (
          <ContractTextBlockView key={`${block.heading ?? section.title}-${index}`} block={block} sectionTitle={`${section.title} ${section.source}`} />
        ))}

        <section className="rounded-2xl border border-emerald-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
            <div>
              <h4 className="text-base font-black text-gray-950">Vigtige servicevilkår</h4>
              <p className="mt-1 text-sm leading-6 text-gray-600">Kort samtaleoverblik. De fulde servicebetingelser står nedenfor.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <ul className="space-y-2.5 text-sm leading-6 text-gray-700">
              {importantServiceTerms.map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-emerald-700" />
                  <span>
                    <strong className="text-gray-950">{title}</strong>
                    <br />
                    {body}
                  </span>
                </li>
              ))}
            </ul>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-bold text-emerald-950">Godtgørelse</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">Aftalt timetakst</p>
              {showEditableRate && onServiceHourlyRateChange ? (
                <label className="mt-2 block">
                  <span className="text-xs font-semibold text-emerald-950">Aftalt timetakst for reklamationsarbejde</span>
                  <div className="flex items-center overflow-hidden rounded-xl border border-emerald-300 bg-white">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={Number.isFinite(serviceHourlyRateDkk) ? serviceHourlyRateDkk : ''}
                      disabled={locked}
                      onChange={(event) => {
                        const nextValue = event.target.value === '' ? 0 : Number(event.target.value);
                        onServiceHourlyRateChange(nextValue);
                      }}
                      className="min-w-0 flex-1 border-0 px-3 py-2 text-lg font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <span className="border-l border-emerald-200 px-3 text-xs font-bold text-emerald-900">DKK/time</span>
                  </div>
                </label>
              ) : (
                <p className="mt-2 text-2xl font-black text-emerald-900">
                  {formatContractServiceHourlyRatePerHourDkk(serviceHourlyRateDkk)}
                </p>
              )}
              {!validRate && (
                <p className="mt-2 text-xs font-semibold text-amber-900">Angiv et beløb over 0 kr.</p>
              )}
              <p className="mt-3 text-sm leading-6 text-emerald-950">
                Maksimalt 6 timers kørsel pr. reklamation dækkes af Timan med samme timetakst.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {serviceBlocks.map((block, index) => (
            <ContractTextBlockView key={`${block.heading ?? section.title}-${index}`} block={block} sectionTitle={`${section.title} ${section.source}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ContractLegalSectionHeader({ section }: { section: GuidedContractSection }) {
  return (
    <div className="flex items-start gap-3">
      <FileText className="mt-1 h-5 w-5 text-gray-500" />
      <div>
        <h3 className="text-lg font-bold text-gray-950">{section.guidedTitle ?? section.title}</h3>
        {!section.hideGuidedSource && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{section.source}</p>
        )}
      </div>
    </div>
  );
}

function PaymentDeliverySection({
  section,
  paymentTerm,
  onPaymentTermChange,
  locked,
  showEditableTerm = true,
}: {
  section: GuidedContractSection;
  paymentTerm: ContractPaymentTermId;
  onPaymentTermChange?: (value: ContractPaymentTermId) => void;
  locked?: boolean;
  showEditableTerm?: boolean;
}) {
  const { uiLanguage } = useLanguage();
  const cbsNeedsLegalText = contractPaymentTermHasMissingLegalText(paymentTerm);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <ContractLegalSectionHeader section={section} />
      <div className="mt-5 space-y-5">
        <section className="rounded-2xl border border-amber-200 bg-white p-5">
          <label className="block">
            <span className="text-sm font-bold text-gray-950">{t('contractPaymentTermsLabel', uiLanguage)}</span>
            {showEditableTerm && onPaymentTermChange ? (
              <select
                value={paymentTerm}
                disabled={locked}
                onChange={(event) => onPaymentTermChange(event.target.value as ContractPaymentTermId)}
                className="mt-2 w-full max-w-sm rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              >
                {CONTRACT_PAYMENT_TERM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {getContractPaymentTermLabel(option, uiLanguage)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm font-black text-gray-950">
                {getContractPaymentTermLabel(paymentTerm, uiLanguage)}
              </p>
            )}
          </label>
          {cbsNeedsLegalText && (
            <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              CBS er valgt, men der findes endnu ikke en fuld juridisk CBS-formulering i kontraktens source of truth.
            </p>
          )}
        </section>

        {section.blocks.map((block, index) => (
          <ContractTextBlockView key={`${block.heading ?? section.title}-${index}`} block={block} sectionTitle={`${section.title} ${section.source}`} />
        ))}
      </div>
    </div>
  );
}

function ContractLegalSection({ section }: { section: GuidedContractSection }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <ContractLegalSectionHeader section={section} />
      <div className="mt-5 space-y-5">
        {section.blocks.map((block, index) => (
          <ContractTextBlockView key={`${block.heading ?? section.title}-${index}`} block={block} sectionTitle={`${section.title} ${section.source}`} />
        ))}
      </div>
    </div>
  );
}

function ContractTextBlockView({ block, sectionTitle }: { block: ContractTextBlock; sectionTitle: string }) {
  const { uiLanguage } = useLanguage();
  const displayHeading = block.heading ? getGuidedContractDisplayHeading(block.heading) : '';
  const showHeading = displayHeading && !shouldHideGuidedContractUiText(displayHeading, sectionTitle);
  const paragraphs = (block.paragraphs ?? []).filter((paragraph) => !shouldHideGuidedContractUiText(paragraph, sectionTitle));
  const bullets = (block.bullets ?? []).filter((bullet) => !shouldHideGuidedContractUiText(bullet, sectionTitle));

  return (
    <div className="space-y-2 text-sm leading-6 text-gray-700">
      {showHeading && <h4 className="font-bold text-gray-950">{displayHeading}</h4>}
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {bullets.length > 0 && (
        <ul className="space-y-1 pl-5">
          {bullets.map((bullet) => (
            <li key={bullet} className="list-disc">
              {bullet}
              {bullet === SPARE_PARTS_PORTAL_BULLET && (
                <>
                  {' '}
                  <a
                    href={SPARE_PARTS_PORTAL_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-bold text-amber-800 underline underline-offset-2 hover:text-amber-900"
                  >
                    {t('contractSparePartsPortalLink', uiLanguage)}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignatureStep({
  form,
  status,
  readyForSignature,
  signatureName,
  onSignatureUpload,
  onGeneratePdf,
  locked,
  workflowStatus,
  contract,
  uploadVersions,
  activeUploadVersion,
  latestSubmittedUploadVersion,
  uploadBusy,
  workflowStatusLabel,
  onSignedFilesUpload,
  onRemoveSignedFile,
  onMoveSignedFile,
  onSubmitUpload,
}: {
  form: ContractFormData;
  status: string;
  readyForSignature: boolean;
  signatureName: string;
  onSignatureUpload: (file: File | undefined) => void;
  onGeneratePdf: () => void;
  locked: boolean;
  workflowStatus: ContractWorkflowStatus;
  contract: DealerContractRecord | null;
  uploadVersions: DealerContractUploadVersion[];
  activeUploadVersion: DealerContractUploadVersion | null;
  latestSubmittedUploadVersion: DealerContractUploadVersion | null;
  uploadBusy: boolean;
  workflowStatusLabel: string;
  onSignedFilesUpload: (files: FileList | null) => void;
  onRemoveSignedFile: (file: DealerContractUploadFile) => void;
  onMoveSignedFile: (file: DealerContractUploadFile, direction: -1 | 1) => void;
  onSubmitUpload: () => void;
}) {
  const expectedPages = contract?.expected_signed_pages ?? 0;
  const draftUpload = uploadVersions.find((version) => version.status === 'draft') ?? null;
  const uploadedFiles = draftUpload?.files ?? activeUploadVersion?.files ?? [];
  const hasPdf = uploadedFiles.some((file) => file.mime_type === 'application/pdf');
  const uploadComplete = hasPdf || expectedPages <= 1 || uploadedFiles.length >= expectedPages;
  const canUpload = workflowStatus === 'awaiting_signed_upload' || workflowStatus === 'changes_requested';
  const partnerTerms = getContractPartnerTerms(form.partnerType) ?? getContractPartnerTerms('dealer')!;

  return (
    <div className="space-y-6">
      <ContractReviewTopArea
        form={form}
        workflowStatusLabel={workflowStatusLabel}
        readyForSignature={readyForSignature}
      />

      {!readyForSignature && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <Lock className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-bold">Ikke klar til underskrift endnu</p>
            <p className="mt-1">Udfyld parterne og bekræft de obligatoriske kontraktafsnit først.</p>
          </div>
        </div>
      )}

      {!locked && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">{partnerTerms.possessive} digitale signatur</h3>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center hover:border-amber-300 hover:bg-amber-50">
            <Upload className="h-5 w-5 text-amber-700" />
            <span className="mt-2 text-sm font-semibold text-gray-800">Upload {partnerTerms.possessive} signaturbillede</span>
            <span className="mt-1 text-xs text-gray-500">{signatureName || 'Valgfrit - PNG eller JPG'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={!readyForSignature}
              onChange={(e) => onSignatureUpload(e.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {contract && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoMini label="Kontraktnummer" value={contract.contract_number || contract.id.slice(0, 8)} />
            <InfoMini label="Version" value={contract.contract_version} />
            <InfoMini label="Dato" value={formatDateDa(contract.final_snapshot?.contractDate || form.contractDate)} />
            <InfoMini label="Status" value={getContractWorkflowStatusLabel(workflowStatus)} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onGeneratePdf}
        disabled={!readyForSignature || !hasReachedContractStatus(workflowStatus, 'ready_for_signature') || workflowStatus === 'submitted_for_approval' || workflowStatus === 'approved' || workflowStatus === 'archived'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        <Download className="h-4 w-4" />
        Generér kontrakt til underskrift
      </button>
      <p className="text-xs text-gray-500">Status: {status}. PDF’en bygges fra den låste kontraktversion, når gennemgangen er afsluttet.</p>

      {canUpload && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-amber-950">Upload underskrevet kontrakt</h3>
              <p className="mt-1 text-sm text-amber-900">
                {hasPdf ? 'Samlet PDF uploadet.' : expectedPages > 1 ? `${uploadedFiles.length} af ${expectedPages} sider uploadet` : `${uploadedFiles.length} fil(er) uploadet`}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100">
              <Upload className="h-4 w-4" />
              Vælg filer
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadBusy}
                onChange={(event) => onSignedFilesUpload(event.target.files)}
              />
            </label>
          </div>

          {workflowStatus === 'changes_requested' && latestSubmittedUploadVersion?.review_comment && (
            <div className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-900">
              <p className="font-bold">Timan beder om ny upload</p>
              <p className="mt-1">{latestSubmittedUploadVersion.review_comment}</p>
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {uploadedFiles.map((file, index) => (
                <div key={file.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-950">{file.file_name}</p>
                      <p className="mt-1 text-xs text-gray-500">{file.mime_type === 'application/pdf' ? 'PDF' : `Side ${index + 1}`}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveSignedFile(file)}
                      disabled={uploadBusy}
                      className="rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      title="Fjern fil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {file.signed_url && file.mime_type.startsWith('image/') && (
                    <img src={file.signed_url} alt={file.file_name} className="mt-3 h-36 w-full rounded-lg object-cover" />
                  )}
                  {file.signed_url && file.mime_type === 'application/pdf' && (
                    <a href={file.signed_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-amber-800 hover:underline">
                      Åbn PDF
                    </a>
                  )}
                  {!hasPdf && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => onMoveSignedFile(file, -1)} disabled={index === 0 || uploadBusy} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold disabled:opacity-40">Op</button>
                      <button type="button" onClick={() => onMoveSignedFile(file, 1)} disabled={index === uploadedFiles.length - 1 || uploadBusy} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold disabled:opacity-40">Ned</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onSubmitUpload}
            disabled={!draftUpload || !uploadComplete || uploadBusy}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            <CheckCircle2 className="h-4 w-4" />
            Send til Timan-godkendelse
          </button>
        </div>
      )}

      {workflowStatus === 'submitted_for_approval' && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
          <p className="font-bold">Kontrakten er sendt til Timan-godkendelse.</p>
          <p className="mt-1">Uploadversionen er låst, mens Timan gennemgår dokumentet.</p>
        </div>
      )}

      {(workflowStatus === 'approved' || workflowStatus === 'archived') && latestSubmittedUploadVersion && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <p className="font-bold">Kontrakten er godkendt og arkiveret.</p>
          <p className="mt-1">Den godkendte uploadversion kan ikke overskrives.</p>
        </div>
      )}
    </div>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-950">{value || '-'}</p>
    </div>
  );
}

function Appendix2DiscountSection({ partnerType, language }: { partnerType: ContractFormData['partnerType']; language: string }) {
  const paragraphs = renderAppendix2Paragraphs(partnerType).filter(
    (paragraph) => !shouldHideGuidedContractUiText(paragraph, 'Rabatstruktur og Bilag 2'),
  );
  const labels = {
    machineOrder: t('contractDiscountMachineOrderGroup', language),
    warrantyRefund: t('contractDiscountWarrantyRefundGroup', language),
    baseDiscount: t('contractDiscountBaseDiscount', language),
    quantityDiscount: t('contractDiscountQuantityDiscount', language),
    deliveryDiscount: t('contractDiscountDeliveryDiscount', language),
    demoDiscount: t('contractDiscountDemoDiscount', language),
    baseDiscountLabel: t('contractDiscountBaseDiscountLabel', language),
    onePiece: t('contractDiscountOnePiece', language),
    twoThreePieces: t('contractDiscountTwoThreePieces', language),
    fourPlusPieces: t('contractDiscountFourPlusPieces', language),
    deliveryTime: t('contractDiscountDeliveryTime', language),
    overThreeMonths: t('contractDiscountOverThreeMonths', language),
    deliveryExplanation: t('contractDiscountDeliveryExplanation', language),
    ownDemoDiscount: t('contractDiscountOwnDemoDiscount', language),
    demoRefundExplanation: t('contractDiscountDemoRefundExplanation', language),
    example: t('contractDiscountExample', language),
    exampleText: t('contractDiscountExampleText', language),
  };
  return (
    <div className="space-y-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="space-y-4 text-sm leading-6 text-gray-700">
        {paragraphs.map((paragraph, index) => {
          const isHeading = index === 0 || /^\d+\./.test(paragraph);
          return (
            <p key={paragraph} className={isHeading ? 'font-bold text-gray-950' : ''}>
              {paragraph}
            </p>
          );
        })}
      </div>

      <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-4 shadow-inner sm:p-5">
        <div className="w-full max-w-full min-w-0">
          <div className="grid min-w-0 grid-cols-1 gap-3 text-center text-base font-bold text-gray-950 md:grid-cols-[3.39fr_1.16fr] lg:text-lg">
            <div>
              <p className="flex min-h-12 items-center justify-center leading-tight">{labels.machineOrder}</p>
              <div className="mx-auto mt-2 h-7 w-[96%] rounded-t-xl border-x-2 border-t-2 border-[#2f711c]" />
            </div>
            <div>
              <p className="flex min-h-12 items-center justify-center leading-tight">{labels.warrantyRefund}</p>
              <div className="mx-auto mt-2 h-7 w-[96%] rounded-t-xl border-x-2 border-t-2 border-[#2f711c]" />
            </div>
          </div>

          <div className="hidden min-w-0 grid-cols-[0.78fr_1.48fr_1.13fr_1.16fr] gap-3 border-b-2 border-[#2f711c] pb-4 pt-1 text-center text-sm font-bold text-gray-950 md:grid lg:text-base">
            <p>{labels.baseDiscount}</p>
            <p>{labels.quantityDiscount}</p>
            <p>{labels.deliveryDiscount}</p>
            <p>{labels.demoDiscount}</p>
          </div>

          <div className="grid min-w-0 grid-cols-1 items-stretch gap-5 py-5 md:grid-cols-[0.78fr_1.48fr_1.13fr_1.16fr] md:items-center md:gap-3 lg:gap-4">
            <div className="min-w-0">
              <p className="mb-3 text-center text-base font-bold text-gray-950 md:hidden">{labels.baseDiscount}</p>
              <div className="flex min-w-0 items-center justify-center gap-3">
                <div className="flex aspect-square w-full max-w-28 flex-col items-center justify-center rounded-full border border-[#79a45e] bg-[#fbfdf9] text-center md:max-w-24 lg:max-w-28 xl:max-w-[7.5rem]">
                  <p className="text-3xl font-black leading-none text-[#36780f] md:text-2xl lg:text-[2rem]">25%</p>
                  <p className="mt-2 px-2 text-sm font-semibold leading-tight text-gray-950 md:text-xs">{labels.baseDiscountLabel}</p>
                </div>
                <div className="hidden text-2xl font-light text-[#36780f] md:block lg:text-3xl">→</div>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-3 text-center text-base font-bold text-gray-950 md:hidden">{labels.quantityDiscount}</p>
              <div className="relative flex min-h-52 w-full min-w-0 items-center rounded-2xl border border-[#79a45e] bg-[#fbfdf9] px-3 py-4">
                <svg className="h-auto w-full min-w-0 overflow-visible" viewBox="0 0 340 220" role="img" aria-label={t('contractDiscountStairAria', language)}>
                  <path d="M34 172 H126 V124 H218 V76 H314" fill="none" stroke="#36780f" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                  <text x="80" y="148" textAnchor="middle" className="fill-gray-950 text-[15px] font-semibold">{labels.onePiece}</text>
                  <text x="80" y="196" textAnchor="middle" className="fill-[#36780f] text-[23px] font-black">+0%</text>
                  <text x="172" y="100" textAnchor="middle" className="fill-gray-950 text-[15px] font-semibold">{labels.twoThreePieces}</text>
                  <text x="172" y="148" textAnchor="middle" className="fill-[#36780f] text-[23px] font-black">+2%</text>
                  <text x="266" y="52" textAnchor="middle" className="fill-gray-950 text-[15px] font-semibold">{labels.fourPlusPieces}</text>
                  <text x="266" y="100" textAnchor="middle" className="fill-[#36780f] text-[23px] font-black">+4%</text>
                </svg>
                <div className="hidden absolute right-[-0.35rem] top-1/2 -translate-y-1/2 text-2xl font-light text-[#36780f] md:block lg:text-3xl">→</div>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-3 text-center text-base font-bold text-gray-950 md:hidden">{labels.deliveryDiscount}</p>
              <div className="flex min-w-0 items-center justify-center gap-2">
                <div className="flex w-full min-w-0 flex-col items-center justify-center rounded-2xl border border-[#79a45e] bg-[#fbfdf9] px-3 py-5 text-center md:min-h-52 lg:min-h-56">
                  <div className="relative flex aspect-square w-28 items-center justify-center rounded-full border border-[#79a45e] md:w-[6.8rem] lg:w-[7.2rem]">
                    <div className="px-2 text-center">
                      <p className="text-[11px] font-bold leading-tight text-gray-950 lg:text-[12px]">{labels.deliveryTime}</p>
                      <p className="text-[11px] font-bold leading-tight text-gray-950 lg:text-[12px]">{labels.overThreeMonths}</p>
                      <p className="mt-1.5 text-2xl font-black leading-none text-[#36780f]">+2%</p>
                    </div>
                  </div>
                  <p className="mt-4 max-w-[10rem] text-[11px] font-medium leading-4 text-gray-950 lg:text-xs">{labels.deliveryExplanation}</p>
                </div>
                <div className="hidden text-2xl font-light text-[#36780f] md:block lg:text-3xl">→</div>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-3 text-center text-base font-bold text-gray-950 md:hidden">{labels.demoDiscount}</p>
              <div className="flex min-h-52 min-w-0 flex-col items-center justify-center rounded-2xl border border-[#79a45e] bg-[#fbfdf9] px-4 py-5 text-center text-gray-950 lg:min-h-56 xl:px-5">
                <p className="max-w-full text-[13px] font-semibold leading-5 lg:text-sm">{labels.ownDemoDiscount}</p>
                <div className="my-3 h-px w-full bg-[#a9c794]" />
                <p className="whitespace-nowrap text-2xl font-black leading-tight text-[#36780f] lg:text-[1.75rem]">3100 kr.</p>
                <div className="my-3 h-px w-full bg-[#a9c794]" />
                <p className="text-[11px] font-medium leading-4 text-gray-950 lg:text-xs">{labels.demoRefundExplanation}</p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-4 rounded-2xl border border-emerald-500 bg-[#fbfdf9] px-4 py-5 text-center text-gray-950 sm:flex-row sm:text-left lg:px-6">
            <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full border-[3px] border-[#36780f] text-2xl font-black text-[#36780f] lg:h-16 lg:w-16 lg:text-3xl">%</div>
            <div className="grid min-w-0 flex-1 gap-1.5 text-sm leading-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-baseline lg:gap-x-5 lg:text-base">
              <p className="font-black text-[#36780f] lg:text-lg">{labels.example}</p>
              <p>{labels.exampleText}</p>
              <p className="font-black text-[#36780f] lg:col-start-2 lg:text-xl">25% + 4% + 2% = 29,44 %</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressSteps({
  activeStepIndex,
  confirmations,
  language,
}: {
  activeStepIndex: number;
  confirmations: ContractConfirmations;
  language: string;
}) {
  return (
    <div className="overflow-x-auto pb-0.5 lg:overflow-x-visible">
      <div className="grid min-w-max grid-flow-col auto-cols-[5.9rem] gap-1 lg:min-w-0 lg:grid-flow-row lg:auto-cols-auto lg:grid-cols-11 lg:gap-1.5">
        {CONTRACT_STEPS.map((step, index) => {
          const label = getContractStepLabel(step.id, language);
          const confirmationId = step.confirmationId;
          const confirmed = !confirmationId || confirmations[confirmationId]?.confirmed;
          const active = index === activeStepIndex;
          const complete = index < activeStepIndex && confirmed;
          return (
            <div
              key={step.id}
              className={`min-w-0 rounded-lg border px-1.5 py-1.5 ${active ? 'border-gray-950 bg-gray-950 text-white' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-gray-200 bg-white text-gray-600'}`}
            >
              <div className="relative flex min-w-0 items-center justify-center gap-1">
                <span className="text-[9px] font-bold uppercase leading-none tracking-wide">Trin {index + 1}</span>
              </div>
              <p className="mt-0.5 break-words text-center text-[10px] font-medium leading-tight">{label.shortTitle}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContractSummary({ form }: { form: ContractFormData }) {
  const partnerLabel = form.partnerType ? getContractPartnerTypeLabel(form.partnerType, 'da') : 'Samarbejdspartner';
  const primaryTerritory = normalizeContractTerritoryArea(form.primaryTerritory);
  const secondaryTerritory = normalizeContractSecondaryTerritoryArea(form.secondaryTerritory, primaryTerritory.country);
  const primaryItems = getContractTerritoryDisplayItems(form.primaryTerritory, 'da');
  const secondaryItems = secondaryTerritory.enabled && isValidContractTerritoryArea(secondaryTerritory)
    ? getContractTerritoryDisplayItems(secondaryTerritory, 'da')
    : [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Timan</h3>
        <p className="mt-3 text-lg font-bold text-emerald-950">{TIMAN_COMPANY_INFO.company}</p>
        <p className="text-sm text-emerald-900">{TIMAN_COMPANY_INFO.address}, {TIMAN_COMPANY_INFO.postalCity}</p>
        <p className="mt-3 text-sm font-bold text-emerald-950">{form.timanSellerName || '-'}</p>
        <p className="text-sm text-emerald-900">{form.timanSellerEmail || '-'}</p>
        {form.timanSellerPhone && <p className="text-sm text-emerald-900">{form.timanSellerPhone}</p>}
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">{partnerLabel}</h3>
        <p className="mt-3 text-lg font-bold text-amber-950">{form.dealerName || '-'}</p>
        <p className="text-sm text-amber-900">{form.dealerAddress || '-'}</p>
        <p className="text-sm text-amber-900">{`${form.dealerPostalCode} ${form.dealerCity}`.trim() || '-'}</p>
        <p className="mt-3 text-sm font-bold text-amber-950">{form.contactPerson || '-'}</p>
        <p className="text-sm text-amber-900">{form.contactTitle || 'Titel ikke angivet'}</p>
        <p className="mt-2 text-sm text-amber-900">Dato: {formatDateDa(form.contractDate)}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 lg:col-span-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">Område</h3>
        <div className="mt-3 text-sm font-semibold text-gray-950">
          <p>Primært område:</p>
          {primaryItems.length > 0 ? (
            <ul className="mt-1 space-y-1 pl-5">
              {primaryItems.map((item) => <li key={item} className="list-disc">{item}</li>)}
            </ul>
          ) : (
            <p className="mt-1">-</p>
          )}
        </div>
        {secondaryItems.length > 0 && (
          <div className="mt-3 text-sm font-semibold text-gray-950">
            <p>Sekundært område:</p>
            <ul className="mt-1 space-y-1 pl-5">
              {secondaryItems.map((item) => <li key={item} className="list-disc">{item}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ContractReviewTopArea({
  form,
  workflowStatusLabel,
  readyForSignature,
}: {
  form: ContractFormData;
  workflowStatusLabel: string;
  readyForSignature: boolean;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <ContractSummary form={form} />
      <aside className="space-y-4">
        <ContractStatusCard status={workflowStatusLabel} readyForSignature={readyForSignature} />
        <DocumentList />
      </aside>
    </div>
  );
}

function ContractStatusCard({ status, readyForSignature }: { status: string; readyForSignature: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${readyForSignature ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {readyForSignature ? <Check className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        </div>
        <div>
          <h3 className="font-bold text-gray-950">Kontraktstatus</h3>
          <p className="mt-1 text-sm font-semibold text-gray-700">{status}</p>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            Klar til underskrift aktiveres først, når parter og alle obligatoriske bekræftelser er på plads.
          </p>
        </div>
      </div>
    </div>
  );
}

function DocumentList() {
  return (
    <aside className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-amber-700" />
        <h2 className="text-lg font-bold text-gray-900">Juridiske dokumenter</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Disse eksisterende PDF’er er kontraktens juridiske source of truth.
      </p>
      <div className="space-y-2">
        {CONTRACT_DOCS.map((doc) => (
          <a
            key={doc.href}
            href={doc.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 hover:border-amber-300 hover:bg-amber-50"
          >
            <span>{doc.title}</span>
            <Download className="h-4 w-4 shrink-0 text-amber-700" />
          </a>
        ))}
      </div>
    </aside>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
        placeholder={placeholder}
      />
    </label>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white/70 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">{label}</div>
      <div className="mt-1 text-sm font-semibold text-emerald-950">{value}</div>
    </div>
  );
}
