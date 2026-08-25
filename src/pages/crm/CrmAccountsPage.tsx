import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { listCrmAccounts, CrmAccount, accountDisplayName } from '@/lib/crmAccountsService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { isCrmAdmin } from '@/lib/crmScope';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  search:    { da: 'Søg konto, email eller forhandlernr.', en: 'Search company, email or dealer no.', de: 'Suche…', it: 'Cerca…', hu: 'Keresés…' },
  filter_owner: { da: 'Sælger', en: 'Seller', de: 'Verkäufer', it: 'Venditore', hu: 'Értékesítő' },
  all_owners: { da: 'Alle sælgere', en: 'All sellers', de: 'Alle', it: 'Tutti', hu: 'Mind' },
  empty:     { da: 'Ingen konti fundet.', en: 'No accounts found.', de: 'Keine Konten.', it: 'Nessun account.', hu: 'Nincs fiók.' },
  th_company:{ da: 'Firma', en: 'Company', de: 'Firma', it: 'Azienda', hu: 'Cég' },
  th_role:   { da: 'Rolle', en: 'Role', de: 'Rolle', it: 'Ruolo', hu: 'Szerepkör' },
  th_country:{ da: 'Land', en: 'Country', de: 'Land', it: 'Paese', hu: 'Ország' },
  th_owner:  { da: 'Sælger', en: 'Owner', de: 'Verkäufer', it: 'Proprietario', hu: 'Tulaj' },
  th_email:  { da: 'Email', en: 'Email', de: 'E-Mail', it: 'Email', hu: 'Email' },
  source_fallback: { da: 'Lokalt preview (Supabase utilgængelig).', en: 'Local preview (Supabase unavailable).', de: 'Lokale Vorschau.', it: 'Anteprima locale.', hu: 'Helyi előnézet.' },
};

const ROLE_LABEL: Record<string, string> = {
  timan_dealer: 'Timan Forhandler',
  timan_importer: 'Timan Importør',
  timan_service_partner: 'Timan Service Partner',
  dealer_user: 'Forhandlerbruger',
  private_end_user: 'Privat / Slutbruger',
};

export default function CrmAccountsPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);

  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const r = await listCrmAccounts({ role: portalRole, sellerId });
      if (cancelled) return;
      setAccounts(r.accounts);
      setErrorMsg(r.source === 'fallback' ? T.source_fallback[lang] : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, portalRole, lang]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach(a => {
      if (a.account_owner_user_id) map.set(a.account_owner_user_id, a.account_owner_name || a.account_owner_initials || a.account_owner_email || a.account_owner_user_id);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [accounts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter(a => {
      if (ownerFilter && a.account_owner_user_id !== ownerFilter) return false;
      if (!needle) return true;
      return [a.company, a.full_name, a.email, a.dealer_number]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(needle));
    });
  }, [accounts, q, ownerFilter]);

  return (
    <CrmLayout pageTitle="Accounts">
      {errorMsg && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded mb-3">{errorMsg}</p>}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={T.search[lang]}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/40" />
        {isAdmin && (
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">{T.all_owners[lang]}</option>
            {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{T.empty[lang]}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">{T.th_company[lang]}</th>
                <th className="text-left px-4 py-3">{T.th_role[lang]}</th>
                <th className="text-left px-4 py-3">{T.th_country[lang]}</th>
                <th className="text-left px-4 py-3">{T.th_owner[lang]}</th>
                <th className="text-left px-4 py-3">{T.th_email[lang]}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}
                    onClick={() => navigate(`/portal/crm/accounts/${a.id}`)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{accountDisplayName(a)}</div>
                    {a.full_name && a.company && <div className="text-xs text-gray-500">{a.full_name}</div>}
                    {a.dealer_number && <div className="text-xs text-gray-400">#{a.dealer_number}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{ROLE_LABEL[a.portal_role || ''] || a.portal_role || a.partner_type || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{a.country || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {a.account_owner_name ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-[#2d5a27]/10 text-[#2d5a27] text-xs font-semibold flex items-center justify-center">{a.account_owner_initials || '–'}</span>
                        {a.account_owner_name}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CrmLayout>
  );
}
