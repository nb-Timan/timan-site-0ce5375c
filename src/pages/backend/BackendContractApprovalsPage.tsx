import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import {
  addSignedUrlsToUploadVersions,
  approveDealerContractUpload,
  fetchDealerContractsForReview,
  fetchDealerContractUploadVersions,
  requestDealerContractNewUpload,
  type DealerContractRecord,
  type DealerContractUploadVersion,
} from '@/lib/dealerContractsService';
import { getContractWorkflowStatusLabel } from '@/lib/contractFlow';

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString('da-DK');
}

function daysWaiting(value: string | null | undefined) {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  return `${Math.max(0, Math.floor(diff / 86400000))} dage`;
}

export default function BackendContractApprovalsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const [contracts, setContracts] = useState<DealerContractRecord[]>([]);
  const [versionsByContract, setVersionsByContract] = useState<Record<string, DealerContractUploadVersion[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const portalRole = derivePortalRole(appUser);
  const canReview = portalRole === 'timan_backend' || portalRole === 'timan_seller' || portalRole === 'timan_service';

  const load = async () => {
    const { rows, error } = await fetchDealerContractsForReview();
    if (error) {
      toast.error('Kunne ikke hente kontrakter til gennemgang.');
      return;
    }
    setContracts(rows);
    const entries = await Promise.all(rows.map(async (contract) => {
      const versions = await fetchDealerContractUploadVersions(contract.id);
      return [contract.id, versions.error ? [] : await addSignedUrlsToUploadVersions(versions.rows)] as const;
    }));
    setVersionsByContract(Object.fromEntries(entries));
  };

  useEffect(() => {
    if (!appUser || !canReview) return;
    void load();
  }, [appUser?.email, canReview]);

  const waitingContracts = useMemo(
    () => contracts.filter((contract) => contract.contract_status === 'submitted_for_approval'),
    [contracts],
  );

  const approve = async (versionId: string) => {
    setBusy(versionId);
    const { error } = await approveDealerContractUpload(versionId);
    if (error) toast.error('Kontrakten kunne ikke godkendes.');
    else {
      toast.success('Kontrakten er godkendt og arkiveret.');
      await load();
    }
    setBusy(null);
  };

  const requestNewUpload = async (versionId: string) => {
    const comment = comments[versionId]?.trim();
    if (!comment) {
      toast.error('Skriv en kommentar først.');
      return;
    }
    setBusy(versionId);
    const { error } = await requestDealerContractNewUpload(versionId, comment);
    if (error) toast.error('Kunne ikke sende besked om ny upload.');
    else {
      toast.success('Partneren kan nu uploade en ny version.');
      await load();
    }
    setBusy(null);
  };

  if (loading) return <div className="min-h-screen bg-gray-50" />;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canReview) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={logout} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Timan Backend</p>
            <h1 className="text-3xl font-black text-gray-950">Kontraktgodkendelse</h1>
            <p className="mt-2 text-sm text-gray-600">{waitingContracts.length} kontrakt(er) afventer Timan-gennemgang.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
            Opdater
          </button>
        </div>

        <div className="space-y-4">
          {contracts.map((contract) => {
            const versions = versionsByContract[contract.id] ?? [];
            const activeVersion = versions.find((version) => version.status === 'submitted')
              ?? versions.find((version) => version.status === 'approved')
              ?? versions[0];
            return (
              <section key={contract.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black text-gray-950">{contract.form_data.dealerName || contract.dealer_account_number || 'Ukendt partner'}</h2>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                        {getContractWorkflowStatusLabel(contract.contract_status)}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <Info label="Kontrakt" value={contract.contract_number || contract.id.slice(0, 8)} />
                      <Info label="Version" value={contract.contract_version} />
                      <Info label="Gennemført af" value={contract.guided_review_completed_by_name || contract.owner_name || '-'} />
                      <Info label="Uploadet" value={fmtDateTime(activeVersion?.submitted_at)} />
                      <Info label="Ventetid" value={daysWaiting(activeVersion?.submitted_at)} />
                      <Info label="Timan-sælger" value={contract.form_data.timanSellerName || contract.guided_review_completed_by_email || '-'} />
                    </dl>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-gray-950">Uploadversion {activeVersion?.version_no ?? '-'}</p>
                    {(activeVersion?.files ?? []).map((file, index) => (
                      <a
                        key={file.id}
                        href={file.signed_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:border-amber-300 hover:bg-amber-50"
                      >
                        <span className="min-w-0 truncate">{file.mime_type === 'application/pdf' ? 'PDF' : `Side ${index + 1}`}: {file.file_name}</span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-amber-700" />
                      </a>
                    ))}
                    {activeVersion?.status === 'submitted' && (
                      <div className="space-y-3 border-t border-gray-200 pt-3">
                        <textarea
                          value={comments[activeVersion.id] || ''}
                          onChange={(event) => setComments((current) => ({ ...current, [activeVersion.id]: event.target.value }))}
                          placeholder="Kommentar ved Kræver ny upload"
                          className="min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => requestNewUpload(activeVersion.id)}
                            disabled={busy === activeVersion.id}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Kræver ny upload
                          </button>
                          <button
                            type="button"
                            onClick={() => approve(activeVersion.id)}
                            disabled={busy === activeVersion.id}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Godkend kontrakt
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
          {contracts.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Ingen kontrakter til gennemgang endnu.
            </div>
          )}
        </div>
      </main>
      <PortalFooter language={lang} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-gray-950">{value || '-'}</dd>
    </div>
  );
}
