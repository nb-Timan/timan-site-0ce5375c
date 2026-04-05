// Local app_users table — will be replaced by Supabase table lookup later
// This is the single source of truth for user access control

import { UserRole, TimanWorkingFor, PartnerType } from '@/types/configurator';

export interface AppUser {
  email: string;
  role: UserRole;
  partner_type?: PartnerType | null;
  approved: boolean;
  is_active: boolean;
  start_step: number; // 1-4
  max_step: number;   // 1-4
  can_view_prices: boolean;
  can_submit_order: boolean;
  can_edit_discount: boolean;
  can_switch_customer_mode: boolean;
  working_for?: TimanWorkingFor | null;
  display_name?: string;
}

// Mock data — mirrors future Supabase app_users table
const APP_USERS: AppUser[] = [
  {
    email: 'nb@timan.dk',
    role: 'timan_saelger',
    partner_type: null,
    approved: true,
    is_active: true,
    start_step: 3,
    max_step: 4,
    can_view_prices: true,
    can_submit_order: true,
    can_edit_discount: true,
    can_switch_customer_mode: true,
    working_for: null,
    display_name: 'NB (Timan)',
  },
  {
    email: 'thomas@jongshoej-maskiner.dk',
    role: 'partner',
    partner_type: 'forhandler',
    approved: true,
    is_active: true,
    start_step: 2,
    max_step: 4,
    can_view_prices: true,
    can_submit_order: true,
    can_edit_discount: false,
    can_switch_customer_mode: false,
    display_name: 'Thomas (Jongshøj)',
  },
  {
    email: 'demo-dealer@timan.dk',
    role: 'partner',
    partner_type: 'forhandler',
    approved: true,
    is_active: true,
    start_step: 1,
    max_step: 4,
    can_view_prices: true,
    can_submit_order: true,
    can_edit_discount: false,
    can_switch_customer_mode: false,
    display_name: 'Demo Dealer',
  },
  {
    email: 'inactive@example.com',
    role: 'partner',
    partner_type: 'service_partner',
    approved: true,
    is_active: false,
    start_step: 1,
    max_step: 4,
    can_view_prices: true,
    can_submit_order: true,
    can_edit_discount: false,
    can_switch_customer_mode: false,
    display_name: 'Inactive User',
  },
  {
    email: 'pending@example.com',
    role: 'partner',
    partner_type: 'importoer',
    approved: false,
    is_active: true,
    start_step: 1,
    max_step: 4,
    can_view_prices: true,
    can_submit_order: true,
    can_edit_discount: false,
    can_switch_customer_mode: false,
    display_name: 'Pending Approval',
  },
];

// Default permissions for unknown/unapproved users (slutkunde)
export const SLUTKUNDE_DEFAULTS: Omit<AppUser, 'email' | 'display_name'> = {
  role: 'slutkunde',
  partner_type: null,
  approved: false,
  is_active: true,
  start_step: 1,
  max_step: 1,
  can_view_prices: false,
  can_submit_order: false,
  can_edit_discount: false,
  can_switch_customer_mode: false,
};

/**
 * Look up user by email. Returns AppUser if found, approved, and active.
 * Returns null for unknown, unapproved, or inactive users.
 */
export function lookupAppUser(email: string): AppUser | null {
  const normalized = email.trim().toLowerCase();
  const user = APP_USERS.find(u => u.email.toLowerCase() === normalized);
  if (!user) return null;
  if (!user.approved || !user.is_active) return null;
  return user;
}
