import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, DatabaseZap, FileText, Sparkles, XCircle } from "lucide-react";
import CrmLayout from "@/components/crm/CrmLayout";
import { cn } from "@/lib/utils";
import { loadLegacyLeadsPreview, type LegacyPreviewLead } from "@/lib/legacyLeadsPreview";

function Field({ label, value, required = false, wide = false }: { label: string; value: string | number | null | undefined; required?: boolean; wide?: boolean }) {
  return (
    <label className={cn("block", wide && "md:col-span-2")}>
      <span className="mb-2 block text-sm font-medium text-slate-800">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      <input
        readOnly
        value={value ?? ""}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
      />
    </label>
  );
}

function TextAreaField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800">{label}</span>
      <textarea
        readOnly
        value={value ?? ""}
        rows={6}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
      />
    </label>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function yesNo(value: string | null) {
  if (value === "yes") return "Ja";
  if (value === "no") return "Nej";
  return "";
}

export default function CrmLegacyLeadImportPreviewDetailPage() {
  const { legacyId } = useParams();
  const [lead, setLead] = useState<LegacyPreviewLead | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadLegacyLeadsPreview()
      .then((data) => {
        if (cancelled) return;
        const found = data.leads.find((item) => item.id === legacyId);
        if (!found) throw new Error("Leadet findes ikke i preview-filen.");
        setLead(found);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Kunne ikke læse preview-lead.");
      });
    return () => { cancelled = true; };
  }, [legacyId]);

  const machineLabel = useMemo(() => lead?.machine_types.join(", ") || "", [lead]);

  return (
    <CrmLayout pageTitle="Rediger historisk lead preview">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to="/portal/crm/leads/import-preview" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Tilbage til import-preview
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
            Rediger lead
            {lead?.display_no && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{lead.display_no}</span>}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Forudfyldt preview af historisk Excel-lead. Felterne gemmes ikke i CRM her.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700">
            <Sparkles className="h-4 w-4" /> Konverter til demo
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            <FileText className="h-4 w-4" /> Konverter til tilbud
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
            <XCircle className="h-4 w-4" /> Luk
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-semibold"><DatabaseZap className="h-4 w-4" /> Lokal import-preview</p>
        <p className="mt-1">Denne side viser, hvordan leadet forventes at se ud efter import. Der bliver ikke oprettet, ændret eller sendt noget.</p>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error}</div>}
      {!lead && !error && <p className="rounded-2xl border bg-white p-6 text-sm text-slate-500 shadow-sm">Indlæser lead...</p>}

      {lead && (
        <div className="space-y-5">
          <Section title="Grundinformation" subtitle="Hvem og hvornår">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Titel" value={lead.title} required wide />
              <Field label="Ansvarlig sælger" value={lead.owner_initials ? `${lead.owner_initials} - ${lead.owner_name}` : ""} required />
              <Field label="Linket forhandler" value={lead.dealer_name} required />
              <Field label="Første kontakt" value={lead.first_contact_date} required />
              <Field label="Forventet lukkedato" value={lead.expected_close_date || ""} required />
              <Field label="Næste opfølgning" value={lead.next_followup_date} required wide />
            </div>
          </Section>

          <Section title="Kontaktinformation" subtitle="Strukturerede kundeoplysninger fra historisk data">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Firma/CVR" value={lead.contact_fields.company} required />
              <Field label="Kontaktperson" value={lead.contact_fields.contact} required />
              <Field label="Telefon" value={lead.contact_fields.phone} required />
              <Field label="E-mail" value={lead.contact_fields.email} required />
              <Field label="Adresse" value={lead.contact_fields.address} wide />
              <Field label="Postnr." value={lead.contact_fields.postalCode} required />
              <Field label="By" value={lead.contact_fields.city} required />
              <Field label="Land" value={lead.country} required wide />
            </div>
          </Section>

          <Section title="Maskine-interesse" subtitle="Valg fundet i Excel og mappet til CRM-valg">
            <div className="flex flex-wrap gap-2">
              {["RC-751", "RC-1000s", "Timan 2620", "Timan 3330", "Loader line / traktor-redskaber"].map((option) => {
                const aliases: Record<string, string[]> = {
                  "Timan 2620": ["New 2620"],
                  "Loader line / traktor-redskaber": ["Full Line", "Tool-Trac 5740", "Third-Party Equipment"],
                };
                const active = lead.machine_types.includes(option) || (aliases[option] || []).some((alias) => lead.machine_types.includes(alias));
                return (
                  <span
                    key={option}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm",
                      active ? "border-[#2d5a27] bg-emerald-50 text-[#2d5a27] font-semibold" : "border-slate-200 bg-white text-slate-600",
                    )}
                  >
                    {option}
                  </span>
                );
              })}
            </div>
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
              Redskaber under maskiner: {machineLabel || "Ingen maskine fundet"}
            </div>
          </Section>

          <Section title="Næste aktivitet">
            <Field label="Næste aktivitet" value={`${lead.next_activity} - ${lead.probability}%`} required />
          </Section>

          <Section title="Demo">
            <div className="flex gap-2">
              {["Ja", "Nej"].map((label) => (
                <span
                  key={label}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-medium",
                    yesNo(lead.demo_has_run) === label ? "border-[#2d5a27] bg-[#2d5a27] text-white" : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Kontakttype & kundetype">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kontakttype" value={lead.contact_type} required />
              <Field label="Kundetype" value={lead.customer_type} required />
            </div>
          </Section>

          <Section title="Detaljer">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Messe" value={lead.trade_fair} />
              <Field label="Land" value={lead.country} />
              <Field label="Pipeline" value={lead.pipeline_stage} />
              <Field label="Budget-estimat (DKK)" value="" />
              <Field label="Flyt til arbejdsbudget?" value="Nej" />
              <Field label="Sandsynlighed (%)" value={lead.probability} />
            </div>
            <div className="mt-4">
              <TextAreaField label="Noter / oprindelig kontaktinformation" value={lead.contact_information} />
            </div>
          </Section>

          <Section title="Filer" subtitle="Vedhæft tilbud, billeder eller PDF">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Ingen filer fundet i Excel-preview.
            </div>
          </Section>
        </div>
      )}
    </CrmLayout>
  );
}
