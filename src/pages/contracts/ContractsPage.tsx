import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSignature, FileText, Lock, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  buildContractSnapshot,
  canLeaveContractStep,
  canPrepareContractForSignature,
  CONTRACT_STEPS,
  type ContractSnapshot,
  type ContractStatus,
  ContractConfirmations,
  ContractFormData,
  EMPTY_CONTRACT_CONFIRMATIONS,
  TIMAN_COMPANY_INFO,
  getContractStatus,
  getRequiredConfirmationForStep,
  hasRequiredPartyData,
} from '@/lib/contractFlow';
import { fetchDealerContractDraft, getCurrentStepId, saveDealerContractDraft } from '@/lib/dealerContractsService';
import { fetchDealerAccountByNumber } from '@/lib/dealerAccountsService';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess } from '@/lib/portalAccess';
import { supabase } from '@/lib/supabase';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { APPENDIX_2_EXAMPLE_LINES, APPENDIX_2_PARAGRAPHS } from '@/lib/contractAppendix2';

const CONTRACT_DOCS = [
  { title: 'Forhandlerkontrakt Timan', href: '/contracts/forhandlerkontrakt-timan.pdf', section: 'Hovedaftale' },
  { title: 'Bilag 1 - Service', href: '/contracts/bilag-1-service-kontrakt-timan.pdf', section: 'Timans ansvar' },
  { title: 'Bilag 2 - Rabat', href: '/contracts/bilag-2-rabat-kontrakt-timan.pdf', section: 'Kommercielle vilkår' },
  { title: 'Bilag 3 - Salgsområde', href: '/contracts/bilag-3-salgsomraade-kontrakt-timan.pdf', section: 'Samarbejde' },
  { title: 'Bilag 4 - Salgs- og leveringsbetingelser', href: '/contracts/bilag-4-salgs-og-leveringsbetingelser-timan.pdf', section: 'Kommercielle vilkår' },
];

const STEP_DOCUMENTS: Partial<Record<(typeof CONTRACT_STEPS)[number]['id'], typeof CONTRACT_DOCS>> = {
  collaboration: CONTRACT_DOCS.filter((doc) => ['Hovedaftale', 'Samarbejde'].includes(doc.section)),
  timan_responsibility: CONTRACT_DOCS.filter((doc) => ['Hovedaftale', 'Timans ansvar'].includes(doc.section)),
  dealer_responsibility: CONTRACT_DOCS.filter((doc) => doc.section === 'Hovedaftale'),
  commercial_terms: CONTRACT_DOCS.filter((doc) => ['Kommercielle vilkår', 'Hovedaftale'].includes(doc.section)),
  full_contract: CONTRACT_DOCS,
};

const CONTRACT_SIDEBAR_STEP_ID: (typeof CONTRACT_STEPS)[number]['id'] = 'full_contract';

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

