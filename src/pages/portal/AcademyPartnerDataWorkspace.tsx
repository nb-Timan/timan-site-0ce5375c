import { useEffect, useState } from 'react';
import { Building2, Handshake, ReceiptText, Users } from 'lucide-react';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { getLocalAcademyUser } from '@/lib/academyCurriculum';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';

export default function AcademyPartnerDataWorkspace({ part }: { part: 1 | 2 }) {
  const { appUser, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const [state, setState] = useState(() => academyPartnerDataSandbox.getState());
  const refresh = () => setState(academyPartnerDataSandbox.getState());
  const progress = academyPartnerDataSandbox.getProgress();

  useEffect(() => {
    academyPartnerDataSandbox.start(part);
    refresh();
  }, [part]);

  const saveProfile = () => {
    academyPartnerDataSandbox.saveProfile({ contactName: state.contactName, youtubeChannel: state.youtubeChannel });
    refresh();
  };

  const user = appUser || getLocalAcademyUser();
  const tasks = part === 1
    ? [
        { label: 'Kontaktperson tilføjet', complete: Boolean(state.contactName.trim()) },
        { label: 'Første kontakt valgt', complete: state.primaryContactId === 'academy-contact-1' },
        { label: 'YouTube-kanal opdateret', complete: /^https?:\/\/(www\.)?youtube\.com\//i.test(state.youtubeChannel.trim()) },
      ]
    : [
        { label: 'Partnerrelation gennemgået', complete: state.relationReviewed },
        { label: 'Fakturaaccept gennemgået', complete: state.invoiceFlowReviewed },
      ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PortalHeader user={user} language={language} onLanguageChange={setLanguage} onLogout={logout} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <AcademyGuidancePanel
          title={`Partnerdata - Part ${part}`}
          description="Du arbejder kun med lokale Academy-data. Ingen virksomheds-, kontakt-, partner- eller fakturadata ændres i portalen."
          tasks={tasks}
          next={part === 1 ? 'Gem kontaktpersonen og vælg den som første kontakt.' : 'Gennemgå partnerrelationen og fakturaaccepten.'}
        />

        {part === 1 ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-[#126a45]" /><h1 className="text-xl font-bold text-slate-900">Virksomheds- og persondata</h1></div>
            <p className="mt-1 text-sm text-slate-600">Opdater den lokale Academy-profil og vælg dens første kontaktperson.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">Kontaktperson
                <input value={state.contactName} onChange={(event) => setState({ ...state, contactName: event.target.value })} placeholder="Academy kontaktperson" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-800">YouTube-kanal
                <input value={state.youtubeChannel} onChange={(event) => setState({ ...state, youtubeChannel: event.target.value })} placeholder="https://youtube.com/@academy" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
              </label>
            </div>
            <button type="button" onClick={saveProfile} className="mt-4 rounded-md bg-[#126a45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f5a3b]">Gem lokale Academy-oplysninger</button>
            <div className="mt-6 border-t border-slate-200 pt-5"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#126a45]" /><h2 className="font-bold text-slate-900">Vælg første kontakt</h2></div>
              <button type="button" onClick={() => { academyPartnerDataSandbox.choosePrimaryContact('academy-contact-1'); refresh(); }} className={`mt-3 flex w-full items-center justify-between rounded-md border px-4 py-3 text-left ${state.primaryContactId === 'academy-contact-1' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span><b>{state.contactName.trim() || 'Academy kontaktperson'}</b><span className="block text-xs text-slate-500">Lokal Academy-kontakt</span></span><span className="text-sm font-semibold">{state.primaryContactId === 'academy-contact-1' ? 'Valgt' : 'Vælg'}</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-[#126a45]" /><h1 className="text-xl font-bold text-slate-900">Samarbejdspartnere og fakturering</h1></div>
            <p className="mt-1 text-sm text-slate-600">Gennemgå den lokale Academy-relation og reservedelsfakturering.</p>
            <button type="button" onClick={() => { academyPartnerDataSandbox.reviewPartnerRelation(); refresh(); }} className={`mt-5 w-full rounded-md border p-4 text-left ${state.relationReviewed ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <b>Academy servicepartner</b><span className="mt-1 block text-sm text-slate-600">Læs den lokale relation mellem hovedforhandler og servicepartner.</span><span className="mt-2 block text-sm font-semibold">{state.relationReviewed ? 'Gennemgået' : 'Gennemgå relation'}</span>
            </button>
            <button type="button" onClick={() => { academyPartnerDataSandbox.reviewInvoiceFlow(); refresh(); }} className={`mt-3 w-full rounded-md border p-4 text-left ${state.invoiceFlowReviewed ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#126a45]" /><b>Fakturaaccept for reservedele</b></span><span className="mt-1 block text-sm text-slate-600">Bekræft den lokale Academy-procedure for reservedelsbestilling.</span><span className="mt-2 block text-sm font-semibold">{state.invoiceFlowReviewed ? 'Gennemgået' : 'Gennemgå fakturaaccept'}</span>
            </button>
          </section>
        )}
        {part === 1 && progress.part1Completed && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Part 1 er gennemført. Part 2 er nu låst op på Academy-dashboardet.</p>}
        {part === 2 && progress.part2Completed && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Part 2 er gennemført.</p>}
      </main>
      <PortalFooter language={language} />
    </div>
  );
}

/**
 * Portal Basics only needs a safe visit to Partnerdata before returning home.
 * Keep that exercise entirely inside the local Academy sandbox instead of
 * opening the authenticated dealer-data queries.
 */
export function AcademyPortalBasicsPartnerDataPreview() {
  const { appUser, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const user = appUser || getLocalAcademyUser();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PortalHeader user={user} language={language} onLanguageChange={setLanguage} onLogout={logout} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <AcademyGuidancePanel
          title="Portal Basics - Partnerdata"
          description="Dette er den lokale Academy-udgave af Partnerdata. Rigtige partner- og kontaktdata bliver ikke hentet eller ændret."
          tasks={[{ label: 'Partnerdata åbnet', complete: true }]}
          next="brug Timan-logoet i headeren for at vende tilbage til portalens forside."
        />
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-[#126a45]" /><h1 className="text-xl font-bold text-slate-900">Partnerdata</h1></div>
          <p className="mt-2 text-sm text-slate-600">I den almindelige portal indeholder dette område stamdata, kontaktinformation samt tilbud og ordrer. Academy bruger kun dette lokale træningskort.</p>
        </section>
      </main>
      <PortalFooter language={language} />
    </div>
  );
}
