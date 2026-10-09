import type { PortalUiLanguage } from "@/lib/portalLanguages";
import type { WarrantySubmissionStatus } from "@/lib/warrantySubmissionsService";

type Labels = Record<PortalUiLanguage, string>;

const LABELS: Record<WarrantySubmissionStatus, Labels> = {
  submitted: {
    da: "Indsendt", en: "Submitted", de: "Eingereicht", it: "Inviato", hu: "Beküldve",
    sv: "Inskickad", fr: "Soumis", pl: "Przesłano", cs: "Odesláno",
  },
  pending: {
    da: "Under behandling", en: "Under review", de: "In Bearbeitung", it: "In revisione", hu: "Feldolgozás alatt",
    sv: "Under behandling", fr: "En cours de traitement", pl: "W trakcie rozpatrywania", cs: "Ve zpracování",
  },
  needs_information: {
    da: "Kræver oplysninger", en: "Information required", de: "Informationen erforderlich", it: "Informazioni richieste", hu: "További információ szükséges",
    sv: "Kräver information", fr: "Informations requises", pl: "Wymagane informacje", cs: "Vyžadovány informace",
  },
  approved: {
    da: "Godkendt", en: "Approved", de: "Genehmigt", it: "Approvato", hu: "Jóváhagyva",
    sv: "Godkänd", fr: "Approuvé", pl: "Zatwierdzono", cs: "Schváleno",
  },
  rejected: {
    da: "Afvist", en: "Rejected", de: "Abgelehnt", it: "Rifiutato", hu: "Elutasítva",
    sv: "Avslagen", fr: "Refusé", pl: "Odrzucono", cs: "Zamítnuto",
  },
  cancelled: {
    da: "Annulleret", en: "Cancelled", de: "Storniert", it: "Annullato", hu: "Törölve",
    sv: "Avbruten", fr: "Annulé", pl: "Anulowano", cs: "Zrušeno",
  },
};

export function warrantySubmissionStatusLabel(
  status: WarrantySubmissionStatus,
  language: PortalUiLanguage,
): string {
  return LABELS[status][language] ?? LABELS[status].en;
}

export function warrantySubmissionStatusClass(status: WarrantySubmissionStatus): string {
  switch (status) {
    case "approved": return "bg-emerald-50 text-emerald-700";
    case "rejected": return "bg-rose-50 text-rose-700";
    case "needs_information": return "bg-amber-50 text-amber-800";
    case "pending": return "bg-sky-50 text-sky-700";
    case "submitted": return "bg-slate-100 text-slate-700";
    default: return "bg-slate-100 text-slate-600";
  }
}
