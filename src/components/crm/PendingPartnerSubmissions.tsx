import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileSearch, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  type PortalFormSubmission,
  reviewCompanyContactInfoSubmission,
} from "@/lib/portalFormsService";
import type { PortalUiLanguage } from "@/lib/portalLanguages";

type Copy = {
  title: string;
  pending: string;
  review: string;
  accountNumber: string;
  accountHelp: string;
  approve: string;
  returnForChanges: string;
  reject: string;
  note: string;
  cancel: string;
  submitted: string;
  noPending: string;
  working: string;
  approved: string;
};

const COPY: Record<PortalUiLanguage, Copy> = {
  da: { title: "Afventende samarbejdspartnere", pending: "Afventer godkendelse", review: "Gennemgå", accountNumber: "Kontonummer", accountHelp: "Påkrævet for en ny canonical partner. Eksisterende CVR/VAT matches automatisk.", approve: "Godkend firmaoplysninger", returnForChanges: "Returnér til rettelse", reject: "Afvis", note: "Bemærkning til review", cancel: "Annullér", submitted: "Indsendt", noPending: "Ingen afventende firmaoplysninger.", working: "Gemmer...", approved: "Godkendt" },
  en: { title: "Pending collaboration partners", pending: "Awaiting approval", review: "Review", accountNumber: "Account number", accountHelp: "Required for a new canonical partner. An existing VAT number is matched automatically.", approve: "Approve company details", returnForChanges: "Return for changes", reject: "Reject", note: "Review note", cancel: "Cancel", submitted: "Submitted", noPending: "No pending company details.", working: "Saving...", approved: "Approved" },
  de: { title: "Ausstehende Kooperationspartner", pending: "Warten auf Genehmigung", review: "Prüfen", accountNumber: "Kontonummer", accountHelp: "Für einen neuen kanonischen Partner erforderlich. Eine bestehende USt-IdNr. wird automatisch abgeglichen.", approve: "Unternehmensdaten genehmigen", returnForChanges: "Zur Korrektur zurückgeben", reject: "Ablehnen", note: "Prüfnotiz", cancel: "Abbrechen", submitted: "Eingereicht", noPending: "Keine ausstehenden Unternehmensdaten.", working: "Speichern...", approved: "Genehmigt" },
  it: { title: "Partner in attesa", pending: "In attesa di approvazione", review: "Esamina", accountNumber: "Numero conto", accountHelp: "Richiesto per un nuovo partner canonico.", approve: "Approva dati aziendali", returnForChanges: "Restituisci per correzione", reject: "Rifiuta", note: "Nota di revisione", cancel: "Annulla", submitted: "Inviato", noPending: "Nessun dato aziendale in attesa.", working: "Salvataggio...", approved: "Approvato" },
  hu: { title: "Függő együttműködő partnerek", pending: "Jóváhagyásra vár", review: "Ellenőrzés", accountNumber: "Számlaszám", accountHelp: "Új kanonikus partnerhez szükséges.", approve: "Cégadatok jóváhagyása", returnForChanges: "Visszaküldés javításra", reject: "Elutasítás", note: "Ellenőrzési megjegyzés", cancel: "Mégse", submitted: "Beküldve", noPending: "Nincs függő cégadat.", working: "Mentés...", approved: "Jóváhagyva" },
  sv: { title: "Väntande samarbetspartner", pending: "Väntar på godkännande", review: "Granska", accountNumber: "Kontonummer", accountHelp: "Krävs för en ny kanonisk partner.", approve: "Godkänn företagsuppgifter", returnForChanges: "Skicka tillbaka för ändring", reject: "Avvisa", note: "Granskningsanteckning", cancel: "Avbryt", submitted: "Insänt", noPending: "Inga väntande företagsuppgifter.", working: "Sparar...", approved: "Godkänd" },
  fr: { title: "Partenaires en attente", pending: "En attente d'approbation", review: "Examiner", accountNumber: "Numéro de compte", accountHelp: "Requis pour un nouveau partenaire canonique.", approve: "Approuver les informations", returnForChanges: "Renvoyer pour correction", reject: "Rejeter", note: "Note d'examen", cancel: "Annuler", submitted: "Envoyé", noPending: "Aucune information en attente.", working: "Enregistrement...", approved: "Approuvé" },
  pl: { title: "Oczekujący partnerzy", pending: "Oczekuje na zatwierdzenie", review: "Sprawdź", accountNumber: "Numer konta", accountHelp: "Wymagany dla nowego partnera kanonicznego.", approve: "Zatwierdź dane firmy", returnForChanges: "Odeślij do poprawy", reject: "Odrzuć", note: "Notatka z przeglądu", cancel: "Anuluj", submitted: "Wysłano", noPending: "Brak oczekujących danych firmy.", working: "Zapisywanie...", approved: "Zatwierdzono" },
  cs: { title: "Čekající spolupracující partneři", pending: "Čeká na schválení", review: "Zkontrolovat", accountNumber: "Číslo účtu", accountHelp: "Vyžadováno pro nového kanonického partnera.", approve: "Schválit údaje společnosti", returnForChanges: "Vrátit k opravě", reject: "Odmítnout", note: "Poznámka ke kontrole", cancel: "Zrušit", submitted: "Odesláno", noPending: "Žádné čekající údaje společnosti.", working: "Ukládání...", approved: "Schváleno" },
};

