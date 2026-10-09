/**
 * Phase 33 — Lead link picker for the configurator.
 *
 * Lets the user attach an existing CRM lead to the quote being created.
 * Visibility:
 *   - Internal roles: open leads for the selected seller AND dealer.
 *   - Seller / view-as: the existing seller scope still applies.
 *   - External dealer roles: hidden (lead concept is internal).
 *
 * Pure presentation — does not save the link itself; the parent page
 * passes the chosen leadId to saveConfiguration().
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { getLead, listLeads, type CrmLead, formatLeadNo } from '@/lib/crmLeadsService';
import { isOpenLead } from '@/lib/leadStatus';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import type { AppUser } from '@/data/appUsers';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';

interface Props {
  appUser: (AppUser & { email: string }) | null;
  /** Currently selected lead id (or null). */
  value: string | null;
  onChange: (leadId: string | null) => void;
  sellerEmail?: string | null;
  /** Canonical dealer_accounts UUID, not the display account number. */
  dealerAccountId?: string | null;
  language?: 'da' | 'en' | 'de' | 'it' | 'hu';
  /** Saved configurations keep their current relation; the picker becomes read-only. */
  readOnly?: boolean;
}

const L = {
  label:    { da: 'Knyt til lead (CRM)', en: 'Link to CRM lead', de: 'Mit CRM-Lead verknüpfen', it: 'Collega a lead CRM', hu: 'CRM leadhez kapcsolás' },
  none:     { da: 'Gem uden lead', en: 'Save without lead', de: 'Ohne Lead speichern', it: 'Salva senza lead', hu: 'Mentés lead nélkül' },
  createNew:{ da: 'Opret nyt lead', en: 'Create new lead', de: 'Neuen Lead erstellen', it: 'Crea nuovo lead', hu: 'Új lead létrehozása' },
  loading:  { da: 'Indlæser leads…', en: 'Loading leads…', de: 'Leads laden…', it: 'Caricamento…', hu: 'Betöltés…' },
  matching: { da: 'Matchende åbne leads', en: 'Matching open leads', de: 'Passende offene Leads', it: 'Lead aperti corrispondenti', hu: 'Egyező nyitott leadek' },
  noMatch:  { da: 'Ingen åbne leads matcher valgt sælger og forhandler.', en: 'No open leads match the selected seller and dealer.', de: 'Keine offenen Leads passen zum gewählten Verkäufer und Händler.', it: 'Nessun lead aperto corrisponde al venditore e rivenditore selezionati.', hu: 'Nincs a kiválasztott értékesítőhöz és kereskedőhöz tartozó nyitott lead.' },
  error:    { da: 'Leads kunne ikke indlæses.', en: 'Unable to load leads.', de: 'Leads konnten nicht geladen werden.', it: 'Impossibile caricare i lead.', hu: 'A leadek betöltése sikertelen.' },
  linked:   { da: 'Knyttet til', en: 'Linked to', de: 'Verknüpft mit', it: 'Collegato a', hu: 'Kapcsolva ehhez' },
  noLinked: { da: 'Ingen lead-knytning', en: 'No linked lead', de: 'Keine Lead-Verknüpfung', it: 'Nessun lead collegato', hu: 'Nincs kapcsolt lead' },
};

