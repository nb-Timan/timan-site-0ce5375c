import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useDealerScope } from "@/lib/dealerScope";
import {
  type CompanyContactInfoCopy,
  formatCompanyContactInfoStep,
  getCompanyContactInfoCopy,
  getCompanyContactInfoRoleLabel,
} from "@/lib/i18n/companyContactInfoTranslations";
import {
  CONTACT_AREA_CONFIG,
  ROLE_KEYS_DIRECTOR,
  ROLE_KEYS_FINANCE,
  ROLE_KEYS_MARKETING,
  ROLE_KEYS_PURCHASING,
  ROLE_KEYS_SALES,
  ROLE_KEYS_WORKSHOP,
  roleKeysForContactArea,
} from "@/lib/dealerContactModel";
import {
  fetchDealerAccountByNumber,
  type DealerAccount,
  type UpdateDealerAccountPatch,
} from "@/lib/dealerAccountsService";
import {
  listDealerContacts,
  type DealerContact,
  type DealerContactArea,
} from "@/lib/dealerContactsService";
import { submitPortalForm, type PortalFormSubmission } from "@/lib/portalFormsService";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";

type PartnerKind = "new" | "existing" | "";

type OnboardingContact = {
  id: string;
  contact_area: DealerContactArea;
  role_title: string;
  name: string;
  email: string;
  phone: string;
  is_primary: boolean;
};

type ContactState = Record<DealerContactArea, OnboardingContact[]>;
type CanonicalContactPayload = {
  dealer_account_id: string | null;
  contact_area: DealerContactArea;
  role_title: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

const AREAS: DealerContactArea[] = ["director", "finance", "parts", "sales", "workshop", "marketing"];
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]";
const textareaCls = `${inputCls} min-h-[120px]`;
const labelCls = "block text-sm font-semibold text-gray-800 mb-1.5";
const reqMark = <span className="text-red-600 ml-0.5">*</span>;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const clean = (value: string | null | undefined) => value?.trim() ?? "";
const hasContactContent = (contact: OnboardingContact) =>
  Boolean(clean(contact.role_title) || clean(contact.name) || clean(contact.email) || clean(contact.phone));

function labelForArea(copy: CompanyContactInfoCopy, area: DealerContactArea): string {
  switch (area) {
    case "director":
      return copy.companySection;
    case "finance":
      return copy.financeSection;
    case "parts":
      return copy.purchasingSection;
    case "sales":
      return copy.salesSection;
    case "workshop":
      return copy.workshopSection;
    case "marketing":
      return copy.marketingSection;
    default:
      return area;
  }
}

function blankContact(area: DealerContactArea): OnboardingContact {
  return {
    id: `local-${crypto.randomUUID()}`,
    contact_area: area,
    role_title: "",
    name: "",
    email: "",
    phone: "",
    is_primary: false,
  };
}

function blankContactState(): ContactState {
  return AREAS.reduce((acc, area) => ({ ...acc, [area]: [blankContact(area)] }), {} as ContactState);
}

function firstUsableContact(contacts: OnboardingContact[]): OnboardingContact | null {
  return contacts.find((contact) => clean(contact.name) || clean(contact.email) || clean(contact.phone)) ?? null;
}

function contactMatchesLegacyPrimary(dealer: DealerAccount, contact: OnboardingContact): boolean {
  return Boolean(
    clean(dealer.primary_contact_name) &&
    clean(dealer.primary_contact_name).toLowerCase() === clean(contact.name).toLowerCase() &&
    clean(dealer.primary_contact_email).toLowerCase() === clean(contact.email).toLowerCase() &&
    clean(dealer.primary_contact_phone).toLowerCase() === clean(contact.phone).toLowerCase(),
  );
}

function toOnboardingContact(row: DealerContact): OnboardingContact {
  return {
    id: row.id,
    contact_area: row.contact_area,
    role_title: clean(row.role_title),
    name: clean(row.name),
    email: clean(row.email),
    phone: clean(row.phone),
    is_primary: row.is_primary,
  };
}

function legacyContact(
  dealer: DealerAccount,
  area: DealerContactArea,
  roleTitle: string,
  name?: string | null,
  email?: string | null,
  phone?: string | null,
): OnboardingContact | null {
  const contact = { ...blankContact(area), id: `legacy-${area}-${dealer.id}`, role_title: roleTitle, name: clean(name), email: clean(email), phone: clean(phone) };
  if (!hasContactContent(contact)) return null;
  return { ...contact, is_primary: contactMatchesLegacyPrimary(dealer, contact) };
}

