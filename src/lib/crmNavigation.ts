import {
  Activity,
  CalendarDays,
  FileText,
  Gauge,
  LayoutDashboard,
  ShoppingCart,
  Sparkles,
  Store,
  Wallet,
} from 'lucide-react';

export interface CrmNavItem {
  tKey: string;
  to: string;
  icon: typeof LayoutDashboard;
}

/** Canonical CRM navigation shared by the CRM shell and read-only portal help. */
export const CRM_NAV_ITEMS: CrmNavItem[] = [
  { tKey: 'crmDashboard', to: '/portal/crm/dashboard', icon: LayoutDashboard },
  { tKey: 'crmMyDealers', to: '/portal/crm/my-dealers', icon: Store },
  { tKey: 'crmLeads', to: '/portal/crm/leads', icon: Sparkles },
  { tKey: 'crmQuotes', to: '/portal/crm/quotes', icon: FileText },
  { tKey: 'crmOrders', to: '/portal/crm/orders', icon: ShoppingCart },
  { tKey: 'crmActivities', to: '/portal/crm/activities', icon: Activity },
  { tKey: 'crmCalendar', to: '/portal/crm/calendar', icon: CalendarDays },
  { tKey: 'crmBudget', to: '/portal/crm/budget', icon: Wallet },
  { tKey: 'crmBudgetDashboard', to: '/portal/crm/budget-dashboard', icon: Gauge },
];

export const EXTERNAL_CRM_NAV_BLOCKLIST = new Set([
  '/portal/crm/activities',
  '/portal/crm/budget-dashboard',
]);