export default function LeadLinkPicker({ appUser, value, onChange, sellerEmail, dealerAccountId, language = 'da', readOnly = false }: Props) {
  const role = derivePortalRole(appUser);
  const isInternal = isCrmAdmin(role) || isScopedSeller(role);

  const inputId = useId();
  const scopeKey = JSON.stringify([role, appUser?.email, sellerEmail, dealerAccountId]);
  const [result, setResult] = useState<{ key: string; sellerId: string | null; leads: CrmLead[]; failed: boolean } | null>(null);
  const hasScope = Boolean(sellerEmail && dealerAccountId);
  const loading = !readOnly && hasScope && result?.key !== scopeKey;
  const [linkedLead, setLinkedLead] = useState<CrmLead | null>(null);

  useEffect(() => {
    if (!isInternal || !readOnly || !value) {
      setLinkedLead(null);
      return;
    }
    let cancelled = false;
    void (academyCrmSandbox.isActive() ? Promise.resolve(academyCrmSandbox.getCrmLead(value)) : getLead(value)).then((lead) => {
      if (!cancelled) setLinkedLead(lead);
    }).catch(() => { if (!cancelled) setLinkedLead(null); });
    return () => { cancelled = true; };
  }, [isInternal, readOnly, value]);

  useEffect(() => {
    if (!isInternal || readOnly || !sellerEmail || !dealerAccountId) return;
    let cancelled = false;
    void (async () => {
      const academy = academyCrmSandbox.isActive();
      const sid = academy ? academyCrmSandbox.getAcademyActor().id : await resolveSellerId(sellerEmail);
      const actorId = isScopedSeller(role) && !academy ? await resolveSellerId(appUser?.email) : sid;
      const allowed = Boolean(sid && (!isScopedSeller(role) || sid === actorId));
      const leads = !allowed ? [] : academy
        ? academyCrmSandbox.getState().leads.map((row) => academyCrmSandbox.getCrmLead(row.id)!)
        : await listLeads({ payload: 'summary', ownerUserId: sid, linkedDealerIds: [dealerAccountId] });
      if (!cancelled) setResult({ key: scopeKey, sellerId: sid, leads, failed: false });
    })().catch(() => {
      if (!cancelled) setResult({ key: scopeKey, sellerId: null, leads: [], failed: true });
    });
    return () => { cancelled = true; };
  }, [appUser?.email, isInternal, readOnly, role, sellerEmail, dealerAccountId, scopeKey]);

  const matching = useMemo(() => {
    // Key the response to its ownership context so stale requests cannot expose old candidates.
    if (!hasScope || result?.key !== scopeKey || !result.sellerId) return [];
    return result.leads.filter(lead =>
      lead.owner_user_id === result.sellerId && lead.linked_dealer_id === dealerAccountId &&
      isOpenLead(lead) && !['closed', 'archived', 'deleted'].includes(lead.status?.trim().toLowerCase() ?? ''),
    );
  }, [hasScope, result, scopeKey, dealerAccountId]);

  useEffect(() => {
    if (!isInternal || readOnly || !value || value === '__new__' || loading || result?.failed) return;
    if (!matching.some(lead => lead.id === value)) onChange(null);
  }, [isInternal, readOnly, value, loading, result?.failed, matching, onChange]);

  if (!isInternal) return null;

  if (readOnly) {
    const leadLabel = value
      ? linkedLead
        ? `${formatLeadNo(linkedLead.lead_no)} · ${linkedLead.title}`
        : loading ? L.loading[language] : value
      : L.noLinked[language];
    return (
      <div>
        <span className="block text-sm font-medium text-gray-700 mb-1">{L.label[language]}</span>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
          {value ? `${L.linked[language]} ${leadLabel}` : leadLabel}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">{L.label[language]}</label>
      <select
        id={inputId}
        className="w-full min-w-0 max-w-full p-2 border rounded-lg bg-white"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">{L.none[language]}</option>
        <option value="__new__">+ {L.createNew[language]}</option>
        {matching.length > 0 && (
          <optgroup label={L.matching[language]}>
            {matching.map(l => (
              <option key={l.id} value={l.id}>
                {formatLeadNo(l.lead_no)} — {l.title}{l.owner_name ? ` · ${l.owner_name}` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {(loading || matching.length === 0) && (
        <p className="text-xs text-gray-500 mt-1" role="status">
          {loading ? L.loading[language] : result?.key === scopeKey && result.failed ? L.error[language] : L.noMatch[language]}
        </p>
      )}
    </div>
  );
}