function buildContactsFromDealer(
  dealer: DealerAccount,
  extraContacts: DealerContact[],
  roleLabel: (area: DealerContactArea) => string,
): ContactState {
  const grouped = blankContactState();
  for (const area of AREAS) grouped[area] = [];

  for (const contact of extraContacts) {
    if (AREAS.includes(contact.contact_area)) grouped[contact.contact_area].push(toOnboardingContact(contact));
  }

  const legacy: Array<OnboardingContact | null> = [
    legacyContact(dealer, "director", roleLabel("director"), dealer.director_name, null, null),
    legacyContact(dealer, "finance", roleLabel("finance"), dealer.finance_contact_name, dealer.finance_contact_email, dealer.finance_contact_phone),
    legacyContact(dealer, "sales", roleLabel("sales"), dealer.sales_contact_name, dealer.sales_contact_email, dealer.sales_contact_phone),
    legacyContact(dealer, "workshop", roleLabel("workshop"), dealer.workshop_contact_name, dealer.workshop_contact_email, dealer.workshop_contact_phone),
    legacyContact(dealer, "marketing", roleLabel("marketing"), dealer.marketing_contact_name, dealer.marketing_contact_email, dealer.marketing_contact_phone),
  ];
  for (const contact of legacy.filter((item): item is OnboardingContact => !!item)) {
    if (!grouped[contact.contact_area].some((existing) =>
      clean(existing.name).toLowerCase() === clean(contact.name).toLowerCase() &&
      clean(existing.email).toLowerCase() === clean(contact.email).toLowerCase())) {
      grouped[contact.contact_area].push(contact);
    }
  }

  for (const area of AREAS) {
    if (grouped[area].length === 0) grouped[area] = [blankContact(area)];
  }
  return grouped;
}

