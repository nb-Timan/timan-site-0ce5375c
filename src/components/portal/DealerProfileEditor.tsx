/**
 * Self-service dealer profile editor (Phase 52).
 *
 * Focus-bug fix: Field and SectionShell are now defined at module scope
 * (not inside the parent render) so React keeps the same component
 * identity across renders and inputs don't remount on every keystroke.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Save, Plus, Trash2, Loader2 } from "lucide-react";
import { useBeforeUnload } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";

import type { Language } from "@/types/configurator";
import { tProfile, type ProfileI18nKey } from "@/lib/dealerProfileI18n";
import {
  updateDealerAccount,
  type DealerAccount,
  type UpdateDealerAccountPatch,
} from "@/lib/dealerAccountsService";
import {
  listDealerContacts,
  upsertDealerContact,
  deleteDealerContact,
  type DealerContact,
  type DealerContactArea,
} from "@/lib/dealerContactsService";
import { computeCompletion, type SectionKey } from "@/lib/dealerProfileCompletion";

interface Props {
  dealer: DealerAccount;
  language: Language;
  canEdit: boolean;
  onUpdated?: (next: DealerAccount) => void;
}

const ROLE_KEYS_SALES: ProfileI18nKey[] = [
  "roleSalesDirector", "roleSalesRep", "roleSalesCoordinator", "roleKeyAccount", "roleOther",
];
const ROLE_KEYS_WORKSHOP: ProfileI18nKey[] = [
  "roleWorkshopManager", "roleMechanic", "rolePartsManager",
  "roleStockManager", "roleServiceCoord", "roleOther",
];
const ROLE_KEYS_DIRECTOR: ProfileI18nKey[] = [
  "roleDirector", "roleOwner", "roleManagingDirector", "roleOther",
];

const PROFILE_PATCH_KEYS = [
  "address_line_1", "address_line_2", "postal_code", "city", "country",
  "vat_number", "director_name", "phone", "email",
  "latitude", "longitude", "google_place_id", "geocoded_at",
  "geocoding_status", "geocoding_error",
  "finance_contact_name", "finance_contact_phone", "finance_contact_email",
  "invoice_email", "payment_terms", "currency_code",
  "website", "social_facebook", "social_linkedin", "social_tiktok",
  "social_youtube", "social_instagram",
  "sales_contact_name", "sales_contact_phone", "sales_contact_email",
  "sales_has_multiple",
  "workshop_contact_name", "workshop_contact_phone", "workshop_contact_email",
  "workshop_has_multiple",
  "marketing_contact_name", "marketing_contact_phone", "marketing_contact_email",
] as const satisfies readonly (keyof UpdateDealerAccountPatch)[];

type ProfilePatchKey = (typeof PROFILE_PATCH_KEYS)[number];
type SavingSection = SectionKey | "leave";

function createLocalContact(dealerAccountId: string, area: DealerContactArea): DealerContact {
  return {
    id: `local-${crypto.randomUUID()}`,
    dealer_account_id: dealerAccountId,
    contact_area: area,
    role_title: null,
    name: null,
    email: null,
    phone: null,
    is_primary: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function isLocalContact(contact: DealerContact): boolean {
  return contact.id.startsWith("local-");
}

function contactHasContent(contact: DealerContact): boolean {
  return Boolean(
    contact.role_title?.trim() ||
    contact.name?.trim() ||
    contact.email?.trim() ||
    contact.phone?.trim() ||
    contact.is_primary
  );
}

// ---------- module-scope helpers (stable component identity) ----------

interface FieldProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  type?: string;
}

function Field({ id, label, value, onChange, disabled, required, type = "text" }: FieldProps) {
  const isEmpty = !value || (typeof value === "string" && value.trim().length === 0);
  const missing = !!required && isEmpty;
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">
        {label}{required ? " *" : ""}
      </Label>
      <Input
        id={id}
        type={type}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={missing ? "border-rose-400 bg-rose-50 focus-visible:ring-rose-300" : undefined}
        aria-invalid={missing || undefined}
      />
      {missing && (
        <p className="mt-1 text-xs text-rose-600">Mangler udfyldelse</p>
      )}
    </div>
  );
}

/**
 * Address field with Google Places autocomplete, styled like the standard
 * shadcn <Input> so it slots into the dealer profile grid without visual
 * changes. Falls back to a plain text input when no API key is configured
 * (see AddressAutocomplete). Manual edits after a suggestion clear the
 * captured coordinates / place_id so stale geocoding is never saved.
 */
