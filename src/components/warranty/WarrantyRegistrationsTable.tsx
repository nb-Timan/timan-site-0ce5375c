/**
 * Shared registrations table — reads from public.warranty_registrations.
 * Used by:
 *  - Dealer (scope="dealer"):  /portal/service/warranty/registrations
 *  - Timan Admin (scope="admin"): /portal/service/warranty/registrations
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  Loader2,
  Pencil,
  PlusCircle,
  Save,
  Search,
  X,
} from "lucide-react";
import {
  MACHINE_TYPES,
  type WarrantyRegistration,
} from "@/lib/warranty-store";
import {
  useWarrantyRegistrationsDb,
  fetchWarrantyRegistrations,
  type DbWarrantyRegistration,
} from "@/lib/warrantyRegistrationsService";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useRegistrationHistory } from "@/lib/warrantyHistoryService";
import { supabase } from "@/lib/supabase";
import { useSellerDirectory } from "@/lib/sellerDirectory";
import { useTeknikScope, applyScopeFilter } from "@/lib/useTeknikScope";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";


export type WarrantyScope = "admin" | "dealer";

interface Props {
  scope: WarrantyScope;
  dealerName?: string;
  /** Kept for backward compatibility — the Vis-button is now always available. */
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
}: Props) {
  const { role, scope: teknikScope } = useTeknikScope();
  const showMatchStatus = role === "timan_backend" || role === "timan_service";
  const canEdit = role === "timan_backend" || role === "timan_service";
  const { records: all, loading, error } = useWarrantyRegistrationsDb();
  const [localRecords, setLocalRecords] = useState<DbWarrantyRegistration[] | null>(null);
  const records = localRecords ?? all;

  const [searchParams] = useSearchParams();
  // Deep-link from Machine Journal: ?certificate=SP-224 or ?serial=… should
  // preseed the search box so the result list focuses on that registration.
  // ?dealer=… is the legacy seed kept for backward compatibility.
  const initialSearch =
    searchParams.get("certificate") ??
    searchParams.get("registrationId") ??
    searchParams.get("serial") ??
    searchParams.get("dealer") ??
    "";
  const [q, setQ] = useState(initialSearch);
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Snapshot of the selected record so the modal stays stable across refetches
  // / re-renders, even if the row briefly disappears from `records`.
  const selectedSnapshotRef = useRef<DbWarrantyRegistration | null>(null);
  const selected = useMemo(() => {
    if (!selectedId) return null;
    const fromRecords = records.find((r) => r.id === selectedId) ?? null;
    if (fromRecords) {
      selectedSnapshotRef.current = fromRecords;
      return fromRecords;
    }
    return selectedSnapshotRef.current;
  }, [selectedId, records]);

  const scoped = useMemo(() => {
    if (scope === "admin") {
      // Seller / dealer / importer / service partner: filter by assigned dealers.
      return applyScopeFilter(teknikScope, records, (r) => ({
        dealer_number: r.dealerAccountNumber,
        dealer_name: r.dealerName,
      }));
    }
    return applyScopeFilter(teknikScope, records, (r) => ({
      dealer_number: r.dealerAccountNumber,
      dealer_name: r.dealerName,
    }));
  }, [records, scope, teknikScope]);

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
        r.sharepointCreatedAt ?? r.registrationDate ?? r.sharepointModifiedAt ?? r.createdAt,
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
        r.id.toLowerCase().includes(ql) ||
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
        case "certificate": {
          const av = a.sharepointFormId ?? spIdNumeric(a.sharepointItemId);
          const bv = b.sharepointFormId ?? spIdNumeric(b.sharepointItemId);
          return (av - bv) * dir;
        }
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
            (dateNum(a.sharepointCreatedAt ?? a.registrationDate ?? a.sharepointModifiedAt ?? a.createdAt) -
              dateNum(b.sharepointCreatedAt ?? b.registrationDate ?? b.sharepointModifiedAt ?? b.createdAt)) *
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

  async function reloadAfterEdit() {
    try {
      const fresh = await fetchWarrantyRegistrations();
      setLocalRecords(fresh);
    } catch {
      /* ignore — keep current data */
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
        {/* Line 1 — Søg, Forhandler (admin), Maskintype, Sprog (admin) */}
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
            scope === "admin" ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          <Field label="Søg">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="SP-ID, kunde, serienr…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </div>
          </Field>
          {scope === "admin" && (
            <Field label="Forhandler">
              <Select value={dealer} onChange={setDealer} placeholder="Alle forhandlere" options={dealers} />
            </Field>
          )}
          <Field label="Maskintype">
            <Select
              value={machine}
              onChange={setMachine}
              placeholder="Alle maskintyper"
              options={MACHINE_TYPES.map((m) => m as string)}
            />
          </Field>
          {scope === "admin" && (
            <Field label="Sprog">
              <Select value={language} onChange={setLanguage} placeholder="Alle sprog" options={languages} />
            </Field>
          )}
        </div>

        {/* Line 2 — Status, Matchstatus, Levering fra/til, Oprettet fra/til */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Status">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Alle"
              options={["active", "draft", "archived"]}
              labels={{ active: "Aktiv", draft: "Kladde", archived: "Arkiveret" }}
            />
          </Field>
          <Field label="Matchstatus">
            {showMatchStatus ? (
              <Select
                value={matchFilter}
                onChange={setMatchFilter}
                placeholder="Alle"
                options={["matched", "needs_review", "unmatched"]}
                labels={{
                  matched: "Matched",
                  needs_review: "Kræver gennemgang",
                  unmatched: "Ikke matched",
                }}
              />
            ) : (
              <DisabledInput value="—" />
            )}
          </Field>
          <Field label="Levering fra">
            <DateInput value={deliveryFrom} onChange={setDeliveryFrom} />
          </Field>
          <Field label="Levering til">
            <DateInput value={deliveryTo} onChange={setDeliveryTo} />
          </Field>
          <Field label="Oprettet fra">
            <DateInput value={createdFrom} onChange={setCreatedFrom} />
          </Field>
          <Field label="Oprettet til">
            <DateInput value={createdTo} onChange={setCreatedTo} />
          </Field>
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
                  <th className="px-6 py-3 text-right">Handlinger</th>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{r.dealerName}</span>
                          {r.dealerAccountNumber ? (
                            <span className="text-xs font-normal text-slate-400">
                              #{r.dealerAccountNumber}
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                              Ikke koblet
                            </span>
                          )}
                        </div>
                        {r.dealerOfficialName && r.dealerNameSnapshot && r.dealerNameSnapshot !== r.dealerOfficialName && (
                          <div className="mt-0.5 text-[11px] font-normal text-slate-400">
                            SP-navn: {r.dealerNameSnapshot}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <div className="font-bold text-slate-900">{r.customer || "—"}</div>
                      <div className="text-xs text-slate-500">{r.postalCity}</div>
                    </td>
                    <td className="px-6 py-3">{r.machineType || "—"}</td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs">
                      {r.machineSerial ? (
                        <Link
                          to={`/portal/service/machines/${encodeURIComponent(r.machineSerial)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-700 hover:underline"
                          title="Min Maskine"
                        >
                          {r.machineSerial}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                      {formatDate(r.deliveryDate)}
                    </td>
                    {scope === "admin" && (
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                        {formatDate(r.sharepointCreatedAt ?? r.registrationDate ?? r.sharepointModifiedAt ?? r.createdAt)}
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
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => { selectedSnapshotRef.current = r; setSelectedId(r.id); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" /> Vis
                      </button>
                    </td>
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

      {selected && (
        <CertificateDialog
          record={selected}
          canEdit={canEdit}
          onClose={() => { selectedSnapshotRef.current = null; setSelectedId(null); }}
          onSaved={async (next) => {
            selectedSnapshotRef.current = next;
            await reloadAfterEdit();
          }}
        />
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

interface EditableFields {
  customer_name: string;
  customer_address: string;
  customer_postal_code: string;
  customer_city: string;
  customer_country: string;
  customer_phone: string;
  customer_email: string;
  delivery_date: string;
  machine_model: string;
  comment: string;
  machine_serial_number: string;
  dealer_account_id: string;
  dealer_account_number: string;
}

function recordToEditable(r: DbWarrantyRegistration): EditableFields {
  const [pc, ...cityParts] = (r.postalCity ?? "").split(" ");
  return {
    customer_name: r.customer ?? "",
    customer_address: r.customerAddress ?? "",
    customer_postal_code: r.postalCode ?? pc ?? "",
    customer_city: r.city ?? cityParts.join(" ") ?? "",
    customer_country: r.country ?? "",
    customer_phone: r.phone ?? "",
    customer_email: r.confirmationEmail ?? "",
    delivery_date: r.deliveryDate ?? "",
    machine_model: r.machineType ?? "",
    comment: r.comment ?? "",
    machine_serial_number: r.machineSerial ?? "",
    dealer_account_id: r.dealerAccountId ?? "",
    dealer_account_number: r.dealerAccountNumber ?? "",
  };
}


function CertificateDialog({
  record,
  canEdit,
  onClose,
  onSaved,
}: {
  record: DbWarrantyRegistration;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (next: DbWarrantyRegistration) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(() => recordToEditable(record));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [auditMissing, setAuditMissing] = useState(false);
  const [dealers, setDealers] = useState<Array<{
    id: string;
    account_number: string;
    company_name: string;
    isBlocked: boolean;
    isDeleted: boolean;
    successorDealerId: string | null;
    successorDealerAccountNumber: string | null;
  }>>([]);

  const selectedDealer = dealers.find((d) => d.id === form.dealer_account_id);
  const selectedStatus = selectedDealer
    ? selectedDealer.isDeleted
      ? "closed"
      : selectedDealer.isBlocked
        ? "blocked"
        : "active"
    : null;
  const selectedSuccessor = selectedDealer?.successorDealerId
    ? dealers.find((d) => d.id === selectedDealer.successorDealerId) ?? null
    : null;

  // Lazy-load dealer accounts the first time the internal user starts editing.
  useEffect(() => {
    if (!editing || !canEdit || dealers.length > 0) return;
    let cancelled = false;
    import("@/lib/dealerAccountsService").then(({ fetchDealerAccounts }) => {
      fetchDealerAccounts({ includeDeleted: true }).then(({ rows }) => {
        if (cancelled) return;
        setDealers(
          rows
            .filter((d) => d.account_number && d.account_number.trim() !== "")
            .map((d) => ({
              id: d.id,
              account_number: d.account_number,
              company_name: d.company_name,
              isBlocked: d.is_blocked,
              isDeleted: d.is_deleted,
              successorDealerId: d.successor_dealer_id,
              successorDealerAccountNumber: d.successor_dealer_account_number,
            }))
            .sort((a, b) => a.company_name.localeCompare(b.company_name, "da")),
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [editing, canEdit, dealers.length]);

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectDealer(dealerId: string) {
    const d = dealers.find((x) => x.id === dealerId);
    if (!d) return;
    setForm((f) => ({
      ...f,
      dealer_account_id: d.id,
      dealer_account_number: d.account_number,
    }));
  }

  function selectSuccessor() {
    if (!selectedSuccessor) return;
    selectDealer(selectedSuccessor.id);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setAuditMissing(false);
    const original = recordToEditable(record);
    const changes: Record<string, string | null> = {};
    (Object.keys(form) as (keyof EditableFields)[]).forEach((k) => {
      const next = form[k]?.trim?.() ?? form[k];
      const prev = original[k]?.trim?.() ?? original[k];
      if (next !== prev) changes[k] = (next as string) || null;
    });
    // Guard: never clear the dealer link from this editor.
    if (
      ("dealer_account_id" in changes && !changes.dealer_account_id) ||
      ("dealer_account_number" in changes && !changes.dealer_account_number)
    ) {
      setSaving(false);
      setSaveError("Forhandlerkoblingen kan ikke ryddes herfra. Brug matching-flowet.");
      return;
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      setSaving(false);
      return;
    }
    const { error } = await supabase.rpc("warranty_update_registration", {
      p_id: record.id,
      p_changes: changes,
    });
    setSaving(false);
    if (error) {
      const msg = error.message || String(error);
      if (
        /function .*warranty_update_registration/i.test(msg) ||
        /could not find the function/i.test(msg) ||
        /PGRST202/i.test(msg)
      ) {
        setAuditMissing(true);
      } else {
        setSaveError(msg);
      }
      return;
    }
    const dealerChanged = !!(changes.dealer_account_id || changes.dealer_account_number);
    const newDealer = dealerChanged ? dealers.find((d) => d.id === form.dealer_account_id) : null;
    const merged: DbWarrantyRegistration = {
      ...record,
      customer: form.customer_name,
      customerAddress: form.customer_address,
      postalCode: form.customer_postal_code,
      city: form.customer_city,
      country: form.customer_country,
      postalCity: [form.customer_postal_code, form.customer_city].filter(Boolean).join(" "),
      phone: form.customer_phone,
      confirmationEmail: form.customer_email,
      deliveryDate: form.delivery_date,
      machineType: form.machine_model,
      machineSerial: form.machine_serial_number,
      comment: form.comment,
      dealerAccountId: form.dealer_account_id || record.dealerAccountId,
      dealerAccountNumber: form.dealer_account_number || record.dealerAccountNumber,
      dealerName: newDealer ? newDealer.company_name : record.dealerName,
      dealerMatchStatus: dealerChanged ? "matched" : record.dealerMatchStatus,
    };
    setEditing(false);
    await onSaved(merged);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4"
      // Intentionally NO onClick → backdrop clicks must not close the modal.
      // The modal can only be closed by the X button, Annuller, or a successful save.
    >
      <div
        className="my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Block Escape from bubbling to anything that might close the modal.
          if (e.key === "Escape") e.stopPropagation();
        }}
        onPaste={(e) => e.stopPropagation()}
        onSubmit={(e) => e.preventDefault()}
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
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => {
                  setForm(recordToEditable(record));
                  setEditing(true);
                  setSaveError(null);
                  setAuditMissing(false);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Pencil className="h-3.5 w-3.5" /> Rediger registrering
              </button>
            )}
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
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <DealerLinkBlock record={record} />

        {auditMissing && (
          <div className="border-b border-amber-100 bg-amber-50 px-6 py-3 text-xs text-amber-800">
            Redigering kræver audit-SQL. Kør{" "}
            <code className="rounded bg-amber-100 px-1">db/sql/proposed_warranty_portal_edit.sql</code>{" "}
            i Supabase for at aktivere portalrettelser med historik.
          </div>
        )}
        {saveError && (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-xs text-rose-700">
            Kunne ikke gemme: {saveError}
          </div>
        )}

        {editing ? (
          <div className="grid grid-cols-1 gap-3 px-6 py-5 text-sm md:grid-cols-2">
            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Forhandlerkonto
              </span>
              <select
                value={form.dealer_account_id}
                onChange={(e) => selectDealer(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              >
                {!form.dealer_account_id && (
                  <option value="">— vælg forhandler —</option>
                )}
                {dealers.map((d) => {
                  const statusLabel = d.isDeleted
                    ? "Lukket"
                    : d.isBlocked
                      ? "Spærret"
                      : "Aktiv";
                  const successor = d.successorDealerId
                    ? dealers.find((s) => s.id === d.successorDealerId)
                    : null;
                  const suffix = successor
                    ? ` · Lukket → ${successor.company_name}`
                    : ` · ${statusLabel}`;
                  return (
                    <option key={d.id} value={d.id}>
                      {d.company_name} (#{d.account_number}){suffix}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Kan ikke ryddes herfra. Vælg en anden forhandler for at re-matche.
                Aktive, spærrede og lukkede forhandlere vises.
              </p>

              {selectedStatus && selectedStatus !== "active" && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold text-amber-800">
                      {selectedStatus === "closed"
                        ? "Denne forhandler er lukket. Overvej at vælge efterfølgeren."
                        : "Denne forhandler er spærret. Overvej at vælge efterfølgeren."}
                    </span>
                    {selectedSuccessor && (
                      <button
                        type="button"
                        onClick={selectSuccessor}
                        className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                      >
                        Vælg {selectedSuccessor.company_name} i stedet
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <EditField label="Kunde" value={form.customer_name} onChange={(v) => update("customer_name", v)} />
            <EditField label="E-mail" value={form.customer_email} onChange={(v) => update("customer_email", v)} />
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Adresse</span>
              <AddressAutocomplete
                value={form.customer_address ?? ""}
                onChange={(v) => update("customer_address", v)}
                onResolve={(r: ResolvedAddress) => {
                  if (r.address_line_1) update("customer_address", r.address_line_1);
                  if (r.postal_code) update("customer_postal_code", r.postal_code);
                  if (r.city) update("customer_city", r.city);
                  if (r.country) update("customer_country", r.country);
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                placeholder="Begynd at skrive adressen…"
                showValidationState
                addressParts={{ address_line_1: form.customer_address, postal_code: form.customer_postal_code, city: form.customer_city, country: form.customer_country }}
              />
            </label>
            <EditField label="Postnr" value={form.customer_postal_code} onChange={(v) => update("customer_postal_code", v)} />
            <EditField label="By" value={form.customer_city} onChange={(v) => update("customer_city", v)} />
            <EditField label="Land" value={form.customer_country} onChange={(v) => update("customer_country", v)} />
            <EditField label="Telefon" value={form.customer_phone} onChange={(v) => update("customer_phone", v)} />
            <EditField label="Leveringsdato" type="date" value={form.delivery_date} onChange={(v) => update("delivery_date", v)} />
            <EditField label="Maskintype" value={form.machine_model} onChange={(v) => update("machine_model", v)} />
            <EditField label="Serienr (kun intern)" value={form.machine_serial_number} onChange={(v) => update("machine_serial_number", v)} span2 />
            <EditField label="Kommentar" value={form.comment} onChange={(v) => update("comment", v)} span2 textarea />
            <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Gem ændringer
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-6 py-5 text-sm md:grid-cols-2">
            <DRow label="Kunde" value={record.customer} />
            <DRow label="Maskintype" value={record.machineType} />
            <DRow label="Serienr" value={record.machineSerial} mono />
            <DRow label="Købt som demo-maskine" value={record.isDemo} />
            <DRow label="Erstatter" value={record.replacementBrand ?? "—"} />
            <DRow label="Leveringsdato" value={formatDate(record.deliveryDate)} />
            <DRow label="Adresse" value={record.customerAddress} />
            <DRow label="Postnr/by" value={record.postalCity} />
            <DRow label="Telefon" value={record.phone} />
            <DRow label="E-mail" value={record.confirmationEmail} />
            <DRow label="Sprog" value={record.language ?? "—"} />
            <DRow label="Oprettet af" value="SharePoint" />
            {record.toolSerials.length > 0 && (
              <DRow label="Redskaber" value={record.toolSerials.join(", ")} mono span2 />
            )}
            {record.comment && <DRow label="Kommentar" value={record.comment} span2 />}
          </dl>
        )}

        {!canEdit && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 text-xs text-slate-500">
            Read-only — du har ikke rettigheder til at redigere denne registrering.
          </div>
        )}

        <HistorySection registrationId={record.id} />
      </div>
    </div>

  );
}

const FIELD_LABELS: Record<string, string> = {
  customer_name: "Kunde",
  customer_address: "Adresse",
  customer_postal_code: "Postnummer",
  customer_city: "By",
  customer_country: "Land",
  customer_email: "E-mail",
  customer_phone: "Telefon",
  delivery_date: "Leveringsdato",
  machine_model: "Maskintype",
  machine_serial_number: "Serienr.",
  comment: "Kommentar",
  dealer_account_id: "Forhandler-ID",
  dealer_account_number: "Forhandlernr.",
  dealer_match_status: "Matchstatus",
  dealer_match_method: "Matchmetode",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function formatHistoryValue(field: string, v: string | null): string {
  if (v === null || v === "") return "—";
  if (field === "delivery_date") return formatDate(v);
  return v;
}

function shortChangeId(id: string): string {
  const clean = id.replace(/-/g, "");
  return `#${clean.slice(-5)}`;
}

function HistorySection({ registrationId }: { registrationId: string }) {
  const { entries, loading, error } = useRegistrationHistory(registrationId);
  const dir = useSellerDirectory();
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
          {entries.map((e) => {
            const user = e.actor ? dir.byId.get(String(e.actor)) : undefined;
            const isSync = e.change_source === "sharepoint_sync";
            const initials = user?.initials
              ?? (isSync ? "SP" : (e.actor ? "?" : "—"));
            const name = user?.full_name
              ?? (isSync ? "SharePoint sync" : (e.actor ? "Ukendt bruger" : "—"));
            const company = user?.company ?? (isSync ? "Timan" : "—");
            const email = user?.email ?? "—";
            const phone = "—";
            const shortId = shortChangeId(e.id);
            return (
              <li
                key={e.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    {formatDateTime(e.changed_at)}
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span
                      className="font-bold text-slate-700"
                      title={`Navn: ${name}\nFirma: ${company}\nE-mail: ${email}\nTelefon: ${phone}`}
                    >
                      {initials}
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span
                      className="font-mono text-[11px] text-slate-400"
                      title={`Teknisk ID: ${e.id}`}
                    >
                      Ændring {shortId}
                    </span>
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {e.fields.length === 0 ? (
                    <li className="text-xs text-slate-500">
                      {isSync ? "Synk fra SharePoint" : "Snapshot"}
                    </li>
                  ) : (
                    e.fields
                      .filter((f) => !f.field.startsWith("_"))
                      .map((f) => (
                        <li key={f.field} className="text-sm">
                          <span className="font-bold text-slate-700">{fieldLabel(f.field)}:</span>{" "}
                          <span className="text-slate-500 line-through">
                            {formatHistoryValue(f.field, f.old)}
                          </span>{" "}
                          → <span className="text-slate-900">
                            {formatHistoryValue(f.field, f.new)}
                          </span>
                        </li>
                      ))
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}



function DealerLinkBlock({ record }: { record: DbWarrantyRegistration }) {
  const missing = !record.dealerAccountId || !record.dealerAccountNumber;
  const matchLabel: Record<string, string> = {
    matched: "Matched",
    needs_review: "Kræver gennemgang",
    unmatched: "Ikke matched",
  };
  const officialName = record.dealerOfficialName;
  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Officiel forhandler
          </div>
          <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
            <span>{officialName ?? record.dealerNameSnapshot ?? "—"}</span>
            {!officialName && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Ikke koblet
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Kontonummer
          </div>
          <div className="font-mono text-slate-800">
            {record.dealerAccountNumber || "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Matchstatus
          </div>
          <div className="text-slate-800">
            <MatchBadge status={record.dealerMatchStatus} />
            <span className="ml-2 text-xs text-slate-500">
              {matchLabel[record.dealerMatchStatus] ?? record.dealerMatchStatus}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            SharePoint forhandlernavn
          </div>
          <div className="text-slate-700">{record.dealerNameSnapshot || "—"}</div>
        </div>
      </div>
      {missing && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Registreringen er ikke koblet til en forhandlerkonto endnu.
        </div>
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

function EditField({
  label,
  value,
  onChange,
  type = "text",
  span2,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  span2?: boolean;
  textarea?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${span2 ? "md:col-span-2" : ""}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
        />
      )}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      {children}
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
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-slate-400"
    />
  );
}

function DisabledInput({ value }: { value: string }) {
  return (
    <input
      type="text"
      disabled
      value={value}
      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 outline-none"
    />
  );
}
