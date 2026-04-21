import { createClient } from '@supabase/supabase-js';

// These are your external Supabase project's publishable keys.
// Replace with your actual Supabase URL and anon key.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wxzsvkgzhnprmrdgrziu.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rEsPC6XJo77frEd3Ew6zcw_HwbcPUpz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