interface AddressFieldProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  onResolve: (r: ResolvedAddress) => void;
  disabled?: boolean;
  required?: boolean;
  addressParts?: { address_line_1?: string | null; postal_code?: string | null; city?: string | null; country?: string | null };
}

function AddressField({ id, label, value, onChange, onResolve, disabled, required, addressParts }: AddressFieldProps) {
  const isEmpty = !value || (typeof value === "string" && value.trim().length === 0);
  const missing = !!required && isEmpty;
  const base =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";
  const cls = missing
    ? `${base} border-rose-400 bg-rose-50 focus-visible:ring-rose-300`
    : base;
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">
        {label}{required ? " *" : ""}
      </Label>
      {disabled ? (
        <Input id={id} value={value ?? ""} disabled />
      ) : (
        <AddressAutocomplete
          id={id}
          value={value ?? ""}
          onChange={onChange}
          onResolve={onResolve}
          onGeocodeResolved={onResolve}
          className={cls}
          showValidationState
          addressParts={addressParts}
        />
      )}
      {missing && (
        <p className="mt-1 text-xs text-rose-600">Mangler udfyldelse</p>
      )}
    </div>
  );
}


interface SectionShellProps {
  skey: SectionKey;
  title: string;
  status: { complete: boolean; filled: number; required: number };
  saving: boolean;
  canEdit: boolean;
  onSave: () => void;
  t: (k: ProfileI18nKey) => string;
  children: React.ReactNode;
}

