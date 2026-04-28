/**
 * Shared registrations table — migrated 1:1 from the old Timan TSB Hub. Used by:
 *  - Dealer (scope="dealer"):  /portal/service/warranty/registrations  ("Mine registreringer", scoped to dealer)
 *  - Timan Admin (scope="admin"): /portal/service/warranty/registrations    ("Registrerede garantibeviser", all dealers)
 *
 * Behaviour controlled by the `scope` prop.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Eye, PlusCircle, Search } from "lucide-react";
import {
  MACHINE_TYPES,
  useWarrantyRecords,
  type WarrantyRegistration,
} from "@/lib/warranty-store";
import { formatDate } from "@/lib/format-date";

export type WarrantyScope = "admin" | "dealer";

interface Props {
  scope: WarrantyScope;
  /** Required when scope === "dealer" — only this dealer's records are shown. */
  dealerName?: string;
  /** Show certificate viewer dialog + download placeholder action. */
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

export function WarrantyRegistrationsTable({
  scope,
  dealerName,
  showCertificateActions = false,
}: Props) {
  const all = useWarrantyRecords();
  const [q, setQ] = useState("");
  const [machine, setMachine] = useState("");
  const [dealer, setDealer] = useState("");
  const [language, setLanguage] = useState("");
  const [selected, setSelected] = useState<WarrantyRegistration | null>(null);

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
    return scoped.filter((r) => {
      if (machine && r.machineType !== machine) return false;
      if (scope === "admin" && dealer && r.dealerName !== dealer) return false;
      if (language && r.language !== language) return false;
      if (!ql) return true;
      return (
        r.customer.toLowerCase().includes(ql) ||
        r.dealerName.toLowerCase().includes(ql) ||
        r.machineType.toLowerCase().includes(ql) ||
        r.machineSerial.toLowerCase().includes(ql) ||
        r.confirmationEmail.toLowerCase().includes(ql) ||
        r.certificateNumber.toLowerCase().includes(ql)
      );
    });
  }, [scoped, q, machine, dealer, language, scope]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div
          className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${
            scope === "admin" ? "lg:grid-cols-5" : "lg:grid-cols-3"
          }`}
        >
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Søg kunde, serienr, certifikat …"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>
          {scope === "admin" && (
            <Select
              value={dealer}
              onChange={setDealer}
              placeholder="Alle forhandlere"
              options={dealers}
            />
          )}
          <Select
            value={machine}
            onChange={setMachine}
            placeholder="Alle maskintyper"
            options={MACHINE_TYPES.map((m) => m as string)}
          />
          {scope === "admin" && (
            <Select
              value={language}
              onChange={setLanguage}
              placeholder="Alle sprog"
              options={languages}
            />
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
          {filtered.length} af {scoped.length} registreringer
        </div>
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Ingen registreringer matcher din søgning.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-3">Certifikat</th>
                  {scope === "admin" && <th className="px-6 py-3">Forhandler</th>}
                  <th className="px-6 py-3">Kunde</th>
                  <th className="px-6 py-3">Maskintype</th>
                  <th className="px-6 py-3">Serienr</th>
                  <th className="px-6 py-3">Levering</th>
                  {scope === "admin" && <th className="px-6 py-3">Oprettet</th>}
                  <th className="px-6 py-3">
                    {scope === "admin" ? "Status" : "Sprog"}
                  </th>
                  {showCertificateActions && (
                    <th className="px-6 py-3 text-right">Handlinger</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 250).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs font-black text-slate-700">
                      {r.certificateNumber}
                    </td>
                    {scope === "admin" && (
                      <td className="px-6 py-3 font-bold text-slate-700">
                        {r.dealerName}
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <div className="font-bold text-slate-900">
                        {r.customer || "—"}
                      </div>
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
                        {formatDate(r.createdAt)}
                      </td>
                    )}
                    <td className="px-6 py-3">
                      {scope === "admin" ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-slate-500">{r.language ?? "—"}</span>
                      )}
                    </td>
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
            {filtered.length > 250 && (
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
  const map: Record<
    WarrantyRegistration["status"],
    { label: string; cls: string }
  > = {
    active: { label: "Aktiv", cls: "bg-emerald-50 text-emerald-700" },
    draft: { label: "Kladde", cls: "bg-amber-50 text-amber-700" },
    archived: { label: "Arkiveret", cls: "bg-slate-100 text-slate-600" },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function CertificateDialog({
  record,
  onClose,
}: {
  record: WarrantyRegistration;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
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
            <DRow
              label="Redskaber"
              value={record.toolSerials.join(", ")}
              mono
              span2
            />
          )}
          {record.comment && (
            <DRow label="Kommentar" value={record.comment} span2 />
          )}
        </dl>
      </div>
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
      <dt className="text-xs font-black uppercase tracking-widest text-slate-400">
        {label}
      </dt>
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
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
          {o}
        </option>
      ))}
    </select>
  );
}
