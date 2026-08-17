import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, Download, FileSignature, FileText } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/portal/BackButton';
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
  dealerName: string;
  dealerAddress: string;
  contactPerson: string;
  timanSeller: string;
  contractDate: string;
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

  const [form, setForm] = useState<ContractForm>(() => ({
    dealerName: '',
    dealerAddress: '',
    contactPerson: '',
    timanSeller: appUser?.name ?? '',
    contractDate: todayIso(),
  }));

  const portalRole = derivePortalRole(appUser);
  const moduleOverride = (appUser?.module_access ?? null) as ModuleAccessKey[] | null;
  const hasAccess = portalRole === 'timan_backend' || hasModuleAccess(portalRole, 'contracts', moduleOverride);

  const ready = useMemo(
    () => Boolean(form.dealerName.trim() && form.dealerAddress.trim() && form.contactPerson.trim() && form.timanSeller.trim() && form.contractDate),
    [form],
  );

  const update = (key: keyof ContractForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const generatePdf = async () => {
    if (!ready) {
      toast.error('Udfyld forhandler, adresse, kontaktperson, Timan sælger og dato.');
      return;
    }

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 20;
    let y = 22;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('Forhandlerkontrakt Timan', left, y);
    y += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(90, 104, 126);
    pdf.text('Kontraktdata genereret fra Timan Portalen', left, y);
    y += 14;

    pdf.setDrawColor(0, 122, 75);
    pdf.setLineWidth(0.7);
    pdf.line(left, y, 190, y);
    y += 12;

    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Udfyldte oplysninger', left, y);
    y += 10;

    const rows: Array<[string, string]> = [
      ['Forhandler', form.dealerName.trim()],
      ['Adresse', form.dealerAddress.trim()],
      ['Kontaktperson', form.contactPerson.trim()],
      ['Timan saelger', form.timanSeller.trim()],
      ['Dato', formatDateDa(form.contractDate)],
    ];

    rows.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${label}:`, left, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(value, 62, y);
      y += 8;
    });

    y += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Kontraktpakke', left, y);
    y += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    CONTRACT_DOCS.forEach((doc, index) => {
      pdf.text(`${index + 1}. ${doc.title}`, left, y);
      y += 7;
    });

    y += 8;
    pdf.setTextColor(90, 104, 126);
    pdf.text('Vedlaeg denne kontraktdata-side sammen med de originale Timan PDF-skabeloner/bilag.', left, y);
    y += 7;
    pdf.text('Dato, forhandlerdata og saelgernavn er udfyldt ud fra formularen i portalen.', left, y);

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

      <div className="bg-white border-b border-gray-200 py-3 no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <BackButton />
        </div>
      </div>

      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <FileSignature className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kontrakt</h1>
              <p className="text-gray-500 mt-1">Udfyld forhandlerdata og generér kontraktdata med dato.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-6">
              <CalendarDays className="h-5 w-5 text-amber-700" />
              <h2 className="text-xl font-bold text-gray-900">Kontraktoplysninger</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Forhandlernavn *</span>
                <input
                  value={form.dealerName}
                  onChange={(e) => update('dealerName', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Fx Danish Agro Machinery - Kolding"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Kontaktperson *</span>
                <input
                  value={form.contactPerson}
                  onChange={(e) => update('contactPerson', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Navn på kontaktperson"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-gray-700">Adresse *</span>
                <input
                  value={form.dealerAddress}
                  onChange={(e) => update('dealerAddress', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Adresse, postnr. og by"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Timan sælger *</span>
                <input
                  value={form.timanSeller}
                  onChange={(e) => update('timanSeller', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Navn på Timan sælger"
                />
              </label>

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