type Payload = { dealer_account_patch?: Record<string, unknown>; dealer_contacts?: unknown[] };
export type PendingPartnerSubmissionDetails = {
  company: string;
  vat: string;
  address: string;
  contacts: number;
  country: string;
};

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
export function getPendingPartnerSubmissionDetails(row: PortalFormSubmission): PendingPartnerSubmissionDetails {
  const payload = row.payload as Payload;
  const patch = payload.dealer_account_patch ?? {};
  return {
    company: text(patch.company_name) || row.dealer_name || "-",
    vat: text(patch.vat_number),
    address: [text(patch.address_line_1), text(patch.postal_code), text(patch.city), text(patch.country)].filter(Boolean).join(", "),
    contacts: Array.isArray(payload.dealer_contacts) ? payload.dealer_contacts.length : 0,
    country: text(patch.country),
  };
}
function submittedContacts(row: PortalFormSubmission): Array<{ name: string; email: string; phone: string; area: string }> {
  const payload = row.payload as Payload;
  if (!Array.isArray(payload.dealer_contacts)) return [];
  return payload.dealer_contacts.map((contact) => {
    const value = contact && typeof contact === "object" ? contact as Record<string, unknown> : {};
    return { name: text(value.name), email: text(value.email), phone: text(value.phone), area: text(value.contact_area) };
  }).filter((contact) => contact.name || contact.email || contact.phone);
}

export default function PendingPartnerSubmissions({ rows, canReview, language, onReviewed, renderList = true, selectedRow, onSelectedRowChange }: {
  rows: PortalFormSubmission[];
  canReview: boolean;
  language: PortalUiLanguage;
  onReviewed: () => void;
  renderList?: boolean;
  selectedRow?: PortalFormSubmission | null;
  onSelectedRowChange?: (row: PortalFormSubmission | null) => void;
}) {
  const copy = COPY[language];
  const pending = useMemo(() => rows.filter((row) => row.review_status === "pending"), [rows]);
  const [internalSelected, setInternalSelected] = useState<PortalFormSubmission | null>(null);
  const selected = selectedRow === undefined ? internalSelected : selectedRow;
  const setSelected = (row: PortalFormSubmission | null) => {
    if (selectedRow === undefined) setInternalSelected(row);
    onSelectedRowChange?.(row);
  };
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function review(decision: "approved" | "returned" | "rejected") {
    if (!selected) return;
    setSaving(true);
    try {
      await reviewCompanyContactInfoSubmission({ submissionId: selected.id, decision, accountNumber, note });
      toast.success(decision === "approved" ? copy.approved : copy.pending);
      setSelected(null); setAccountNumber(""); setNote(""); onReviewed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  }

  const dialog = selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
    <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
      <h4 className="text-lg font-bold text-slate-900">{copy.review}: {getPendingPartnerSubmissionDetails(selected).company}</h4>
      <p className="mt-1 text-sm text-slate-600">{getPendingPartnerSubmissionDetails(selected).vat} · {getPendingPartnerSubmissionDetails(selected).address}</p>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p className="mb-1 font-semibold text-slate-900">Kontaktpersoner</p>
        {submittedContacts(selected).map((contact, index) => <p key={`${contact.email}-${index}`}>{contact.area}: {contact.name || "-"} · {contact.email || "-"} · {contact.phone || "-"}</p>)}
      </div>
      <label className="mt-4 block text-sm font-semibold text-slate-800">{copy.accountNumber}<input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <p className="mt-1 text-xs text-slate-500">{copy.accountHelp}</p>
      <label className="mt-4 block text-sm font-semibold text-slate-800">{copy.note}<textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-3 py-2 text-sm">{copy.cancel}</button><button disabled={saving} type="button" onClick={() => void review("returned")} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-900"><RotateCcw className="h-4 w-4" />{copy.returnForChanges}</button><button disabled={saving} type="button" onClick={() => void review("rejected")} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800"><XCircle className="h-4 w-4" />{copy.reject}</button><button disabled={saving} type="button" onClick={() => void review("approved")} className="inline-flex items-center gap-1 rounded-lg bg-[#2d5a27] px-3 py-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" />{saving ? copy.working : copy.approve}</button></div>
    </div>
  </div>;

  if (!pending.length && !dialog) return null;
  if (!renderList) return <>{dialog}</>;
  return (
    <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center gap-2"><Clock3 className="h-5 w-5 text-amber-700" /><h3 className="font-bold text-slate-900">{copy.title}</h3></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pending.map((row) => {
          const item = getPendingPartnerSubmissionDetails(row);
          return <article key={row.id} className="rounded-xl border border-amber-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-start justify-between gap-2"><strong className="text-slate-900">{item.company}</strong><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">{copy.pending}</span></div>
            <div className="space-y-1 text-xs text-slate-600"><p>{item.vat || "VAT -"}</p><p>{item.address || "-"}</p><p>{item.contacts} kontakt(er)</p><p>{copy.submitted}: {new Date(row.created_at).toLocaleDateString(language)}</p></div>
            {canReview && <button type="button" onClick={() => setSelected(row)} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileSearch className="h-3.5 w-3.5" />{copy.review}</button>}
          </article>;
        })}
      </div>
      {dialog}
    </section>
  );
}
