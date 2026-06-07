import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LifeBuoy, AlertCircle, Plus, Search, LayoutDashboard, FileText,
  Clock, CheckCircle2, XCircle, Layers, Eye,
} from 'lucide-react';
import { Language } from '@/types/configurator';
import { loadClaims, ServiceClaim, ClaimStatus } from '@/lib/claimsService';

const T: Record<string, Record<Language, string>> = {
  title:        { da: 'Service / Claims', en: 'Service / Claims', de: 'Service / Reklamationen', it: 'Assistenza / Reclami', hu: 'Szerviz / Reklamációk' },
  intro:        { da: 'Dine service- og garantisager.', en: 'Your service and warranty cases.', de: 'Ihre Service- und Garantiefälle.', it: 'I tuoi casi di servizio.', hu: 'Az Ön ügyei.' },
  newClaim:     { da: 'Ny claim', en: 'New claim', de: 'Neuer Fall', it: 'Nuovo reclamo', hu: 'Új ügy' },
  readOnly:     { da: 'Skrivebeskyttet', en: 'Read-only', de: 'Nur-Lesen', it: 'Sola lettura', hu: 'Csak olvasható' },
  empty:        { da: 'Ingen sager endnu.', en: 'No claims yet.', de: 'Noch keine Fälle.', it: 'Nessun reclamo.', hu: 'Még nincs ügy.' },
  loading:      { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
  mockNote:     { da: 'Viser eksempeldata (backend-tabel ikke tilgængelig).', en: 'Showing sample data.', de: 'Beispieldaten.', it: 'Dati di esempio.', hu: 'Mintaadatok.' },
  badgeDealer:  { da: 'Forhandlervisning', en: 'Dealer view', de: 'Händleransicht', it: 'Vista rivenditore', hu: 'Kereskedői nézet' },

  navDash:      { da: 'Dashboard', en: 'Dashboard', de: 'Dashboard', it: 'Dashboard', hu: 'Áttekintés' },
  navMine:      { da: 'Mine claims', en: 'My claims', de: 'Meine Fälle', it: 'I miei reclami', hu: 'Saját ügyek' },

  kpiMine:      { da: 'Mine sager', en: 'My claims', de: 'Meine Fälle', it: 'Miei reclami', hu: 'Saját ügyek' },
  kpiOpen:      { da: 'Aktive', en: 'Active', de: 'Aktiv', it: 'Attivi', hu: 'Aktív' },
  kpiApproved:  { da: 'Godkendt', en: 'Approved', de: 'Genehmigt', it: 'Approvati', hu: 'Jóváhagyva' },
  kpiRejected:  { da: 'Afvist', en: 'Rejected', de: 'Abgelehnt', it: 'Respinti', hu: 'Elutasítva' },

  latest:       { da: 'Seneste sager', en: 'Latest claims', de: 'Neueste Fälle', it: 'Ultimi reclami', hu: 'Legutóbbi ügyek' },
  viewAll:      { da: 'Se alle', en: 'View all', de: 'Alle anzeigen', it: 'Vedi tutti', hu: 'Összes megtekintése' },
  search:       { da: 'Søg sagsnr., model, kunde…', en: 'Search claim #, model, customer…', de: 'Suchen…', it: 'Cerca…', hu: 'Keresés…' },
  filterAll:    { da: 'Alle', en: 'All', de: 'Alle', it: 'Tutti', hu: 'Mind' },

  colNumber:    { da: 'Sagsnr.', en: 'Claim #', de: 'Fall-Nr.', it: 'N. reclamo', hu: 'Ügyszám' },
  colModel:     { da: 'Model / Serienr.', en: 'Model / Serial', de: 'Modell / Serien-Nr.', it: 'Modello / Seriale', hu: 'Modell / Sorozatszám' },
  colCustomer:  { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  colDesc:      { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás' },
  colStatus:    { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Állapot' },
  colDate:      { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
  colActions:   { da: '', en: '', de: '', it: '', hu: '' },
};

const STATUS_LABEL: Record<ClaimStatus, Record<Language, string>> = {
  draft:     { da: 'Gemt', en: 'Draft', de: 'Entwurf', it: 'Bozza', hu: 'Vázlat' },
  pending_service_review: { da: 'Afventer servicegodkendelse', en: 'Awaiting service review', de: 'Wartet auf Service-Freigabe', it: 'In attesa di revisione assistenza', hu: 'Szerviz jóváhagyásra vár' },
  submitted: { da: 'Afventer accept', en: 'Awaiting acceptance', de: 'Wartet', it: 'In attesa', hu: 'Vár' },
  open:      { da: 'Åben', en: 'Open', de: 'Offen', it: 'Aperto', hu: 'Nyitott' },
  in_review: { da: 'Under behandling', en: 'In review', de: 'In Prüfung', it: 'In revisione', hu: 'Vizsgálat' },
  approved:  { da: 'Godkendt', en: 'Approved', de: 'Genehmigt', it: 'Approvato', hu: 'Jóváhagyva' },
  rejected:  { da: 'Afvist', en: 'Rejected', de: 'Abgelehnt', it: 'Respinto', hu: 'Elutasítva' },
  closed:    { da: 'Lukket', en: 'Closed', de: 'Geschlossen', it: 'Chiuso', hu: 'Lezárva' },
};
const STATUS_CLASS: Record<ClaimStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_service_review: 'bg-orange-100 text-orange-800',
  submitted: 'bg-indigo-100 text-indigo-800',
  open: 'bg-amber-100 text-amber-800',
  in_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-rose-100 text-rose-800',
  closed: 'bg-gray-100 text-gray-700',
};

const FILTER_STATUSES: (ClaimStatus | 'all')[] = ['all', 'draft', 'pending_service_review', 'submitted', 'open', 'in_review', 'approved', 'rejected', 'closed'];

type DealerSection = 'dashboard' | 'mine';

interface Props {
  lang: Language;
  /** Email of the current user — used to scope "my claims" */
  userEmail: string;
  canCreate: boolean;
  readOnly: boolean;
}

export default function ClaimsDealerView({ lang, userEmail, canCreate, readOnly }: Props) {
  const navigate = useNavigate();

  // Section state — persisted in URL hash so back/refresh works
  const [section, setSection] = useState<DealerSection>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    return window.location.hash === '#mine' ? 'mine' : 'dashboard';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (section === 'mine' && window.location.hash !== '#mine') window.history.replaceState(null, '', '#mine');
    if (section === 'dashboard' && window.location.hash === '#mine') window.history.replaceState(null, '', window.location.pathname);
  }, [section]);

  const [claims, setClaims] = useState<ServiceClaim[]>([]);
  const [source, setSource] = useState<'supabase' | 'mock' | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('all');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await loadClaims();
        if (!active) return;
        setClaims(res.claims);
        setSource(res.source);
      } catch {
        if (!active) return;
        setClaims([]); setSource('mock');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Scope to the current user's claims (own claims only)
  const myClaims = useMemo(() => {
    const email = userEmail.toLowerCase();
    return claims.filter(c => (c.created_by_email || '').toLowerCase() === email);
  }, [claims, userEmail]);

  const stats = useMemo(() => ({
    total: myClaims.length,
    open: myClaims.filter(c => c.status === 'open' || c.status === 'in_review' || c.status === 'submitted').length,
    approved: myClaims.filter(c => c.status === 'approved').length,
    rejected: myClaims.filter(c => c.status === 'rejected').length,
  }), [myClaims]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myClaims.filter(c => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      const blob = [c.claim_number, c.machine_model, c.machine_serial, c.customer_name, c.description]
        .filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [myClaims, query, filter]);

  const latest = useMemo(() => myClaims.slice(0, 5), [myClaims]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* ===== Sidebar ===== */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                <LifeBuoy className="h-4 w-4 text-rose-600" />
              </div>
              <div className="font-bold text-sm text-gray-900">{T.title[lang]}</div>
            </div>
            <nav className="p-2 space-y-1">
              <SideLink
                active={section === 'dashboard'}
                onClick={() => setSection('dashboard')}
                icon={<LayoutDashboard className="h-4 w-4" />}
                label={T.navDash[lang]}
              />
              <SideLink
                active={section === 'mine'}
                onClick={() => setSection('mine')}
                icon={<FileText className="h-4 w-4" />}
                label={T.navMine[lang]}
                count={myClaims.length}
              />
            </nav>
            {readOnly && (
              <div className="px-3 pb-3">
                <span className="block text-center text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full py-1">
                  {T.readOnly[lang]}
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* ===== Content ===== */}
        <section>
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {section === 'dashboard' ? T.navDash[lang] : T.navMine[lang]}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{T.intro[lang]}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                {T.badgeDealer[lang]}
              </span>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => navigate('/portal/service/claims/new')}
                  className="inline-flex items-center gap-2 bg-[#2d5a27] text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#244820] transition"
                >
                  <Plus className="h-4 w-4" />
                  {T.newClaim[lang]}
                </button>
              )}
            </div>
          </div>

          {source === 'mock' && (
            <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {T.mockNote[lang]}
            </div>
          )}

          {section === 'dashboard' ? (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Kpi icon={<Layers className="h-5 w-5" />} label={T.kpiMine[lang]} value={stats.total} accent="bg-[#2d5a27]/10 text-[#2d5a27]" />
                <Kpi icon={<Clock className="h-5 w-5" />} label={T.kpiOpen[lang]} value={stats.open} accent="bg-amber-100 text-amber-700" />
                <Kpi icon={<CheckCircle2 className="h-5 w-5" />} label={T.kpiApproved[lang]} value={stats.approved} accent="bg-green-100 text-green-700" />
                <Kpi icon={<XCircle className="h-5 w-5" />} label={T.kpiRejected[lang]} value={stats.rejected} accent="bg-rose-100 text-rose-700" />
              </div>

              {/* Latest claims */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{T.latest[lang]}</h2>
                  <button
                    onClick={() => setSection('mine')}
                    className="text-xs font-semibold text-[#2d5a27] hover:underline"
                  >
                    {T.viewAll[lang]} →
                  </button>
                </div>
                <DealerTable
                  lang={lang}
                  loading={loading}
                  rows={latest}
                  onOpen={(id) => navigate(`/portal/service/claims/${id}`)}
                  emptyText={T.empty[lang]}
                  loadingText={T.loading[lang]}
                />
              </div>
            </>
          ) : (
            <>
              {/* Filter bar */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mb-4">
                <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                  <div className="relative flex-1 max-w-xl">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={T.search[lang]}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:border-[#2d5a27] focus:outline-[#2d5a27] bg-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {FILTER_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${filter === s ? 'bg-[#2d5a27] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {s === 'all' ? T.filterAll[lang] : (STATUS_LABEL[s][lang] || STATUS_LABEL[s].en)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <DealerTable
                  lang={lang}
                  loading={loading}
                  rows={filtered}
                  onOpen={(id) => navigate(`/portal/service/claims/${id}`)}
                  emptyText={T.empty[lang]}
                  loadingText={T.loading[lang]}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SideLink({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
        active ? 'bg-[#2d5a27] text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span className={active ? 'text-white' : 'text-gray-500'}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {typeof count === 'number' && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>{count}</span>
      )}
    </button>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold text-gray-900 leading-tight">{value}</div>
      </div>
    </div>
  );
}

function DealerTable({
  lang, loading, rows, onOpen, emptyText, loadingText,
}: {
  lang: Language;
  loading: boolean;
  rows: ServiceClaim[];
  onOpen: (id: string) => void;
  emptyText: string;
  loadingText: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 text-left">{T.colNumber[lang]}</th>
            <th className="px-4 py-3 text-left">{T.colModel[lang]}</th>
            <th className="px-4 py-3 text-left">{T.colCustomer[lang]}</th>
            <th className="px-4 py-3 text-left">{T.colDesc[lang]}</th>
            <th className="px-4 py-3 text-left">{T.colStatus[lang]}</th>
            <th className="px-4 py-3 text-left">{T.colDate[lang]}</th>
            <th className="px-4 py-3 text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{loadingText}</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{emptyText}</td></tr>
          ) : rows.map(c => (
            <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(c.id)}>
              <td className="px-4 py-3 font-semibold text-[#2d5a27] hover:underline whitespace-nowrap">{c.claim_number}</td>
              <td className="px-4 py-3 text-gray-700">
                <div className="font-medium">{c.machine_model || '—'}</div>
                <div className="text-xs text-gray-500">{c.machine_serial || ''}</div>
              </td>
              <td className="px-4 py-3 text-gray-700">{c.customer_name || '—'}</td>
              <td className="px-4 py-3 text-gray-700 max-w-md truncate">{c.description}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CLASS[c.status]}`}>
                  {STATUS_LABEL[c.status][lang] || STATUS_LABEL[c.status].en}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                {new Date(c.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : lang)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}
                  className="inline-flex items-center gap-1 text-[#2d5a27] text-xs font-semibold hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" /> Åbn
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
