/**
 * Timan Backend → Partner relationer.
 * Route: /portal/backend/partner-relations
 *
 * Manages two hierarchies used by Machine Journal access control:
 *
 *   1. Importer → child dealer (via dealer_accounts.parent_account_number).
 *   2. Service partner → dealer (via service_partner_dealer_links).
 *
 * Access is gated client-side AND server-side: only Timan Backend /
 * Service can mutate, enforced by RLS (is_timan_staff()).
 *
 * Intentionally simple: two dropdowns + active toggle + save button +
 * a list of existing links per section.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { isBackendActor } from "@/lib/portalAccess";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useLanguage } from "@/context/LanguageContext";
import {
  DealerAccount,
  fetchDealerAccounts,
} from "@/lib/dealerAccountsService";
import {
  ServicePartnerLink,
  listServicePartnerLinks,
  upsertServicePartnerLink,
  setServicePartnerLinkActive,
  deleteServicePartnerLink,
  setImporterParent,
} from "@/lib/partnerRelationsService";

export default function BackendPartnerRelationsPage() {
  const { appUser, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = isBackendActor(appUser);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [spLinks, setSpLinks] = useState<ServicePartnerLink[]>([]);
  const [loading, setLoading] = useState(true);

  // Importer form
  const [impParent, setImpParent] = useState<string>("");
  const [impChild, setImpChild] = useState<string>("");
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg] = useState<string | null>(null);

  // Service-partner form
  const [spPartnerId, setSpPartnerId] = useState<string>("");
  const [spDealerId, setSpDealerId] = useState<string>("");
  const [spActive, setSpActive] = useState(true);
  const [spBusy, setSpBusy] = useState(false);
  const [spMsg, setSpMsg] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [d, l] = await Promise.all([
      fetchDealerAccounts({ includeDeleted: false }),
      listServicePartnerLinks(),
    ]);
    setDealers(d.rows);
    setSpLinks(l);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  // Filter on a normalised concat of all type/role fields. We accept many
  // historical spellings (DK + EN, with/without space, with/without timan_ prefix).
  const norm = (d: DealerAccount) =>
    [d.customer_type, d.customer_type_label, d.dealer_type]
      .filter(Boolean)
      .join("|")
      .toLowerCase()
      .replace(/\s+/g, "");
  const isImporter = (d: DealerAccount) => {
    const s = norm(d);
    return s.includes("import"); // matches importer, importør, timan_importer
  };
  const isServicePartner = (d: DealerAccount) => {
    const s = norm(d);
    return (
      s.includes("servicepartner") || // service partner, servicepartner, Service partner
      s.includes("service_partner") ||
      s.includes("timan_service_partner")
    );
  };
  const isDealer = (d: DealerAccount) => {
    const s = norm(d);
    return (
      s.includes("forhandler") ||
      s.includes("dealer") ||
      s.includes("timan_dealer") ||
      s.includes("dealer_user")
    );
  };
  const importers = useMemo(() => dealers.filter(isImporter), [dealers]);
  const servicePartners = useMemo(() => dealers.filter(isServicePartner), [dealers]);
  const dealerOptions = useMemo(
    () => dealers.filter((d) => isDealer(d) || isServicePartner(d)),
    [dealers],
  );
  const dealersById = useMemo(() => {
    const m = new Map<string, DealerAccount>();
    for (const d of dealers) m.set(d.id, d);
    return m;
  }, [dealers]);
  const childDealersByImporter = useMemo(() => {
    const m = new Map<string, DealerAccount[]>();
    for (const d of dealers) {
      if (!d.parent_account_number) continue;
      const arr = m.get(d.parent_account_number) ?? [];
      arr.push(d);
      m.set(d.parent_account_number, arr);
    }
    return m;
  }, [dealers]);

  if (!appUser) return <Navigate to="/" replace />;
  if (!isBackend) return <Navigate to="/portal" replace />;

  async function onSaveImporter() {
    if (!impParent || !impChild) { setImpMsg("Vælg importør og forhandler"); return; }
    if (impParent === impChild) { setImpMsg("Importør og forhandler kan ikke være samme konto"); return; }
    setImpBusy(true); setImpMsg(null);
    const importerAcc = dealersById.get(impParent)?.account_number;
    const childAcc = dealersById.get(impChild)?.account_number;
    if (!importerAcc || !childAcc) { setImpMsg("Kunne ikke finde kontonumre"); setImpBusy(false); return; }
    const r = await setImporterParent(childAcc, importerAcc);
    setImpBusy(false);
    if (!r.ok) { setImpMsg(r.error ?? "Fejl ved gem"); return; }
    setImpMsg("Gemt");
    setImpChild("");
    await refresh();
  }

  async function onDetachChild(childAccountNumber: string) {
    if (!confirm("Fjern denne forhandler fra importøren?")) return;
    const r = await setImporterParent(childAccountNumber, null);
    if (!r.ok) { alert(r.error ?? "Fejl"); return; }
    await refresh();
  }

  async function onSaveServicePartner() {
    if (!spPartnerId || !spDealerId) { setSpMsg("Vælg service partner og forhandler"); return; }
    setSpBusy(true); setSpMsg(null);
    const r = await upsertServicePartnerLink(spPartnerId, spDealerId, spActive);
    setSpBusy(false);
    if (!r.ok) { setSpMsg(r.error ?? "Fejl ved gem"); return; }
    setSpMsg("Gemt");
    setSpDealerId("");
    await refresh();
  }

  async function onToggleSpLink(id: string, next: boolean) {
    const r = await setServicePartnerLinkActive(id, next);
    if (!r.ok) { alert(r.error ?? "Fejl"); return; }
    await refresh();
  }

  async function onDeleteSpLink(id: string) {
    if (!confirm("Slet denne service-partner relation?")) return;
    const r = await deleteServicePartnerLink(id);
    if (!r.ok) { alert(r.error ?? "Fejl"); return; }
    await refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader user={appUser} language={language} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-900">Partner relationer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Definér importør → forhandler-hierarkiet og service-partner → forhandler-relationer,
          som styrer adgang i "Søg på maskine" og Min Maskine.
        </p>

        {loading && <div className="mt-6 text-sm text-slate-500">Indlæser…</div>}

        {/* ---------- IMPORTER ---------- */}
        <section className="mt-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Importør → forhandler</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bruger eksisterende felt <code>parent_account_number</code> på dealer_accounts.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
            <label className="block text-sm">
              <span className="text-slate-700">Importør</span>
              <select className="mt-1 w-full rounded border-slate-300" value={impParent} onChange={(e) => setImpParent(e.target.value)}>
                <option value="">— vælg —</option>
                {importers.map((d) => (
                  <option key={d.id} value={d.id}>{d.account_number} · {d.company_name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Forhandler (barn)</span>
              <select className="mt-1 w-full rounded border-slate-300" value={impChild} onChange={(e) => setImpChild(e.target.value)}>
                <option value="">— vælg —</option>
                {dealerOptions.filter((d) => d.id !== impParent).map((d) => (
                  <option key={d.id} value={d.id}>{d.account_number} · {d.company_name}</option>
                ))}
              </select>
              {!loading && importers.length === 0 && (
                <span className="mt-1 block text-xs text-amber-700">Ingen importører fundet. Tjek forhandlertype på dealer_accounts.</span>
              )}
            </label>
            <button
              type="button"
              onClick={onSaveImporter}
              disabled={impBusy}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >{impBusy ? "Gemmer…" : "Gem"}</button>
          </div>
          {impMsg && <div className="mt-2 text-sm text-slate-700">{impMsg}</div>}

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700">Eksisterende relationer</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Importør</th><th>Forhandler</th><th></th></tr>
              </thead>
              <tbody>
                {importers.flatMap((imp) => {
                  const kids = childDealersByImporter.get(imp.account_number) ?? [];
                  if (kids.length === 0) return [];
                  return kids.map((k) => (
                    <tr key={`${imp.id}-${k.id}`} className="border-t">
                      <td className="py-2">{imp.account_number} · {imp.company_name}</td>
                      <td>{k.account_number} · {k.company_name}</td>
                      <td className="text-right">
                        <button onClick={() => onDetachChild(k.account_number)} className="text-rose-600 hover:underline">Fjern</button>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- SERVICE PARTNER ---------- */}
        <section className="mt-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Service partner → forhandler</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bruger tabellen <code>service_partner_dealer_links</code>.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] items-end">
            <label className="block text-sm">
              <span className="text-slate-700">Service partner</span>
              <select className="mt-1 w-full rounded border-slate-300" value={spPartnerId} onChange={(e) => setSpPartnerId(e.target.value)}>
                <option value="">— vælg —</option>
                {servicePartners.map((d) => (
                  <option key={d.id} value={d.id}>{d.account_number} · {d.company_name}</option>
                ))}
              </select>
              {!loading && servicePartners.length === 0 && (
                <span className="mt-1 block text-xs text-amber-700">Ingen servicepartnere fundet. Tjek forhandlertype på dealer_accounts.</span>
              )}
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Forhandler</span>
              <select className="mt-1 w-full rounded border-slate-300" value={spDealerId} onChange={(e) => setSpDealerId(e.target.value)}>
                <option value="">— vælg —</option>
                {dealerOptions.filter((d) => d.id !== spPartnerId).map((d) => (
                  <option key={d.id} value={d.id}>{d.account_number} · {d.company_name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={spActive} onChange={(e) => setSpActive(e.target.checked)} />
              <span>Aktiv</span>
            </label>
            <button
              type="button"
              onClick={onSaveServicePartner}
              disabled={spBusy}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >{spBusy ? "Gemmer…" : "Gem"}</button>
          </div>
          {spMsg && <div className="mt-2 text-sm text-slate-700">{spMsg}</div>}

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700">Eksisterende relationer</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Service partner</th><th>Forhandler</th><th>Aktiv</th><th></th></tr>
              </thead>
              <tbody>
                {spLinks.map((l) => {
                  const sp = dealersById.get(l.service_partner_account_id);
                  const dl = dealersById.get(l.dealer_account_id);
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="py-2">{sp ? `${sp.account_number} · ${sp.company_name}` : l.service_partner_account_id}</td>
                      <td>{dl ? `${dl.account_number} · ${dl.company_name}` : l.dealer_account_id}</td>
                      <td>
                        <input type="checkbox" checked={l.active} onChange={(e) => onToggleSpLink(l.id, e.target.checked)} />
                      </td>
                      <td className="text-right">
                        <button onClick={() => onDeleteSpLink(l.id)} className="text-rose-600 hover:underline">Slet</button>
                      </td>
                    </tr>
                  );
                })}
                {spLinks.length === 0 && (
                  <tr><td colSpan={4} className="py-3 text-slate-500">Ingen relationer endnu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <PortalFooter language={language} />
    </div>
  );
}
