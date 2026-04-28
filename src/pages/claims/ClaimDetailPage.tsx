/**
 * Claim detail page — single React-Router route at
 * `/portal/service/claims/:claimId`. Renders either the dealer-side or
 * admin-side detail view by role, both 1:1 from the old portal.
 */

import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ClaimsAdminSidebarLayout, type ClaimsLayoutScope } from "@/components/claims/ClaimsAdminSidebarLayout";
import { ClaimTool } from "@/components/claims/ClaimTool";
import {
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_PILL,
  claimDisplayId,
  getClaimById,
  isClaimEditable,
  isClaimGrouped,
  type ClaimRecord,
  type ClaimStatus,
} from "@/lib/claims-store";

interface Props {
  scope: ClaimsLayoutScope;
  /** When true, dealer view forces full read-only (Dealer User). */
  readOnly?: boolean;
}

export default function ClaimDetailPage({ scope, readOnly = false }: Props) {
  const { claimId } = useParams<{ claimId: string }>();
  const claim = claimId ? getClaimById(claimId) : undefined;

  if (!claim) {
    return (
      <ClaimsAdminSidebarLayout scope={scope}>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-xl font-black">Claim ikke fundet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Vi kunne ikke finde sagen <span className="font-mono">{claimId}</span>.
          </p>
          <Link
            to={scope === "admin" ? "/portal/service/claims?tab=all" : "/portal/service/claims?tab=mine"}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {scope === "admin" ? "Tilbage til Alle claims" : "Tilbage til Mine claims"}
          </Link>
        </div>
      </ClaimsAdminSidebarLayout>
    );
  }

  const adminMode = scope === "admin";
  // Dealer User forces read-only. Otherwise: dealer-side is read-only when the
  // claim is past dealer-edit; admin always uses adminMode (read-only handled inside ClaimTool).
  const effectiveReadOnly = readOnly || (!adminMode && !isClaimEditable(claim.status));

  return (
    <ClaimsAdminSidebarLayout
      scope={scope}
      intro={<DetailIntro claim={claim} scope={scope} readOnly={effectiveReadOnly} />}
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ClaimTool initialClaim={claim} readOnly={effectiveReadOnly} adminMode={adminMode} />
      </div>
    </ClaimsAdminSidebarLayout>
  );
}

function DetailIntro({ claim, scope, readOnly }: { claim: ClaimRecord; scope: ClaimsLayoutScope; readOnly: boolean }) {
  const adminMode = scope === "admin";
  const backTo = adminMode ? "/portal/service/claims?tab=all" : "/portal/service/claims?tab=mine";
  const backLabel = adminMode ? "Alle claims" : "Mine claims";

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight">{claimDisplayId(claim)}</h1>
          <StatusPill status={claim.status} />
          {adminMode && (
            <span className="inline-flex rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-black text-white">
              Admin review
            </span>
          )}
          {isClaimGrouped(claim) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-black text-indigo-700">
              Samlet sag · {claim.groupId}
            </span>
          )}
          {readOnly && (
            <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-black text-white">
              {adminMode ? "Forhandler-låst" : "Skrivebeskyttet"}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-slate-500">
          {claim.title} • {adminMode ? `${claim.dealer} • ` : ""}{claim.customer} • {claim.machineType} ({claim.serial})
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ClaimStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${CLAIM_STATUS_PILL[status]}`}>
      {CLAIM_STATUS_LABEL[status]}
    </span>
  );
}
