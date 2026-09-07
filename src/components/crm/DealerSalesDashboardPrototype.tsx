import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CalendarDays, Download, FilterX, Globe2, Package, Percent, ShoppingCart, SlidersHorizontal, Tag, Trophy, Truck, Users } from "lucide-react";
import { convertCurrency, formatMoney, toDkk, type Currency } from "@/lib/currency";
import {
  dealerDashboardPrototypeRows,
  discountValue,
  filterDealerDashboardRows,
  groupedSum,
  isPartnerPrototypeScope,
  netValue,
  salesLabelForDashboardRow,
  totalDiscountPct,
  type DashboardCurrencyFilter,
  type DealerDashboardFilters,
  type DealerDashboardRow,
  prototypeScopeLabels,
  type PrototypeScopeMode,
} from "@/lib/crmDealerDashboardPrototype";
import { fetchDealerSalesDashboard, type DealerDashboardLiveData } from "@/lib/crmDealerSalesDashboardService";

type Props = {
  initialScope: PrototypeScopeMode;
  scope?: PrototypeScopeMode;
  onScopeChange?: (scope: PrototypeScopeMode) => void;
  canSwitchScope?: boolean;
  live?: boolean;
  viewAsEmail?: string | null;
};

const COLORS = ["#047857", "#2563eb", "#0f766e", "#60a5fa", "#65a30d", "#f59e0b", "#7c3aed", "#94a3b8"];
const initialFilters: DealerDashboardFilters = {
  from: "",
  to: "",
  fromYear: "2021",
  toYear: "2026",
  countries: [],
  sellers: [],
  dealers: [],
  customers: [],
  machines: [],
  partnerType: "all",
  currency: "both",
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function unique(rows: DealerDashboardRow[], getValue: (row: DealerDashboardRow) => string) {
  return Array.from(new Set(rows.map(getValue))).sort((a, b) => a.localeCompare(b, "da"));
}

function formatValue(value: number, currency: DashboardCurrencyFilter) {
  return formatMoney(value, currency === "EUR" ? "EUR" : "DKK");
}

function valueForDashboard(row: DealerDashboardRow, currency: DashboardCurrencyFilter, value = netValue(row)) {
  if (currency === "EUR") return convertCurrency(value, row.currency, "EUR");
  return toDkk(value, row.currency);
}

function KpiCard({ icon: Icon, label, value, note, tone = "emerald" }: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  note: string;
  tone?: "emerald" | "blue" | "amber";
}) {
  const colors = {
    emerald: "border-emerald-100 bg-emerald-50/40 text-emerald-700",
    blue: "border-blue-100 bg-blue-50/40 text-blue-700",
    amber: "border-amber-100 bg-amber-50/50 text-amber-700",
  };
  return (
    <section className="min-h-[116px] rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-md p-2 ${colors[tone]}`}><Icon className="h-4 w-4" /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="mt-3 text-xl font-bold tabular-nums text-slate-950">{value}</div>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </section>
  );
}

function ChartCard({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
      </div>
      <div className="h-[230px]">{children}</div>
    </section>
  );
}

function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-slate-400">Ingen data i det valgte udsnit.</div>;
}

