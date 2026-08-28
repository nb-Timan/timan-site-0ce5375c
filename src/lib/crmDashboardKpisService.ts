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

export type CrmDashboardQuoteOrderKpis = {
  quoteCount: number;
  quoteValueDkk: number;
  quoteValueEur: number;
  orderCount: number;
  orderValueDkk: number;
  orderValueEur: number;
  closedCountThisMonth: number;
  closedValueThisMonth: number;
  closedValueThisMonthEur: number;
  wonPctChange: number;
  closedPctChange: number;
  rawRecordsScanned: {
    configurations: number;
    quotes: number;
    orders: number;
  };
  stageRows: {
    quote: CrmDashboardPipelineRow[];
    won: CrmDashboardPipelineRow[];
  };
  orderRows: Array<Record<string, unknown>>;
};

export type CrmDashboardSalesOutcomeKpis = {
  wonOrdersCount: number;
  lostCount: number;
  winRate: number;
  avgSalesDays: number;
  salesCyclesCount: number;
  rawRecordsScanned: {
    configurations: number;
    orders: number;
    crmActivities: number;
    lostActivities: number;
    quoteCreatedActivities: number;
  };
};

export type CrmDashboardCalendarActivityKpis = {
  activitiesThisWeek: number;
  demosThisMonth: number;
  overdueCount: number;
  noPlanInitials: string[];
  upcomingRows: Array<Record<string, unknown>>;
  rawRecordsScanned: {
    crmCalendarActivities: number;
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

type QuoteOrderRpcPayload = {
  quote_count?: number;
  quote_value_dkk?: number | string;
  quote_value_eur?: number | string;
  order_count?: number;
  order_value_dkk?: number | string;
  order_value_eur?: number | string;
  closed_count_this_month?: number;
  closed_value_this_month?: number | string;
  closed_value_this_month_eur?: number | string;
  won_pct_change?: number;
  closed_pct_change?: number;
  raw_records_scanned?: {
    configurations?: number;
    quotes?: number;
    orders?: number;
  };
  stage_rows?: {
    quote?: unknown;
    won?: unknown;
  };
  order_rows?: unknown;
};

type SalesOutcomeRpcPayload = {
  won_orders_count?: number;
  lost_count?: number;
  win_rate?: number;
  avg_sales_days?: number;
  sales_cycles_count?: number;
  raw_records_scanned?: {
    configurations?: number;
    orders?: number;
    crm_activities?: number;
    lost_activities?: number;
    quote_created_activities?: number;
  };
};

type CalendarActivityRpcPayload = {
  activities_this_week?: number;
  demos_this_month?: number;
  overdue_count?: number;
  no_plan_initials?: unknown;
  upcoming_rows?: unknown;
  raw_records_scanned?: {
    crm_calendar_activities?: number;
  };
};

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rawRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function rows(value: unknown): CrmDashboardPipelineRow[] {
  return Array.isArray(value) ? value as CrmDashboardPipelineRow[] : [];
}

function mapQuoteOrderPayload(payload: QuoteOrderRpcPayload): CrmDashboardQuoteOrderKpis {
  return {
    quoteCount: numberValue(payload.quote_count),
    quoteValueDkk: numberValue(payload.quote_value_dkk),
    quoteValueEur: numberValue(payload.quote_value_eur),
    orderCount: numberValue(payload.order_count),
    orderValueDkk: numberValue(payload.order_value_dkk),
    orderValueEur: numberValue(payload.order_value_eur),
    closedCountThisMonth: numberValue(payload.closed_count_this_month),
    closedValueThisMonth: numberValue(payload.closed_value_this_month),
    closedValueThisMonthEur: numberValue(payload.closed_value_this_month_eur),
    wonPctChange: numberValue(payload.won_pct_change),
    closedPctChange: numberValue(payload.closed_pct_change),
    rawRecordsScanned: {
      configurations: numberValue(payload.raw_records_scanned?.configurations),
      quotes: numberValue(payload.raw_records_scanned?.quotes),
      orders: numberValue(payload.raw_records_scanned?.orders),
    },
    stageRows: {
      quote: rows(payload.stage_rows?.quote),
      won: rows(payload.stage_rows?.won),
    },
    orderRows: rawRows(payload.order_rows),
  };
}

function mapSalesOutcomePayload(payload: SalesOutcomeRpcPayload): CrmDashboardSalesOutcomeKpis {
  return {
    wonOrdersCount: numberValue(payload.won_orders_count),
    lostCount: numberValue(payload.lost_count),
    winRate: numberValue(payload.win_rate),
    avgSalesDays: numberValue(payload.avg_sales_days),
    salesCyclesCount: numberValue(payload.sales_cycles_count),
    rawRecordsScanned: {
      configurations: numberValue(payload.raw_records_scanned?.configurations),
      orders: numberValue(payload.raw_records_scanned?.orders),
      crmActivities: numberValue(payload.raw_records_scanned?.crm_activities),
      lostActivities: numberValue(payload.raw_records_scanned?.lost_activities),
      quoteCreatedActivities: numberValue(payload.raw_records_scanned?.quote_created_activities),
    },
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapCalendarActivityPayload(payload: CalendarActivityRpcPayload): CrmDashboardCalendarActivityKpis {
  return {
    activitiesThisWeek: numberValue(payload.activities_this_week),
    demosThisMonth: numberValue(payload.demos_this_month),
    overdueCount: numberValue(payload.overdue_count),
    noPlanInitials: stringList(payload.no_plan_initials),
    upcomingRows: rawRows(payload.upcoming_rows),
    rawRecordsScanned: {
      crmCalendarActivities: numberValue(payload.raw_records_scanned?.crm_calendar_activities),
    },
  };
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

export async function fetchCrmDashboardQuoteOrderKpis(opts: {
  sellerUserId?: string | null;
  sellerInitials?: string | null;
  sellerEmail?: string | null;
}): Promise<CrmDashboardQuoteOrderKpis | null> {
  const { data, error } = await supabase.rpc("crm_dashboard_quote_order_kpis", {
    p_seller_user_id: opts.sellerUserId || null,
    p_seller_initials: opts.sellerInitials || null,
    p_seller_email: opts.sellerEmail || null,
  });

  if (error) {
    console.warn("[crmDashboardKpis] quote/order rpc failed, dashboard will use local calculation:", error);
    return null;
  }

  return mapQuoteOrderPayload((data || {}) as QuoteOrderRpcPayload);
}

export async function fetchCrmDashboardSalesOutcomeKpis(opts: {
  sellerUserId?: string | null;
  sellerInitials?: string | null;
  sellerEmail?: string | null;
}): Promise<CrmDashboardSalesOutcomeKpis | null> {
  const { data, error } = await supabase.rpc("crm_dashboard_sales_outcome_kpis", {
    p_seller_user_id: opts.sellerUserId || null,
    p_seller_initials: opts.sellerInitials || null,
    p_seller_email: opts.sellerEmail || null,
  });

  if (error) {
    console.warn("[crmDashboardKpis] sales outcome rpc failed, dashboard will use local calculation:", error);
    return null;
  }

  return mapSalesOutcomePayload((data || {}) as SalesOutcomeRpcPayload);
}

export async function fetchCrmDashboardCalendarActivityKpis(opts: {
  sellerInitials?: string | null;
}): Promise<CrmDashboardCalendarActivityKpis | null> {
  const { data, error } = await supabase.rpc("crm_dashboard_calendar_activity_kpis", {
    p_seller_initials: opts.sellerInitials || null,
  });

  if (error) {
    console.warn("[crmDashboardKpis] calendar activity rpc failed, dashboard will use local calculation:", error);
    return null;
  }

  return mapCalendarActivityPayload((data || {}) as CalendarActivityRpcPayload);
}
