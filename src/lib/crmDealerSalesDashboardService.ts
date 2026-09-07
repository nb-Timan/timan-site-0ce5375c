import { supabase } from "@/lib/supabase";
import type { DashboardCurrencyFilter, DealerDashboardFilters } from "@/lib/crmDealerDashboardPrototype";

export type DealerDashboardSeriesPoint = {
  name: string;
  value?: number;
  standard?: number;
  extra?: number;
  payment?: number | null;
  total?: number;
};

export type DealerDashboardLiveRow = {
  id: string;
  record_kind: "order" | "quote";
  order_number: string | null;
  quote_number: string | null;
  date: string;
  seller: string;
  country: string;
  dealer: string;
  dealer_number: string | null;
  customer: string;
  machine: string;
  machine_count: number;
  list_price: number;
  net_value: number;
  currency: "DKK" | "EUR";
  standard_discount_pct: number;
  extra_discount_pct: number;
  payment_delivery_discount_pct: number | null;
  total_discount_pct: number | null;
  discount_value: number;
};

export type DealerDashboardLiveData = {
  scope: { role: string; is_backend: boolean; is_external: boolean; display_currency: "DKK" | "EUR" | "BOTH" };
  summary: {
    revenue: number;
    order_count: number;
    machine_count: number;
    average_discount_pct: number;
    extra_discount_value: number | null;
    payment_delivery_discount_value: number | null;
    top_country: string;
    top_dealer: string;
    quote_count: number;
  };
  charts: Record<string, DealerDashboardSeriesPoint[]>;
  filters: {
    countries: string[];
    sellers: string[];
    dealers: Array<{ number: string | null; name: string }>;
    customers: string[];
    machines: string[];
    partner_types: string[];
  };
  detail: { total_count: number; limit: number; offset: number; rows: DealerDashboardLiveRow[] };
};

function selected(values: string[]) {
  return values.length ? values : null;
}

export async function fetchDealerSalesDashboard(
  filters: DealerDashboardFilters,
  viewAsEmail?: string | null,
): Promise<{ data: DealerDashboardLiveData | null; error: string | null }> {
  let viewAsUserId: string | null = null;
  if (viewAsEmail) {
    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", viewAsEmail.toLowerCase())
      .maybeSingle();
    if (error) return { data: null, error: error.message };
    viewAsUserId = data?.id ?? null;
  }

  const { data, error } = await supabase.rpc("crm_dealer_sales_dashboard", {
    p_from: filters.from || (filters.fromYear ? `${filters.fromYear}-01-01` : null),
    p_to: filters.to || (filters.toYear ? `${filters.toYear}-12-31` : null),
    p_countries: selected(filters.countries),
    p_sellers: selected(filters.sellers),
    p_dealer_numbers: selected(filters.dealers),
    p_customers: selected(filters.customers),
    p_machines: selected(filters.machines),
    p_partner_types: filters.partnerType === "all" ? null : [filters.partnerType],
    p_display_currency: filters.currency === "both" ? "both" : (filters.currency as DashboardCurrencyFilter),
    p_limit: 100,
    p_offset: 0,
    p_view_as_user_id: viewAsUserId,
  });

  return { data: (data as DealerDashboardLiveData | null) ?? null, error: error?.message ?? null };
}
