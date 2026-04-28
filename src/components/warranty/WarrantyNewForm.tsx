/**
 * Shared "New warranty registration" form — migrated 1:1 from the old Timan
 * TSB Hub. Used only by dealer-side roles at /portal/service/warranty/new.
 * The "Redskabs identifikationsnummer" field is dynamic — starts with one row,
 * dealers can add/remove additional tools.
 */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Plus, X } from "lucide-react";
import {
  MACHINE_TYPES,
  REPLACEMENT_BRANDS,
  addRegistration,
  type NewRegistrationInput,
} from "@/lib/warranty-store";

interface FormState {
  dealerName: string;
  isDemo: "" | "Ja" | "Nej";
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
  dealerName: "",
  isDemo: "",
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

export function WarrantyNewFormIntro() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Ny registrering</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Registrér en ny maskine ved levering til kunden. Garantiregistrering
        skal oprettes ved overlevering — der kan ikke behandles garanti eller
        reklamation på maskiner, som ikke er registreret.
      </p>
    </div>
  );
}

export function WarrantyNewForm({ defaultDealerName = "" }: { defaultDealerName?: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<FormState>({ ...EMPTY, dealerName: defaultDealerName });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    certificate: string;
    customer: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const required: [keyof FormState, string][] = [
      ["dealerName", "Forhandlernavn"],
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

    setSubmitting(true);
    try {
      const input: NewRegistrationInput = {
        dealerName: state.dealerName.trim(),
        isDemo: state.isDemo as "Ja" | "Nej",
        machineSerial: state.machineSerial.trim(),
        machineType: state.machineType,
        replacementBrand:
          state.replacementBrand && state.replacementBrand !== "Nej"
            ? state.replacementBrand
            : "Nej",
        toolSerials: state.toolSerials.map((t) => t.trim()).filter(Boolean),
        deliveryDate: state.deliveryDate,
        customer: state.customer.trim(),
        customerAddress: state.customerAddress.trim(),
        postalCity: state.postalCity.trim(),
        phone: state.phone.trim(),
        confirmationEmail: state.confirmationEmail.trim(),
        comment: state.comment.trim() || null,
      };
      const record = addRegistration(input);
      setSuccess({ certificate: record.certificateNumber, customer: record.customer });
      setState({ ...EMPTY, dealerName: defaultDealerName });
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
            <h2 className="text-2xl font-black">Garantiregistrering oprettet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Garantibevis{" "}
              <span className="font-mono font-black text-slate-900">
                {success.certificate}
              </span>{" "}
              er registreret for <strong>{success.customer}</strong>.
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
                Se mine registreringer
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

      <Section title="Forhandler & maskine">
        <Field label="Forhandlernavn" required>
          <input
            value={state.dealerName}
            onChange={(e) => set("dealerName", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Er den solgte maskine en demo maskine?" required>
          <div className="flex gap-2">
            {(["Nej", "Ja"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("isDemo", v)}
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
        <Field label="Maskinens identifikationsnummer / serienummer" required>
          <input
            value={state.machineSerial}
            onChange={(e) => set("machineSerial", e.target.value)}
            placeholder="fx 712000-00-1111"
            className={inputCls}
          />
        </Field>
        <Field label="Hvilken maskine er solgt?" required>
          <select
            value={state.machineType}
            onChange={(e) => set("machineType", e.target.value)}
            className={inputCls}
          >
            <option value="">Vælg maskine</option>
            {MACHINE_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Erstatter den en anden maskine?">
          <select
            value={state.replacementBrand}
            onChange={(e) => set("replacementBrand", e.target.value)}
            className={inputCls}
          >
            {REPLACEMENT_BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
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
          <input
            value={state.customerAddress}
            onChange={(e) => set("customerAddress", e.target.value)}
            className={inputCls}
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
          onClick={() => setState({ ...EMPTY, dealerName: defaultDealerName })}
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
