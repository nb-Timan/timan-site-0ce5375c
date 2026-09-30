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
import { portalCapabilityRoute } from '../../supabase/functions/_shared/portalCapabilityContract';

export interface CrmNavItem {
  tKey: string;
  to: string;
  icon: typeof LayoutDashboard;
}

/** Canonical CRM navigation shared by the CRM shell and read-only portal help. */
export const CRM_NAV_ITEMS: CrmNavItem[] = [
  { tKey: 'crmDashboard', to: portalCapabilityRoute('crm.dashboard'), icon: LayoutDashboard },
  { tKey: 'crmMyDealers', to: portalCapabilityRoute('crm.my_dealers'), icon: Store },
  { tKey: 'crmLeads', to: portalCapabilityRoute('crm.leads'), icon: Sparkles },
  { tKey: 'crmQuotes', to: portalCapabilityRoute('crm.quotes'), icon: FileText },
  { tKey: 'crmOrders', to: portalCapabilityRoute('crm.orders'), icon: ShoppingCart },
  { tKey: 'crmActivities', to: portalCapabilityRoute('crm.activities'), icon: Activity },
  { tKey: 'crmCalendar', to: portalCapabilityRoute('crm.calendar'), icon: CalendarDays },
  { tKey: 'crmBudget', to: portalCapabilityRoute('crm.budget'), icon: Wallet },
  { tKey: 'crmBudgetDashboard', to: portalCapabilityRoute('crm.budget_dashboard'), icon: Gauge },
];

export const EXTERNAL_CRM_NAV_BLOCKLIST = new Set([
  '/portal/crm/activities',
  '/portal/crm/budget-dashboard',
]);
