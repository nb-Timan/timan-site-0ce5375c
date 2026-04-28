/**
 * Timan Service Portal — Claim / Reclamation tool.
 *
 * Standalone component used by the Service / Claims page.
 * Local state only — not connected to Supabase yet.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Copy,
  FileEdit,
  History,
  Layers,
  Lock,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  Save,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { usePortalLanguage, type PortalLang } from "@/components/PortalHeader";
import {
  addConnectedClaim,
  addDealerComment,
  CLAIM_STATUS_LABEL,
  claimDisplayId,
  createDealerClaim,
  generateClaimNumber,
  getClaimById,
  getGroupClaims,
  isPastApproval,
  setClaimStatus,
  updateAdminFields,
  type ClaimAuditEntry,
  type ClaimComment,
  type ClaimRecord,
  type ClaimStatus,
} from "@/lib/claims-store";
import {
  COUNTRY_GROUP_LABEL,
  getCountriesGrouped,
} from "@/lib/countries-store";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format-date";

const LANGUAGES = [
  { code: "dk", name: "Dansk", flag: "DK" },
  { code: "gb", name: "English", flag: "GB" },
  { code: "de", name: "Deutsch", flag: "DE" },
  { code: "se", name: "Svenska", flag: "SE" },
  { code: "fr", name: "Francais", flag: "FR" },
  { code: "es", name: "Espanol", flag: "ES" },
  { code: "it", name: "Italiano", flag: "IT" },
  { code: "pl", name: "Polski", flag: "PL" },
  { code: "cz", name: "Cestina", flag: "CZ" },
  { code: "hu", name: "Magyar", flag: "HU" },
] as const;

const TRANSLATIONS = {
  dk: {
    title: "Reklamationsværktøj",
    subtitle: "Officiel portal for forhandlere",
    validationError:
      "Fejl: Udfyld alle felter med * og sørg for at emails indeholder @.",
    intro: {
      title: "Vigtig information",
      ok: "Forstået - Start reklamation",
      body:
        "Reklamationen vil ikke blive behandlet, og reparationen bør ikke igangsættes, uden at Timan forudgående er kontaktet og der er udleveret et reklamationsnummer.\n\nTimetaksten er fastsat i aftalen mellem Timan og forhandleren.\n\nReklamationsrapporten skal returneres til Timan senest 10 dage efter udførelse af arbejdet.\n\nNår reklamationsarbejdet er udført og senest 3 måneder efter udstedelse af reklamationsnummeret, behandler og krediterer Timan den indsendte rapport senest 14 dage efter modtagelse.",
    },
    steps: {
      s1: "Kontakt Timan før start",
      s2: "Reklamations nr.",
      s3: "Forhandler & Ejer",
      s4: "Maskin Info",
      s5: "Dato",
      s6: "Beskrivelse",
      s7: "Reservedele & Arbejde",
      s8: "Generer PDF",
    },
    sections: {
      dealer: "Forhandler Information",
      owner: "Ejer Information",
      machine: "Maskin Information",
      dates: "Datoer",
      parts: "RESERVEDELE & ARBEJDE",
      summary: "OVERSIGT",
    },
    labels: {
      dealer: "Forhandler",
      country: "Land",
      contact: "Kontaktperson",
      phone: "Telefon nr.",
      email: "Mail",
      owner: "Ejer",
      address: "Vej / gade",
      postal: "Postnummer",
      machineType: "Maskintype",
      serialNo: "Serienummer",
      hours: "Timetæller stand",
      guaranteeNo: "Garantinummer (Tildeles af Timan)",
      saleDate: "Salgsdato",
      damageDate: "Skadesdato",
      approvedDate: "Godkendt dato",
      repairDate: "Reparationsdato",
      faultDesc: "Fejlbeskrivelse",
      repairDesc: "Reparationsbeskrivelse",
      qty: "Antal",
      partNo: "Reservedelsnr.",
      desc: "Beskrivelse",
      unitPrice: "Stykpris Netto",
      totalPrice: "Pris i alt",
      workingHours: "Arbejdstimer",
      drivingKm: "Antal kørte km",
      summaryKm: "Kørte km",
      totalSum: "TOTAL SUM",
      submit: "Generer PDF",
      disclaimer:
        "Reklamationen behandles kun med forudgående kontakt og nummer.",
    },
  },
  gb: {
    title: "Reclamation Tool",
    subtitle: "Official Dealer Portal",
    validationError: "Error: Fill in all fields with * and check emails.",
    intro: {
      title: "Important information",
      ok: "OK - Start Claim",
      body:
        "The claim will not be processed, and the repair must not be started, unless Timan has been contacted in advance and a claim number has been issued.",
    },
    steps: {
      s1: "Contact Timan first",
      s2: "Claim No.",
      s3: "Dealer & Owner",
      s4: "Machine Info",
      s5: "Dates",
      s6: "Description",
      s7: "Parts & Labor",
      s8: "Generate PDF",
    },
    sections: {
      dealer: "Dealer Information",
      owner: "Owner Information",
      machine: "Machine Info",
      dates: "Dates",
      parts: "PARTS & LABOR",
      summary: "SUMMARY",
    },
    labels: {
      dealer: "Dealer",
      country: "Country",
      contact: "Contact Person",
      phone: "Phone No.",
      email: "Email",
      owner: "Owner",
      address: "Address",
      postal: "Postal Code",
      machineType: "Type",
      serialNo: "Serial No.",
      hours: "Hours",
      guaranteeNo: "Warranty No.",
      saleDate: "Sale Date",
      damageDate: "Damage Date",
      approvedDate: "Approved Date",
      repairDate: "Repair Date",
      faultDesc: "Fault Desc.",
      repairDesc: "Repair Desc.",
      qty: "Qty",
      partNo: "Part No.",
      desc: "Description",
      unitPrice: "Net Price",
      totalPrice: "Total",
      workingHours: "Labor Hours",
      drivingKm: "Driven km",
      summaryKm: "Driven km",
      totalSum: "TOTAL SUM",
      submit: "Generate PDF",
      disclaimer: "Claims only processed with prior contact.",
    },
  },
} as const;

type LanguageCode = keyof typeof TRANSLATIONS;

type PartLine = {
  id: number;
  qty: string;
  partNo: string;
  desc: string;
  unitPrice: string;
};

/** Map shared portal language → claim translation key (only DK/GB exist). */
function mapPortalLang(p: PortalLang): LanguageCode {
  return p === "DK" ? "dk" : "gb";
}

