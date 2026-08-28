import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Download, FileSignature, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { fetchDealerAccountByNumber } from '@/lib/dealerAccountsService';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess } from '@/lib/portalAccess';
import { supabase } from '@/lib/supabase';
import { useEffectivePortalUser } from '@/lib/viewAsUser';

const CONTRACT_DOCS = [
  { title: 'Forhandlerkontrakt Timan', href: '/contracts/forhandlerkontrakt-timan.pdf' },
  { title: 'Bilag 1 - Service', href: '/contracts/bilag-1-service-kontrakt-timan.pdf' },
  { title: 'Bilag 2 - Rabat', href: '/contracts/bilag-2-rabat-kontrakt-timan.pdf' },
  { title: 'Bilag 3 - Salgsområde', href: '/contracts/bilag-3-salgsomraade-kontrakt-timan.pdf' },
  { title: 'Bilag 4 - Salgs- og leveringsbetingelser', href: '/contracts/bilag-4-salgs-og-leveringsbetingelser-timan.pdf' },
];

type ContractForm = {
  dealerName: string;
  dealerAddress: string;
  dealerPostalCity: string;
  dealerCvr: string;
  contactPerson: string;
  contactTitle: string;
  timanSellerName: string;
  timanSellerEmail: string;
  timanSellerPhone: string;
  contractDate: string;
  signatureDataUrl: string | null;
};

const TIMAN_COMPANY_INFO = {
  company: 'Timan A/S',
  cvr: '27609627',
  address: 'Osvald Pedersens Vej 2A-D',
  postalCity: '6980 Tim',
};

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

