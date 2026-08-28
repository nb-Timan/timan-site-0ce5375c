import { supabase } from "@/lib/supabase";

export type CrmDashboardPipelineRow = {
  id: string;
  type: "Lead" | "Demo" | "Tilbud" | "Forhandling" | "Ordre" | "Tabt";
  number: string;
  title: string;
  dealer: string;
  seller: string;
  value: number;
  status: string;
  date: string;
  metricDate?: string;
  href: string | null;
};

export type CrmDashboardLeadKpis = {
  activeLeads: number;
  leadCount: number;
  demoLeadCount: number;
  calendarDemoCount: number;
  offerLeadCount: number;
  wonLeadCount: number;
  lostLeadCount: number;
  leadPipelineValue: number;
  demoPipelineValue: number;
  activeThisMonth: number;
  activePrevWindow: number;
  leadsPctChange: number;
  activitiesThisWeek: number;
  activitiesThisMonth: number;
  rawRecordsScanned: {
    crmLeads: number;
    crmCalendarActivities: number;
  };
  statusCounts: Record<string, number>;
  stageRows: {
    lead: CrmDashboardPipelineRow[];
    demo: CrmDashboardPipelineRow[];
    won: CrmDashboardPipelineRow[];
    lost: CrmDashboardPipelineRow[];
  };
};

type RpcPayload = {
  active_leads?: number;
  lead_count?: number;
  demo_lead_count?: number;
  calendar_demo_count?: number;
  offer_lead_count?: number;
  won_lead_count?: number;
  lost_lead_count?: number;
  lead_pipeline_value?: number | string;
  demo_pipeline_value?: number | string;
  active_this_month?: number;
  active_prev_window?: number;
  leads_pct_change?: number;
  activities_this_week?: number;
  activities_this_month?: number;
  raw_records_scanned?: {
    crm_leads?: number;
    crm_calendar_activities?: number;
  };
  status_counts?: Record<string, number>;
  stage_rows?: Partial<CrmDashboardLeadKpis["stageRows"]>;
};

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rows(value: unknown): CrmDashboardPipelineRow[] {
  return Array.isArray(value) ? value as CrmDashboardPipelineRow[] : [];
}

function mapPayload(payload: RpcPayload): CrmDashboardLeadKpis {
  return {
    activeLeads: numberValue(payload.active_leads),
    leadCount: numberValue(payload.lead_count),
    demoLeadCount: numberValue(payload.demo_lead_count),
    calendarDemoCount: numberValue(payload.calendar_demo_count),
    offerLeadCount: numberValue(payload.offer_lead_count),
    wonLeadCount: numberValue(payload.won_lead_count),
    lostLeadCount: numberValue(payload.lost_lead_count),
    leadPipelineValue: numberValue(payload.lead_pipeline_value),
    demoPipelineValue: numberValue(payload.demo_pipeline_value),
    activeThisMonth: numberValue(payload.active_this_month),
    activePrevWindow: numberValue(payload.active_prev_window),
    leadsPctChange: numberValue(payload.leads_pct_change),
    activitiesThisWeek: numberValue(payload.activities_this_week),
    activitiesThisMonth: numberValue(payload.activities_this_month),
    rawRecordsScanned: {
      crmLeads: numberValue(payload.raw_records_scanned?.crm_leads),
      crmCalendarActivities: numberValue(payload.raw_records_scanned?.crm_calendar_activities),
    },
    statusCounts: payload.status_counts || {},
    stageRows: {
      lead: rows(payload.stage_rows?.lead),
      demo: rows(payload.stage_rows?.demo),
      won: rows(payload.stage_rows?.won),
      lost: rows(payload.stage_rows?.lost),
    },
  };
}

export async function fetchCrmDashboardLeadKpis(opts: {
  sellerUserId?: string | null;
  sellerInitials?: string | null;
}): Promise<CrmDashboardLeadKpis | null> {
  const { data, error } = await supabase.rpc("crm_dashboard_lead_kpis", {
    p_seller_user_id: opts.sellerUserId || null,
    p_seller_initials: opts.sellerInitials || null,
  });

  if (error) {
    console.warn("[crmDashboardKpis] rpc failed, dashboard will use local calculation:", error);
    return null;
  }

  return mapPayload((data || {}) as RpcPayload);
}