function drawAppendix2Pdf(pdf: any, left: number, right: number) {
  let y = 16;
  const width = right - left;

  APPENDIX_2_PARAGRAPHS.forEach((paragraph, index) => {
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
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [signatureName, setSignatureName] = useState('');
  const [contractRowId, setContractRowId] = useState<string | null>(null);
  const [contractLoaded, setContractLoaded] = useState(false);
  const [contractLoadError, setContractLoadError] = useState<string | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<ContractSnapshot | null>(null);
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
    signatureDataUrl: null,
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
        setForm((current) => ({
          ...current,
          ...row.form_data,
          signatureDataUrl: row.signature_data_url,
        }));
        setConfirmations({ ...EMPTY_CONTRACT_CONFIRMATIONS, ...row.confirmations });
        setFinalSnapshot(row.final_snapshot);
        const stepIndex = CONTRACT_STEPS.findIndex((step) => step.id === row.current_step);
        setActiveStepIndex(stepIndex >= 0 ? stepIndex : 0);
        if (row.signature_data_url) setSignatureName('Gemt signatur');
      } else {
        setContractRowId(null);
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
      }));
    });
    return () => { cancelled = true; };
  }, [dealerAccountNumber]);

  const portalRole = derivePortalRole(effectiveUser);
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);
  const hasAccess = portalRole === 'timan_backend' || hasModuleAccess(portalRole, 'contracts', moduleOverride);
  const activeStep = CONTRACT_STEPS[activeStepIndex];
  const status = getContractStatus(form, confirmations);
  const isSigned = status === 'Signed';
  const readyForSignature = canPrepareContractForSignature(form, confirmations);
  const currentConfirmationId = getRequiredConfirmationForStep(activeStep.id);
  const currentStepConfirmed = !currentConfirmationId || confirmations[currentConfirmationId]?.confirmed;
  const showContractSidebar = activeStep.id === CONTRACT_SIDEBAR_STEP_ID;

  const update = (key: keyof ContractFormData, value: string | null) => {
    setForm((current) => ({ ...current, [key]: value }));
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
    if (status === 'Signed' && finalSnapshot?.status === 'Signed') return;
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
  }, [activeStepIndex, confirmations, contractLoaded, dealerAccountNumber, effectiveUser?.email, form, status]);

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
    if (activeStep.id === 'parties' && !hasRequiredPartyData(form)) {
      toast.error('Udfyld Timan-sælger og forhandleroplysninger, før du går videre.');
      return;
    }
    setActiveStepIndex((current) => Math.min(current + 1, CONTRACT_STEPS.length - 1));
  };

  const goPrevious = () => setActiveStepIndex((current) => Math.max(current - 1, 0));

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

    const snapshot = finalSnapshot?.status === 'Signed'
      ? finalSnapshot
      : buildContractSnapshot(form, confirmations);
    const signedSnapshot = snapshot.status === 'Signed'
      ? snapshot
      : buildContractSnapshot({ ...form, signatureDataUrl: form.signatureDataUrl }, confirmations);

    if (signedSnapshot.status === 'Signed' && !finalSnapshot) {
      const { row, error } = await saveDealerContractDraft({
        id: contractRowId,
        ownerEmail: effectiveUser?.email || form.timanSellerEmail,
        ownerName: effectiveUser?.display_name || effectiveUser?.email || form.timanSellerName,
        dealerAccountNumber,
        activeStepIndex,
        form,
        confirmations,
        status: 'Signed',
        finalSnapshot: signedSnapshot,
      });
      if (error) {
        toast.error('Kontrakten kunne ikke låses som Signed.');
        return;
      }
      setContractRowId(row?.id ?? contractRowId);
      setFinalSnapshot(row?.final_snapshot ?? signedSnapshot);
    }

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pdfSnapshot = finalSnapshot?.status === 'Signed' ? finalSnapshot : signedSnapshot;
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
    pdf.text('Forhandler', 112, y);
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
    pdf.text('Kontraktpakke', left, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    CONTRACT_DOCS.forEach((doc, index) => {
      pdf.text(`${index + 1}. ${doc.title}`, left, y);
      y += 6;
    });

    pdf.addPage();
    drawAppendix2Pdf(pdf, left, right);

    pdf.addPage();
    y = 18;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(17, 24, 39);
    pdf.text('Bekræftelser', left, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    Object.entries(pdfSnapshot.confirmations).forEach(([key, confirmation]) => {
      const confirmedAt = confirmation.confirmedAt ? new Date(confirmation.confirmedAt).toLocaleString('da-DK') : '-';
      pdf.text(`${key}: ${confirmation.confirmed ? 'Bekræftet' : 'Ikke bekræftet'} · ${confirmedAt} · ${confirmation.confirmedBy || '-'}`, left, y);
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
    if (pdfSnapshot.signatureDataUrl) {
      try {
        pdf.addImage(pdfSnapshot.signatureDataUrl, 'PNG', 112, y + 3, 45, 14, undefined, 'FAST');
      } catch {
        try {
          pdf.addImage(pdfSnapshot.signatureDataUrl, 'JPEG', 112, y + 3, 45, 14, undefined, 'FAST');
        } catch {
          // Keep the signature line if the browser cannot embed the uploaded image.
        }
      }
    }
    pdf.text('Timan underskrift______________________', left, y + 24);
    pdf.text('Forhandler underskrift_________________', 112, y + 24);

    const fileName = `Timan_Forhandlerkontrakt_${safeFilePart(dealer.name)}_${pdfSnapshot.contractDate}.pdf`;
    pdf.save(fileName);
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
            <ProgressSteps activeStepIndex={activeStepIndex} confirmations={confirmations} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        <div className={`grid grid-cols-1 gap-6 ${showContractSidebar ? 'xl:grid-cols-[1fr_340px]' : ''}`}>
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="mb-6">
              <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Trin {activeStepIndex + 1} af {CONTRACT_STEPS.length}</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-950">{activeStep.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">{activeStep.intro}</p>
            </div>

            {activeStep.id === 'parties' && (
              <PartiesStep form={form} update={update} locked={isSigned} />
            )}

            {activeStep.id !== 'parties' && activeStep.id !== 'signature' && (
              <ReviewStep
                stepId={activeStep.id}
                confirmationId={currentConfirmationId}
                confirmation={currentConfirmationId ? confirmations[currentConfirmationId] : undefined}
                onConfirm={confirmSection}
                form={form}
              />
            )}

            {activeStep.id === 'signature' && (
              <SignatureStep
                form={form}
                status={status}
                readyForSignature={readyForSignature}
                signatureName={signatureName}
                onSignatureUpload={handleSignatureUpload}
                onGeneratePdf={generatePdf}
                locked={isSigned}
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

          {showContractSidebar && (
            <aside className="space-y-4">
              <ContractStatusCard status={status} readyForSignature={readyForSignature} />
              <DocumentList />
            </aside>
          )}
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
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900 mb-3">Forhandleroplysninger</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="Forhandlernavn *" value={form.dealerName} onChange={(value) => update('dealerName', value)} placeholder="Fx Danish Agro Machinery - Kolding" disabled={locked} />
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
}: {
  stepId: (typeof CONTRACT_STEPS)[number]['id'];
  confirmationId?: string;
  confirmation?: { confirmed: boolean; confirmedAt?: string; confirmedBy?: string };
  onConfirm: () => void;
  form: ContractFormData;
}) {
  const docs = STEP_DOCUMENTS[stepId] ?? [];
  const fullContract = stepId === 'full_contract';

  return (
    <div className="space-y-5">
      {fullContract && (
        <ContractSummary form={form} />
      )}

      {stepId === 'commercial_terms' && (
        <Appendix2DiscountSection />
      )}

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex items-start gap-3">
          <FileText className="mt-1 h-5 w-5 text-gray-500" />
          <div>
            <h3 className="text-lg font-bold text-gray-950">Juridisk kontrakttekst</h3>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Den juridiske tekst ligger i de eksisterende kontrakt-PDF’er. De er source of truth, og denne guidede visning ændrer ikke vilkårene.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {docs.map((doc) => (
            <a
              key={doc.href}
              href={doc.href}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm hover:border-amber-300 hover:bg-amber-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-bold text-gray-900">{doc.title}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Læs hele afsnittet</span>
            </a>
          ))}
        </div>
      </div>

      {confirmationId && (
        <div className={`rounded-2xl border p-5 ${confirmation?.confirmed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(confirmation?.confirmed)}
              onChange={onConfirm}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600"
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

function SignatureStep({
  form,
  status,
  readyForSignature,
  signatureName,
  onSignatureUpload,
  onGeneratePdf,
  locked,
}: {
  form: ContractFormData;
  status: string;
  readyForSignature: boolean;
  signatureName: string;
  onSignatureUpload: (file: File | undefined) => void;
  onGeneratePdf: () => void;
  locked: boolean;
}) {
  return (
    <div className="space-y-6">
      <ContractSummary form={form} />

      {!readyForSignature && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <Lock className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-bold">Ikke klar til underskrift endnu</p>
            <p className="mt-1">Udfyld parterne og bekræft de obligatoriske kontraktafsnit først.</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Forhandlerens digitale signatur</h3>
        <label className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center ${locked ? 'cursor-not-allowed border-gray-200 bg-gray-100' : 'cursor-pointer border-gray-300 bg-gray-50 hover:border-amber-300 hover:bg-amber-50'}`}>
          <Upload className="h-5 w-5 text-amber-700" />
          <span className="mt-2 text-sm font-semibold text-gray-800">{locked ? 'Signaturen er låst på denne kontrakt' : 'Upload forhandlerens signaturbillede'}</span>
          <span className="mt-1 text-xs text-gray-500">{signatureName || 'Valgfrit - PNG eller JPG'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={!readyForSignature || locked}
            onChange={(e) => onSignatureUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onGeneratePdf}
        disabled={!readyForSignature}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        <Download className="h-4 w-4" />
        Generér endelig kontrakt-PDF
      </button>
      <p className="text-xs text-gray-500">Status: {status}. PDF’en gemmer et snapshot af de data og bekræftelser, der er gennemgået i flowet.</p>
    </div>
  );
}

function Appendix2DiscountSection() {
  return (
    <div className="space-y-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="space-y-4 text-sm leading-6 text-gray-700">
        {APPENDIX_2_PARAGRAPHS.map((paragraph, index) => {
          const isHeading = index === 0 || /^\d+\./.test(paragraph);
          return (
            <p key={paragraph} className={isHeading ? 'font-bold text-gray-950' : ''}>
              {paragraph}
            </p>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-emerald-200 bg-white p-4 shadow-inner">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[3fr_1.05fr] gap-5 text-center text-lg font-bold text-gray-950">
            <div>
              <p>Hele maskinordren inkl. redskaber.</p>
              <div className="mt-2 h-8 rounded-t-xl border-x-2 border-t-2 border-[#2f711c]" />
            </div>
            <div>
              <p>Refusion ved garantiregistrering.</p>
              <div className="mt-2 h-8 rounded-t-xl border-x-2 border-t-2 border-[#2f711c]" />
            </div>
          </div>

          <div className="grid grid-cols-[1.05fr_1.8fr_1.25fr_1.45fr] border-b-2 border-[#2f711c] pb-4 text-center text-lg font-bold text-gray-950">
            <p>Grundrabat</p>
            <p>Stk. rabat</p>
            <p>Leveringsrabat</p>
            <p>Demonstrationsrabat</p>
          </div>

          <div className="grid grid-cols-[1.05fr_1.8fr_1.25fr_1.45fr] items-center gap-6 py-7">
            <div className="flex items-center justify-center gap-6">
              <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border border-[#79a45e] bg-[#fbfdf9] text-center">
                <p className="text-5xl font-black leading-none text-[#36780f]">25%</p>
                <p className="mt-3 text-base font-semibold text-gray-950">Grund rabat</p>
              </div>
              <div className="text-4xl font-light text-[#36780f]">→</div>
            </div>

            <div className="relative h-56">
              <div className="absolute bottom-9 left-4 h-1.5 w-28 rounded-full bg-[#36780f]" />
              <div className="absolute bottom-9 left-32 h-20 w-1.5 rounded-full bg-[#36780f]" />
              <div className="absolute bottom-[7.05rem] left-32 h-1.5 w-28 rounded-full bg-[#36780f]" />
              <div className="absolute bottom-[7.05rem] left-60 h-20 w-1.5 rounded-full bg-[#36780f]" />
              <div className="absolute bottom-[11.95rem] left-60 h-1.5 w-32 rounded-full bg-[#36780f]" />

              <div className="absolute bottom-2 left-14 text-center">
                <p className="text-lg font-semibold text-gray-950">1 stk.</p>
                <p className="text-3xl font-black text-[#36780f]">+0%</p>
              </div>
              <div className="absolute bottom-[5.6rem] left-40 text-center">
                <p className="text-lg font-semibold text-gray-950">2-3 stk.</p>
                <p className="text-3xl font-black text-[#36780f]">+2%</p>
              </div>
              <div className="absolute bottom-[10.5rem] left-[16.5rem] text-center">
                <p className="text-lg font-semibold text-gray-950">4 stk. og &gt;</p>
                <p className="text-3xl font-black text-[#36780f]">+4%</p>
              </div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 text-4xl font-light text-[#36780f]">→</div>
            </div>

            <div className="flex items-center justify-center gap-5">
              <div className="flex h-56 w-full max-w-[210px] flex-col items-center justify-center rounded-2xl border border-[#79a45e] bg-[#fbfdf9] px-4 text-center">
                <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#8bb06f]">
                  <div className="absolute -inset-3 rounded-full border-[7px] border-[#36780f] border-l-transparent border-b-transparent" />
                  <div className="absolute -inset-3 rotate-180 rounded-full border-[7px] border-[#36780f] border-l-transparent border-b-transparent" />
                  <div>
                    <p className="text-base font-bold text-gray-950">Leveringstid:</p>
                    <p className="text-base font-bold text-gray-950">Over 3 mdr.</p>
                    <p className="mt-1 text-3xl font-black text-[#36780f]">+2%</p>
                  </div>
                </div>
                <p className="mt-5 text-sm font-medium leading-5 text-gray-950">Rabatten gives ved leveringstid over 3 måneder.</p>
              </div>
              <div className="text-4xl font-light text-[#36780f]">→</div>
            </div>

            <div className="flex h-52 flex-col justify-center rounded-2xl border border-[#79a45e] bg-[#fbfdf9] px-7 text-gray-950">
              <div className="flex items-center gap-5">
                <div className="h-16 w-16 rotate-[-38deg] rounded-lg border-[3px] border-gray-950">
                  <div className="ml-auto mr-2 mt-2 h-3.5 w-3.5 rounded-full border-[3px] border-gray-950" />
                </div>
                <div>
                  <p className="text-lg font-semibold leading-6">Egen</p>
                  <p className="text-lg font-semibold leading-6">demonstrationsrabat</p>
                  <p className="mt-3 text-4xl font-black text-[#36780f]">3100 kr.</p>
                </div>
              </div>
              <div className="my-6 h-px bg-[#a9c794]" />
              <p className="text-center text-base font-medium leading-6">Udbetales som kreditnota<br />ved garantiregistrering.</p>
            </div>
          </div>

          <div className="flex items-center gap-8 rounded-2xl border border-emerald-500 bg-[#fbfdf9] px-8 py-5 text-gray-950">
            <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full border-[4px] border-[#36780f] text-4xl font-black text-[#36780f]">%</div>
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-base">
              <p className="text-xl font-black text-[#36780f]">Eksempel:</p>
              <p>Den maksimale rabat, som kan opnås på en maskine og redskaber er:</p>
              <p className="text-xl font-black text-[#36780f]">25% + 4% + 2% = 29,44 %</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressSteps({ activeStepIndex, confirmations }: { activeStepIndex: number; confirmations: ContractConfirmations }) {
  return (
    <div className="overflow-x-auto pb-0.5">
      <div className="grid min-w-[720px] grid-cols-7 gap-1.5 md:w-full">
        {CONTRACT_STEPS.map((step, index) => {
          const confirmationId = step.confirmationId;
          const confirmed = !confirmationId || confirmations[confirmationId]?.confirmed;
          const active = index === activeStepIndex;
          const complete = index < activeStepIndex && confirmed;
          return (
            <div
              key={step.id}
              className={`rounded-xl border px-2.5 py-2 ${active ? 'border-gray-950 bg-gray-950 text-white' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-gray-200 bg-white text-gray-600'}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide leading-none">Trin {index + 1}</span>
                {complete || (confirmationId && confirmed) ? <CheckCircle2 className="h-3.5 w-3.5 flex-none" /> : null}
              </div>
              <p className="mt-1 text-xs font-bold leading-snug">{step.shortTitle}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContractSummary({ form }: { form: ContractFormData }) {
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
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">Forhandler</h3>
        <p className="mt-3 text-lg font-bold text-amber-950">{form.dealerName || '-'}</p>
        <p className="text-sm text-amber-900">{form.dealerAddress || '-'}</p>
        <p className="text-sm text-amber-900">{`${form.dealerPostalCode} ${form.dealerCity}`.trim() || '-'}</p>
        <p className="mt-3 text-sm font-bold text-amber-950">{form.contactPerson || '-'}</p>
        <p className="text-sm text-amber-900">{form.contactTitle || 'Titel ikke angivet'}</p>
        <p className="mt-2 text-sm text-amber-900">Dato: {formatDateDa(form.contractDate)}</p>
      </div>
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
