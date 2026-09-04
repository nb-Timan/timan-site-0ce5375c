/**
 * Self-service dealer profile editor (Phase 52).
 *
 * Focus-bug fix: Field and SectionShell are now defined at module scope
 * (not inside the parent render) so React keeps the same component
 * identity across renders and inputs don't remount on every keystroke.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Save, Plus, Trash2, Loader2, ArrowRightLeft, CopyPlus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  CONTACT_AREA_CONFIG,
  ROLE_KEYS_DIRECTOR,
  ROLE_KEYS_FINANCE,
  ROLE_KEYS_MARKETING,
  ROLE_KEYS_PURCHASING,
  ROLE_KEYS_SALES,
  ROLE_KEYS_WORKSHOP,
} from "@/lib/dealerContactModel";
import { computeCompletion, type SectionKey } from "@/lib/dealerProfileCompletion";

interface Props {
  dealer: DealerAccount;
  language: Language;
  canEdit: boolean;
  onUpdated?: (next: DealerAccount) => void;
}

type ContactTransferMode = "move" | "duplicate";
type ContactTransferDialogState = {
  mode: ContactTransferMode;
  contact: DealerContact;
  targetArea: DealerContactArea;
};

const PROFILE_PATCH_KEYS = [
  "address_line_1", "postal_code", "city", "country",
  "vat_number", "director_name", "phone", "email",
  "primary_contact_name", "primary_contact_email", "primary_contact_phone",
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
    contact.phone?.trim()
  );
}

type LegacyContactSource = {
  area: DealerContactArea;
  roleKey: ProfileI18nKey;
  name: string | null;
  email: string | null;
  phone: string | null;
};

function normalizeContactValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sameContactPerson(contact: DealerContact, source: LegacyContactSource): boolean {
  return (
    normalizeContactValue(contact.contact_area) === normalizeContactValue(source.area) &&
    normalizeContactValue(contact.name) === normalizeContactValue(source.name) &&
    normalizeContactValue(contact.email) === normalizeContactValue(source.email) &&
    normalizeContactValue(contact.phone) === normalizeContactValue(source.phone)
  );
}

function legacyContactSources(dealer: DealerAccount, t: (k: ProfileI18nKey) => string): LegacyContactSource[] {
  return [
    {
      area: "director",
      roleKey: "roleDirector",
      name: dealer.director_name,
      email: null,
      phone: null,
    },
    {
      area: "finance",
      roleKey: "roleFinanceManager",
      name: dealer.finance_contact_name,
      email: dealer.finance_contact_email,
      phone: dealer.finance_contact_phone,
    },
    {
      area: "sales",
      roleKey: "roleSalesRep",
      name: dealer.sales_contact_name,
      email: dealer.sales_contact_email,
      phone: dealer.sales_contact_phone,
    },
    {
      area: "workshop",
      roleKey: "roleWorkshopManager",
      name: dealer.workshop_contact_name,
      email: dealer.workshop_contact_email,
      phone: dealer.workshop_contact_phone,
    },
    {
      area: "marketing",
      roleKey: "roleMarketingManager",
      name: dealer.marketing_contact_name,
      email: dealer.marketing_contact_email,
      phone: dealer.marketing_contact_phone,
    },
  ].filter((source) => Boolean(source.name || source.email || source.phone)) as LegacyContactSource[];
}

function isLegacyPrimaryContact(dealer: DealerAccount, source: LegacyContactSource): boolean {
  return (
    normalizeContactValue(dealer.primary_contact_name) === normalizeContactValue(source.name) &&
    normalizeContactValue(dealer.primary_contact_email) === normalizeContactValue(source.email) &&
    normalizeContactValue(dealer.primary_contact_phone) === normalizeContactValue(source.phone) &&
    Boolean(source.name || source.email || source.phone)
  );
}

function mergeLegacyContacts(
  dealer: DealerAccount,
  rows: DealerContact[],
  t: (k: ProfileI18nKey) => string,
): DealerContact[] {
  const merged = [...rows];
  for (const source of legacyContactSources(dealer, t)) {
    if (merged.some((contact) => sameContactPerson(contact, source))) continue;
    merged.unshift({
      ...createLocalContact(dealer.id, source.area),
      id: `local-legacy-${source.area}-${dealer.id}`,
      role_title: t(source.roleKey),
      name: source.name,
      email: source.email,
      phone: source.phone,
      is_primary: isLegacyPrimaryContact(dealer, source),
    });
  }
  return merged;
}

function ensureMinimumAreaContacts(dealerAccountId: string, rows: DealerContact[]): DealerContact[] {
  const next = [...rows];
  for (const { area } of CONTACT_AREA_CONFIG) {
    if (!next.some((contact) => contact.contact_area === area)) {
      next.push(createLocalContact(dealerAccountId, area));
    }
  }
  return next;
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

function ProfileSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      {children}
    </section>
  );
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
  const [contactTransfer, setContactTransfer] = useState<ContactTransferDialogState | null>(null);
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
        setContacts(ensureMinimumAreaContacts(dealer.id, mergeLegacyContacts(dealer, rows, t)));
        setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dealer.id, t]);

  useEffect(() => {
    if (loadingContacts) return;
    setContacts((prev) => {
      const next = ensureMinimumAreaContacts(dealer.id, prev);
      return next.length === prev.length ? prev : next;
    });
  }, [dealer.id, loadingContacts, contacts]);

  const completion = useMemo(() => computeCompletion(draft, contacts), [draft, contacts]);

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

  const markLegacyMultiple = (area: DealerContactArea) => {
    if (area === "sales") set("sales_has_multiple", true);
    if (area === "workshop") set("workshop_has_multiple", true);
  };

  const addContact = (area: DealerContactArea) => {
    markLegacyMultiple(area);
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
  const setPrimaryContact = async (id: string, checked: boolean) => {
    const next = contacts.map((c) => (
      { ...c, is_primary: checked && c.id === id }
    ));
    setContacts(next);
    if (checked) {
      setDraft((d) => ({ ...d, primary_contact_name: null, primary_contact_email: null, primary_contact_phone: null }));
    }
    const changedContacts = next.filter((c) => !isLocalContact(c) || contactHasContent(c));
    const results = await Promise.all(changedContacts.map((c) => persistContact(c)));
    const error = results.find((r) => !r.ok)?.error;
    if (error) toast({ title: t("saveError"), description: error, variant: "destructive" });
    const savedByPreviousId = new Map<string, DealerContact>();
    changedContacts.forEach((contact, index) => {
      const saved = results[index]?.row;
      if (saved) savedByPreviousId.set(contact.id, saved);
    });
    if (savedByPreviousId.size > 0) {
      setContacts((prev) => prev.map((row) => savedByPreviousId.get(row.id) ?? row));
    }
  };

  const openContactTransfer = (mode: ContactTransferMode, contact: DealerContact) => {
    const fallbackArea = CONTACT_AREA_CONFIG.find((option) => option.area !== contact.contact_area)?.area ?? "sales";
    setContactTransfer({ mode, contact, targetArea: fallbackArea });
  };

  const closeContactTransfer = () => setContactTransfer(null);

  const applyContactTransfer = async () => {
    if (!contactTransfer) return;
    const { mode, contact, targetArea } = contactTransfer;
    const nextContact: DealerContact = {
      ...contact,
      contact_area: targetArea,
      role_title: null,
      is_primary: false,
    };

    if (mode === "move") {
      if (isLocalContact(contact)) {
        markLegacyMultiple(targetArea);
        setContacts((prev) => prev.map((row) => row.id === contact.id ? nextContact : row));
        closeContactTransfer();
        return;
      }
      const res = await upsertDealerContact({
        id: contact.id,
        dealer_account_id: contact.dealer_account_id,
        contact_area: targetArea,
        role_title: null,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        is_primary: false,
      });
      if (!res.ok || !res.row) {
        toast({ title: t("saveError"), description: res.error || "", variant: "destructive" });
        return;
      }
      markLegacyMultiple(targetArea);
      setContacts((prev) => prev.map((row) => row.id === contact.id ? res.row! : row));
      closeContactTransfer();
      return;
    }

    const duplicate = createLocalContact(dealer.id, targetArea);
    duplicate.name = contact.name;
    duplicate.email = contact.email;
    duplicate.phone = contact.phone;
    if (isLocalContact(contact)) {
      markLegacyMultiple(targetArea);
      setContacts((prev) => [...prev, duplicate]);
      closeContactTransfer();
      return;
    }
    const res = await upsertDealerContact({
      dealer_account_id: contact.dealer_account_id,
      contact_area: targetArea,
      role_title: null,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      is_primary: false,
    });
    if (!res.ok || !res.row) {
      toast({ title: t("saveError"), description: res.error || "", variant: "destructive" });
      return;
    }
    markLegacyMultiple(targetArea);
    setContacts((prev) => [...prev, res.row!]);
    closeContactTransfer();
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

  const transferContactName = contactTransfer?.contact.name?.trim() || t("contact");
  const transferOptions = CONTACT_AREA_CONFIG.filter((option) => option.area !== contactTransfer?.contact.contact_area);

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
        <ProfileSubsection title={t("companySectionCompany")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="company_name" label={t("companyName")} value={draft.company_name} onChange={() => {}} disabled required />
            <Field id="vat_number" label={t("vatNumber")} value={draft.vat_number} onChange={(v) => set("vat_number", v)} disabled={!canEdit} required />
          </div>
        </ProfileSubsection>

        <ProfileSubsection title={t("companySectionAddress")}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,1.6fr)_minmax(110px,0.6fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
            <AddressField
              id="address_line_1"
              label={t("address")}
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
                  country: r.country ?? r.country_name ?? d.country,
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
            <Field id="postal_code" label={t("postalCode")} value={draft.postal_code} onChange={(v) => setAddressPart("postal_code", v)} disabled={!canEdit} required />
            <Field id="city" label={t("city")} value={draft.city} onChange={(v) => setAddressPart("city", v)} disabled={!canEdit} required />
            <Field id="country" label={t("country")} value={draft.country} onChange={(v) => setAddressPart("country", v)} disabled={!canEdit} required />
          </div>
        </ProfileSubsection>

        <ProfileSubsection title={t("companySectionManagementContacts")}>
          <ContactList
            area="director" t={t} roleKeys={ROLE_KEYS_DIRECTOR} canEdit={canEdit}
            contacts={contactsByArea("director")} loading={loadingContacts}
            onAdd={() => addContact("director")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            onTransfer={openContactTransfer}
          />
        </ProfileSubsection>
      </SectionShell>

      {/* 2) Finance */}
      <SectionShell
        skey="finance" title={t("sec2")} status={statusOf("finance")}
        saving={savingSection === "finance"} canEdit={canEdit} t={t}
        onSave={() => void saveAllProfile("finance")}
      >
        <ContactList
          area="finance" t={t} roleKeys={ROLE_KEYS_FINANCE} canEdit={canEdit}
          contacts={contactsByArea("finance")} loading={loadingContacts}
          onAdd={() => addContact("finance")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
          onTransfer={openContactTransfer}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field id="invoice_email" label={t("invoiceEmail")} value={draft.invoice_email} onChange={(v) => set("invoice_email", v)} disabled={!canEdit} type="email" required />
          <Field id="payment_terms" label={t("paymentTerms")} value={draft.payment_terms} onChange={(v) => set("payment_terms", v)} disabled={!canEdit} />
          <Field id="currency_code" label={t("currencyCode")} value={draft.currency_code} onChange={(v) => set("currency_code", v)} disabled={!canEdit} />
        </div>
      </SectionShell>

      {/* 3) Purchasing/logistics + Sales side-by-side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <SectionShell
          skey="purchasing" title={t("sec3")} status={statusOf("purchasing")}
          saving={savingSection === "purchasing"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("purchasing")}
        >
          <ContactList
            area="parts" t={t} roleKeys={ROLE_KEYS_PURCHASING} canEdit={canEdit}
            contacts={contactsByArea("parts")} loading={loadingContacts}
            onAdd={() => addContact("parts")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            onTransfer={openContactTransfer}
          />
        </SectionShell>

        {/* Sales */}
        <SectionShell
          skey="sales" title={t("sec4")} status={statusOf("sales")}
          saving={savingSection === "sales"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("sales")}
        >
          <ContactList
            area="sales" t={t} roleKeys={ROLE_KEYS_SALES} canEdit={canEdit}
            contacts={contactsByArea("sales")} loading={loadingContacts}
            onAdd={() => addContact("sales")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            onTransfer={openContactTransfer}
          />
        </SectionShell>
      </div>

      {/* 4) Workshop/service + Marketing side-by-side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Workshop & parts */}
        <SectionShell
          skey="workshop" title={t("sec5")} status={statusOf("workshop")}
          saving={savingSection === "workshop"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("workshop")}
        >
          <ContactList
            area="workshop" t={t} roleKeys={ROLE_KEYS_WORKSHOP} canEdit={canEdit}
            contacts={contactsByArea("workshop")} loading={loadingContacts}
            onAdd={() => addContact("workshop")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            onTransfer={openContactTransfer}
          />
        </SectionShell>
        {/* Marketing */}
        <SectionShell
          skey="marketing" title={t("sec6")} status={statusOf("marketing")}
          saving={savingSection === "marketing"} canEdit={canEdit} t={t}
          onSave={() => void saveAllProfile("marketing")}
        >
          <ProfileSubsection title={t("digitalChannels")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="website" label={t("website")} value={draft.website} onChange={(v) => set("website", v)} disabled={!canEdit} required />
              <Field id="social_linkedin" label={t("linkedin")} value={draft.social_linkedin} onChange={(v) => set("social_linkedin", v)} disabled={!canEdit} />
              <Field id="social_facebook" label={t("facebook")} value={draft.social_facebook} onChange={(v) => set("social_facebook", v)} disabled={!canEdit} />
              <Field id="social_instagram" label={t("instagram")} value={draft.social_instagram} onChange={(v) => set("social_instagram", v)} disabled={!canEdit} />
              <Field id="social_tiktok" label={t("tiktok")} value={draft.social_tiktok} onChange={(v) => set("social_tiktok", v)} disabled={!canEdit} />
              <Field id="social_youtube" label={t("youtube")} value={draft.social_youtube} onChange={(v) => set("social_youtube", v)} disabled={!canEdit} />
            </div>
          </ProfileSubsection>
          <ContactList
            area="marketing" t={t} roleKeys={ROLE_KEYS_MARKETING} canEdit={canEdit}
            contacts={contactsByArea("marketing")} loading={loadingContacts}
            onAdd={() => addContact("marketing")} onPatch={patchContact} onSave={saveContact} onRemove={removeContact} onSetPrimary={setPrimaryContact}
            onTransfer={openContactTransfer}
          />
        </SectionShell>
      </div>
    </div>
    <Dialog open={contactTransfer !== null} onOpenChange={(open) => { if (!open) closeContactTransfer(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {contactTransfer?.mode === "move"
              ? t("movePersonTo").replace("{name}", transferContactName)
              : t("duplicatePersonTo").replace("{name}", transferContactName)}
          </DialogTitle>
          <DialogDescription>
            {contactTransfer?.mode === "move" ? t("movePersonHelp") : t("duplicatePersonHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">{t("targetDepartment")}</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={contactTransfer?.targetArea ?? ""}
            onChange={(event) => {
              const targetArea = event.target.value as DealerContactArea;
              setContactTransfer((current) => current ? { ...current, targetArea } : current);
            }}
          >
            {transferOptions.map((option) => (
              <option key={option.area} value={option.area}>{t(option.labelKey)}</option>
            ))}
          </select>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={closeContactTransfer}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void applyContactTransfer()}>
            {contactTransfer?.mode === "move" ? t("confirmMove") : t("confirmDuplicate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("name")} *</Label>
        <Input value={c.name ?? ""} disabled={!canEdit}
          onChange={(e) => onPatch(c.id, { name: e.target.value })} onBlur={() => onSave(c)} />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">{t("email")} *</Label>
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

function FirstContactCheckbox({ label, checked, disabled, onChange }: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function ContactList({
  area, t, roleKeys, contacts, loading, canEdit, firstContactNumber = 1,
  onAdd, onPatch, onSave, onRemove, onSetPrimary, onTransfer,
}: {
  area: DealerContactArea;
  t: (k: ProfileI18nKey) => string;
  roleKeys: ProfileI18nKey[];
  contacts: DealerContact[];
  loading: boolean;
  canEdit: boolean;
  firstContactNumber?: number;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<DealerContact>) => void;
  onSave: (c: DealerContact) => void;
  onRemove: (id: string) => void;
  onSetPrimary: (id: string, checked: boolean) => void;
  onTransfer: (mode: ContactTransferMode, contact: DealerContact) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-3">
      {loading && <p className="text-xs text-slate-500">…</p>}
      {contacts.map((c, index) => (
        <ContactBlock
          key={c.id}
          title={`${t("contact")} ${index + firstContactNumber}`}
          primaryControl={
            c.is_primary ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-50" variant="outline">
                {t("firstContact")}
              </Badge>
            ) : undefined
          }
          removeControl={
            canEdit ? (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onTransfer("move", c)}
                  aria-label={t("movePerson")}
                  title={t("movePerson")}
                >
                  <ArrowRightLeft className="h-4 w-4 text-slate-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onTransfer("duplicate", c)}
                  aria-label={t("duplicatePerson")}
                  title={t("duplicatePerson")}
                >
                  <CopyPlus className="h-4 w-4 text-slate-600" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onRemove(c.id)} aria-label={t("removePerson")} title={t("removePerson")}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            ) : undefined
          }
        >
          <ContactFields c={c} t={t} roleKeys={roleKeys} canEdit={canEdit} onPatch={onPatch} onSave={onSave} />
          <div className="sm:col-span-2 xl:col-span-4">
            <FirstContactCheckbox
              label={t("firstContact")}
              checked={c.is_primary}
              disabled={!canEdit}
              onChange={(checked) => onSetPrimary(c.id, checked)}
            />
          </div>
        </ContactBlock>
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
