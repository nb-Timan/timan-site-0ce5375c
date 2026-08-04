import { createClient } from '@supabase/supabase-js';

// These are your external Supabase project's publishable keys.
// Replace with your actual Supabase URL and anon key.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rdodyoixxybiozvmuqon.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_yGHuYBzLY-dRDJ0U_s5FRw_CXIwFHK2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