export default function CompanyContactInfoFormPage() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const scope = useDealerScope();
  const navigate = useNavigate();
  const copy = getCompanyContactInfoCopy(uiLanguage);
  const sections = copy.sections;

  const [partnerKind, setPartnerKind] = useState<PartnerKind>(
    scope.isExternalDealerUser ? "existing" : (appUser?.dealer_number ? "existing" : ""),
  );
  const [loadedDealerId, setLoadedDealerId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(scope.lockedDealerName ?? appUser?.company_dealer ?? "");
  const [vatNumber, setVatNumber] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [currencyCode, setCurrencyCode] = useState("DKK");
  const [website, setWebsite] = useState("");
  const [socialLinkedin, setSocialLinkedin] = useState("");
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialTiktok, setSocialTiktok] = useState("");
  const [socialYoutube, setSocialYoutube] = useState("");
  const [contacts, setContacts] = useState<ContactState>(() => blankContactState());
  const [finalComment, setFinalComment] = useState("");
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [receipt, setReceipt] = useState<PortalFormSubmission | null>(null);

  const dealerNumber = scope.isExternalDealerUser
    ? scope.lockedDealerNumber
    : partnerKind === "existing"
      ? (appUser?.dealer_number ?? null)
      : null;

  const roleLabelForArea = (area: DealerContactArea) => {
    const key = roleKeysForContactArea(area)[0];
    return getCompanyContactInfoRoleLabel(copy, key);
  };

  useEffect(() => {
    if (scope.isExternalDealerUser) {
      setPartnerKind("existing");
      if (scope.lockedDealerName) setCompanyName(scope.lockedDealerName);
    }
  }, [scope.isExternalDealerUser, scope.lockedDealerName]);

  useEffect(() => {
    let cancelled = false;
    if (partnerKind !== "existing" || !dealerNumber) return;

    (async () => {
      setPreloading(true);
      const result = await fetchDealerAccountByNumber(dealerNumber);
      if (cancelled) return;
      const dealer = result.row;
      if (!dealer) {
        setPreloading(false);
        return;
      }

      setLoadedDealerId(dealer.id);
      setCompanyName(clean(dealer.company_name));
      setVatNumber(clean(dealer.vat_number));
      setAddressLine1(clean(dealer.address_line_1 || dealer.address));
      setPostalCode(clean(dealer.postal_code));
      setCity(clean(dealer.city));
      setCountry(clean(dealer.country));
      setInvoiceEmail(clean(dealer.invoice_email));
      setPaymentTerms(clean(dealer.payment_terms));
      setCurrencyCode(clean(dealer.currency_code) || "DKK");
      setWebsite(clean(dealer.website));
      setSocialLinkedin(clean(dealer.social_linkedin));
      setSocialFacebook(clean(dealer.social_facebook));
      setSocialInstagram(clean(dealer.social_instagram));
      setSocialTiktok(clean(dealer.social_tiktok));
      setSocialYoutube(clean(dealer.social_youtube));

      const dealerContacts = await listDealerContacts(dealer.id);
      if (!cancelled) {
        setContacts(buildContactsFromDealer(dealer, dealerContacts, roleLabelForArea));
        setPreloading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dealerNumber, partnerKind]);

  function contactsForArea(area: DealerContactArea): OnboardingContact[] {
    return contacts[area]?.length ? contacts[area] : [blankContact(area)];
  }

  function patchContact(area: DealerContactArea, id: string, patch: Partial<OnboardingContact>) {
    setContacts((current) => ({
      ...current,
      [area]: contactsForAreaFrom(current, area).map((contact) => contact.id === id ? { ...contact, ...patch } : contact),
    }));
  }

  function contactsForAreaFrom(state: ContactState, area: DealerContactArea): OnboardingContact[] {
    return state[area]?.length ? state[area] : [blankContact(area)];
  }

  function addContact(area: DealerContactArea) {
    setContacts((current) => ({ ...current, [area]: [...contactsForAreaFrom(current, area), blankContact(area)] }));
  }

  function removeContact(area: DealerContactArea, id: string) {
    setContacts((current) => {
      const next = contactsForAreaFrom(current, area).filter((contact) => contact.id !== id);
      return { ...current, [area]: next.length ? next : [blankContact(area)] };
    });
  }

  function setPrimaryContact(area: DealerContactArea, id: string) {
    setContacts((current) => {
      const next = { ...current };
      for (const contactArea of AREAS) {
        next[contactArea] = contactsForAreaFrom(current, contactArea).map((contact) => ({
          ...contact,
          is_primary: contactArea === area && contact.id === id,
        }));
      }
      return next;
    });
  }

  function validateContact(area: DealerContactArea): string | null {
    const contact = firstUsableContact(contactsForArea(area));
    if (!contact || !clean(contact.name)) return copy.errors.contactName;
    if (!clean(contact.email)) return copy.errors.contactEmail;
    if (!isEmail(contact.email)) return copy.errors.contactEmailInvalid;
    return null;
  }

  const stepError = useMemo<string | null>(() => {
    switch (step) {
      case 0:
        if (!partnerKind) return copy.errors.dealerKind;
        if (!clean(companyName)) return copy.errors.companyName;
        if (!clean(addressLine1)) return copy.errors.address;
        if (!clean(postalCode)) return copy.errors.postalCode;
        if (!clean(city)) return copy.errors.city;
        if (!clean(country)) return copy.errors.country;
        if (!clean(vatNumber)) return copy.errors.vatNumber;
        return validateContact("director");
      case 1:
        if (!clean(invoiceEmail) || !isEmail(invoiceEmail)) return copy.errors.invoiceEmail;
        return validateContact("finance");
      case 2:
        return validateContact("parts");
      case 3:
        return validateContact("sales");
      case 4:
        return validateContact("workshop");
      case 5:
        if (!clean(website)) return copy.errors.website;
        return validateContact("marketing");
      case 6:
        return Object.values(contacts).flat().some((contact) => contact.is_primary && hasContactContent(contact))
          ? null
          : copy.errors.firstContact;
      default:
        return null;
    }
  }, [step, partnerKind, companyName, addressLine1, postalCode, city, country, vatNumber, invoiceEmail, website, contacts, copy]);

  const isLast = step === sections.length - 1;

  function next() {
    if (stepError) {
      toast.error(stepError);
      return;
    }
    setStep((current) => Math.min(sections.length - 1, current + 1));
  }

  function prev() {
    setStep((current) => Math.max(0, current - 1));
  }

  function canonicalContacts(): CanonicalContactPayload[] {
    return AREAS.flatMap((area) => contactsForArea(area))
      .filter(hasContactContent)
      .map((contact) => ({
        dealer_account_id: loadedDealerId,
        contact_area: contact.contact_area,
        role_title: clean(contact.role_title) || null,
        name: clean(contact.name) || null,
        email: clean(contact.email) || null,
        phone: clean(contact.phone) || null,
        is_primary: contact.is_primary,
      }));
  }

  function dealerAccountPatch(): UpdateDealerAccountPatch {
    return {
      company_name: clean(companyName),
      address_line_1: clean(addressLine1),
      postal_code: clean(postalCode),
      city: clean(city),
      country: clean(country),
      vat_number: clean(vatNumber),
      invoice_email: clean(invoiceEmail),
      payment_terms: clean(paymentTerms) || null,
      currency_code: clean(currencyCode) || null,
      website: clean(website),
      social_linkedin: clean(socialLinkedin) || null,
      social_facebook: clean(socialFacebook) || null,
      social_instagram: clean(socialInstagram) || null,
      social_tiktok: clean(socialTiktok) || null,
      social_youtube: clean(socialYoutube) || null,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (stepError) {
      toast.error(stepError);
      return;
    }

    const payload = {
      schema_version: 2,
      source_model: "partnerdata",
      dealer_kind: partnerKind,
      dealer_account_id: loadedDealerId,
      dealer_account_number: dealerNumber,
      dealer_account_patch: dealerAccountPatch(),
      dealer_contacts: canonicalContacts(),
      final_comment: clean(finalComment) || null,
    };

    setSubmitting(true);
    try {
      const row = await submitPortalForm({
        form_type: "company_contact_info",
        dealer_account_number: dealerNumber,
        dealer_name: clean(companyName) || appUser?.company_dealer || null,
        payload,
      });
      setReceipt(row);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errors.dealerKind);
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <MiscPageShell title={copy.title} subtitle={copy.subtitle} backTo="/portal/misc/forms">
        <div className="max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-7 w-7 text-[#2d5a27]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{copy.receiptTitle}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {copy.receiptReference}: <span className="font-mono">{receipt.id.slice(0, 8)}</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">{new Date(receipt.created_at).toLocaleString(uiLanguage)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setReceipt(null); setStep(0); }} className="rounded-lg bg-[#2d5a27] px-4 py-2 text-sm font-semibold text-white hover:bg-[#244a20]">
              {copy.newSubmission}
            </button>
            <button type="button" onClick={() => navigate("/portal/misc/forms")} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              {copy.backToForms}
            </button>
          </div>
        </div>
      </MiscPageShell>
    );
  }

  return (
    <MiscPageShell title={copy.title} subtitle={copy.subtitle} intro={copy.intro} backTo="/portal/misc/forms">
      <div className="max-w-5xl">
        <ol className="mb-6 flex flex-wrap gap-2 text-xs">
          {sections.map((section, index) => (
            <li key={section} className={`rounded-full border px-3 py-1.5 ${index === step ? "border-[#2d5a27] bg-[#2d5a27] text-white" : index < step ? "border-[#2d5a27]/30 bg-[#2d5a27]/10 text-[#2d5a27]" : "border-gray-200 bg-white text-gray-500"}`}>
              {section}
            </li>
          ))}
        </ol>

        <form onSubmit={(event) => { if (isLast) void handleSubmit(event); else { event.preventDefault(); next(); } }} className="space-y-6 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold text-gray-900">{sections[step]}</h2>
            {preloading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {step === 0 && (
            <section className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <span className={labelCls}>{copy.partnerTypeHelp}{reqMark}</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
                  <Radio label={copy.newPartner} checked={partnerKind === "new"} disabled={scope.isExternalDealerUser} onChange={() => setPartnerKind("new")} />
                  <Radio label={copy.existingPartner} checked={partnerKind === "existing"} disabled={scope.isExternalDealerUser} onChange={() => setPartnerKind("existing")} />
                </div>
                {scope.isExternalDealerUser && <p className="mt-2 text-xs text-gray-500">{copy.lockedPartnerHelp}</p>}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField label={copy.companyName} value={companyName} onChange={setCompanyName} required disabled={scope.isExternalDealerUser} />
                <TextField label={copy.vatNumber} value={vatNumber} onChange={setVatNumber} required />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_0.8fr_1fr_1fr]">
                <AddressField copyLabel={copy.address} value={addressLine1} onChange={setAddressLine1} onResolve={(resolved) => {
                  if (resolved.address_line_1) setAddressLine1(resolved.address_line_1);
                  if (resolved.postal_code) setPostalCode(resolved.postal_code);
                  if (resolved.city) setCity(resolved.city);
                  if (resolved.country_name) setCountry(resolved.country_name);
                }} />
                <TextField label={copy.postalCode} value={postalCode} onChange={setPostalCode} required />
                <TextField label={copy.city} value={city} onChange={setCity} required />
                <TextField label={copy.country} value={country} onChange={setCountry} required />
              </div>
              <ContactEditor area="director" copy={copy} contacts={contactsForArea("director")} roleKeys={ROLE_KEYS_DIRECTOR} onPatch={patchContact} onAdd={addContact} onRemove={removeContact} onSetPrimary={setPrimaryContact} />
            </section>
          )}

          {step === 1 && (
            <section className="space-y-6">
              <ContactEditor area="finance" copy={copy} contacts={contactsForArea("finance")} roleKeys={ROLE_KEYS_FINANCE} onPatch={patchContact} onAdd={addContact} onRemove={removeContact} onSetPrimary={setPrimaryContact} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <TextField label={copy.invoiceEmail} type="email" value={invoiceEmail} onChange={setInvoiceEmail} required />
                <TextField label={copy.paymentTerms} value={paymentTerms} onChange={setPaymentTerms} />
                <TextField label={copy.currencyCode} value={currencyCode} onChange={setCurrencyCode} />
              </div>
            </section>
          )}

          {step === 2 && <ContactEditor area="parts" copy={copy} contacts={contactsForArea("parts")} roleKeys={ROLE_KEYS_PURCHASING} onPatch={patchContact} onAdd={addContact} onRemove={removeContact} onSetPrimary={setPrimaryContact} />}
          {step === 3 && <ContactEditor area="sales" copy={copy} contacts={contactsForArea("sales")} roleKeys={ROLE_KEYS_SALES} onPatch={patchContact} onAdd={addContact} onRemove={removeContact} onSetPrimary={setPrimaryContact} />}
          {step === 4 && <ContactEditor area="workshop" copy={copy} contacts={contactsForArea("workshop")} roleKeys={ROLE_KEYS_WORKSHOP} onPatch={patchContact} onAdd={addContact} onRemove={removeContact} onSetPrimary={setPrimaryContact} />}

          {step === 5 && (
            <section className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField label={copy.website} value={website} onChange={setWebsite} required />
                <TextField label={copy.linkedin} value={socialLinkedin} onChange={setSocialLinkedin} />
                <TextField label={copy.facebook} value={socialFacebook} onChange={setSocialFacebook} />
                <TextField label={copy.instagram} value={socialInstagram} onChange={setSocialInstagram} />
                <TextField label={copy.tiktok} value={socialTiktok} onChange={setSocialTiktok} />
                <TextField label={copy.youtube} value={socialYoutube} onChange={setSocialYoutube} />
              </div>
              <ContactEditor area="marketing" copy={copy} contacts={contactsForArea("marketing")} roleKeys={ROLE_KEYS_MARKETING} onPatch={patchContact} onAdd={addContact} onRemove={removeContact} onSetPrimary={setPrimaryContact} />
            </section>
          )}

          {step === 6 && (
            <section className="space-y-6">
              <p className="text-sm text-gray-600">{copy.reviewIntro}</p>
              <ReviewGrid copy={copy} company={{ companyName, vatNumber, addressLine1, postalCode, city, country, invoiceEmail, paymentTerms, currencyCode, website, socialLinkedin, socialFacebook, socialInstagram, socialTiktok, socialYoutube }} contacts={canonicalContacts()} />
              <div>
                <label className={labelCls}>{copy.finalComment}</label>
                <textarea className={textareaCls} value={finalComment} onChange={(event) => setFinalComment(event.target.value)} />
              </div>
            </section>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <button type="button" onClick={prev} disabled={step === 0 || submitting} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
              {copy.back}
            </button>
            <span className="text-xs text-gray-400">{formatCompanyContactInfoStep(copy, step + 1, sections.length)}</span>
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#2d5a27] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244a20] disabled:cursor-not-allowed disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLast ? (submitting ? copy.sending : copy.submit) : copy.next}
            </button>
          </div>
        </form>
      </div>
    </MiscPageShell>
  );
}

function Radio({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
      <input type="radio" checked={checked} disabled={disabled} onChange={onChange} />
      {label}
    </label>
  );
}

function TextField({ label, value, onChange, required, disabled, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}{required && reqMark}</label>
      <input type={type} className={`${inputCls}${disabled ? " cursor-not-allowed bg-gray-100" : ""}`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function AddressField({ copyLabel, value, onChange, onResolve }: {
  copyLabel: string;
  value: string;
  onChange: (value: string) => void;
  onResolve: (resolved: ResolvedAddress) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{copyLabel}{reqMark}</label>
      <AddressAutocomplete
        className={inputCls}
        value={value}
        onChange={onChange}
        onResolve={onResolve}
        placeholder={copyLabel}
        showValidationState
        addressParts={{ address_line_1: value }}
      />
    </div>
  );
}

function ContactEditor({
  area, copy, contacts, roleKeys, onPatch, onAdd, onRemove, onSetPrimary,
}: {
  area: DealerContactArea;
  copy: ReturnType<typeof getCompanyContactInfoCopy>;
  contacts: OnboardingContact[];
  roleKeys: typeof CONTACT_AREA_CONFIG[number]["roleKeys"];
  onPatch: (area: DealerContactArea, id: string, patch: Partial<OnboardingContact>) => void;
  onAdd: (area: DealerContactArea) => void;
  onRemove: (area: DealerContactArea, id: string) => void;
  onSetPrimary: (area: DealerContactArea, id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {contacts.map((contact, index) => {
        const roleOptions = roleKeys.map((key) => getCompanyContactInfoRoleLabel(copy, key));
        const hasCustomRole = contact.role_title && !roleOptions.includes(contact.role_title);
        return (
          <div key={contact.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-gray-900">{copy.contact} {index + 1}</p>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-emerald-600" checked={contact.is_primary} onChange={() => onSetPrimary(area, contact.id)} />
                  {copy.firstContact}
                </label>
              </div>
              <button type="button" onClick={() => onRemove(area, contact.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline">
                <Trash2 className="h-3.5 w-3.5" /> {copy.removePerson}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <label className={labelCls}>{copy.role}</label>
                <select className={inputCls} value={contact.role_title} onChange={(event) => onPatch(area, contact.id, { role_title: event.target.value })}>
                  <option value="">{copy.selectPlaceholder}</option>
                  {hasCustomRole && <option value={contact.role_title}>{contact.role_title}</option>}
                  {roleOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                </select>
              </div>
              <TextField label={copy.name} value={contact.name} onChange={(value) => onPatch(area, contact.id, { name: value })} required />
              <TextField label={copy.email} type="email" value={contact.email} onChange={(value) => onPatch(area, contact.id, { email: value })} required />
              <TextField label={copy.phone} type="tel" value={contact.phone} onChange={(value) => onPatch(area, contact.id, { phone: value })} />
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => onAdd(area)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#2d5a27]/40 px-3 py-2 text-sm font-semibold text-[#2d5a27] hover:bg-[#2d5a27]/5">
        <Plus className="h-4 w-4" /> {copy.addPerson}
      </button>
    </div>
  );
}

function ReviewGrid({
  copy,
  company,
  contacts,
}: {
  copy: ReturnType<typeof getCompanyContactInfoCopy>;
  company: Record<string, string>;
  contacts: CanonicalContactPayload[];
}) {
  const rows = [
    [copy.companyName, company.companyName],
    [copy.vatNumber, company.vatNumber],
    [copy.address, [company.addressLine1, company.postalCode, company.city, company.country].filter(Boolean).join(", ")],
    [copy.invoiceEmail, company.invoiceEmail],
    [copy.paymentTerms, company.paymentTerms],
    [copy.currencyCode, company.currencyCode],
    [copy.website, company.website],
    [copy.linkedin, company.socialLinkedin],
    [copy.facebook, company.socialFacebook],
    [copy.instagram, company.socialInstagram],
    [copy.tiktok, company.socialTiktok],
    [copy.youtube, company.socialYoutube],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-900">{copy.companySection}</h3>
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-gray-500">{label}</dt>
              <dd className="font-medium text-gray-900">{value || "-"}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-900">{copy.contact}</h3>
        <ul className="space-y-2 text-sm">
          {contacts.map((contact, index) => (
            <li key={`${contact.contact_area}-${index}`} className="rounded-md bg-gray-50 p-2">
              <span className="font-semibold text-gray-900">{String(contact.name ?? "-")}</span>
              {contact.is_primary === true && <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{copy.firstContact}</span>}
              <span className="block text-xs text-gray-500">{labelForArea(copy, contact.contact_area)} · {String(contact.role_title ?? "-")}</span>
              <span className="block text-xs text-gray-500">{String(contact.email ?? "-")} · {String(contact.phone ?? "-")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