function SectionShell({ skey, title, status, saving, canEdit, onSave, t, children }: SectionShellProps) {
  const badge = status.complete ? (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
      <CheckCircle2 className="h-3 w-3 mr-1" />{t("statusComplete")}
    </Badge>
  ) : status.filled > 0 ? (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
      {t("statusPartial")} ({status.filled}/{status.required})
    </Badge>
  ) : (
    <Badge variant="secondary">{t("statusEmpty")}</Badge>
  );
  return (
    <Card data-section={skey} className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">{title} {badge}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {children}
        {canEdit && (
          <div className="flex justify-end mt-auto pt-2">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function buildProfilePatch(draft: DealerAccount): UpdateDealerAccountPatch {
  const patch: UpdateDealerAccountPatch = {};
  for (const key of PROFILE_PATCH_KEYS) {
    patch[key] = draft[key] as never;
  }
  return patch;
}

function profileValue(value: DealerAccount[ProfilePatchKey]) {
  return value ?? null;
}

// ---------- main component ----------

export default function DealerProfileEditor({ dealer, language, canEdit, onUpdated }: Props) {
  const t = useMemo(() => (k: ProfileI18nKey) => tProfile(language, k), [language]);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[DealerProfileEditor] canEdit:', canEdit, 'dealer:', dealer?.account_number);
  }


  const [draft, setDraft] = useState<DealerAccount>(dealer);
  const [savedDealer, setSavedDealer] = useState<DealerAccount>(dealer);
  const [savingSection, setSavingSection] = useState<SavingSection | null>(null);
  const [contacts, setContacts] = useState<DealerContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [directorHasMultiple, setDirectorHasMultiple] = useState(false);
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null);

  // Only re-sync draft when the dealer id changes — not on every prop ref change.
  useEffect(() => {
    setDraft(dealer);
    setSavedDealer(dealer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingContacts(true);
      const rows = await listDealerContacts(dealer.id);
      if (!cancelled) {
        setContacts(rows);
        setDirectorHasMultiple(rows.some((c) => c.contact_area === "director"));
        setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dealer.id]);

  const completion = useMemo(() => computeCompletion(draft), [draft]);

  const hasUnsavedChanges = useMemo(() => (
    PROFILE_PATCH_KEYS.some((key) => profileValue(draft[key]) !== profileValue(savedDealer[key]))
  ), [draft, savedDealer]);

  useBeforeUnload((event) => {
    if (!canEdit || !hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "";
  }, { capture: true });

  useEffect(() => {
    if (!canEdit || !hasUnsavedChanges) return;

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.href;
      if (!href || href === window.location.href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingLeaveHref(href);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [canEdit, hasUnsavedChanges]);

  const set = <K extends keyof DealerAccount>(key: K, value: DealerAccount[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setAddressPart = <K extends "address_line_1" | "postal_code" | "city" | "country">(key: K, value: DealerAccount[K]) =>
    setDraft((d) => ({
      ...d,
      [key]: value,
      latitude: null,
      longitude: null,
      google_place_id: null,
      geocoded_at: null,
      geocoding_status: "pending",
      geocoding_error: null,
    }));

  const saveAllProfile = async (section: SavingSection): Promise<boolean> => {
    if (!canEdit) return false;
    setSavingSection(section);
    try {
      const res = await updateDealerAccount(dealer.id, buildProfilePatch(draft));
      if (!res.ok) {
        toast({ title: t("saveError"), description: res.error || "", variant: "destructive" });
        return false;
      } else {
        const contactResults = await Promise.all(contacts.map((c) => persistContact(c)));
        const contactError = contactResults.find((r) => !r.ok)?.error;
        if (contactError) {
          toast({ title: t("saveError"), description: contactError, variant: "destructive" });
          return false;
        }
        toast({ title: t("saved") });
        if (res.row) {
          setDraft(res.row);
          setSavedDealer(res.row);
          onUpdated?.(res.row);
        }
        return true;
      }
    } finally {
      setSavingSection(null);
    }
  };

  // -------- contact list helpers --------
  const contactsByArea = (area: DealerContactArea) => contacts.filter((c) => c.contact_area === area);

  const addContact = (area: DealerContactArea) => {
    setContacts((prev) => [...prev, createLocalContact(dealer.id, area)]);
  };
  const patchContact = (id: string, patch: Partial<DealerContact>) =>
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const persistContact = async (c: DealerContact) => {
    if (isLocalContact(c) && !contactHasContent(c)) return { ok: true };
    const res = await upsertDealerContact({
      id: isLocalContact(c) ? undefined : c.id, dealer_account_id: c.dealer_account_id, contact_area: c.contact_area,
      role_title: c.role_title, name: c.name, email: c.email, phone: c.phone, is_primary: c.is_primary,
    });
    return res;
  };
  const saveContact = async (c: DealerContact) => {
    const res = await persistContact(c);
    if (!res.ok) toast({ title: t("saveError"), description: res.error || "", variant: "destructive" });
    else if (res.row) setContacts((prev) => prev.map((row) => row.id === c.id ? res.row! : row));
  };
  const removeContact = async (id: string) => {
    const local = contacts.find((c) => c.id === id);
    if (local && isLocalContact(local)) {
      setContacts((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    const res = await deleteDealerContact(id);
    if (res.ok) setContacts((prev) => prev.filter((c) => c.id !== id));
    else toast({ title: t("saveError"), description: res.error || "", variant: "destructive" });
  };
  const setPrimaryContact = async (area: DealerContactArea, id: string, checked: boolean) => {
    const next = contacts.map((c) => (
      c.contact_area === area ? { ...c, is_primary: checked && c.id === id } : c
    ));
    setContacts(next);
    const changedAreaContacts = next.filter((c) => c.contact_area === area && (!isLocalContact(c) || contactHasContent(c)));
    const results = await Promise.all(changedAreaContacts.map((c) => persistContact(c)));
    const error = results.find((r) => !r.ok)?.error;
    if (error) toast({ title: t("saveError"), description: error, variant: "destructive" });
    const savedByPreviousId = new Map<string, DealerContact>();
    changedAreaContacts.forEach((contact, index) => {
      const saved = results[index]?.row;
      if (saved) savedByPreviousId.set(contact.id, saved);
    });
    if (savedByPreviousId.size > 0) {
      setContacts((prev) => prev.map((row) => savedByPreviousId.get(row.id) ?? row));
    }
  };

  const statusOf = (key: SectionKey) =>
    completion.sections.find((s) => s.key === key) ?? { complete: false, filled: 0, required: 0 };

  const leaveHref = pendingLeaveHref;
  const leaveWithoutSaving = () => {
    if (!leaveHref) return;
    setPendingLeaveHref(null);
    window.location.assign(leaveHref);
  };
  const saveAndLeave = async () => {
    if (!leaveHref) return;
    const ok = await saveAllProfile("leave");
    if (ok) {
      setPendingLeaveHref(null);
      window.location.assign(leaveHref);
    }
  };

  return (
    <>
    <div className="space-y-6">
      {/* Progress strip */}
      <Card>
        <CardContent className="py-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("profileTitle")}</h2>
              <p className="text-sm text-slate-500">{t("profileSubtitle")}</p>
            </div>
            <div className="text-right">
              {completion.missingSteps === 0 ? (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> {t("progressComplete")}
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {t("progressMissing")} {completion.missingSteps} {t("progressOf")} {completion.totalSteps}
                </Badge>
              )}
              <div className="text-xs text-slate-500 mt-1">{t("progressFilled")} {completion.percentage}%</div>
            </div>
          </div>
          <Progress value={completion.percentage} />
        </CardContent>
      </Card>

      {/* 1) Company */}
      <SectionShell
        skey="company" title={t("sec1")} status={statusOf("company")}
        saving={savingSection === "company"} canEdit={canEdit} t={t}
        onSave={() => void saveAllProfile("company")}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="company_name" label={t("companyName")} value={draft.company_name} onChange={() => {}} disabled required />
          <div className="space-y-3">
            <Field id="director_name" label={t("directorName")} value={draft.director_name} onChange={(v) => set("director_name", v)} disabled={!canEdit} required />
            <YesNoToggle
              label={t("directorMultiple")}
              value={directorHasMultiple}
              disabled={!canEdit}
              onChange={setDirectorHasMultiple}
              yes={t("yes")}
              no={t("no")}
            />
          </div>
          <AddressField
            id="address_line_1"
            label={t("addressLine1")}
            value={draft.address_line_1}
            disabled={!canEdit}
            required
            addressParts={{ address_line_1: draft.address_line_1, postal_code: draft.postal_code, city: draft.city, country: draft.country }}
            onChange={(v) => {
              // Manual edit after a Places pick → coordinates / place_id may be stale, clear them.
              setDraft((d) => ({
                ...d,
                address_line_1: v,
                latitude: null,
                longitude: null,
                google_place_id: null,
                geocoded_at: null,
                geocoding_status: "pending",
                geocoding_error: null,
              }));
            }}
            onResolve={(r) => {
              setDraft((d) => ({
                ...d,
                address_line_1: r.address_line_1 ?? r.formatted ?? d.address_line_1,
                postal_code: r.postal_code ?? d.postal_code,
                city: r.city ?? d.city,
                country: r.country_name ?? d.country,
                latitude: r.latitude ?? d.latitude,
                longitude: r.longitude ?? d.longitude,
                google_place_id: r.google_place_id ?? d.google_place_id,
                geocoded_at: typeof r.latitude === "number" && typeof r.longitude === "number"
                  ? new Date().toISOString()
                  : d.geocoded_at,
                geocoding_status: typeof r.latitude === "number" && typeof r.longitude === "number"
                  ? "ok"
                  : d.geocoding_status,
                geocoding_error: typeof r.latitude === "number" && typeof r.longitude === "number"
                  ? null
                  : d.geocoding_error,
              }));
            }}
          />
          <Field id="address_line_2" label={t("addressLine2")} value={draft.address_line_2} onChange={(v) => set("address_line_2", v)} disabled={!canEdit} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="postal_code" label={t("postalCode")} value={draft.postal_code} onChange={(v) => setAddressPart("postal_code", v)} disabled={!canEdit} required />
            <Field id="city" label={t("city")} value={draft.city} onChange={(v) => setAddressPart("city", v)} disabled={!canEdit} required />
          </div>
          <Field id="country" label={t("country")} value={draft.country} onChange={(v) => setAddressPart("country", v)} disabled={!canEdit} required />
          <Field id="vat_number" label={t("vatNumber")} value={draft.vat_number} onChange={(v) => set("vat_number", v)} disabled={!canEdit} required />
          <Field id="phone" label={t("phone")} value={draft.phone} onChange={(v) => set("phone", v)} disabled={!canEdit} required />
          <Field id="email" label={t("email")} value={draft.email} onChange={(v) => set("email", v)} disabled={!canEdit} type="email" required />
        </div>
        {directorHasMultiple && (
          <ContactList
            area="director" t={t} roleKeys={ROLE_KEYS_DIRECTOR} canEdit={canEdit}
            contacts={contactsByArea("director")} loading={loadingContacts}
            onAdd={() => addContact("director")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
          />
        )}
      </SectionShell>

      {/* 2) Finance */}
      <SectionShell
        skey="finance" title={t("sec2")} status={statusOf("finance")}
        saving={savingSection === "finance"} canEdit={canEdit} t={t}
        onSave={() => void saveAllProfile("finance")}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="finance_contact_name" label={t("financeContactName")} value={draft.finance_contact_name} onChange={(v) => set("finance_contact_name", v)} disabled={!canEdit} required />
          <Field id="finance_contact_email" label={t("financeEmail")} value={draft.finance_contact_email} onChange={(v) => set("finance_contact_email", v)} disabled={!canEdit} type="email" required />
          <Field id="invoice_email" label={t("invoiceEmail")} value={draft.invoice_email} onChange={(v) => set("invoice_email", v)} disabled={!canEdit} type="email" required />
          <Field id="finance_contact_phone" label={t("financePhone")} value={draft.finance_contact_phone} onChange={(v) => set("finance_contact_phone", v)} disabled={!canEdit} />
          <Field id="payment_terms" label={t("paymentTerms")} value={draft.payment_terms} onChange={(v) => set("payment_terms", v)} disabled={!canEdit} />
          <Field id="currency_code" label={t("currencyCode")} value={draft.currency_code} onChange={(v) => set("currency_code", v)} disabled={!canEdit} />
        </div>
      </SectionShell>

      {/* 3) Sales + Workshop side-by-side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Sales */}
        <SectionShell
          skey="sales" title={t("sec4")} status={statusOf("sales")}
          saving={savingSection === "sales"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("sales")}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field id="sales_contact_name"  label={t("salesContactName")} value={draft.sales_contact_name}  onChange={(v) => set("sales_contact_name", v)} disabled={!canEdit} required />
            <Field id="sales_contact_phone" label={t("salesPhone")}       value={draft.sales_contact_phone} onChange={(v) => set("sales_contact_phone", v)} disabled={!canEdit} />
            <Field id="sales_contact_email" label={t("salesEmail")}       value={draft.sales_contact_email} onChange={(v) => set("sales_contact_email", v)} disabled={!canEdit} type="email" required />
          </div>
          <YesNoToggle label={t("salesMultiple")} value={draft.sales_has_multiple} disabled={!canEdit}
            onChange={(v) => set("sales_has_multiple", v)} yes={t("yes")} no={t("no")} />
          {draft.sales_has_multiple && (
            <ContactList
              area="sales" t={t} roleKeys={ROLE_KEYS_SALES} canEdit={canEdit}
              contacts={contactsByArea("sales")} loading={loadingContacts}
              onAdd={() => addContact("sales")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            />
          )}
        </SectionShell>

        {/* Workshop & parts */}
        <SectionShell
          skey="workshop" title={t("sec5")} status={statusOf("workshop")}
          saving={savingSection === "workshop"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("workshop")}
        >
          <div className="space-y-3">
            <ContactBlock
              title={`${t("contact")} 1`}
              primaryControl={<Badge variant="secondary">{t("area_primary")}</Badge>}
            >
              <div>
                <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("role")}</Label>
                <Input value="" disabled placeholder="—" />
              </div>
              <Field id="workshop_contact_name" label={t("name")} value={draft.workshop_contact_name} onChange={(v) => set("workshop_contact_name", v)} disabled={!canEdit} required />
              <Field id="workshop_contact_email" label={t("email")} value={draft.workshop_contact_email} onChange={(v) => set("workshop_contact_email", v)} disabled={!canEdit} type="email" required />
              <Field id="workshop_contact_phone" label={t("phone")} value={draft.workshop_contact_phone} onChange={(v) => set("workshop_contact_phone", v)} disabled={!canEdit} />
            </ContactBlock>
          </div>
          <YesNoToggle label={t("workshopMultiple")} value={draft.workshop_has_multiple} disabled={!canEdit}
            onChange={(v) => set("workshop_has_multiple", v)} yes={t("yes")} no={t("no")} />
          {draft.workshop_has_multiple && (
            <ContactList
              area="workshop" t={t} roleKeys={ROLE_KEYS_WORKSHOP} canEdit={canEdit}
              contacts={contactsByArea("workshop")} loading={loadingContacts}
              onAdd={() => addContact("workshop")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            />
          )}
        </SectionShell>
      </div>

      {/* 4) Marketing + Media side-by-side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Marketing */}
        <SectionShell
          skey="marketing" title={t("sec6")} status={statusOf("marketing")}
          saving={savingSection === "marketing"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("marketing")}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field id="marketing_contact_name"  label={t("marketingContactName")} value={draft.marketing_contact_name}  onChange={(v) => set("marketing_contact_name", v)} disabled={!canEdit} required />
            <Field id="marketing_contact_phone" label={t("marketingPhone")}       value={draft.marketing_contact_phone} onChange={(v) => set("marketing_contact_phone", v)} disabled={!canEdit} />
            <Field id="marketing_contact_email" label={t("marketingEmail")}       value={draft.marketing_contact_email} onChange={(v) => set("marketing_contact_email", v)} disabled={!canEdit} type="email" required />
          </div>
        </SectionShell>

        {/* Media */}
        <SectionShell
          skey="media" title={t("sec3")} status={statusOf("media")}
          saving={savingSection === "media"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("media")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field id="website" label={t("website")} value={draft.website} onChange={(v) => set("website", v)} disabled={!canEdit} required />
            <Field id="social_facebook"  label={t("facebook")}  value={draft.social_facebook}  onChange={(v) => set("social_facebook", v)} disabled={!canEdit} />
            <Field id="social_linkedin"  label={t("linkedin")}  value={draft.social_linkedin}  onChange={(v) => set("social_linkedin", v)} disabled={!canEdit} />
            <Field id="social_tiktok"    label={t("tiktok")}    value={draft.social_tiktok}    onChange={(v) => set("social_tiktok", v)} disabled={!canEdit} />
            <Field id="social_youtube"   label={t("youtube")}   value={draft.social_youtube}   onChange={(v) => set("social_youtube", v)} disabled={!canEdit} />
            <Field id="social_instagram" label={t("instagram")} value={draft.social_instagram} onChange={(v) => set("social_instagram", v)} disabled={!canEdit} />
          </div>
        </SectionShell>
      </div>
    </div>
    <AlertDialog open={pendingLeaveHref !== null} onOpenChange={(open) => { if (!open && savingSection !== "leave") setPendingLeaveHref(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vil du gemme disse oplysninger?</AlertDialogTitle>
          <AlertDialogDescription>
            Du har ændret oplysninger i forhandlerprofilen. Vælg Ja for at gemme alt, eller Nej for at gå videre uden at gemme.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={savingSection === "leave"} onClick={leaveWithoutSaving}>
            Nej
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={savingSection === "leave"}
            onClick={(event) => {
              event.preventDefault();
              void saveAndLeave();
            }}
          >
            {savingSection === "leave" ? "Gemmer..." : "Ja, gem"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ---------- small helpers ----------

function YesNoToggle({ label, value, onChange, yes, no, disabled }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
  yes: string; no: string; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      <Button size="sm" variant={value ? "default" : "outline"} disabled={disabled} onClick={() => onChange(true)}>{yes}</Button>
      <Button size="sm" variant={!value ? "default" : "outline"} disabled={disabled} onClick={() => onChange(false)}>{no}</Button>
    </div>
  );
}

function ContactBlock({
  title,
  primaryControl,
  removeControl,
  children,
}: {
  title: string;
  primaryControl?: ReactNode;
  removeControl?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {primaryControl}
        </div>
        {removeControl}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
        {children}
      </div>
    </div>
  );
}

function RoleSelect({
  contact,
  t,
  roleKeys,
  canEdit,
  onPatch,
  onSave,
}: {
  contact: DealerContact;
  t: (k: ProfileI18nKey) => string;
  roleKeys: ProfileI18nKey[];
  canEdit: boolean;
  onPatch: (id: string, patch: Partial<DealerContact>) => void;
  onSave: (c: DealerContact) => void;
}) {
  return (
    <>
      <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("role")}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={contact.role_title ?? ""}
        disabled={!canEdit}
        onChange={(e) => onPatch(contact.id, { role_title: e.target.value })}
        onBlur={() => onSave(contact)}
      >
        <option value="">—</option>
        {roleKeys.map((k) => <option key={k} value={t(k)}>{t(k)}</option>)}
      </select>
    </>
  );
}

function ContactFields({
  c,
  t,
  roleKeys,
  canEdit,
  onPatch,
  onSave,
}: {
  c: DealerContact;
  t: (k: ProfileI18nKey) => string;
  roleKeys: ProfileI18nKey[];
  canEdit: boolean;
  onPatch: (id: string, patch: Partial<DealerContact>) => void;
  onSave: (c: DealerContact) => void;
}) {
  return (
    <>
      <div>
        <RoleSelect contact={c} t={t} roleKeys={roleKeys} canEdit={canEdit} onPatch={onPatch} onSave={onSave} />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("name")}</Label>
        <Input value={c.name ?? ""} disabled={!canEdit}
          onChange={(e) => onPatch(c.id, { name: e.target.value })} onBlur={() => onSave(c)} />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("email")}</Label>
        <Input type="email" value={c.email ?? ""} disabled={!canEdit}
          onChange={(e) => onPatch(c.id, { email: e.target.value })} onBlur={() => onSave(c)} />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("phone")}</Label>
        <Input value={c.phone ?? ""} disabled={!canEdit}
          onChange={(e) => onPatch(c.id, { phone: e.target.value })} onBlur={() => onSave(c)} />
      </div>
    </>
  );
}

function PrimaryContactCheckbox({
  area,
  contact,
  t,
  canEdit,
  onSetPrimary,
}: {
  area: DealerContactArea;
  contact: DealerContact;
  t: (k: ProfileI18nKey) => string;
  canEdit: boolean;
  onSetPrimary: (area: DealerContactArea, id: string, checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
        checked={contact.is_primary}
        disabled={!canEdit}
        onChange={(event) => onSetPrimary(area, contact.id, event.target.checked)}
      />
      {t("area_primary")}
    </label>
  );
}

function ContactList({
  area, t, roleKeys, contacts, loading, canEdit,
  onAdd, onPatch, onSave, onRemove, onSetPrimary,
}: {
  area: DealerContactArea;
  t: (k: ProfileI18nKey) => string;
  roleKeys: ProfileI18nKey[];
  contacts: DealerContact[];
  loading: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<DealerContact>) => void;
  onSave: (c: DealerContact) => void;
  onRemove: (id: string) => void;
  onSetPrimary: (area: DealerContactArea, id: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-3">
      {loading && <p className="text-xs text-slate-500">…</p>}
      {!loading && contacts.length === 0 && <p className="text-xs text-slate-500">—</p>}
      {contacts.map((c, index) => area === "workshop" ? (
        <ContactBlock
          key={c.id}
          title={`${t("contact")} ${index + 2}`}
          primaryControl={c.is_primary ? <Badge variant="secondary">{t("area_primary")}</Badge> : undefined}
          removeControl={
            canEdit ? (
              <Button size="icon" variant="ghost" onClick={() => onRemove(c.id)} aria-label={t("removePerson")}>
                <Trash2 className="h-4 w-4 text-rose-600" />
              </Button>
            ) : undefined
          }
        >
          <ContactFields c={c} t={t} roleKeys={roleKeys} canEdit={canEdit} onPatch={onPatch} onSave={onSave} />
          <div className="sm:col-span-2 xl:col-span-4">
            <PrimaryContactCheckbox area={area} contact={c} t={t} canEdit={canEdit} onSetPrimary={onSetPrimary} />
          </div>
        </ContactBlock>
      ) : (
        <div key={c.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-3">
            <RoleSelect contact={c} t={t} roleKeys={roleKeys} canEdit={canEdit} onPatch={onPatch} onSave={onSave} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("name")}</Label>
            <Input value={c.name ?? ""} disabled={!canEdit}
              onChange={(e) => onPatch(c.id, { name: e.target.value })} onBlur={() => onSave(c)} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("email")}</Label>
            <Input type="email" value={c.email ?? ""} disabled={!canEdit}
              onChange={(e) => onPatch(c.id, { email: e.target.value })} onBlur={() => onSave(c)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("phone")}</Label>
            <Input value={c.phone ?? ""} disabled={!canEdit}
              onChange={(e) => onPatch(c.id, { phone: e.target.value })} onBlur={() => onSave(c)} />
          </div>
          <div className="md:col-span-1 flex justify-end">
            {canEdit && (
              <Button size="icon" variant="ghost" onClick={() => onRemove(c.id)} aria-label={t("removePerson")}>
                <Trash2 className="h-4 w-4 text-rose-600" />
              </Button>
            )}
          </div>
          <div className="md:col-span-12">
            <PrimaryContactCheckbox area={area} contact={c} t={t} canEdit={canEdit} onSetPrimary={onSetPrimary} />
          </div>
        </div>
      ))}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" /> {t("addPerson")}
        </Button>
      )}
      <input type="hidden" data-area={area} />
    </div>
  );
}
