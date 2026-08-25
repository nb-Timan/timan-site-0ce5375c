import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import MesseSubpageHeader from "@/components/messe/MesseSubpageHeader";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { createCrm2620Trial } from "@/lib/crm2620TrialsService";

type Props = {
  variant?: "portal" | "messe";
};

function clean(value: string): string {
  return value.trim();
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.06em] text-slate-600">
        {label}{required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const COUNTRY_OPTIONS = [
  "Danmark",
  "Tyskland",
  "Sverige",
  "Norge",
  "Finland",
  "Island",
  "Færøerne",
  "Grønland",
  "Holland",
  "Belgien",
  "Luxembourg",
  "Frankrig",
  "Italien",
  "Spanien",
  "Portugal",
  "Østrig",
  "Schweiz",
  "Polen",
  "Tjekkiet",
  "Slovakiet",
  "Ungarn",
  "Kroatien",
  "Slovenien",
  "Rumænien",
  "Bulgarien",
  "Estland",
  "Letland",
  "Litauen",
  "Storbritannien",
  "Irland",
  "Canada",
  "USA",
  "Japan",
  "Andet",
];

export default function Timan2620TrialPage({ variant = "portal" }: Props) {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [country, setCountry] = useState("Danmark");
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [address, setAddress] = useState("");
  const [zipCity, setZipCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");

  const ready = Boolean(
    clean(company) &&
    clean(contactPerson) &&
    clean(zipCity) &&
    clean(phone) &&
    clean(email),
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">...</div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) {
      toast.error("Udfyld de påkrævede felter.");
      return;
    }
    setSubmitting(true);
    try {
      const trial = await createCrm2620Trial({
        country: clean(country) || null,
        company_cvr: clean(company),
        contact_person: clean(contactPerson),
        address: clean(address) || null,
        zip_city: clean(zipCity),
        phone: clean(phone),
        email: clean(email),
        comment: clean(comment) || null,
        responsible_seller_id: null,
        responsible_seller_name: null,
        responsible_seller_email: null,
        created_by_email: appUser.email || null,
      });
      setCreatedId(trial.id);
      toast.success("Afprøvning af 2620 er gemt.");
    } catch (error) {
      console.error(error);
      toast.error("Kunne ikke gemme afprøvningen.");
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <ClipboardList className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Afprøvning af Timan 2620</h1>
          <p className="text-sm text-slate-600">Selvstændig registrering uden lead eller CRM-pipeline.</p>
        </div>
      </div>

      {createdId ? (
        <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Registreringen er gemt</h2>
              <p className="mt-1 text-sm text-slate-600">Den er gemt i det separate 2620-afprøvningsregister og har ikke oprettet et lead.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={variant === "messe" ? "/messe" : "/portal"}
                  className="inline-flex rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Tilbage
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedId(null);
                    setCompany("");
                    setContactPerson("");
                    setAddress("");
                    setZipCity("");
                    setPhone("");
                    setEmail("");
                    setComment("");
                  }}
                  className="inline-flex rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Opret ny
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Firma" required>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Navn / kontaktperson" required>
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Adresse">
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Postnummer og by" required>
              <input value={zipCity} onChange={(e) => setZipCity(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Telefon" required>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </Field>
            <Field label="E-mail" required>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputClass} />
            </Field>
            <Field label="Land">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={inputClass}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Kommentar">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} className={inputClass} />
          </Field>
          <div className="flex justify-end border-t border-slate-200 pt-5">
            <button
              type="submit"
              disabled={submitting || !ready}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Gem afprøvning
            </button>
          </div>
        </form>
      )}
    </main>
  );

  if (variant === "messe") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <MesseSubpageHeader backTo="/messe" backLabel="Tilbage til Timan Messe" />
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />
      <div className="flex-grow">{content}</div>
      <PortalFooter language={lang} />
    </div>
  );
}
