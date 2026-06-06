import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, AlertCircle, Search, Layers, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Language } from '@/types/configurator';
import { loadClaims, ServiceClaim, ClaimStatus } from '@/lib/claimsService';

const T: Record<string, Record<Language, string>> = {
  title:        { da: 'Service / Claims — Intern', en: 'Service / Claims — Internal', de: 'Service / Reklamationen — Intern', it: 'Assistenza / Reclami — Interno', hu: 'Szerviz / Reklamációk — Belső' },
  intro:        { da: 'Intern oversigt over alle aktive sager på tværs af forhandlere.', en: 'Internal overview of all active claims across dealers.', de: 'Interne Übersicht aller aktiven Fälle.', it: 'Panoramica interna di tutti i reclami.', hu: 'Belső áttekintés az összes ügyről.' },
  search:       { da: 'Søg sagsnr., dealer, model, kunde…', en: 'Search claim #, dealer, model, customer…', de: 'Suchen…', it: 'Cerca…', hu: 'Keresés…' },
  empty:        { da: 'Ingen sager fundet.', en: 'No claims found.', de: 'Keine Fälle gefunden.', it: 'Nessun reclamo.', hu: 'Nincs találat.' },
  loading:      { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
  mockNote:     { da: 'Viser eksempeldata (backend-tabel ikke tilgængelig).', en: 'Showing sample data (backend unavailable).', de: 'Beispieldaten.', it: 'Dati di esempio.', hu: 'Mintaadatok.' },

  kpiTotal:     { da: 'Sager i alt', en: 'Total claims', de: 'Fälle gesamt', it: 'Totale reclami', hu: 'Összes ügy' },
  kpiOpen:      { da: 'Åbne / under behandling', en: 'Open / in review', de: 'Offen / in Prüfung', it: 'Aperti / in revisione', hu: 'Nyitott / vizsgálat' },
  kpiApproved:  { da: 'Godkendte', en: 'Approved', de: 'Genehmigt', it: 'Approvati', hu: 'Jóváhagyva' },
  kpiRejected:  { da: 'Afviste', en: 'Rejected', de: 'Abgelehnt', it: 'Respinti', hu: 'Elutasítva' },

  colNumber:    { da: 'Sagsnr.', en: 'Claim #', de: 'Fall-Nr.', it: 'N. reclamo', hu: 'Ügyszám' },
  colDealer:    { da: 'Forhandler / Firma', en: 'Dealer / Company', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  colModel:     { da: 'Model / Serienr.', en: 'Model / Serial', de: 'Modell / Serien-Nr.', it: 'Modello / Seriale', hu: 'Modell / Sorozatszám' },
  colCustomer:  { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  colDesc:      { da: 'Beskrivelse', en: 'Description', de: 'Beschreibung', it: 'Descrizione', hu: 'Leírás' },
  colStatus:    { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Állapot' },
  colDate:      { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },

  filterAll:    { da: 'Alle', en: 'All', de: 'Alle', it: 'Tutti', hu: 'Mind' },
  badgeInternal:{ da: 'Intern visning', en: 'Internal view', de: 'Interne Ansicht', it: 'Vista interna', hu: 'Belső nézet' },
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
  draft:     'bg-gray-100 text-gray-700',
  pending_service_review: 'bg-orange-100 text-orange-800',
  submitted: 'bg-indigo-100 text-indigo-800',
  open:      'bg-amber-100 text-amber-800',
  in_review: 'bg-blue-100 text-blue-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-rose-100 text-rose-800',
  closed:    'bg-gray-100 text-gray-700',
};

const FILTER_STATUSES: (ClaimStatus | 'all')[] = ['all', 'pending_service_review', 'submitted', 'open', 'in_review', 'approved', 'rejected', 'closed'];

interface Props { lang: Language }

export default function ClaimsInternalView({ lang }: Props) {
  const navigate = useNavigate();
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
        setClaims([]);
        setSource('mock');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const total = claims.length;
    const open = claims.filter(c => c.status === 'open' || c.status === 'in_review' || c.status === 'submitted').length;
    const approved = claims.filter(c => c.status === 'approved').length;
    const rejected = claims.filter(c => c.status === 'rejected').length;
    return { total, open, approved, rejected };
  }, [claims]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter(c => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      const blob = [c.claim_number, c.dealer_company, c.machine_model, c.machine_serial, c.customer_name, c.description]
        .filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [claims, query, filter]);

  return (
    <>
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
              <LifeBuoy className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{T.title[lang]}</h1>
              <p className="text-gray-500 mt-1 text-sm">{T.intro[lang]}</p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#2d5a27]/10 text-[#2d5a27]">
            {T.badgeInternal[lang]}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi icon={<Layers className="h-5 w-5" />} label={T.kpiTotal[lang]} value={stats.total} accent="bg-[#2d5a27]/10 text-[#2d5a27]" />
          <Kpi icon={<Clock className="h-5 w-5" />} label={T.kpiOpen[lang]} value={stats.open} accent="bg-amber-100 text-amber-700" />
          <Kpi icon={<CheckCircle2 className="h-5 w-5" />} label={T.kpiApproved[lang]} value={stats.approved} accent="bg-green-100 text-green-700" />
          <Kpi icon={<XCircle className="h-5 w-5" />} label={T.kpiRejected[lang]} value={stats.rejected} accent="bg-rose-100 text-rose-700" />
        </div>

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

        {source === 'mock' && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {T.mockNote[lang]}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">{T.colNumber[lang]}</th>
                  <th className="px-4 py-3 text-left">{T.colDealer[lang]}</th>
                  <th className="px-4 py-3 text-left">{T.colModel[lang]}</th>
                  <th className="px-4 py-3 text-left">{T.colCustomer[lang]}</th>
                  <th className="px-4 py-3 text-left">{T.colDesc[lang]}</th>
                  <th className="px-4 py-3 text-left">{T.colStatus[lang]}</th>
                  <th className="px-4 py-3 text-left">{T.colDate[lang]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{T.loading[lang]}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{T.empty[lang]}</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/portal/service/claims/${c.id}`)}>
                    <td className="px-4 py-3 font-semibold text-[#2d5a27] hover:underline whitespace-nowrap">{c.claim_number}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="font-medium">{c.dealer_company || '—'}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">{c.created_by_email || ''}</div>
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
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
