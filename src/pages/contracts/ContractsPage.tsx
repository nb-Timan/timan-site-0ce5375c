import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, Download, FileSignature, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole, hasModuleAccess, type ModuleAccessKey } from '@/lib/portalAccess';

const CONTRACT_DOCS = [
  { title: 'Forhandlerkontrakt Timan', href: '/contracts/forhandlerkontrakt-timan.pdf' },
  { title: 'Bilag 1 - Service', href: '/contracts/bilag-1-service-kontrakt-timan.pdf' },
  { title: 'Bilag 2 - Rabat', href: '/contracts/bilag-2-rabat-kontrakt-timan.pdf' },
  { title: 'Bilag 3 - Salgsområde', href: '/contracts/bilag-3-salgsomraade-kontrakt-timan.pdf' },
  { title: 'Bilag 4 - Salgs- og leveringsbetingelser', href: '/contracts/bilag-4-salgs-og-leveringsbetingelser-timan.pdf' },
];

type ContractForm = {
  timanCompany: string;
  timanAddress: string;
  timanPostalCity: string;
  timanCvr: string;
  dealerName: string;
  dealerAddress: string;
  dealerPostalCity: string;
  dealerCvr: string;
  contactPerson: string;
  contactTitle: string;
  timanSeller: string;
  contractDate: string;
  signatureDataUrl: string | null;
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
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [signatureName, setSignatureName] = useState('');

  const [form, setForm] = useState<ContractForm>(() => ({
    timanCompany: 'Timan A/S',
    timanAddress: 'Osvald Pedersens Vej 2A-D',
    timanPostalCity: '6980 Tim',
    timanCvr: '27609627',
    dealerName: '',
    dealerAddress: '',
    dealerPostalCity: '',
    dealerCvr: '',
    contactPerson: '',
    contactTitle: '',
    timanSeller: appUser?.name ?? '',
    contractDate: todayIso(),
    signatureDataUrl: null,
  }));

  const portalRole = derivePortalRole(appUser);
  const moduleOverride = (appUser?.module_access ?? null) as ModuleAccessKey[] | null;
  const hasAccess = portalRole === 'timan_backend' || hasModuleAccess(portalRole, 'contracts', moduleOverride);

  const ready = useMemo(
    () => Boolean(
      form.timanCompany.trim()
      && form.timanAddress.trim()
      && form.timanPostalCity.trim()
      && form.timanCvr.trim()
      && form.dealerName.trim()
      && form.dealerAddress.trim()
      && form.dealerPostalCity.trim()
      && form.dealerCvr.trim()
      && form.contactPerson.trim()
      && form.timanSeller.trim()
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
      toast.error('Udfyld Timan-oplysninger, forhandlerdata, kontaktperson, Timan sælger og dato.');
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
    pdf.text(form.timanCompany.trim(), left, y);
    y += 5;
    pdf.text(form.timanAddress.trim(), left, y);
    y += 5;
    pdf.text(form.timanPostalCity.trim(), left, y);
    y += 5;
    pdf.text(`CVR: ${form.timanCvr.trim()}`, left, y);

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
      ['Timan sælger', form.timanSeller.trim()],
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
    pdf.text(form.timanCompany.trim(), left, y);
    pdf.text(form.dealerName.trim(), 116, y);
    y += 7;
    pdf.text(`Navn: ${form.timanSeller.trim()}`, left, y);
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
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Timan-oplysninger</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField label="Firma *" value={form.timanCompany} onChange={(value) => update('timanCompany', value)} />
                  <TextField label="CVR *" value={form.timanCvr} onChange={(value) => update('timanCvr', value)} />
                  <TextField label="Adresse *" value={form.timanAddress} onChange={(value) => update('timanAddress', value)} />
                  <TextField label="Postnr. og by *" value={form.timanPostalCity} onChange={(value) => update('timanPostalCity', value)} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Forhandleroplysninger</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField label="Forhandlernavn *" value={form.dealerName} onChange={(value) => update('dealerName', value)} placeholder="Fx Danish Agro Machinery - Kolding" />
                  <TextField label="CVR *" value={form.dealerCvr} onChange={(value) => update('dealerCvr', value)} />
                  <TextField label="Adresse *" value={form.dealerAddress} onChange={(value) => update('dealerAddress', value)} />
                  <TextField label="Postnr. og by *" value={form.dealerPostalCity} onChange={(value) => update('dealerPostalCity', value)} />
                  <TextField label="Kontaktperson *" value={form.contactPerson} onChange={(value) => update('contactPerson', value)} placeholder="Navn på kontaktperson" />
                  <TextField label="Titel" value={form.contactTitle} onChange={(value) => update('contactTitle', value)} placeholder="Fx ejer, salgschef eller direktør" />
                  <TextField label="Timan sælger *" value={form.timanSeller} onChange={(value) => update('timanSeller', value)} placeholder="Navn på Timan sælger" />
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
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Digital signatur</h3>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center hover:border-amber-300 hover:bg-amber-50">
                  <Upload className="h-5 w-5 text-amber-700" />
                  <span className="mt-2 text-sm font-semibold text-gray-800">Upload signaturbillede</span>
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
