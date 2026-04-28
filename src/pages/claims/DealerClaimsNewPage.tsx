/**
 * Dealer Claims — Ny claim (1:1 from old src/routes/dealer.claims.new.tsx).
 */

import { ClaimsAdminSidebarLayout } from "@/components/claims/ClaimsAdminSidebarLayout";
import { ClaimTool } from "@/components/claims/ClaimTool";

export default function DealerClaimsNewPage() {
  return (
    <ClaimsAdminSidebarLayout
      intro={
        <div>
          <h1 className="text-3xl font-black tracking-tight">Ny claim</h1>
          <p className="mt-1 text-sm text-slate-500">Opret en ny reklamationssag.</p>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ClaimTool />
      </div>
    </ClaimsAdminSidebarLayout>
  );
}