function MultiSelect({ label, options, value, onChange, searchable = false }: {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) => option.toLowerCase().includes(search.toLowerCase()));
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  return (
    <details className="relative min-w-0 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-slate-700">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block truncate font-medium">{value.length ? `${value.length} valgt` : "Alle"}</span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-slate-200 bg-white p-2 shadow-xl">
        {searchable && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Søg ${label.toLowerCase()}...`} className="mb-2 w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />}
        {visible.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
            <input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function DealerSalesDashboardPrototype({ initialScope, scope: controlledScope, onScopeChange, canSwitchScope = false, live = false, viewAsEmail }: Props) {
  const [filters, setFilters] = useState<DealerDashboardFilters>(initialFilters);
  const [activeQuickPeriod, setActiveQuickPeriod] = useState<string | null>(null);
  const [localScope, setLocalScope] = useState<PrototypeScopeMode>(initialScope);
  const [liveData, setLiveData] = useState<DealerDashboardLiveData | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(live);
  const dealerOptionsRef = useRef<DealerDashboardLiveData["filters"]["dealers"]>([]);
  const scope = controlledScope ?? localScope;
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setLiveLoading(true);
    const rpcFilters = dealerOptionsRef.current.length
      ? {
          ...filters,
          dealers: filters.dealers.map((dealer) => dealerOptionsRef.current.find((option) => option.name === dealer)?.number ?? dealer),
        }
      : filters;
    void fetchDealerSalesDashboard(rpcFilters, viewAsEmail).then(({ data, error }) => {
      if (cancelled) return;
      dealerOptionsRef.current = data?.filters.dealers ?? [];
      setLiveData(data);
      setLiveError(error);
      setLiveLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters, live, viewAsEmail]);

  const liveRows = useMemo<DealerDashboardRow[]>(() => (liveData?.detail.rows ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    seller: row.seller as DealerDashboardRow["seller"],
    country: row.country as DealerDashboardRow["country"],
    dealer: row.dealer,
    customer: row.customer,
    machine: row.machine as DealerDashboardRow["machine"],
    partnerType: "Forhandler",
    currency: row.currency,
    listPrice: Number(row.list_price),
    standardDiscountPct: Number(row.standard_discount_pct),
    extraDiscountPct: Number(row.extra_discount_pct),
    paymentDeliveryDiscountPct: Number(row.payment_delivery_discount_pct ?? 0),
    quantity: Number(row.machine_count),
    dbPct: null,
    orderNumber: row.order_number ?? "—",
    quoteNumber: row.quote_number ?? "—",
  })), [liveData]);
  const rows = useMemo(() => live ? liveRows : filterDealerDashboardRows(dealerDashboardPrototypeRows, filters, scope), [filters, live, liveRows, scope]);
  const scopedRows = useMemo(() => filterDealerDashboardRows(dealerDashboardPrototypeRows, initialFilters, scope), [scope]);
  const options = useMemo(() => live && liveData ? ({
    countries: liveData.filters.countries,
    sellers: liveData.filters.sellers,
    dealers: liveData.filters.dealers.map((dealer) => dealer.name),
    customers: liveData.filters.customers,
    machines: liveData.filters.machines,
  }) : ({
    countries: unique(scopedRows, (row) => row.country),
    sellers: unique(scopedRows, (row) => row.seller),
    dealers: unique(scopedRows, (row) => row.dealer),
    customers: unique(scopedRows, (row) => row.customer),
    machines: unique(scopedRows, (row) => row.machine),
  }), [live, liveData, scopedRows]);
  const yearOptions = useMemo(() => unique(dealerDashboardPrototypeRows, (row) => row.date.slice(0, 4)).sort(), []);
  const value = (row: DealerDashboardRow, amount?: number) => valueForDashboard(row, filters.currency, amount);
  const revenue = liveData ? Number(liveData.summary.revenue) : rows.reduce((sum, row) => sum + value(row), 0);
  const totalList = rows.reduce((sum, row) => sum + value(row, row.listPrice), 0);
  const discountTotal = totalList - revenue;
  const averageDiscount = liveData ? Number(liveData.summary.average_discount_pct) : rows.length ? rows.reduce((sum, row) => sum + totalDiscountPct(row), 0) / rows.length : 0;
  const extraDiscount = liveData ? liveData.summary.extra_discount_value : rows.reduce((sum, row) => sum + value(row, row.listPrice * row.extraDiscountPct / 100), 0);
  const paymentDiscount = liveData ? liveData.summary.payment_delivery_discount_value : rows.reduce((sum, row) => sum + value(row, row.listPrice * row.paymentDeliveryDiscountPct / 100), 0);
  const machineCount = liveData ? Number(liveData.summary.machine_count) : rows.reduce((sum, row) => sum + row.quantity, 0);
  const dashboardCurrencyNote = filters.currency === "both" ? "DKK-normaliseret for samlet visning" : `Vises i ${filters.currency}`;

  const byMonth = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const yearRows = [2022, 2023, 2024, 2025, 2026].reduce<Record<string, number>>((acc, year) => {
      acc[String(year)] = rows.filter((row) => row.date.startsWith(`${year}-${month}`)).reduce((sum, row) => sum + value(row), 0);
      return acc;
    }, {});
    return { month: new Date(`2026-${month}-01`).toLocaleDateString("da-DK", { month: "short" }), ...yearRows };
  });
  const liveChart = (key: string) => liveData?.charts[key] ?? [];
  const byYear = liveData ? liveChart("revenue_by_year") : groupedSum(rows, (row) => row.date.slice(0, 4), (row) => value(row));
  const byDealer = liveData ? liveChart("top_dealers") : groupedSum(rows, (row) => row.dealer, (row) => value(row)).slice(0, 10);
  const byCountry = liveData ? liveChart("by_country") : groupedSum(rows, (row) => row.country, (row) => value(row));
  const bySeller = liveData ? liveChart("by_seller") : groupedSum(rows, (row) => salesLabelForDashboardRow(row, scope), (row) => value(row));
  const usesPartnerSalesContacts = liveData ? liveData.scope.is_external : isPartnerPrototypeScope(scope);
  const byMachineValue = liveData ? liveChart("machine_value") : groupedSum(rows, (row) => row.machine, (row) => value(row));
  const machineYears = [2022, 2023, 2024, 2025, 2026].map((year) => ({
    year: String(year),
    ...Object.fromEntries(options.machines.map((machine) => [machine, rows.filter((row) => row.machine === machine && row.date.startsWith(String(year))).reduce((sum, row) => sum + row.quantity, 0)])),
  }));
  const dkDe = [2022, 2023, 2024, 2025, 2026].map((year) => ({
    year: String(year),
    Danmark: rows.filter((row) => row.country === "Danmark" && row.date.startsWith(String(year))).reduce((sum, row) => sum + value(row), 0),
    Tyskland: rows.filter((row) => row.country === "Tyskland" && row.date.startsWith(String(year))).reduce((sum, row) => sum + value(row), 0),
  }));
  const discountByMachine = options.machines.map((machine) => {
    const selected = rows.filter((row) => row.machine === machine);
    const average = (key: "standardDiscountPct" | "extraDiscountPct" | "paymentDeliveryDiscountPct") => selected.length ? selected.reduce((sum, row) => sum + row[key], 0) / selected.length : 0;
    return { machine, standard: average("standardDiscountPct"), extra: average("extraDiscountPct"), payment: average("paymentDeliveryDiscountPct") };
  });
  const discountOverTime = [2022, 2023, 2024, 2025, 2026].map((year) => {
    const selected = rows.filter((row) => row.date.startsWith(String(year)));
    const average = (fn: (row: DealerDashboardRow) => number) => selected.length ? selected.reduce((sum, row) => sum + fn(row), 0) / selected.length : 0;
    return { year: String(year), standard: average((row) => row.standardDiscountPct), extra: average((row) => row.extraDiscountPct), total: average(totalDiscountPct) };
  });
  const discountsByYear = [2022, 2023, 2024, 2025, 2026].map((year) => {
    const selected = rows.filter((row) => row.date.startsWith(String(year)));
    return {
      year: String(year),
      standard: selected.reduce((sum, row) => sum + value(row, row.listPrice * row.standardDiscountPct / 100), 0),
      extra: selected.reduce((sum, row) => sum + value(row, row.listPrice * row.extraDiscountPct / 100), 0),
      payment: selected.reduce((sum, row) => sum + value(row, row.listPrice * row.paymentDeliveryDiscountPct / 100), 0),
    };
  });
  const topCountry = liveData?.summary.top_country ?? byCountry[0]?.name ?? "Ikke tilgængeligt";
  const topDealer = liveData?.summary.top_dealer ?? byDealer[0]?.name ?? "Ikke tilgængeligt";

  const update = <K extends keyof DealerDashboardFilters>(key: K, value: DealerDashboardFilters[K]) => {
    setActiveQuickPeriod(null);
    setFilters((previous) => ({ ...previous, [key]: value }));
  };
  const drill = (key: "countries" | "sellers" | "dealers" | "machines", item: string) => update(key, [item]);
  const setQuickPeriod = (period: "today" | "month" | "quarter" | "year" | "lastYear" | "all") => {
    const now = new Date();
    const currentYear = now.getFullYear();
    let from = "";
    let to = "";
    let fromYear = "";
    let toYear = "";

    if (period === "today") {
      from = toDateInputValue(now);
      to = from;
    } else if (period === "month") {
      from = toDateInputValue(new Date(currentYear, now.getMonth(), 1));
      to = toDateInputValue(new Date(currentYear, now.getMonth() + 1, 0));
    } else if (period === "quarter") {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      from = toDateInputValue(new Date(currentYear, quarterStart, 1));
      to = toDateInputValue(new Date(currentYear, quarterStart + 3, 0));
    } else if (period === "year") {
      fromYear = String(currentYear);
      toYear = String(currentYear);
    } else if (period === "lastYear") {
      fromYear = String(currentYear - 1);
      toYear = String(currentYear - 1);
    } else {
      fromYear = yearOptions[0] ?? "";
      toYear = yearOptions.at(-1) ?? "";
    }

    setActiveQuickPeriod(period);
    setFilters((previous) => ({ ...previous, from, to, fromYear, toYear }));
  };
  const selectScope = (nextScope: PrototypeScopeMode) => {
    setLocalScope(nextScope);
    onScopeChange?.(nextScope);
    setFilters(initialFilters);
  };

  return (
    <div className="space-y-3">
      {!live && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-sky-800">Local-only scope-simulering</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{prototypeScopeLabels[scope]}</div>
          <p className="mt-0.5 text-xs text-slate-600">Filtermulighederne er bygget fra scope først og kan derfor kun indsnævre data.</p>
        </div>
        {canSwitchScope ? (
          <select value={scope} onChange={(event) => selectScope(event.target.value as PrototypeScopeMode)} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <option value="backend">Backend/global</option>
            <option value="akr_seller">Timan Sælger: AKR</option>
            <option value="em_seller">Timan Sælger: EM</option>
            <option value="bp_seller">Timan Sælger: BP</option>
            <option value="jtn_seller">Timan Sælger: JTN</option>
            <option value="dealer_wj">Forhandler: WJ Maskinservice</option>
            <option value="importer_avistech">Importør: AVISTECH SRO</option>
            <option value="service_nordic">Servicepartner: Nordic Mower AB</option>
          </select>
        ) : <span className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">{prototypeScopeLabels[scope]}</span>}
      </div>}
      {liveError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Dashboard-data kunne ikke indlæses: {liveError}</div>}
      {liveLoading && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Indlæser dashboard-data…</div>}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <span className="mr-1 text-sm font-bold text-slate-800">Hurtigvalg</span>
          {([ ["today", "I dag"], ["month", "Denne måned"], ["quarter", "Dette kvartal"], ["year", "Dette år"], ["lastYear", "Sidste år"], ["all", "Alt"] ] as const).map(([period, label]) => (
            <button type="button" key={period} onClick={() => setQuickPeriod(period)} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold transition-colors ${activeQuickPeriod === period ? "border-emerald-600 bg-emerald-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"}`}>{label}</button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => { setActiveQuickPeriod(null); setFilters(initialFilters); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FilterX className="h-4 w-4" />Nulstil</button>
            <button type="button" disabled className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white opacity-50"><Download className="h-4 w-4" />Eksporter</button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)] lg:items-center rounded-lg border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><CalendarDays className="h-5 w-5 text-emerald-700" />Periode</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dato fra</span><input type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} className="mt-1 w-full bg-transparent text-sm font-medium outline-none" /></label>
            <label className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dato til</span><input type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} className="mt-1 w-full bg-transparent text-sm font-medium outline-none" /></label>
            <label className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">År fra</span><select value={filters.fromYear} onChange={(event) => update("fromYear", event.target.value)} className="mt-1 w-full bg-transparent text-sm font-medium outline-none"><option value="">Alle år</option>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label>
            <label className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">År til</span><select value={filters.toYear} onChange={(event) => update("toYear", event.target.value)} className="mt-1 w-full bg-transparent text-sm font-medium outline-none"><option value="">Alle år</option>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <MultiSelect label="Land" options={options.countries} value={filters.countries} onChange={(next) => update("countries", next)} />
          <MultiSelect label="Sælger" options={options.sellers} value={filters.sellers} onChange={(next) => update("sellers", next)} />
          <MultiSelect label="Forhandler" options={options.dealers} value={filters.dealers} onChange={(next) => update("dealers", next)} searchable />
          <MultiSelect label="Kunde" options={options.customers} value={filters.customers} onChange={(next) => update("customers", next)} searchable />
          <MultiSelect label="Maskine / model" options={options.machines} value={filters.machines} onChange={(next) => update("machines", next)} />
          <label className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Partnertype</span><select value={filters.partnerType} onChange={(event) => update("partnerType", event.target.value)} className="mt-1 w-full bg-transparent font-medium outline-none"><option value="all">Alle</option><option>Forhandler</option><option>Importør</option><option>Servicepartner</option></select></label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3"><span className="text-sm font-bold text-slate-800">Valuta</span><div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 text-sm shadow-sm">{(["DKK", "EUR", "both"] as DashboardCurrencyFilter[]).map((currency) => <button type="button" key={currency} onClick={() => update("currency", currency)} className={`min-h-10 px-5 font-semibold ${filters.currency === currency ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-emerald-50"}`}>{currency === "both" ? "Begge" : currency}</button>)}</div></div>
          <button type="button" className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><SlidersHorizontal className="h-4 w-4" />Flere filtre</button>
          <span className="text-xs text-slate-500">Dato har prioritet · {live ? `${liveData?.detail.total_count ?? 0} canonical rækker` : `Local prototype · ${rows.length} scoped rows`}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <KpiCard icon={BarChart3} label="Omsætning total" value={formatValue(revenue, filters.currency)} note={dashboardCurrencyNote} />
        <KpiCard icon={ShoppingCart} label="Antal ordrer" value={String(liveData?.summary.order_count ?? rows.length)} note="Afgivne ordrer" tone="blue" />
        <KpiCard icon={Package} label="Solgte maskiner" value={String(machineCount)} note="Maskiner i alt" />
        <KpiCard icon={Percent} label="Gns. rabat" value={`${averageDiscount.toFixed(1)} %`} note="Samlet rabat" tone="amber" />
        <KpiCard icon={Tag} label="Ekstra rabat i alt" value={extraDiscount === null ? "Ikke tilgængeligt" : formatValue(extraDiscount, filters.currency)} note={extraDiscount === null ? "Mangler canonical værdifelt" : dashboardCurrencyNote} />
        <KpiCard icon={Truck} label="Betalings-/leveringsrabat" value={paymentDiscount === null ? "Ikke tilgængeligt" : formatValue(paymentDiscount, filters.currency)} note={paymentDiscount === null ? "Mangler canonical værdifelt" : dashboardCurrencyNote} tone="amber" />
        <KpiCard icon={Globe2} label="Top land" value={topCountry} note={byCountry[0] ? formatValue(byCountry[0].value, filters.currency) : "Ingen data"} tone="blue" />
        <KpiCard icon={Trophy} label="Top forhandler" value={topDealer} note={byDealer[0] ? formatValue(byDealer[0].value, filters.currency) : "Ingen data"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Omsætning over tid" note={dashboardCurrencyNote}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={live ? liveChart("revenue_over_time") : byMonth}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={live ? "name" : "month"} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={48} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} />{live ? <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={false} /> : ["2022", "2023", "2024", "2025", "2026"].map((year, index) => <Line key={year} type="monotone" dataKey={year} stroke={COLORS[index]} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="Omsætning pr. kalenderår" note={dashboardCurrencyNote}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byYear}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis tick={{ fontSize: 11 }} width={48} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <ChartCard title="Top 10 forhandlere" note="Klik en søjle for at filtrere">{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byDealer} layout="vertical" margin={{ left: 40 }}><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Bar dataKey="value" fill="#34d399" radius={[0, 4, 4, 0]} onClick={(entry: { name?: string }) => entry.name && drill("dealers", entry.name)} /></BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="Omsætning pr. land" note="Klik en søjle for at filtrere">{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byCountry} layout="vertical" margin={{ left: 28 }}><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} onClick={(entry: { name?: string }) => entry.name && drill("countries", entry.name)} /></BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="Omsætning pr. sælger" note={usesPartnerSalesContacts ? "Partnerdata: salgs-kontakter. Manglende kontakt vises som Info mangler." : "Klik en søjle for at filtrere"}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={bySeller} layout="vertical" margin={{ left: usesPartnerSalesContacts ? 70 : 20 }}><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={usesPartnerSalesContacts ? 110 : 48} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} onClick={usesPartnerSalesContacts ? undefined : (entry: { name?: string }) => entry.name && drill("sellers", entry.name)} /></BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <ChartCard title="Salg af maskiner (stk.)" note={live ? "Samlet i valgt periode" : "Årlig fordeling"}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={live ? liveChart("machine_volume") : machineYears}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={live ? "name" : "year"} /><YAxis allowDecimals={false} width={32} /><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />{live ? <Bar dataKey="value" name="Maskiner" fill="#0f766e" /> : options.machines.map((machine, index) => <Bar key={machine} dataKey={machine} stackId="machines" fill={COLORS[index]} />)}</BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="Maskinsalg i værdi" note={dashboardCurrencyNote}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byMachineValue} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>{byMachineValue.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="DK vs DE - omsætning" note={dashboardCurrencyNote}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={live ? liveChart("dk_vs_de") : dkDe}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={live ? "name" : "year"} /><YAxis width={42} tick={{ fontSize: 11 }} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Legend wrapperStyle={{ fontSize: 10 }} />{live ? <Bar dataKey="value" name="Omsætning" fill="#2563eb" radius={[4, 4, 0, 0]} /> : <><Bar dataKey="Danmark" fill="#34d399" radius={[4, 4, 0, 0]} /><Bar dataKey="Tyskland" fill="#2563eb" radius={[4, 4, 0, 0]} /></>}</BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <ChartCard title="Rabatfordeling pr. maskine" note="Gennemsnit i procent">{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={live ? liveChart("discount_by_machine") : discountByMachine}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={live ? "name" : "machine"} tick={{ fontSize: 10 }} /><YAxis unit="%" width={38} /><Tooltip formatter={(amount: number) => `${amount.toFixed(1)} %`} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="standard" name="Standard" stackId="discount" fill="#0f766e" /><Bar dataKey="extra" name="Ekstra" stackId="discount" fill="#2563eb" /><Bar dataKey="payment" name="Betaling/levering" stackId="discount" fill="#f59e0b" /></BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="Gns. rabat over tid" note="Gennemsnit i procent">{rows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={live ? liveChart("discount_over_time") : discountOverTime}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={live ? "name" : "year"} /><YAxis unit="%" width={38} /><Tooltip formatter={(amount: number) => `${amount.toFixed(1)} %`} /><Legend wrapperStyle={{ fontSize: 10 }} /><Line type="monotone" dataKey="standard" name="Standard" stroke="#0f766e" strokeWidth={2} /><Line type="monotone" dataKey="extra" name="Ekstra" stroke="#2563eb" strokeWidth={2} /><Line type="monotone" dataKey="total" name="Samlet" stroke="#1e3a8a" strokeWidth={2} /></LineChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
        <ChartCard title="Rabat i værdi pr. år" note={dashboardCurrencyNote}>{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={live ? liveChart("discount_value_by_year") : discountsByYear}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={live ? "name" : "year"} /><YAxis width={42} tick={{ fontSize: 11 }} /><Tooltip formatter={(amount: number) => formatValue(amount, filters.currency)} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="standard" name="Standard" stackId="discount" fill="#0f766e" /><Bar dataKey="extra" name="Ekstra" stackId="discount" fill="#2563eb" /><Bar dataKey="payment" name="Betaling/levering" stackId="discount" fill="#f59e0b" /></BarChart></ResponsiveContainer> : <EmptyChart />}</ChartCard>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">Ordre- og rabatdetaljer</h3><p className="text-xs text-slate-500">{live ? "Canonical ordre- og tilbudsdata." : "Local prototype - klikbare detaljer kobles til canonical quote/order-detail med den kommende RPC."}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{liveData?.detail.total_count ?? rows.length} rækker</span></div>
        <div className="overflow-x-auto"><table className="min-w-[1780px] w-full text-left text-xs"><thead className="border-y border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500"><tr>{["Ordrenr.", "Tilbudsnr.", "Dato", "Sælger", "Land", "Forhandler", "Kunde", "Maskine", "Listepris", "Standard", "Ekstra", "Betaling/levering", "Samlet", "Rabat i alt", "Netto", "Valuta", "DB"].map((column) => <th key={column} className="whitespace-nowrap px-3 py-3 font-semibold">{column}</th>)}</tr></thead><tbody>{rows.map((row) => { const canonical = liveData?.detail.rows.find((item) => item.id === row.id); return <tr key={row.id} className="border-b border-slate-100 hover:bg-emerald-50/40"><td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">{row.orderNumber}</td><td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.quoteNumber}</td><td className="whitespace-nowrap px-3 py-3">{new Date(row.date).toLocaleDateString("da-DK")}</td><td className="px-3 py-3">{row.seller}</td><td className="px-3 py-3">{row.country}</td><td className="px-3 py-3 font-medium">{row.dealer}</td><td className="px-3 py-3">{row.customer}</td><td className="px-3 py-3"><button type="button" onClick={() => drill("machines", row.machine)} className="font-semibold text-emerald-700 hover:underline">{row.machine}</button></td><td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatMoney(row.listPrice, row.currency)}</td><td className="px-3 py-3">{row.standardDiscountPct} %</td><td className="px-3 py-3">{row.extraDiscountPct} %</td><td className="px-3 py-3">{row.paymentDeliveryDiscountPct} %</td><td className="px-3 py-3 font-semibold">{canonical?.total_discount_pct ?? totalDiscountPct(row)} %</td><td className="whitespace-nowrap px-3 py-3 text-rose-700 tabular-nums">{formatMoney(Number(canonical?.discount_value ?? discountValue(row)), row.currency)}</td><td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums">{formatMoney(Number(canonical?.net_value ?? netValue(row)), row.currency)}</td><td className="px-3 py-3">{row.currency}</td><td className="px-3 py-3">{row.dbPct === null ? "-" : `${row.dbPct} %`}</td></tr>; })}{!rows.length && <tr><td colSpan={17} className="px-3 py-10 text-center text-slate-400">Ingen rækker matcher filtrene.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