export interface ClaimToolProps {
  /** When provided, the form is prefilled with this claim's detail. */
  initialClaim?: ClaimRecord;
  /** When true, the entire form is rendered read-only and submission is hidden. */
  readOnly?: boolean;
  /**
   * Timan-Admin mode. When true, the admin comment field becomes editable
   * and a small set of price-overview fields (working hours, driving km,
   * total price) remain editable even if the claim is otherwise read-only
   * (e.g. closed/rejected). Replaces the dealer "Generer PDF" submit with
   * an admin "Gem ændringer" save action.
   */
  adminMode?: boolean;
}

export function ClaimTool({
  initialClaim,
  readOnly = false,
  adminMode = false,
}: ClaimToolProps = {}) {
  const [portalLang] = usePortalLanguage();
  const lang = mapPortalLang(portalLang);
  const [showErrors, setShowErrors] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [adminSaved, setAdminSaved] = useState(false);
  // Saving state for the dealer-side "draft" / "activate" actions.
  const [savingAction, setSavingAction] = useState<null | "draft" | "activate">(
    null,
  );
  const [dealerSavedMsg, setDealerSavedMsg] = useState<string | null>(null);
  // Skip the intro modal when opening an existing claim (view/edit), or in
  // read-only mode where no submission is possible anyway.
  const [showIntro, setShowIntro] = useState(!initialClaim && !readOnly);
  const [adminComment, setAdminComment] = useState(initialClaim?.adminComment ?? "");
  const navigate = useNavigate();

  // Live status — mutated locally so the UI reflects workflow transitions
  // (Accept/Reject/Reopen/etc.) without a full route reload. Initialised
  // from the loaded claim and synced back to the in-memory store via
  // setClaimStatus().
  const [liveStatus, setLiveStatus] = useState<ClaimStatus | undefined>(
    initialClaim?.status,
  );
  const [dealerComments, setDealerComments] = useState<ClaimComment[]>(
    initialClaim?.dealerComments ?? [],
  );
  const [auditLog, setAuditLog] = useState<ClaimAuditEntry[]>(
    initialClaim?.auditLog ?? [],
  );
  // "Ikke accepteret" comment modal state.
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  /**
   * Auto-generated claim number for *new* claims (Ny claim).
   * Format: `CL-YYYY-NNNN`. The dealer never types this manually.
   * For an existing claim, we fall back to its stored groupId so the
   * top-of-form display still shows the same case number.
   */
  const [generatedClaimId] = useState(() =>
    initialClaim ? initialClaim.groupId : generateClaimNumber(),
  );
  const displayClaimNumber = initialClaim
    ? claimDisplayId(initialClaim)
    : `${generatedClaimId}/1`;

  // Connected (grouped) claims — siblings of the current claim sharing the
  // same main case number (groupId). Only meaningful when an existing claim
  // is open.
  const groupClaims = useMemo(
    () => (initialClaim ? getGroupClaims(initialClaim.groupId) : []),
    [initialClaim],
  );
  const isGrouped = groupClaims.length > 1;

  /** Resolve effective status (live edits override props for the open claim). */
  const effectiveStatus: ClaimStatus | undefined = liveStatus;

  /**
   * After Timan approval the dealer is locked out of the entire claim form,
   * regardless of the prop passed by the route. Approved/rejected/closed/
   * dealer_in_progress/awaiting_* statuses all mean the dealer cannot edit
   * the claim data — only Timan can.
   */
  const dealerLocked =
    !adminMode && !!effectiveStatus && isPastApproval(effectiveStatus);
  const formReadOnly = readOnly || dealerLocked;

  function refreshFromStore() {
    if (!initialClaim) return;
    const fresh = getClaimById(initialClaim.id);
    if (!fresh) return;
    setLiveStatus(fresh.status);
    setDealerComments(fresh.dealerComments ?? []);
    setAuditLog(fresh.auditLog ?? []);
  }

  function handleSetStatus(next: ClaimStatus) {
    if (!initialClaim) return;
    setClaimStatus(initialClaim.id, next);
    setLiveStatus(next);
  }

  function handleAddDealerComment(text: string) {
    if (!initialClaim || !text.trim()) return;
    addDealerComment(initialClaim.id, text);
    refreshFromStore();
  }

  function handleRejectConfirm(nextStatus: ClaimStatus) {
    if (!rejectComment.trim()) return;
    handleAddDealerComment(rejectComment);
    handleSetStatus(nextStatus);
    setRejectComment("");
    setRejectModalOpen(false);
  }

  function handleAddConnectedMachine() {
    if (!initialClaim) return;
    const created = addConnectedClaim(initialClaim.id);
    if (!created) return;
    const target = adminMode ? "/admin/claims/$claimId" : "/dealer/claims/$claimId";
    navigate({ to: target, params: { claimId: created.id } });
  }

  const t = (key: string): string => {
    const parts = key.split(".");
    let translation: unknown = TRANSLATIONS[lang] ?? TRANSLATIONS.gb;
    for (const part of parts) {
      if (translation && typeof translation === "object" && part in translation) {
        translation = (translation as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    return typeof translation === "string" ? translation : key;
  };

  const [formData, setFormData] = useState(() => {
    const d = initialClaim?.detail;
    return {
      guaranteeNo: initialClaim?.warrantyNo ?? generatedClaimId,
      dealer: d?.dealer ?? "",
      dealerCountry: d?.dealerCountry ?? "",
      dealerContact: d?.dealerContact ?? "",
      dealerPhone: d?.dealerPhone ?? "",
      dealerEmail: d?.dealerEmail ?? "",
      owner: d?.owner ?? "",
      ownerCountry: d?.ownerCountry ?? "",
      ownerAddress: d?.ownerAddress ?? "",
      ownerPostal: d?.ownerPostal ?? "",
      ownerPhone: "",
      ownerEmail: "",
      machineType: d?.machineType ?? "",
      serialNo: d?.serialNo ?? "",
      hours: d?.hours ?? "",
      saleDate: d?.saleDate ?? "",
      damageDate: d?.damageDate ?? "",
      approvedDate: d?.approvedDate ?? "",
      repairDate: d?.repairDate ?? "",
      faultDesc: d?.faultDesc ?? "",
      repairDesc: d?.repairDesc ?? "",
      parts: (d?.parts && d.parts.length > 0
        ? d.parts.map((p, idx) => ({ id: idx + 1, ...p }))
        : [
            { id: 1, qty: "1", partNo: "", desc: "", unitPrice: "" },
            { id: 2, qty: "1", partNo: "", desc: "", unitPrice: "" },
            { id: 3, qty: "1", partNo: "", desc: "", unitPrice: "" },
          ]) as PartLine[],
      laborHours: d?.laborHours ?? "0",
      drivingKm: d?.drivingKm ?? "0",
      currency: d?.currency ?? "DKK",
    };
  });

  const stepStatus = useMemo(() => {
    const hasGuarantee = !!formData.guaranteeNo.trim();
    const dealerComplete = !!(
      formData.dealer.trim() && formData.dealerPhone.trim()
    );
    const ownerComplete = !!(
      formData.owner.trim() && formData.ownerAddress.trim()
    );
    const machineComplete = !!(
      formData.machineType.trim() && formData.serialNo.trim()
    );
    const datesComplete = !!(formData.saleDate && formData.repairDate);
    const descComplete = !!(
      formData.faultDesc.trim() && formData.repairDesc.trim()
    );
    const partsComplete = !!(
      formData.laborHours !== "0" ||
      formData.parts.some((part) => part.desc.trim())
    );

    return {
      s1: hasGuarantee,
      s2: hasGuarantee,
      s3: dealerComplete && ownerComplete,
      s4: machineComplete,
      s5: datesComplete,
      s6: descComplete,
      s7: partsComplete,
      s8:
        hasGuarantee &&
        dealerComplete &&
        ownerComplete &&
        machineComplete &&
        datesComplete &&
        descComplete &&
        partsComplete,
    };
  }, [formData]);

  const totals = useMemo(() => {
    const partsTotal = formData.parts.reduce((acc, current) => {
      const qty = parseFloat(current.qty.replace(",", ".")) || 0;
      const unitPrice = parseFloat(current.unitPrice.replace(",", ".")) || 0;
      return acc + qty * unitPrice;
    }, 0);
    return { parts: partsTotal, grandTotal: partsTotal };
  }, [formData.parts]);

  /**
   * Build a {@link ClaimDetail} payload from the current form state.
   * Used by both "Gem til senere" and "Aktiver claim".
   */
  function buildDetailFromForm() {
    return {
      dealer: formData.dealer,
      dealerCountry: formData.dealerCountry,
      dealerContact: formData.dealerContact,
      dealerPhone: formData.dealerPhone,
      dealerEmail: formData.dealerEmail,
      owner: formData.owner,
      ownerCountry: formData.ownerCountry,
      ownerAddress: formData.ownerAddress,
      ownerPostal: formData.ownerPostal,
      machineType: formData.machineType,
      serialNo: formData.serialNo,
      hours: formData.hours,
      saleDate: formData.saleDate,
      damageDate: formData.damageDate,
      approvedDate: formData.approvedDate,
      repairDate: formData.repairDate,
      faultDesc: formData.faultDesc,
      repairDesc: formData.repairDesc,
      parts: formData.parts.map(({ id: _id, ...p }) => p),
      laborHours: formData.laborHours,
      drivingKm: formData.drivingKm,
      currency: formData.currency as "DKK",
    };
  }

  /**
   * Save & navigate to the freshly created claim. `status` decides:
   *  - `in_progress` → "Gem til senere redigering" (draft, dealer can still edit)
   *  - `waiting`     → "Aktiver claim og afvent Timan"
   */
  function handleSave(status: Extract<ClaimStatus, "in_progress" | "waiting">) {
    if (initialClaim) return; // existing-claim editing is handled elsewhere
    setSavingAction(status === "waiting" ? "activate" : "draft");
    setShowErrors(false);
    setDealerSavedMsg(null);
    const created = createDealerClaim({
      groupId: generatedClaimId,
      warrantyNo: generatedClaimId,
      status,
      detail: buildDetailFromForm(),
      totalPrice: totals.grandTotal,
    });
    setDealerSavedMsg(
      status === "waiting"
        ? "Claim aktiveret. Timan er nu informeret og kan se sagen."
        : "Kladde gemt. Du kan fortsætte redigeringen senere.",
    );
    // Small delay so the success message is visible before navigation.
    setTimeout(() => {
      setSavingAction(null);
      navigate({
        to: "/dealer/claims/$claimId",
        params: { claimId: created.id },
      });
    }, 800);
  }

  const updatePart = (id: number, field: keyof PartLine, value: string) => {
    setFormData({
      ...formData,
      parts: formData.parts.map((part) =>
        part.id === id ? { ...part, [field]: value } : part,
      ),
    });
  };

  return (
    <div className="bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {showIntro && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800">
                {t("intro.title")}
              </h2>
            </div>
            <div className="p-8">
              <p className="mb-8 whitespace-pre-line leading-relaxed text-slate-600">
                {t("intro.body")}
              </p>
              <button
                type="button"
                onClick={() => setShowIntro(false)}
                className="w-full rounded-xl bg-green-700 py-4 font-bold text-white shadow-lg shadow-green-100 transition-all hover:bg-green-800"
              >
                {t("intro.ok")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language is controlled from the shared portal header */}

      {/* Stepper */}
      <div className="border-b bg-slate-900 py-4 shadow-inner no-print">
        <div className="scrollbar-hide mx-auto flex max-w-6xl items-center justify-between gap-4 overflow-x-auto px-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
            const active = stepStatus[`s${num}` as keyof typeof stepStatus];
            return (
              <div
                key={num}
                className="flex shrink-0 items-center gap-3"
                style={{ opacity: active || num === 1 ? 1 : 0.4 }}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                    active
                      ? "bg-green-500 shadow-lg shadow-green-900/40"
                      : "border border-slate-700 bg-slate-800 text-slate-500"
                  }`}
                >
                  {active ? (
                    <Check className="h-5 w-5 text-white" />
                  ) : (
                    <span className="text-xs font-bold">{num}</span>
                  )}
                </div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-tight ${
                    active ? "text-white" : "text-slate-500"
                  }`}
                >
                  {t(`steps.s${num}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {/* Connected / grouped claims panel — siblings under the same main case. */}
        {initialClaim && isGrouped && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 no-print">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                  <Layers className="h-3.5 w-3.5" />
                  Samlet sag · {initialClaim.groupId}
                </div>
                <p className="mt-1 text-sm text-indigo-900">
                  Denne reklamation er en del af en samlet sag med{" "}
                  <span className="font-black">{groupClaims.length} maskiner</span>.
                  Hver maskine har sin egen claim, men de hører til samme hovedsag.
                </p>
              </div>
              {!adminMode && !readOnly && (
                <button
                  type="button"
                  onClick={handleAddConnectedMachine}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" /> Tilføj endnu en maskine
                </button>
              )}
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupClaims.map((sibling) => {
                const current = sibling.id === initialClaim.id;
                const target = adminMode
                  ? "/admin/claims/$claimId"
                  : "/dealer/claims/$claimId";
                return (
                  <li key={sibling.id}>
                    <Link
                      to={target}
                      params={{ claimId: sibling.id }}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors ${
                        current
                          ? "border-indigo-400 bg-white shadow-sm"
                          : "border-indigo-200 bg-white/60 hover:bg-white"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="font-mono font-black text-slate-900">
                          {claimDisplayId(sibling)}
                        </span>
                        <span className="ml-2 truncate text-slate-500">
                          {sibling.serial || "— intet serienr —"}
                        </span>
                      </span>
                      {current && (
                        <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">
                          Aktuel
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Onboarding banner shown when a connected claim was just created
            via "Tilføj endnu en maskine" — common data is copied, but the
            dealer must review per-machine fields. Detected by empty serial. */}
        {initialClaim && isGrouped && !readOnly && !adminMode && !initialClaim.serial && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 no-print">
            <Copy className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-black">
                Fælles data er kopieret fra første claim i sagen.
              </p>
              <p className="mt-1">
                Husk at gennemgå og opdatere:{" "}
                <span className="font-bold">Serienummer</span>,{" "}
                <span className="font-bold">Ejer / kunde</span>,{" "}
                <span className="font-bold">Maskin info</span>,{" "}
                <span className="font-bold">Datoer</span> og{" "}
                <span className="font-bold">Beskrivelse</span> hvis nødvendigt.
              </p>
            </div>
          </div>
        )}

        {/* "Add machine" button when viewing/editing a standalone claim that
            doesn't yet have siblings — lets the dealer start grouping. */}
        {initialClaim && !isGrouped && !readOnly && !adminMode && (
          <div className="flex justify-end no-print">
            <button
              type="button"
              onClick={handleAddConnectedMachine}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" /> Tilføj endnu en maskine til samme sag
            </button>
          </div>
        )}

        {dealerLocked && !adminMode && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-800 no-print">
            <Lock className="mt-0.5 h-5 w-5 text-slate-500" />
            <div className="text-sm">
              <p className="font-black">Låst efter Timan-godkendelse</p>
              <p className="mt-0.5 text-slate-600">
                Status: <span className="font-bold">{CLAIM_STATUS_LABEL[effectiveStatus!]}</span>.
                Claim-data kan ikke længere redigeres af forhandleren. Eventuelle
                ændringer foretaget af Timan Admin vises i ændringsloggen nederst.
              </p>
            </div>
          </div>
        )}
        {readOnly && !adminMode && !dealerLocked && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700 no-print">
            <AlertTriangle className="h-5 w-5 text-slate-500" />
            <p className="text-sm font-bold">
              Denne sag er låst og kan kun ses.
            </p>
          </div>
        )}
        {adminMode && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 no-print">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="text-sm font-bold">
              Admin review — du kan justere claim-data. Ændringer efter godkendelse
              registreres automatisk i ændringsloggen.
            </p>
          </div>
        )}

        {/* Workflow actions panel — status-driven buttons for dealer + admin. */}
        {initialClaim && effectiveStatus && (
          <WorkflowPanel
            status={effectiveStatus}
            adminMode={adminMode}
            onAccept={() => handleSetStatus("dealer_in_progress")}
            onWait={() => {
              /* status unchanged — visual confirmation only */
            }}
            onDealerReject={() => setRejectModalOpen(true)}
            onReadyToClose={() => handleSetStatus("awaiting_timan_close")}
            onAdminApprove={() => handleSetStatus("approved")}
            onAdminReject={() => handleSetStatus("rejected")}
            onAdminClose={() => handleSetStatus("closed")}
            onAdminSendBack={() => handleSetStatus("dealer_in_progress")}
            onAdminReopen={() => handleSetStatus("dealer_in_progress")}
            onAdminMoveForward={() => handleSetStatus("approved")}
          />
        )}

        {showErrors && !formReadOnly && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 no-print">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm font-bold">{t("validationError")}</p>
          </div>
        )}

        <fieldset disabled={formReadOnly} className="contents">

        <div className="rounded-2xl border border-slate-200 border-l-8 border-l-green-700 bg-white p-6 shadow-sm print:border-none print:p-0 print:shadow-none">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-green-800">
            Reklamations nr. {!initialClaim && (
              <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-800">
                Auto-genereret
              </span>
            )}
          </label>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 print:bg-white">
            <span className="font-mono text-2xl font-black tracking-tight text-slate-900">
              {displayClaimNumber}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {initialClaim ? "Eksisterende sag" : "Tildeles ved oprettelse"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2 print:gap-2">
          <SectionBox
            title={t("sections.dealer")}
            icon={<Wrench className="h-4 w-4" />}
          >
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label={t("labels.dealer")}
                value={formData.dealer}
                onChange={(value) => setFormData({ ...formData, dealer: value })}
                required
              />
              <CountrySelect
                label={t("labels.country")}
                value={formData.dealerCountry}
                onChange={(value) =>
                  setFormData({ ...formData, dealerCountry: value })
                }
                required
                disabled={readOnly && !adminMode}
              />
              <FormInput
                label={t("labels.contact")}
                value={formData.dealerContact}
                onChange={(value) =>
                  setFormData({ ...formData, dealerContact: value })
                }
                required
              />
              <FormInput
                label={t("labels.phone")}
                value={formData.dealerPhone}
                onChange={(value) =>
                  setFormData({ ...formData, dealerPhone: value })
                }
                required
              />
            </div>
            <div className="mt-3">
              <FormInput
                label={t("labels.email")}
                value={formData.dealerEmail}
                onChange={(value) =>
                  setFormData({ ...formData, dealerEmail: value })
                }
                required
                type="email"
              />
            </div>
          </SectionBox>

          <SectionBox
            title={t("sections.owner")}
            icon={<User className="h-4 w-4" />}
          >
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label={t("labels.owner")}
                value={formData.owner}
                onChange={(value) => setFormData({ ...formData, owner: value })}
                required
              />
              <CountrySelect
                label={t("labels.country")}
                value={formData.ownerCountry}
                onChange={(value) =>
                  setFormData({ ...formData, ownerCountry: value })
                }
                required
                disabled={readOnly && !adminMode}
              />
              <FormInput
                label={t("labels.address")}
                value={formData.ownerAddress}
                onChange={(value) =>
                  setFormData({ ...formData, ownerAddress: value })
                }
                required
              />
              <FormInput
                label={t("labels.postal")}
                value={formData.ownerPostal}
                onChange={(value) =>
                  setFormData({ ...formData, ownerPostal: value })
                }
                required
              />
            </div>
          </SectionBox>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2 print:gap-2">
          <SectionBox title={t("sections.machine")}>
            <div className="w-full">
              <label className="mb-1 block text-[9px] font-bold uppercase text-slate-400 print:text-black">
                {t("labels.machineType")} *
              </label>
              <Select
                value={formData.machineType || undefined}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, machineType: value })
                }
                disabled={readOnly && !adminMode}
              >
                <SelectTrigger
                  className={`h-auto w-full rounded-lg border px-3 py-2 text-sm shadow-none ${
                    showErrors && !formData.machineType.trim()
                      ? "border-red-200 bg-red-50"
                      : "border-slate-200 bg-slate-50"
                  } print:border-black print:bg-white`}
                >
                  <SelectValue placeholder="Vælg maskintype" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "RC-750",
                    "RC-751",
                    "RC-1000",
                    "Timan 3330",
                    "Timan 2620",
                    "Timan Tool-Trac",
                  ].map((machineType) => (
                    <SelectItem key={machineType} value={machineType}>
                      {machineType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <FormInput
                label={t("labels.serialNo")}
                value={formData.serialNo}
                onChange={(value) =>
                  setFormData({ ...formData, serialNo: value })
                }
                required
              />
              <FormInput
                label={t("labels.hours")}
                value={formData.hours}
                onChange={(value) => setFormData({ ...formData, hours: value })}
                required
              />
            </div>
          </SectionBox>

          <SectionBox title={t("sections.dates")}>
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label={t("labels.saleDate")}
                type="date"
                value={formData.saleDate}
                onChange={(value) =>
                  setFormData({ ...formData, saleDate: value })
                }
                required
              />
              <FormInput
                label={t("labels.damageDate")}
                type="date"
                value={formData.damageDate}
                onChange={(value) =>
                  setFormData({ ...formData, damageDate: value })
                }
                required
              />
              <FormInput
                label={t("labels.approvedDate")}
                type="date"
                value={formData.approvedDate}
                onChange={(value) =>
                  setFormData({ ...formData, approvedDate: value })
                }
                required
              />
              <FormInput
                label={t("labels.repairDate")}
                type="date"
                value={formData.repairDate}
                onChange={(value) =>
                  setFormData({ ...formData, repairDate: value })
                }
                required
              />
            </div>
          </SectionBox>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2 print:gap-2">
          <TextAreaBox
            title={`${t("labels.faultDesc")} *`}
            value={formData.faultDesc}
            onChange={(value) => setFormData({ ...formData, faultDesc: value })}
            missing={isFieldMissing(formData.faultDesc, true)}
          />
          <TextAreaBox
            title={`${t("labels.repairDesc")} *`}
            value={formData.repairDesc}
            onChange={(value) => setFormData({ ...formData, repairDesc: value })}
            missing={isFieldMissing(formData.repairDesc, true)}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between bg-[#111827] p-4 text-white print:border-b print:bg-white print:text-black">
            <h3 className="text-sm font-bold uppercase tracking-widest">
              {t("sections.parts")}
            </h3>
            <button
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  parts: [
                    ...formData.parts,
                    {
                      id: Date.now(),
                      qty: "1",
                      partNo: "",
                      desc: "",
                      unitPrice: "",
                    },
                  ],
                })
              }
              className="rounded-full bg-green-600 p-1.5 transition-colors hover:bg-green-700 no-print"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50">
                <tr className="text-[10px] font-black uppercase text-slate-500">
                  <th className="w-20 px-4 py-3">{t("labels.qty")}</th>
                  <th className="w-40 px-4 py-3">{t("labels.partNo")}</th>
                  <th className="px-4 py-3">{t("labels.desc")}</th>
                  <th className="w-40 px-4 py-3 text-right">
                    {t("labels.unitPrice")}
                  </th>
                  <th className="w-40 px-4 py-3 text-right">
                    {t("labels.totalPrice")}
                  </th>
                  <th className="w-12 px-4 py-3 no-print" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formData.parts.map((part) => (
                  <tr
                    key={part.id}
                    className="transition-colors hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3">
                      <TableInput
                        value={part.qty}
                        onChange={(value) => updatePart(part.id, "qty", value)}
                        numeric
                      />
                    </td>
                    <td className="px-4 py-3">
                      <TableInput
                        value={part.partNo}
                        onChange={(value) => updatePart(part.id, "partNo", value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <TableInput
                        value={part.desc}
                        onChange={(value) => updatePart(part.id, "desc", value)}
                        italic
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TableInput
                        value={part.unitPrice}
                        onChange={(value) =>
                          updatePart(part.id, "unitPrice", value)
                        }
                        alignRight
                        numeric
                        decimals
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">
                      {(
                        (parseFloat(part.qty.replace(",", ".")) || 0) *
                        (parseFloat(part.unitPrice.replace(",", ".")) || 0)
                      ).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center no-print">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            parts: formData.parts.filter(
                              (item) => item.id !== part.id,
                            ),
                          })
                        }
                        className="text-slate-300 transition-colors hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        </fieldset>

        {/*
          Price-overview row + admin comment.
          In admin mode, working hours / driving km / total price remain
          editable here even when the rest of the claim form is read-only
          (e.g. closed/rejected). Dealers see this block as read-only when
          their `readOnly` flag is set.
        */}
        <fieldset
          disabled={formReadOnly && !adminMode}
          className="contents"
        >
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
              <div className="grid grid-cols-2 gap-6">
                <FormInput
                  label={t("labels.workingHours")}
                  value={formData.laborHours}
                  onChange={(value) =>
                    setFormData({ ...formData, laborHours: value })
                  }
                  numeric
                  decimals
                  unit="h"
                />
                <FormInput
                  label={t("labels.drivingKm")}
                  value={formData.drivingKm}
                  onChange={(value) =>
                    setFormData({ ...formData, drivingKm: value })
                  }
                  numeric
                  unit="km"
                />
              </div>
              <p className="mt-8 text-[10px] font-bold italic leading-relaxed text-red-600 opacity-80">
                {t("labels.disclaimer")}
              </p>

              {/* Admin comment — visible to both Timan Admin and dealer. */}
              {(adminMode || adminComment.trim()) && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-800">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Kommentar fra Timan Admin
                  </div>
                  {adminMode ? (
                    <textarea
                      className="h-28 w-full rounded-lg border border-amber-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-amber-100"
                      placeholder="Tilføj en kommentar…"
                      value={adminComment}
                      onChange={(event) => setAdminComment(event.target.value)}
                    />
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-amber-900">
                      {adminComment}
                    </p>
                  )}
                </div>
              )}

              {/* Dealer comments thread + add-comment box on rejected claims. */}
              {initialClaim && (dealerComments.length > 0 || effectiveStatus === "rejected") && (
                <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-800">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Forhandler-kommentarer
                  </div>
                  {dealerComments.length === 0 ? (
                    <p className="text-xs italic text-orange-800/70">Ingen kommentarer endnu.</p>
                  ) : (
                    <ul className="space-y-2">
                      {dealerComments.map((c) => (
                        <li key={c.id} className="rounded-lg border border-orange-200 bg-white p-3 text-sm">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-orange-700">
                            <span>{c.author}</span>
                            <span>{formatDateTime(c.at)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-orange-900">{c.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!adminMode && effectiveStatus === "rejected" && (
                    <DealerReplyBox onSubmit={handleAddDealerComment} />
                  )}
                </div>
              )}

              {/* Audit log — shows Timan changes after approval. */}
              {initialClaim && auditLog.length > 0 && (
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                    <History className="h-3.5 w-3.5" />
                    Ændringslog · Changed by Timan Admin
                  </div>
                  <ul className="divide-y divide-slate-200">
                    {auditLog.map((e) => (
                      <li key={e.id} className="py-2 text-xs">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          <span>{e.by} · {e.field}</span>
                          <span>{formatDateTime(e.at)}</span>
                        </div>
                        <div className="mt-1 font-mono text-slate-700">
                          <span className="line-through text-slate-400">{e.oldValue || "—"}</span>
                          {" → "}
                          <span className="font-bold text-slate-900">{e.newValue || "—"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="relative overflow-hidden rounded-3xl border-b-8 border-green-600 bg-[#111827] p-8 text-white shadow-2xl">
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-green-600/5 blur-2xl" />
              <div className="relative z-10 mb-8 flex items-center justify-between">
                <span className="text-sm font-black uppercase tracking-[0.2em] text-green-400">
                  {t("sections.summary")}
                </span>
                <span className="rounded-lg bg-green-600 px-3 py-1 text-xs font-black shadow-lg shadow-green-900/40">
                  {formData.currency}
                </span>
              </div>

              <div className="relative z-10 mb-8 space-y-4">
                <SummaryRow
                  label={t("sections.parts")}
                  value={totals.parts.toFixed(2)}
                />
                <SummaryRow
                  label={t("labels.workingHours")}
                  value={`${formData.laborHours || 0} h`}
                />
                <SummaryRow
                  label={t("labels.summaryKm")}
                  value={`${formData.drivingKm || 0} km`}
                />
              </div>

              <div className="relative z-10 border-t border-slate-800 pt-8 text-right">
                <span className="mb-2 block text-[11px] font-bold uppercase leading-none tracking-widest text-slate-500">
                  {t("labels.totalSum")}
                </span>
                <span className="text-5xl font-black italic leading-none tracking-tighter text-white">
                  {totals.grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </fieldset>

        {/*
          New-claim bottom actions for the dealer:
            1. "Gem til senere redigering" — saves as draft (status I gang)
            2. "Aktiver claim og afvent Timan" — submits (status Afventer accept)
          Existing claims open in edit mode and don't need these — the
          dealer there uses the regular form fields.
        */}
        {!readOnly && !adminMode && !initialClaim && (
          <div className="flex flex-col items-center gap-4 py-8 no-print">
            {dealerSavedMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
                <Check className="h-4 w-4" />
                {dealerSavedMsg}
              </div>
            )}
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => handleSave("in_progress")}
                disabled={savingAction !== null}
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-8 py-4 text-sm font-black uppercase tracking-widest text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
              >
                {savingAction === "draft" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileEdit className="h-5 w-5" />
                )}
                Gem til senere redigering
              </button>
              <button
                type="button"
                onClick={() => handleSave("waiting")}
                disabled={savingAction !== null}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-green-600 px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-green-100 transition-all hover:-translate-y-0.5 hover:bg-green-700 disabled:opacity-60"
              >
                {savingAction === "activate" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                Aktiver claim og afvent Timan
              </button>
            </div>
            <p className="max-w-md text-center text-[11px] text-slate-500">
              Claim-nummer <span className="font-mono font-bold text-slate-700">{displayClaimNumber}</span>{" "}
              er automatisk genereret. Du kan altid finde sagen igen under "Mine claims".
            </p>
          </div>
        )}

        {adminMode && initialClaim && (
          <div className="flex flex-col items-center gap-3 py-8 no-print">
            <button
              type="button"
              onClick={() => {
                setIsSavingAdmin(true);
                setAdminSaved(false);
                updateAdminFields(initialClaim.id, {
                  adminComment,
                  laborHours: formData.laborHours,
                  drivingKm: formData.drivingKm,
                  totalPrice: Math.round(totals.grandTotal),
                });
                setTimeout(() => {
                  setIsSavingAdmin(false);
                  setAdminSaved(true);
                  setTimeout(() => setAdminSaved(false), 2500);
                }, 350);
              }}
              disabled={isSavingAdmin}
              className="flex items-center gap-3 rounded-2xl bg-slate-900 px-10 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
            >
              {isSavingAdmin ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}
              Gem ændringer
            </button>
            {adminSaved && (
              <p className="text-xs font-bold text-emerald-700">
                Ændringer gemt.
              </p>
            )}
          </div>
        )}
      </main>

      {/* "Ikke accepteret" — required-comment modal. */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 p-4 no-print">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
                Ikke accepteret — kommentar krævet
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="mb-3 text-sm text-slate-600">
                Forklar hvorfor du ikke kan acceptere. Sagen sendes til Timan Admin
                med din kommentar.
              </p>
              <textarea
                className="h-32 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-slate-400"
                placeholder="Skriv din kommentar her…"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Annullér
                </button>
                <button
                  type="button"
                  disabled={!rejectComment.trim()}
                  onClick={() => handleRejectConfirm("awaiting_timan_comment")}
                  className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black uppercase tracking-widest text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
                >
                  Send til Timan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="mx-auto mt-8 max-w-6xl border-t px-4 py-12 text-center text-slate-400 no-print">
        <p className="text-sm font-black uppercase italic tracking-tighter text-slate-800">
          <span className="text-red-600">TI</span>
          <span className="text-green-700">MAN</span> A/S
        </p>
        <p className="mt-1 text-xs">
          Osvald Pedersens Vej 2A-D, 6980 Tim - Danmark
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-green-700">
          <Phone className="h-4 w-4 text-red-600" />
          <span>Service - 96 74 44 66</span>
        </div>
      </footer>
    </div>
  );
}

export default ClaimTool;

function isFieldMissing(value: string, required?: boolean, type = "text") {
  if (!required) return false;
  if (!value || value.toString().trim() === "") return true;
  if (type === "email" && !value.includes("@")) return true;
  return false;
}

function SectionBox({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all print:border-none print:p-0 print:shadow-none">
      <h3 className="mb-4 flex items-center gap-2 border-b border-green-50 pb-2 text-xs font-black uppercase tracking-widest text-green-800 print:border-black print:text-black">
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function TextAreaBox({
  title,
  value,
  onChange,
  missing,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  missing?: boolean;
}) {
  return (
    <SectionBox title={title}>
      <textarea
        className={`h-32 w-full rounded-lg border p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-green-100 ${
          missing ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"
        }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </SectionBox>
  );
}

/**
 * Whether `value` is a valid number string for a numeric input.
 * Empty string is considered valid (handled by `required` separately).
 * Accepts `.` or `,` as decimal separator. When `decimals` is false,
 * only integers are accepted.
 */
function isValidNumber(value: string, decimals: boolean): boolean {
  if (!value) return true;
  const pattern = decimals ? /^\d+([.,]\d+)?$/ : /^\d+$/;
  return pattern.test(value);
}

/**
 * Sanitise live keyboard input so the user can never enter letters.
 * Returns the previous value if the new input is malformed.
 */
function sanitiseNumeric(
  next: string,
  prev: string,
  decimals: boolean,
): string {
  if (next === "") return "";
  // Only digits and (optionally) a single decimal separator allowed at all.
  const allowed = decimals ? /^[\d.,]*$/ : /^\d*$/;
  if (!allowed.test(next)) return prev;
  if (decimals) {
    // Disallow more than one decimal separator.
    const sepCount = (next.match(/[.,]/g) || []).length;
    if (sepCount > 1) return prev;
  }
  return next;
}

function FormInput({
  label,
  value,
  onChange,
  required,
  type = "text",
  numeric,
  decimals = false,
  unit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  /** Restrict input to numbers only. */
  numeric?: boolean;
  /** When numeric, allow a decimal separator. */
  decimals?: boolean;
  /** Optional unit suffix shown next to the label, e.g. "h" or "km". */
  unit?: string;
}) {
  const missing = isFieldMissing(value, required, type);
  const numericInvalid = numeric ? !isValidNumber(value, decimals) : false;
  const error = missing || numericInvalid;
  return (
    <div className="w-full">
      <label className="mb-1 block text-[9px] font-bold uppercase text-slate-400 print:text-black">
        {label} {required && "*"}
        {unit && (
          <span className="ml-1 font-normal normal-case text-slate-400">
            ({unit})
          </span>
        )}
      </label>
      <input
        type={type}
        inputMode={numeric ? (decimals ? "decimal" : "numeric") : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all ${
          error
            ? "border-red-300 bg-red-50"
            : "border-slate-200 bg-slate-50 focus:border-green-600"
        } print:border-black print:bg-white`}
        value={value}
        onChange={(event) => {
          if (numeric) {
            const cleaned = sanitiseNumeric(
              event.target.value,
              value,
              decimals,
            );
            onChange(cleaned);
            return;
          }
          onChange(event.target.value);
        }}
      />
      {numericInvalid && (
        <p className="mt-1 text-[10px] font-bold text-red-600">
          {decimals
            ? "Indtast et tal — fx 5,5 eller 12.0."
            : "Indtast kun hele tal."}
        </p>
      )}
    </div>
  );
}

function TableInput({
  value,
  onChange,
  italic,
  alignRight,
  numeric,
  decimals = false,
}: {
  value: string;
  onChange: (value: string) => void;
  italic?: boolean;
  alignRight?: boolean;
  /** Restrict input to numbers only. */
  numeric?: boolean;
  /** When numeric, allow a decimal separator. */
  decimals?: boolean;
}) {
  const numericInvalid = numeric ? !isValidNumber(value, decimals) : false;
  return (
    <div className="w-full">
      <input
        inputMode={numeric ? (decimals ? "decimal" : "numeric") : undefined}
        className={`w-full rounded-md border bg-white px-2 py-1.5 outline-none ${
          numericInvalid
            ? "border-red-300 bg-red-50"
            : "border-slate-200 focus:border-green-600"
        } ${italic ? "italic" : ""} ${alignRight ? "text-right" : ""}`}
        value={value}
        onChange={(event) => {
          if (numeric) {
            const cleaned = sanitiseNumeric(
              event.target.value,
              value,
              decimals,
            );
            onChange(cleaned);
            return;
          }
          onChange(event.target.value);
        }}
      />
      {numericInvalid && (
        <p className="mt-1 text-[10px] font-bold text-red-600">
          {decimals ? "Kun tal — fx 1450,00." : "Kun hele tal."}
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-slate-400">{label}</span>
      <span className="font-mono text-lg">{value}</span>
    </div>
  );
}

/**
 * CountrySelect — grouped dropdown of standardized country names.
 *
 * Replaces the free-text Land input in the claim form. Countries are
 * sourced from `src/lib/countries-store.ts` and grouped into Europe /
 * Outside Europe. Timan Admin can extend the list via /admin/countries.
 */
function CountrySelect({
  label,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const groups = useMemo(() => getCountriesGrouped(), []);
  const missing = required && !value.trim();
  return (
    <div className="w-full">
      <label className="mb-1 block text-[9px] font-bold uppercase text-slate-400 print:text-black">
        {label} {required && "*"}
      </label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          className={`h-auto w-full rounded-lg border px-3 py-2 text-sm shadow-none ${
            missing
              ? "border-red-200 bg-red-50"
              : "border-slate-200 bg-slate-50"
          } print:border-black print:bg-white`}
        >
          <SelectValue placeholder="Vælg land" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{COUNTRY_GROUP_LABEL.europe}</SelectLabel>
            {groups.europe.map((c) => (
              <SelectItem key={`eu-${c.name}`} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>{COUNTRY_GROUP_LABEL.outside}</SelectLabel>
            {groups.outside.map((c) => (
              <SelectItem key={`ow-${c.name}`} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * WorkflowPanel — status-driven action buttons for both Dealer and Timan Admin.
 * Renders the right buttons based on the live status of the open claim.
 */
function WorkflowPanel({
  status,
  adminMode,
  onAccept,
  onWait,
  onDealerReject,
  onReadyToClose,
  onAdminApprove,
  onAdminReject,
  onAdminClose,
  onAdminSendBack,
  onAdminReopen,
  onAdminMoveForward,
}: {
  status: ClaimStatus;
  adminMode: boolean;
  onAccept: () => void;
  onWait: () => void;
  onDealerReject: () => void;
  onReadyToClose: () => void;
  onAdminApprove: () => void;
  onAdminReject: () => void;
  onAdminClose: () => void;
  onAdminSendBack: () => void;
  onAdminReopen: () => void;
  onAdminMoveForward: () => void;
}) {
  const [waited, setWaited] = useState(false);
  const wait = () => {
    onWait();
    setWaited(true);
    setTimeout(() => setWaited(false), 2000);
  };

  const Btn = ({
    onClick,
    children,
    tone = "default",
    icon: Icon,
  }: {
    onClick: () => void;
    children: React.ReactNode;
    tone?: "default" | "primary" | "danger" | "warn";
    icon?: typeof ThumbsUp;
  }) => {
    const cls =
      tone === "primary"
        ? "bg-emerald-600 text-white hover:bg-emerald-700"
        : tone === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : tone === "warn"
        ? "bg-orange-600 text-white hover:bg-orange-700"
        : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50";
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest shadow-sm ${cls}`}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {children}
      </button>
    );
  };

  let content: React.ReactNode = null;
  if (!adminMode) {
    if (status === "approved") {
      content = (
        <>
          <Btn onClick={onAccept} tone="primary" icon={ThumbsUp}>Accepter</Btn>
          <Btn onClick={wait}>Afvent</Btn>
          <Btn onClick={onDealerReject} tone="warn" icon={ThumbsDown}>Ikke accepteret</Btn>
        </>
      );
    } else if (status === "dealer_in_progress") {
      content = (
        <>
          <Btn onClick={onReadyToClose} tone="primary" icon={Check}>Klar til afslutning</Btn>
          <Btn onClick={wait}>Afvent</Btn>
          <Btn onClick={onDealerReject} tone="warn" icon={ThumbsDown}>Ikke accepteret</Btn>
        </>
      );
    }
  } else {
    if (status === "waiting") {
      content = (
        <>
          <Btn onClick={onAdminApprove} tone="primary" icon={ThumbsUp}>Godkend</Btn>
          <Btn onClick={onAdminReject} tone="danger" icon={ThumbsDown}>Afvis</Btn>
        </>
      );
    } else if (status === "awaiting_timan_close") {
      content = (
        <>
          <Btn onClick={onAdminClose} tone="primary" icon={Check}>Luk sag</Btn>
          <Btn onClick={onAdminSendBack}>Send tilbage til forhandler</Btn>
        </>
      );
    } else if (status === "awaiting_timan_comment") {
      content = (
        <>
          <Btn onClick={onAdminMoveForward} tone="primary" icon={ThumbsUp}>Godkend igen</Btn>
          <Btn onClick={onAdminReject} tone="danger" icon={ThumbsDown}>Afvis</Btn>
          <Btn onClick={onAdminSendBack}>Send tilbage til forhandler</Btn>
        </>
      );
    } else if (status === "rejected" || status === "closed") {
      content = <Btn onClick={onAdminReopen} tone="warn">Genåben sag</Btn>;
    }
  }

  if (!content) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm no-print">
      <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
        Handlinger · {CLAIM_STATUS_LABEL[status]}
      </div>
      <div className="flex flex-wrap items-center gap-2">{content}</div>
      {waited && (
        <p className="mt-2 text-[11px] font-bold text-slate-500">
          Status uændret. Du kan vende tilbage senere.
        </p>
      )}
    </div>
  );
}

function DealerReplyBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-3 space-y-2">
      <textarea
        className="h-20 w-full rounded-lg border border-orange-200 bg-white p-2 text-sm outline-none focus:border-orange-400"
        placeholder="Skriv et svar til Timan…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onSubmit(text);
            setText("");
          }}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
        >
          Send svar
        </button>
      </div>
    </div>
  );
}