export default function ContractsPage() {
  const { appUser, loading, logout } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [signatureName, setSignatureName] = useState('');
  const dealerAccountNumber = (searchParams.get('accountNumber') || searchParams.get('dealer') || '').trim();

  const [form, setForm] = useState<ContractForm>(() => ({
    dealerName: '',
    dealerAddress: '',
    dealerPostalCity: '',
    dealerCvr: '',
    contactPerson: '',
    contactTitle: '',
    timanSellerName: '',
    timanSellerEmail: '',
    timanSellerPhone: '',
    contractDate: todayIso(),
    signatureDataUrl: null,
  }));

  useEffect(() => {
    if (!effectiveUser) return;
    let cancelled = false;

    const applySeller = (phone = '') => {
      if (cancelled) return;
      setForm((current) => ({
        ...current,
        timanSellerName: effectiveUser.display_name || effectiveUser.email || '',
        timanSellerEmail: effectiveUser.email || '',
        timanSellerPhone: phone,
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
      setForm((current) => ({
        ...current,
        dealerName: row.company_name || current.dealerName,
        dealerAddress: [row.address_line_1 || row.address, row.address_line_2].filter(Boolean).join(', ') || current.dealerAddress,
        dealerPostalCity: [row.postal_code, row.city].filter(Boolean).join(' ') || row.zip_city_raw || current.dealerPostalCity,
        dealerCvr: row.vat_number || current.dealerCvr,
        contactPerson: row.primary_contact_name || row.sales_contact_name || current.contactPerson,
      }));
    });
    return () => { cancelled = true; };
  }, [dealerAccountNumber]);

  const portalRole = derivePortalRole(effectiveUser);
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);
  const hasAccess = portalRole === 'timan_backend' || hasModuleAccess(portalRole, 'contracts', moduleOverride);

  const ready = useMemo(
    () => Boolean(
      form.dealerName.trim()
      && form.dealerAddress.trim()
      && form.dealerPostalCity.trim()
      && form.dealerCvr.trim()
      && form.contactPerson.trim()
      && form.timanSellerName.trim()
      && form.timanSellerEmail.trim()
      && form.contractDate,
    ),
    [form],
  );

  const update = (key: keyof ContractForm, value: string | null) => {
    setForm((current) => ({ ...current, [key]: value }));
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
    if (!ready) {
      toast.error('Udfyld forhandlerdata, kontaktperson og dato. Timan-sælger udfyldes automatisk.');
      return;
    }

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 16;
    const right = 194;
    let y = 18;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(43, 85, 140);
    pdf.text('FORHANDLERKONTRAKT', left, y);
    y += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(17, 24, 39);
    pdf.text(TIMAN_COMPANY_INFO.company, left, y);
    y += 5;
    pdf.text(TIMAN_COMPANY_INFO.address, left, y);
    y += 5;
    pdf.text(TIMAN_COMPANY_INFO.postalCity, left, y);
    y += 5;
    pdf.text(`CVR: ${TIMAN_COMPANY_INFO.cvr}`, left, y);
    y += 5;
    pdf.text(`Timan sælger: ${form.timanSellerName.trim()}`, left, y);
    y += 5;
    pdf.text(`E-mail: ${form.timanSellerEmail.trim()}`, left, y);
    if (form.timanSellerPhone.trim()) {
      y += 5;
      pdf.text(`Telefon: ${form.timanSellerPhone.trim()}`, left, y);
    }

    const boxX = 82;
    const boxY = 20;
    const boxW = 108;
    const boxH = 34;
    pdf.setDrawColor(70, 70, 70);
    pdf.setLineWidth(0.3);
    pdf.rect(boxX, boxY, boxW, boxH);
    pdf.text(`Forhandlers navn: ${form.dealerName.trim()}`, boxX + 4, boxY + 8);
    pdf.text(`Adresse: ${form.dealerAddress.trim()}`, boxX + 4, boxY + 15);
    pdf.text(`Postnummer, By: ${form.dealerPostalCity.trim()}`, boxX + 4, boxY + 22);
    pdf.text(`CVR: ${form.dealerCvr.trim()}`, boxX + 4, boxY + 29);

    y = 66;
    pdf.text(`Dato: ${formatDateDa(form.contractDate)}`, left, y);
    y += 12;

    pdf.setDrawColor(81, 127, 202);
    pdf.line(left, y, right, y);
    y += 12;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(12);
    pdf.text('Kontaktoplysninger', left, y);
    y += 8;

    const rows: Array<[string, string]> = [
      ['Kontaktperson', form.contactPerson.trim()],
      ['Titel', form.contactTitle.trim() || '-'],
      ['Timan sælger', form.timanSellerName.trim()],
      ['Sælgers e-mail', form.timanSellerEmail.trim()],
      ['Sælgers telefon', form.timanSellerPhone.trim() || '-'],
    ];

    rows.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${label}:`, left, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(value, 54, y);
      y += 7;
    });

    y += 8;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Kontraktpakke', left, y);
    y += 8;
    pdf.setFont('helvetica', 'normal');
    CONTRACT_DOCS.forEach((doc, index) => {
      pdf.text(`${index + 1}. ${doc.title}`, left, y);
      y += 6;
    });

    y = 220;
    pdf.setDrawColor(81, 127, 202);
    pdf.line(left, y, right, y);
    y += 9;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(43, 85, 140);
    pdf.text('Underskrifter', left, y);
    y += 8;

    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'normal');
    pdf.text(TIMAN_COMPANY_INFO.company, left, y);
    pdf.text(form.dealerName.trim(), 116, y);
    y += 7;
    pdf.text(`Navn: ${form.timanSellerName.trim()}`, left, y);
    pdf.text(`Navn: ${form.contactPerson.trim()}`, 116, y);
    y += 7;
    pdf.text('Titel:', left, y);
    pdf.text(`Titel: ${form.contactTitle.trim() || ''}`, 116, y);
    y += 7;
    pdf.text(`Dato: ${formatDateDa(form.contractDate)}`, left, y);
    pdf.text('Dato:', 116, y);
    y += 10;

    if (form.signatureDataUrl) {
      try {
        pdf.addImage(form.signatureDataUrl, 'PNG', left, y - 7, 45, 14, undefined, 'FAST');
      } catch {
        try {
          pdf.addImage(form.signatureDataUrl, 'JPEG', left, y - 7, 45, 14, undefined, 'FAST');
        } catch {
          // If the browser cannot embed the uploaded image, keep the signature line.
        }
      }
    }

    pdf.text('Underskrift____________________________', left, y + 10);
    pdf.text('Underskrift____________________________', 116, y + 10);

    const fileName = `Timan_Forhandlerkontrakt_${safeFilePart(form.dealerName)}_${form.contractDate}.pdf`;
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
          <div className="flex items-start gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Kontrakt udfyldt forhandlere</h1>
                <p className="text-sm text-gray-500 mt-1">Generér kontraktdata med dato.</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <CalendarDays className="h-5 w-5 text-amber-700" />
              <h2 className="text-xl font-bold text-gray-900">Kontraktoplysninger</h2>
            </div>

            <div className="space-y-7">
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
                      <InfoField label="Navn" value={form.timanSellerName || '—'} />
                      <InfoField label="E-mail" value={form.timanSellerEmail || '—'} />
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
                  <TextField label="Forhandlernavn *" value={form.dealerName} onChange={(value) => update('dealerName', value)} placeholder="Fx Danish Agro Machinery - Kolding" />
                  <TextField label="CVR *" value={form.dealerCvr} onChange={(value) => update('dealerCvr', value)} />
                  <TextField label="Adresse *" value={form.dealerAddress} onChange={(value) => update('dealerAddress', value)} />
                  <TextField label="Postnr. og by *" value={form.dealerPostalCity} onChange={(value) => update('dealerPostalCity', value)} />
                  <TextField label="Kontaktperson *" value={form.contactPerson} onChange={(value) => update('contactPerson', value)} placeholder="Navn på kontaktperson" />
                  <TextField label="Titel" value={form.contactTitle} onChange={(value) => update('contactTitle', value)} placeholder="Fx ejer, salgschef eller direktør" />
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Dato *</span>
                    <input
                      type="date"
                      value={form.contractDate}
                      onChange={(e) => update('contractDate', e.target.value)}
                      className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Forhandlerens digitale signatur</h3>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center hover:border-amber-300 hover:bg-amber-50">
                  <Upload className="h-5 w-5 text-amber-700" />
                  <span className="mt-2 text-sm font-semibold text-gray-800">Upload forhandlerens signaturbillede</span>
                  <span className="mt-1 text-xs text-gray-500">{signatureName || 'Valgfrit - PNG eller JPG'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => handleSignatureUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={generatePdf}
                disabled={!ready}
                className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <Download className="h-4 w-4" />
                Generér kontrakt-PDF
              </button>
            </div>
          </section>

          <aside className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 h-fit">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-bold text-gray-900">Skabeloner og bilag</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Hent de originale PDF-dokumenter, der hører til kontrakten.
            </p>
            <div className="space-y-2">
              {CONTRACT_DOCS.map((doc) => (
                <a
                  key={doc.href}
                  href={doc.href}
                  download
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 hover:border-amber-300 hover:bg-amber-50"
                >
                  <span>{doc.title}</span>
                  <Download className="h-4 w-4 shrink-0 text-amber-700" />
                </a>
              ))}
            </div>
          </aside>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
