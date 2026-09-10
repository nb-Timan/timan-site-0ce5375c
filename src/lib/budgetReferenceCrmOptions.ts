import type { CrmDemoLead, CrmLead } from "@/lib/crmLeadsService";

export type BudgetReferenceCrmOption = {
  value: string;
  kind: "lead" | "demo";
  reference: string;
  label: string;
};

function leadReference(lead: CrmLead): string {
  return typeof lead.lead_no === "number" ? `L-${lead.lead_no}` : lead.id;
}

function demoReference(demo: CrmDemoLead): string {
  return typeof demo.demo_no === "number" ? `D-${demo.demo_no}` : demo.id;
}

/**
 * The CRM keeps normal leads and demo leads in separate canonical tables.
 * The budget dialog presents them as one chooser while retaining their source
 * type, so existing lead_id/demo_id persistence remains intact.
 */
export function buildBudgetReferenceCrmOptions(
  leads: CrmLead[],
  demos: CrmDemoLead[],
): BudgetReferenceCrmOption[] {
  const leadOptions = leads.map((lead) => {
    const reference = leadReference(lead);
    const status = lead.status?.trim() || lead.pipeline_stage || "Åben";
    return {
      value: `lead:${reference}`,
      kind: "lead" as const,
      reference,
      label: [reference, lead.title?.trim() || "Uden titel", status].join(" · "),
    };
  });
  const demoOptions = demos.map((demo) => {
    const reference = demoReference(demo);
    return {
      value: `demo:${reference}`,
      kind: "demo" as const,
      reference,
      label: [reference, demo.title?.trim() || demo.demo_machine?.trim() || "Demo", "Demo"].join(" · "),
    };
  });

  return [...leadOptions, ...demoOptions].sort((left, right) => left.label.localeCompare(right.label, "da"));
}
