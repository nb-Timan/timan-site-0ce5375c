/**
 * Phase 33 — Lead link picker for the configurator.
 *
 * Lets the user attach an existing CRM lead to the quote being created.
 * Visibility:
 *   - Backend / view-as-all: every open lead.
 *   - Seller (or backend viewing as seller): only that seller's leads.
 *   - External dealer roles: hidden (lead concept is internal).
 *
 * Pure presentation — does not save the link itself; the parent page
 * passes the chosen leadId to saveConfiguration().
 */
import { useEffect, useMemo, useState } from 'react';
import { listLeads, type CrmLead, formatLeadNo } from '@/lib/crmLeadsService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import type { AppUser } from '@/data/appUsers';

interface Props {
  appUser: (AppUser & { email: string }) | null;
  /** Currently selected lead id (or null). */
  value: string | null;
  onChange: (leadId: string | null) => void;
  /** Optional — currently selected dealer account_number to prefer. */
  dealerNumber?: string | null;
  language?: 'da' | 'en' | 'de' | 'it' | 'hu';
}

const L = {
  label:    { da: 'Knyt til lead (CRM)', en: 'Link to CRM lead', de: 'Mit CRM-Lead verknüpfen', it: 'Collega a lead CRM', hu: 'CRM leadhez kapcsolás' },
  none:     { da: 'Ingen — gem uden lead', en: 'None — save without lead', de: 'Keiner — ohne Lead speichern', it: 'Nessuno — senza lead', hu: 'Egyik sem' },
  loading:  { da: 'Indlæser leads…', en: 'Loading leads…', de: 'Leads laden…', it: 'Caricamento…', hu: 'Betöltés…' },
  prefer:   { da: 'Foreslået for valgt forhandler', en: 'Suggested for selected dealer', de: 'Vorgeschlagen', it: 'Suggeriti', hu: 'Javasolt' },
  others:   { da: 'Andre åbne leads', en: 'Other open leads', de: 'Andere Leads', it: 'Altri lead', hu: 'Egyéb leadek' },
  hint:     { da: 'Når du sender tilbuddet, opdateres leadets stage til "Offer sent" og en aktivitet logges.',
              en: 'When the quote is sent the lead moves to "Offer sent" and an activity is logged.',
              de: 'Beim Senden wechselt der Lead zu "Offer sent".',
              it: 'All\'invio il lead passa a "Offer sent".',
              hu: 'Küldéskor a lead "Offer sent" állapotba kerül.' },
};

export default function LeadLinkPicker({ appUser, value, onChange, dealerNumber, language = 'da' }: Props) {
  const role = derivePortalRole(appUser);
  const isInternal = isCrmAdmin(role) || isScopedSeller(role);

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);

  useEffect(() => {
    if (!isInternal) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const sid = await resolveSellerId(appUser?.email);
      const all = await listLeads({});
      if (cancelled) return;
      setSellerId(sid);
      setLeads(all);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, isInternal]);

  const { suggested, others } = useMemo(() => {
    const open = leads.filter(l => !isLeadClosed(l));
    const myEmail = (appUser?.email || '').toLowerCase();
    let scoped = open;
    if (isCrmAdmin(role)) {
      // backend / view-as: keep all
    } else {
      scoped = open.filter(l =>
        (sellerId && l.owner_user_id === sellerId) ||
        (!!myEmail && (l.owner_email || '').toLowerCase() === myEmail),
      );
    }
    const dn = (dealerNumber || '').trim();
    const sug = dn ? scoped.filter(l => (l.linked_dealer_id || '') === dn) : [];
    const sugIds = new Set(sug.map(l => l.id));
    const oth = scoped.filter(l => !sugIds.has(l.id));
    return { suggested: sug, others: oth };
  }, [leads, role, sellerId, appUser?.email, dealerNumber]);

  if (!isInternal) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{L.label[language]}</label>
      <select
        className="w-full p-2 border rounded-lg bg-white"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={loading}
      >
        <option value="">{loading ? L.loading[language] : L.none[language]}</option>
        {suggested.length > 0 && (
          <optgroup label={L.prefer[language]}>
            {suggested.map(l => (
              <option key={l.id} value={l.id}>
                {formatLeadNo(l.lead_no)} — {l.title}{l.owner_name ? ` · ${l.owner_name}` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label={L.others[language]}>
            {others.map(l => (
              <option key={l.id} value={l.id}>
                {formatLeadNo(l.lead_no)} — {l.title}{l.owner_name ? ` · ${l.owner_name}` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="text-xs text-gray-500 mt-1">{L.hint[language]}</p>
    </div>
  );
}
