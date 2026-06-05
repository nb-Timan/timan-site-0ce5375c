/**
 * Shared registrations table — reads from public.warranty_registrations.
 * Used by:
 *  - Dealer (scope="dealer"):  /portal/service/warranty/registrations
 *  - Timan Admin (scope="admin"): /portal/service/warranty/registrations
 *
 * Behaviour controlled by the `scope` prop.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  Loader2,
  PlusCircle,
  Search,
} from "lucide-react";
import {
  MACHINE_TYPES,
  type WarrantyRegistration,
} from "@/lib/warranty-store";
import {
  useWarrantyRegistrationsDb,
  type DbWarrantyRegistration,
} from "@/lib/warrantyRegistrationsService";
import { useAppUser } from "@/context/AppUserContext";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useRegistrationHistory } from "@/lib/warrantyHistoryService";


export type WarrantyScope = "admin" | "dealer";

interface Props {
  scope: WarrantyScope;
  dealerName?: string;
  showCertificateActions?: boolean;
}

export function WarrantyRegistrationsHeader({
  scope,
  title,
  subtitle,
  showCreate = false,
}: {
  scope: WarrantyScope;
  title: string;
  subtitle?: string;
  showCreate?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {scope === "dealer" && showCreate && (
        <Link
          to="/portal/service/warranty/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <PlusCircle className="h-4 w-4" /> Ny registrering
        </Link>
      )}
    </div>
  );
}

type SortKey =
  | "certificate"
  | "dealer"
  | "customer"
  | "machineType"
  | "serial"
  | "deliveryDate"
  | "createdDate"
  | "status"
  | "matchStatus";
type SortDir = "asc" | "desc";

function spIdNumeric(v: string | null): number {
  if (!v) return -Infinity;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : -Infinity;
}

function dateNum(v?: string | null): number {
  if (!v) return -Infinity;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : -Infinity;
}

function cmp(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "da", { sensitivity: "base" });
}

export function WarrantyRegistrationsTable({
  scope,
  dealerName,
  showCertificateActions = false,
}: Props) {
  const { appUser } = useAppUser();
  const role = appUser?.portal_role ?? null;
  const showMatchStatus = role === "timan_backend" || role === "timan_service";
  const { records: all, loading, error } = useWarrantyRegistrationsDb();

  const [q, setQ] = useState("");
  const [machine, setMachine] = useState("");
  const [dealer, setDealer] = useState("");
  const [language, setLanguage] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [matchFilter, setMatchFilter] = useState("");
  const [deliveryFrom, setDeliveryFrom] = useState("");
  const [deliveryTo, setDeliveryTo] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("certificate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selected, setSelected] = useState<DbWarrantyRegistration | null>(null);

  const scoped = useMemo(() => {
    if (scope === "admin") return all;
    if (!dealerName) return [];
    const needle = dealerName.toLowerCase();
    return all.filter((r) => r.dealerName.toLowerCase() === needle);
  }, [all, scope, dealerName]);

  const dealers = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach((r) => set.add(r.dealerName));
    return Array.from(set).sort();
  }, [scoped]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach((r) => r.language && set.add(r.language));
    return Array.from(set).sort();
  }, [scoped]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const dFrom = deliveryFrom ? new Date(deliveryFrom).getTime() : null;
    const dTo = deliveryTo ? new Date(deliveryTo).getTime() + 86_400_000 - 1 : null;
    const cFrom = createdFrom ? new Date(createdFrom).getTime() : null;
    const cTo = createdTo ? new Date(createdTo).getTime() + 86_400_000 - 1 : null;
    return scoped.filter((r) => {
      if (machine && r.machineType !== machine) return false;
      if (scope === "admin" && dealer && r.dealerName !== dealer) return false;
      if (language && r.language !== language) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (matchFilter && r.dealerMatchStatus !== matchFilter) return false;
      const dd = dateNum(r.deliveryDate);
      if (dFrom !== null && dd < dFrom) return false;
      if (dTo !== null && dd > dTo) return false;
      const cd = dateNum(
        r.registrationDate ?? r.sharepointModifiedAt ?? r.createdAt,
      );
      if (cFrom !== null && cd < cFrom) return false;
      if (cTo !== null && cd > cTo) return false;
      if (!ql) return true;
      return (
        r.customer.toLowerCase().includes(ql) ||
        r.dealerName.toLowerCase().includes(ql) ||
        (r.dealerAccountNumber ?? "").toLowerCase().includes(ql) ||
        r.machineType.toLowerCase().includes(ql) ||
        r.machineSerial.toLowerCase().includes(ql) ||
        r.confirmationEmail.toLowerCase().includes(ql) ||
        r.certificateNumber.toLowerCase().includes(ql) ||
        (r.sharepointItemId ?? "").toLowerCase().includes(ql)
      );
    });
  }, [
    scoped,
    q,
    machine,
    dealer,
    language,
    statusFilter,
    matchFilter,
    deliveryFrom,
    deliveryTo,
    createdFrom,
    createdTo,
    scope,
  ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "certificate":
          return (spIdNumeric(a.sharepointItemId) - spIdNumeric(b.sharepointItemId)) * dir;
        case "dealer":
          return cmp(a.dealerName, b.dealerName) * dir;
        case "customer":
          return cmp(a.customer, b.customer) * dir;
        case "machineType":
          return cmp(a.machineType, b.machineType) * dir;
        case "serial":
          return cmp(a.machineSerial, b.machineSerial) * dir;
        case "deliveryDate":
          return (dateNum(a.deliveryDate) - dateNum(b.deliveryDate)) * dir;
        case "createdDate":
          return (
            (dateNum(a.registrationDate ?? a.sharepointModifiedAt ?? a.createdAt) -
              dateNum(b.registrationDate ?? b.sharepointModifiedAt ?? b.createdAt)) *
            dir
          );
        case "status":
          return cmp(a.status, b.status) * dir;
        case "matchStatus":
          return cmp(a.dealerMatchStatus, b.dealerMatchStatus) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "certificate" || k === "deliveryDate" || k === "createdDate" ? "desc" : "asc");
    }
  }

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className="px-6 py-3">
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 uppercase tracking-widest ${active ? "text-slate-900" : "text-slate-500"}`}
        >
          {children}
          <Icon className="h-3 w-3" />
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div
          className={`grid grid-cols-1 gap-2.5 md:grid-cols-2 ${
            scope === "admin" ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Søg SP-ID, kunde, serienr…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>
          {scope === "admin" && (
            <Select value={dealer} onChange={setDealer} placeholder="Alle forhandlere" options={dealers} />
          )}
          <Select
            value={machine}
            onChange={setMachine}
            placeholder="Alle maskintyper"
            options={MACHINE_TYPES.map((m) => m as string)}
          />
          {scope === "admin" && (
            <Select value={language} onChange={setLanguage} placeholder="Alle sprog" options={languages} />
          )}
        </div>


        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {scope === "admin" && (
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Alle statusser"
              options={["active", "draft", "archived"]}
              labels={{ active: "Aktiv", draft: "Kladde", archived: "Arkiveret" }}
            />
          )}
          {showMatchStatus && (
            <Select
              value={matchFilter}
              onChange={setMatchFilter}
              placeholder="Alle matchstatusser"
              options={["matched", "needs_review", "unmatched"]}
              labels={{
                matched: "Matched",
                needs_review: "Kræver gennemgang",
                unmatched: "Ikke matched",
              }}
            />
          )}
          <DateInput label="Levering fra" value={deliveryFrom} onChange={setDeliveryFrom} />
          <DateInput label="Levering til" value={deliveryTo} onChange={setDeliveryTo} />
          <DateInput label="Oprettet fra" value={createdFrom} onChange={setCreatedFrom} />
          <DateInput label="Oprettet til" value={createdTo} onChange={setCreatedTo} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-3">
          <span>{sorted.length} af {scoped.length} registreringer</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        {error && (
          <div className="px-6 py-4 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">
            Kunne ikke hente registreringer: {error}
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            {loading ? "Henter registreringer…" : "Ingen registreringer matcher din søgning."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <SortHeader k="certificate">Certifikat</SortHeader>
                  {scope === "admin" && <SortHeader k="dealer">Forhandler</SortHeader>}
                  <SortHeader k="customer">Kunde</SortHeader>
                  <SortHeader k="machineType">Maskintype</SortHeader>
                  <SortHeader k="serial">Serienr</SortHeader>
                  <SortHeader k="deliveryDate">Levering</SortHeader>
                  {scope === "admin" && <SortHeader k="createdDate">Oprettet</SortHeader>}
                  {scope === "admin" ? (
                    <SortHeader k="status">Status</SortHeader>
                  ) : (
                    <th className="px-6 py-3">Sprog</th>
                  )}
                  {showMatchStatus && <SortHeader k="matchStatus">Match</SortHeader>}
                  {showCertificateActions && <th className="px-6 py-3 text-right">Handlinger</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.slice(0, 250).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs font-black text-slate-700">
                      {r.certificateNumber}
                    </td>
                    {scope === "admin" && (
                      <td className="px-6 py-3 font-bold text-slate-700">
                        {r.dealerName}
                        {r.dealerAccountNumber && (
                          <span className="ml-1 text-xs font-normal text-slate-400">
                            #{r.dealerAccountNumber}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <div className="font-bold text-slate-900">{r.customer || "—"}</div>
                      <div className="text-xs text-slate-500">{r.postalCity}</div>
                    </td>
                    <td className="px-6 py-3">{r.machineType || "—"}</td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs">
                      {r.machineSerial || "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                      {formatDate(r.deliveryDate)}
                    </td>
                    {scope === "admin" && (
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                        {formatDate(r.registrationDate ?? r.sharepointModifiedAt ?? r.createdAt)}
                      </td>
                    )}
                    <td className="px-6 py-3">
                      {scope === "admin" ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-slate-500">{r.language ?? "—"}</span>
                      )}
                    </td>
                    {showMatchStatus && (
                      <td className="px-6 py-3">
                        <MatchBadge status={r.dealerMatchStatus} />
                      </td>
                    )}
                    {showCertificateActions && (
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" /> Vis
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length > 250 && (
              <div className="border-t border-slate-100 px-6 py-3 text-center text-xs text-slate-500">
                Viser de første 250 — brug filtre for at indsnævre.
              </div>
            )}
          </div>
        )}
      </div>

      {showCertificateActions && selected && (
        <CertificateDialog record={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: WarrantyRegistration["status"] }) {
  const map: Record<WarrantyRegistration["status"], { label: string; cls: string }> = {
    active: { label: "Aktiv", cls: "bg-emerald-50 text-emerald-700" },
    draft: { label: "Kladde", cls: "bg-amber-50 text-amber-700" },
    archived: { label: "Arkiveret", cls: "bg-slate-100 text-slate-600" },
  };
  const v = map[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${v.cls}`}>
      {v.label}
    </span>
  );
}

function MatchBadge({
  status,
}: {
  status: "matched" | "needs_review" | "unmatched";
}) {
  const map = {
    matched: { label: "Matched", cls: "bg-emerald-50 text-emerald-700" },
    needs_review: { label: "Kræver gennemgang", cls: "bg-amber-50 text-amber-700" },
    unmatched: { label: "Ikke matched", cls: "bg-rose-50 text-rose-700" },
  } as const;
  const v = map[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${v.cls}`}>
      {v.label}
    </span>
  );
}

function CertificateDialog({
  record,
  onClose,
}: {
  record: DbWarrantyRegistration;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Garantibevis
            </p>
            <h3 className="mt-0.5 font-mono text-lg font-black">
              {record.certificateNumber}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              onClick={() => alert("Download PDF kommer snart.")}
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Luk
            </button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-6 py-5 text-sm md:grid-cols-2">
          <DRow label="Forhandler" value={record.dealerName} />
          <DRow label="Kunde" value={record.customer} />
          <DRow label="Maskintype" value={record.machineType} />
          <DRow label="Serienr" value={record.machineSerial} mono />
          <DRow label="Demo" value={record.isDemo} />
          <DRow label="Erstatter" value={record.replacementBrand ?? "—"} />
          <DRow label="Leveringsdato" value={formatDate(record.deliveryDate)} />
          <DRow label="Adresse" value={record.customerAddress} />
          <DRow label="Postnr/by" value={record.postalCity} />
          <DRow label="Telefon" value={record.phone} />
          <DRow label="E-mail" value={record.confirmationEmail} />
          <DRow label="Sprog" value={record.language ?? "—"} />
          {record.toolSerials.length > 0 && (
            <DRow label="Redskaber" value={record.toolSerials.join(", ")} mono span2 />
          )}
          {record.comment && <DRow label="Kommentar" value={record.comment} span2 />}
        </dl>

        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4 text-xs text-slate-500">
          <p className="font-bold text-slate-600">SharePoint-styrede felter</p>
          <p className="mt-1">
            Serienr, certifikat-ID, leveringsdato og kundeoplysninger kommer fra
            SharePoint. Portalrettelser med audit-log aktiveres når{" "}
            <code className="rounded bg-slate-100 px-1">warranty_update_registration</code>{" "}
            RPC'en er kørt (se{" "}
            <code className="rounded bg-slate-100 px-1">db/sql/proposed_warranty_portal_edit.sql</code>).
          </p>
        </div>

        <HistorySection registrationId={record.id} />
      </div>
    </div>
  );
}

function HistorySection({ registrationId }: { registrationId: string }) {
  const { entries, loading, error } = useRegistrationHistory(registrationId);
  return (
    <div className="border-t border-slate-100 px-6 py-5">
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
        Ændringshistorik
      </h4>
      {loading && (
        <p className="mt-3 text-sm text-slate-500">Henter historik…</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-rose-700">Kunne ikke hente historik: {error}</p>
      )}
      {!loading && !error && entries.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">Ingen ændringer registreret endnu.</p>
      )}
      {entries.length > 0 && (
        <ul className="mt-3 space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{formatDateTime(e.changed_at)}</span>
                <span className="font-bold text-slate-600">
                  {e.actor ?? e.change_source}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {e.fields.length === 0 ? (
                  <li className="text-xs text-slate-500">
                    {e.change_source === "sharepoint_sync"
                      ? "Synk fra SharePoint"
                      : "Snapshot"}
                  </li>
                ) : (
                  e.fields.map((f) => (
                    <li key={f.field} className="text-sm">
                      <span className="font-bold text-slate-700">{f.field}:</span>{" "}
                      <span className="text-slate-500 line-through">
                        {f.old ?? "—"}
                      </span>{" "}
                      → <span className="text-slate-900">{f.new ?? "—"}</span>
                    </li>
                  ))
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function DRow({
  label,
  value,
  mono,
  span2,
}: {
  label: string;
  value: string;
  mono?: boolean;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "md:col-span-2" : ""}>
      <dt className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono text-xs" : ""} text-slate-800`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
      <span className="uppercase tracking-widest">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-slate-400"
      />
    </label>
  );
}
