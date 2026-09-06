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
import { getLead, listLeads, type CrmLead, formatLeadNo } from '@/lib/crmLeadsService';
import { isLeadClosed } from '@/lib/leadStatus';
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
  /** Saved configurations keep their current relation; the picker becomes read-only. */
  readOnly?: boolean;
}

const L = {
  label:    { da: 'Knyt til lead (CRM)', en: 'Link to CRM lead', de: 'Mit CRM-Lead verknüpfen', it: 'Collega a lead CRM', hu: 'CRM leadhez kapcsolás' },
  none:     { da: 'Gem uden lead', en: 'Save without lead', de: 'Ohne Lead speichern', it: 'Salva senza lead', hu: 'Mentés lead nélkül' },
  createNew:{ da: 'Opret nyt lead', en: 'Create new lead', de: 'Neuen Lead erstellen', it: 'Crea nuovo lead', hu: 'Új lead létrehozása' },
  loading:  { da: 'Indlæser leads…', en: 'Loading leads…', de: 'Leads laden…', it: 'Caricamento…', hu: 'Betöltés…' },
  prefer:   { da: 'Foreslået for valgt forhandler', en: 'Suggested for selected dealer', de: 'Vorgeschlagen', it: 'Suggeriti', hu: 'Javasolt' },
  others:   { da: 'Andre åbne leads', en: 'Other open leads', de: 'Andere Leads', it: 'Altri lead', hu: 'Egyéb leadek' },
  hint:     { da: 'Vælg "Opret nyt lead" for at oprette et CRM-lead automatisk når du gemmer eller sender tilbuddet. Eksisterende leads opdateres til "Offer sent" ved afsendelse.',
              en: 'Pick "Create new lead" to auto-create a CRM lead when you save or send the quote. Existing leads move to "Offer sent" on send.',
              de: 'Mit "Neuen Lead erstellen" wird beim Speichern/Senden automatisch ein CRM-Lead angelegt. Bestehende Leads wechseln beim Senden zu "Offer sent".',
              it: 'Scegli "Crea nuovo lead" per creare automaticamente un lead CRM al salvataggio o invio. I lead esistenti passano a "Offer sent".',
              hu: 'Válaszd az "Új lead létrehozása" lehetőséget az automatikus CRM lead létrehozásához mentéskor/küldéskor.' },
  linked:   { da: 'Knyttet til', en: 'Linked to', de: 'Verknüpft mit', it: 'Collegato a', hu: 'Kapcsolva ehhez' },
  noLinked: { da: 'Ingen lead-knytning', en: 'No linked lead', de: 'Keine Lead-Verknüpfung', it: 'Nessun lead collegato', hu: 'Nincs kapcsolt lead' },
};

export default function LeadLinkPicker({ appUser, value, onChange, dealerNumber, language = 'da', readOnly = false }: Props) {
  const role = derivePortalRole(appUser);
  const isInternal = isCrmAdmin(role) || isScopedSeller(role);

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [linkedLead, setLinkedLead] = useState<CrmLead | null>(null);

  useEffect(() => {
    if (!readOnly || !value) {
      setLinkedLead(null);
      return;
    }
    let cancelled = false;
    void getLead(value).then((lead) => {
      if (!cancelled) setLinkedLead(lead);
    });
    return () => { cancelled = true; };
  }, [readOnly, value]);

  useEffect(() => {
    if (!isInternal) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const sid = await resolveSellerId(appUser?.email);
      const all = await listLeads({ payload: "summary" });
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{L.label[language]}</label>
      <select
        className="w-full p-2 border rounded-lg bg-white"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={loading}
      >
        <option value="">{loading ? L.loading[language] : L.none[language]}</option>
        <option value="__new__">+ {L.createNew[language]}</option>
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
