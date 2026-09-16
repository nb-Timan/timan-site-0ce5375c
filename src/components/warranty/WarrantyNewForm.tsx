/**
 * Dealer-side demo/warranty registration form at /portal/service/warranty/new.
 * The server derives the dealer account from the authenticated user.
 * The "Redskabs identifikationsnummer" field is dynamic — starts with one row,
 * dealers can add/remove additional tools.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Plus, X } from "lucide-react";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";
import { validateWarrantySerial } from "@/lib/warrantySerialValidation";
import {
  fetchPortalWarrantyEligibleMachines,
  filterPortalWarrantyMachines,
  portalWarrantyMachineMatchesType,
  resolvePortalWarrantyMachine,
  type PortalWarrantyMachineOption,
} from "@/lib/portalWarrantyMachineSelector";
import type { PortalRole } from "@/lib/portalAccess";
import { useLanguage } from "@/context/LanguageContext";
import { createPortalWarrantyRegistration } from "@/lib/portalWarrantyRegistrationService";
import {
  PORTAL_WARRANTY_MACHINE_TYPES,
  replacementBrandsForMachine,
  splitPostalCity,
} from "@/lib/portalWarrantyRegistrationForm";

interface FormState {
  isDemo: "" | "Ja" | "Nej";
  demoHoursAtSale: string;
  machineSerial: string;
  machineType: string;
  replacementBrand: string;
  toolSerials: string[];
  deliveryDate: string;
  customer: string;
  customerAddress: string;
  postalCity: string;
  phone: string;
  confirmationEmail: string;
  comment: string;
}

const EMPTY: FormState = {
  isDemo: "",
  demoHoursAtSale: "",
  machineSerial: "",
  machineType: "",
  replacementBrand: "Nej",
  toolSerials: [""],
  deliveryDate: "",
  customer: "",
  customerAddress: "",
  postalCity: "",
  phone: "",
  confirmationEmail: "",
  comment: "",
};

type WarrantyCopy = {
  serialLabel: string;
  serialPlaceholder: string;
  ownMachines: string;
  demoMachine: string;
  demoDetected: string;
  demoHoursAtSale: string;
  demoHoursHint: string;
  demoHoursRequired: string;
  approvedWarrantyExists: string;
  serialDoesNotMatchMachine: string;
};

const warrantyCopy: Record<string, WarrantyCopy> = {
  da: { serialLabel: "Maskinens identifikationsnummer / serienummer", serialPlaceholder: "Skriv serienummer eller søg blandt dine maskiner", ownMachines: "Dine maskiner", demoMachine: "Demo-maskine", demoDetected: "Denne maskine er registreret som demo-maskine.", demoHoursAtSale: "Driftstimer ved salg", demoHoursHint: "Angiv maskinens timetal på salgstidspunktet.", demoHoursRequired: "Angiv driftstimer for demo-maskinen.", approvedWarrantyExists: "Maskinen har allerede en godkendt garantiregistrering.", serialDoesNotMatchMachine: "Serienummeret hører ikke til den valgte maskintype." },
  en: { serialLabel: "Machine identification number / serial number", serialPlaceholder: "Enter a serial number or search your machines", ownMachines: "Your machines", demoMachine: "Demo machine", demoDetected: "This machine is registered as a demo machine.", demoHoursAtSale: "Operating hours at sale", demoHoursHint: "Enter the machine hours at the time of sale.", demoHoursRequired: "Enter operating hours for the demo machine.", approvedWarrantyExists: "The machine already has an approved warranty registration.", serialDoesNotMatchMachine: "The serial number does not belong to the selected machine type." },
  de: { serialLabel: "Maschinenidentifikationsnummer / Seriennummer", serialPlaceholder: "Seriennummer eingeben oder Ihre Maschinen durchsuchen", ownMachines: "Ihre Maschinen", demoMachine: "Demo-Maschine", demoDetected: "Diese Maschine ist als Demo-Maschine registriert.", demoHoursAtSale: "Betriebsstunden beim Verkauf", demoHoursHint: "Geben Sie den Maschinenstundenzähler zum Verkaufszeitpunkt an.", demoHoursRequired: "Geben Sie die Betriebsstunden der Demo-Maschine an.", approvedWarrantyExists: "Die Maschine hat bereits eine genehmigte Garantieregistrierung.", serialDoesNotMatchMachine: "Die Seriennummer gehört nicht zum ausgewählten Maschinentyp." },
  it: { serialLabel: "Numero identificativo macchina / numero di serie", serialPlaceholder: "Inserisci un numero di serie o cerca tra le tue macchine", ownMachines: "Le tue macchine", demoMachine: "Macchina demo", demoDetected: "Questa macchina è registrata come macchina demo.", demoHoursAtSale: "Ore di esercizio alla vendita", demoHoursHint: "Inserisci le ore della macchina al momento della vendita.", demoHoursRequired: "Inserisci le ore di esercizio della macchina demo.", approvedWarrantyExists: "La macchina dispone già di una registrazione della garanzia approvata.", serialDoesNotMatchMachine: "Il numero di serie non appartiene al tipo di macchina selezionato." },
  hu: { serialLabel: "Gépazonosító / sorozatszám", serialPlaceholder: "Adjon meg sorozatszámot vagy keressen a gépei között", ownMachines: "Az Ön gépei", demoMachine: "Demógép", demoDetected: "Ez a gép demógépként van nyilvántartva.", demoHoursAtSale: "Üzemóra az értékesítéskor", demoHoursHint: "Adja meg a gép üzemóráját az értékesítés időpontjában.", demoHoursRequired: "Adja meg a demógép üzemóráját.", approvedWarrantyExists: "A géphez már tartozik jóváhagyott garanciaregisztráció.", serialDoesNotMatchMachine: "A sorozatszám nem a kiválasztott géptípushoz tartozik." },
  sv: { serialLabel: "Maskinens identifieringsnummer / serienummer", serialPlaceholder: "Ange serienummer eller sök bland dina maskiner", ownMachines: "Dina maskiner", demoMachine: "Demomaskin", demoDetected: "Den här maskinen är registrerad som demomaskin.", demoHoursAtSale: "Drifttimmar vid försäljning", demoHoursHint: "Ange maskinens timtal vid försäljningstillfället.", demoHoursRequired: "Ange drifttimmar för demomaskinen.", approvedWarrantyExists: "Maskinen har redan en godkänd garantiregistrering.", serialDoesNotMatchMachine: "Serienumret tillhör inte den valda maskintypen." },
  fr: { serialLabel: "Numéro d'identification / numéro de série de la machine", serialPlaceholder: "Saisissez un numéro de série ou recherchez parmi vos machines", ownMachines: "Vos machines", demoMachine: "Machine de démonstration", demoDetected: "Cette machine est enregistrée comme machine de démonstration.", demoHoursAtSale: "Heures de fonctionnement à la vente", demoHoursHint: "Indiquez le compteur d'heures au moment de la vente.", demoHoursRequired: "Indiquez les heures de fonctionnement de la machine de démonstration.", approvedWarrantyExists: "La machine possède déjà un enregistrement de garantie approuvé.", serialDoesNotMatchMachine: "Le numéro de série ne correspond pas au type de machine sélectionné." },
  pl: { serialLabel: "Numer identyfikacyjny / numer seryjny maszyny", serialPlaceholder: "Wpisz numer seryjny lub wyszukaj wśród swoich maszyn", ownMachines: "Twoje maszyny", demoMachine: "Maszyna demonstracyjna", demoDetected: "Ta maszyna jest zarejestrowana jako maszyna demonstracyjna.", demoHoursAtSale: "Godziny pracy przy sprzedaży", demoHoursHint: "Podaj liczbę godzin maszyny w chwili sprzedaży.", demoHoursRequired: "Podaj liczbę godzin pracy maszyny demonstracyjnej.", approvedWarrantyExists: "Maszyna ma już zatwierdzoną rejestrację gwarancji.", serialDoesNotMatchMachine: "Numer seryjny nie należy do wybranego typu maszyny." },
  cs: { serialLabel: "Identifikační číslo / sériové číslo stroje", serialPlaceholder: "Zadejte sériové číslo nebo vyhledejte mezi svými stroji", ownMachines: "Vaše stroje", demoMachine: "Předváděcí stroj", demoDetected: "Tento stroj je evidován jako předváděcí.", demoHoursAtSale: "Provozní hodiny při prodeji", demoHoursHint: "Zadejte stav hodin stroje v okamžiku prodeje.", demoHoursRequired: "Zadejte provozní hodiny předváděcího stroje.", approvedWarrantyExists: "Stroj již má schválenou registraci záruky.", serialDoesNotMatchMachine: "Sériové číslo nepatří k vybranému typu stroje." },
};

export function WarrantyNewFormIntro() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Opret garantiregistrering</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Registrér en ny maskine ved levering til kunden. Garantiregistrering
        skal oprettes ved overlevering — der kan ikke behandles garanti eller
        reklamation på maskiner, som ikke er registreret.
      </p>
    </div>
  );
}

export function WarrantyNewForm({
  defaultDealerName = "",
  defaultDealerNumber = "",
  role = null,
}: {
  defaultDealerName?: string;
  defaultDealerNumber?: string;
  role?: PortalRole | null;
}) {
  const navigate = useNavigate();
  const { uiLanguage } = useLanguage();
  const [state, setState] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    submissionId: string;
    customer: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [machineOptions, setMachineOptions] = useState<PortalWarrantyMachineOption[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);
  const machinePickerRef = useRef<HTMLDivElement>(null);
  const replacementBrands = replacementBrandsForMachine(state.machineType);
  const copy = warrantyCopy[uiLanguage] ?? warrantyCopy.en;
  const selectedMachine = useMemo(
    () => resolvePortalWarrantyMachine(state.machineSerial, machineOptions),
    [machineOptions, state.machineSerial],
  );
  const filteredMachineOptions = useMemo(
    () => filterPortalWarrantyMachines(machineOptions, state.machineType, state.machineSerial),
    [machineOptions, state.machineSerial, state.machineType],
  );
  const serialSuggestions = state.machineType ? filteredMachineOptions : [];
  const selectedMachineIsDemo = Boolean(selectedMachine?.isDemo);
  const isDemo = selectedMachineIsDemo || state.isDemo === "Ja";

  useEffect(() => {
    let cancelled = false;
    if (!defaultDealerNumber.trim()) {
      setMachineOptions([]);
      return undefined;
    }
    setMachinesLoading(true);
    void fetchPortalWarrantyEligibleMachines(defaultDealerNumber)
      .then((options) => { if (!cancelled) setMachineOptions(options); })
      .catch(() => { if (!cancelled) setMachineOptions([]); })
      .finally(() => { if (!cancelled) setMachinesLoading(false); });
    return () => { cancelled = true; };
  }, [defaultDealerNumber]);

  useEffect(() => {
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!machinePickerRef.current?.contains(event.target as Node)) setMachinePickerOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  useEffect(() => {
    if (!selectedMachineIsDemo) return;
    setState((current) => current.isDemo === "Ja" ? current : {
      ...current,
      isDemo: "Ja",
      machineType: selectedMachine?.machineModel || current.machineType,
    });
  }, [selectedMachine, selectedMachineIsDemo]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => {
      if (key !== "machineType") return { ...s, [key]: value };
      const machineType = value as string;
      const resolved = resolvePortalWarrantyMachine(s.machineSerial, machineOptions);
      return {
        ...s,
        machineType,
        machineSerial: resolved && !portalWarrantyMachineMatchesType(resolved, machineType) ? "" : s.machineSerial,
        replacementBrand: "Nej",
      };
    });
    if (key === "machineType") setMachinePickerOpen(false);
    if (key === "machineSerial") setWarning(null);
  }

  function setMachineSerial(machineSerial: string) {
    const match = resolvePortalWarrantyMachine(machineSerial, machineOptions);
    setState((current) => ({
      ...current,
      machineSerial,
      machineType: match && (!current.machineType || portalWarrantyMachineMatchesType(match, current.machineType))
        ? match.machineModel || current.machineType
        : current.machineType,
      isDemo: match?.isDemo ? "Ja" : current.isDemo,
    }));
    setWarning(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    const required: [keyof FormState, string][] = [
      ["isDemo", "Demo maskine"],
      ["machineSerial", "Maskinens serienummer"],
      ["machineType", "Maskintype"],
      ["deliveryDate", "Leveringsdato"],
      ["customer", "Kunde"],
      ["customerAddress", "Kunde adresse"],
      ["postalCity", "Postnr/by"],
      ["phone", "Telefon"],
      ["confirmationEmail", "Bekræftelses-email"],
    ];
    const missing = required.find(([k]) => !String(state[k] ?? "").trim());
    if (missing) {
      setError(`Udfyld venligst feltet "${missing[1]}".`);
      return;
    }
    if (isDemo && (!/^\d+$/.test(state.demoHoursAtSale) || Number(state.demoHoursAtSale) < 0)) {
      setError(copy.demoHoursRequired);
      return;
    }
    if (selectedMachine && !portalWarrantyMachineMatchesType(selectedMachine, state.machineType)) {
      setError(copy.serialDoesNotMatchMachine);
      return;
    }

    setSubmitting(true);
    try {
      // ---- Serial validation (Phase 2.1) ----
      // External users are BLOCKED on duplicates. Internal Timan
      // (backend / service) sees a warning but may proceed = approval.
      // Unknown serials only surface a soft warning (catalogue TBD).
      const v = await validateWarrantySerial(state.machineSerial, role);
      if (v.kind === "duplicate") {
        if (v.blocking) {
          setError(copy.approvedWarrantyExists);
          setSubmitting(false);
          return;
        }
        setWarning(v.message);
      } else if (v.kind === "unknown") {
        setWarning(v.message);
      }

      const postal = splitPostalCity(state.postalCity);
      const record = await createPortalWarrantyRegistration({
        isDemo,
        demoHoursAtSale: isDemo ? Number(state.demoHoursAtSale) : null,
        machineSerial: state.machineSerial,
        machineModel: state.machineType,
        replacementBrand: replacementBrands.length > 0 ? state.replacementBrand : null,
        toolSerials: state.toolSerials,
        deliveryDate: state.deliveryDate,
        customerName: state.customer,
        customerAddress: state.customerAddress,
        customerPostalCode: postal.postalCode,
        customerCity: postal.city,
        customerCountry: "",
        customerPhone: state.phone,
        customerEmail: state.confirmationEmail,
        comment: state.comment || null,
        language: uiLanguage,
        dealerAccountNumber: defaultDealerNumber,
      });
      setSuccess({ submissionId: record.id, customer: state.customer.trim() });
      setState(EMPTY);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunne ikke gemme registreringen. Prøv igen.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-2xl font-black">Garantiregistrering indsendt</h2>
            <p className="mt-2 text-sm text-slate-600">
              Indsendelsen for <strong>{success.customer}</strong> afventer nu gennemgang.
              Et garantibevis med SP-nummer oprettes først efter godkendelse.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Reference{" "}
              <span className="font-mono font-black text-slate-900">
                {success.submissionId.slice(0, 8).toUpperCase()}
              </span>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                Opret endnu en
              </button>
              <button
                type="button"
                onClick={() => navigate("/portal/service/warranty/registrations")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Se mine indsendelser
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {warning && !error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      <Section title="Forhandler & maskine">
        <Field label="Forhandlernavn">
          <input
            value={defaultDealerName}
            readOnly
            aria-label="Forhandlernavn fra din konto"
            className={`${inputCls} bg-slate-50 text-slate-600`}
          />
        </Field>
        <Field label="Er den solgte maskine en demo maskine?" required>
          <div className="flex gap-2">
            {(["Nej", "Ja"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("isDemo", v)}
                disabled={selectedMachineIsDemo && v === "Nej"}
                className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                  state.isDemo === v
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Hvilken maskine er solgt?" required>
          <select
            value={state.machineType}
            onChange={(e) => set("machineType", e.target.value)}
            className={inputCls}
          >
            <option value="">Vælg maskine</option>
            {state.machineType && !PORTAL_WARRANTY_MACHINE_TYPES.includes(state.machineType as typeof PORTAL_WARRANTY_MACHINE_TYPES[number]) && (
              <option value={state.machineType}>{state.machineType}</option>
            )}
            {PORTAL_WARRANTY_MACHINE_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.serialLabel} required>
          <div ref={machinePickerRef} className="relative">
            <input
              value={state.machineSerial}
              onFocus={() => setMachinePickerOpen(true)}
              onChange={(e) => {
                setMachineSerial(e.target.value);
                setMachinePickerOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMachinePickerOpen(false);
              }}
              aria-autocomplete="list"
              aria-expanded={machinePickerOpen}
              aria-controls="portal-warranty-machine-options"
              placeholder={copy.serialPlaceholder}
              className={inputCls}
            />
            {machinePickerOpen && !machinesLoading && (
              <div
                id="portal-warranty-machine-options"
                role="listbox"
                className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
              >
                {serialSuggestions.length > 0 ? serialSuggestions.map((machine) => (
                  <button
                    key={machine.normalizedSerial}
                    type="button"
                    role="option"
                    aria-selected={machine.normalizedSerial === selectedMachine?.normalizedSerial}
                    onClick={() => {
                      setMachineSerial(machine.serial);
                      setMachinePickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{machine.serial}</span>
                      <span className="block truncate text-xs text-slate-500">{[machine.machineModel, machine.machineOrderNumber].filter(Boolean).join(" · ")}</span>
                    </span>
                    {machine.isDemo && <span title={copy.demoMachine} className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">DEMO</span>}
                  </button>
                )) : (
                  <p className="px-3 py-2 text-sm text-slate-500">
                    {state.machineType
                      ? "Ingen maskiner matcher valget. Du kan stadig skrive serienummeret manuelt."
                      : "Vælg maskintype først, eller skriv serienummeret manuelt."}
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {machinesLoading ? "…" : `${copy.ownMachines}: ${state.machineType ? serialSuggestions.length : machineOptions.length}`}
          </p>
          {selectedMachine && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>{[selectedMachine.machineModel, selectedMachine.machineOrderNumber].filter(Boolean).join(" · ")}</span>
              {selectedMachineIsDemo && <span title={copy.demoMachine} className="rounded bg-amber-100 px-2 py-0.5 font-black text-amber-900">DEMO</span>}
            </div>
          )}
        </Field>
        {selectedMachineIsDemo && <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{copy.demoDetected}</div>}
        {isDemo && <Field label={copy.demoHoursAtSale} required>
          <input
            type="number"
            min="0"
            step="1"
            value={state.demoHoursAtSale}
            onChange={(e) => set("demoHoursAtSale", e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">{copy.demoHoursHint}</p>
        </Field>}
        {replacementBrands.length > 0 && <Field label="Erstatter den en anden maskine?">
          <select
            value={state.replacementBrand}
            onChange={(e) => set("replacementBrand", e.target.value)}
            className={inputCls}
          >
            {replacementBrands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>}
      </Section>

      <Section title="Redskabs identifikationsnumre">
        <div className="space-y-3 lg:col-span-2">
          {state.toolSerials.map((t, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  label={`Redskab ${i + 1} — identifikationsnummer / serienummer`}
                >
                  <input
                    value={t}
                    onChange={(e) => {
                      const next = [...state.toolSerials];
                      next[i] = e.target.value;
                      set("toolSerials", next);
                    }}
                    placeholder="fx 712000-00-1111"
                    className={inputCls}
                  />
                </Field>
              </div>
              {state.toolSerials.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = state.toolSerials.filter((_, idx) => idx !== i);
                    set("toolSerials", next.length ? next : [""]);
                  }}
                  aria-label={`Fjern redskab ${i + 1}`}
                  className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("toolSerials", [...state.toolSerials, ""])}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Tilføj endnu et redskab
          </button>
        </div>
      </Section>

      <Section title="Levering & kunde">
        <Field label="Leveringsdato" required>
          <input
            type="date"
            value={state.deliveryDate}
            onChange={(e) => set("deliveryDate", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Kunde" required>
          <input
            value={state.customer}
            onChange={(e) => set("customer", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Kunde adresse" required>
          <AddressAutocomplete
            value={state.customerAddress}
            onChange={(v) => set("customerAddress", v)}
            onResolve={(r: ResolvedAddress) => {
              if (r.address_line_1) set("customerAddress", r.address_line_1);
              const pc = [r.postal_code, r.city].filter(Boolean).join(" ");
              if (pc) set("postalCity", pc);
            }}
            className={inputCls}
            placeholder="Begynd at skrive adressen…"
            showValidationState
            addressParts={{ address_line_1: state.customerAddress, postal_code: state.postalCity }}
          />
        </Field>
        <Field label="Postnr/by" required>
          <input
            value={state.postalCity}
            onChange={(e) => set("postalCity", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Telefon-Nr" required>
          <input
            value={state.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="E-mail til bekræftelse af garantiregistrering" required>
          <input
            type="email"
            value={state.confirmationEmail}
            onChange={(e) => set("confirmationEmail", e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Kommentar">
        <div className="lg:col-span-2">
          <textarea
            value={state.comment}
            onChange={(e) => set("comment", e.target.value)}
            rows={3}
            className={`${inputCls} min-h-[80px]`}
          />
        </div>
      </Section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => setState(EMPTY)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Nulstil
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Gemmer …" : "Opret garantiregistrering"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
