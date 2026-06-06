// Service / Claims data layer.
// Tries Supabase `service_claims` table first; falls back to mock data
// (preview-safe — no HTTP 500 if the table does not exist).

import { supabase } from '@/lib/supabase';

export type ClaimStatus =
  | 'draft'                   // Gemt / ikke afsendt
  | 'pending_service_review'  // Afventer servicegodkendelse (dealer-created)
  | 'submitted'               // Afventer accept
  | 'open'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'closed';

/** Friendly Danish labels for claim statuses. */
export const CLAIM_STATUS_LABEL_DA: Record<ClaimStatus, string> = {
  draft: 'Kladde',
  pending_service_review: 'Afventer servicegodkendelse',
  submitted: 'Indsendt',
  open: 'Åben',
  in_review: 'Under behandling',
  approved: 'Godkendt',
  rejected: 'Afvist',
  closed: 'Lukket',
};

export function claimStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return (CLAIM_STATUS_LABEL_DA as Record<string, string>)[status] || status;
}

export interface ClaimPartLine {
  id: string;
  part_number?: string;
  description: string;
  quantity: number;
  unit_price_net: number;
}

export interface ClaimWorkLine {
  id: string;
  description: string;
  hours: number;
  hourly_rate_net: number;
}

export interface ServiceClaim {
  id: string;
  claim_number: string;
  // Dealer
  dealer_company?: string | null;
  dealer_contact?: string | null;
  dealer_email?: string | null;
  dealer_phone?: string | null;
  // Owner / customer
  customer_name: string | null;
  customer_contact?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  // Machine
  machine_model: string | null;
  machine_serial: string | null;
  machine_year?: string | null;
  // Dates
  delivery_date?: string | null;
  fault_date?: string | null;
  repair_date?: string | null;
  // Descriptions
  description: string;            // Fault description
  repair_description?: string | null;
  // Service / hours / km
  work_hours?: number | null;
  driven_km?: number | null;
  parts?: ClaimPartLine[] | null;
  work_lines?: ClaimWorkLine[] | null;
  total_price_net?: number | null;
  // Status / meta
  status: ClaimStatus;
  created_at: string;
  created_by_email?: string | null;
  // Link back to the originating service ticket (when claim was converted from one).
  service_ticket_id?: string | null;
}

// Demo claims removed — Service / Claims now reads only from Supabase
// (table `service_claims`) and any locally drafted claims. Empty when none.
const MOCK_CLAIMS: ServiceClaim[] = [];

// ---------- Local fallback store (preview-safe) ----------
const LOCAL_KEY = 'timan.claims.local';

function readLocal(): ServiceClaim[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ServiceClaim[];
  } catch {
    return [];
  }
}

function writeLocal(list: ServiceClaim[]): void {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// ---------- Claim number generation ----------
// Format: CLM-YYYY-#### (4-digit zero-padded sequence per year).
// Optional grouped suffix: CLM-YYYY-####/N for multi-machine claims.

const CLAIM_NUMBER_RE = /^CLM-(\d{4})-(\d{4,})(?:\/(\d+))?$/;

function pad4(n: number): string {
  return n.toString().padStart(4, '0');
}

export function formatClaimNumber(year: number, seq: number, groupIndex?: number): string {
  const base = `CLM-${year}-${pad4(seq)}`;
  return groupIndex && groupIndex > 0 ? `${base}/${groupIndex}` : base;
}

/** Parses CLM-YYYY-####(/N) → { year, seq, group? }. Returns null if not matching. */
export function parseClaimNumber(value: string | null | undefined): { year: number; seq: number; group?: number } | null {
  if (!value) return null;
  const m = CLAIM_NUMBER_RE.exec(value.trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    seq: Number(m[2]),
    group: m[3] ? Number(m[3]) : undefined,
  };
}

async function fetchExistingNumbersForYear(year: number): Promise<Set<string>> {
  const set = new Set<string>();
  // Local + mock are always available
  for (const c of readLocal()) if (c.claim_number) set.add(c.claim_number);
  for (const c of MOCK_CLAIMS) if (c.claim_number) set.add(c.claim_number);

  try {
    const { data, error } = await supabase
      .from('service_claims')
      .select('claim_number')
      .like('claim_number', `CLM-${year}-%`)
      .limit(10000);
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ claim_number: string | null }>) {
        if (row.claim_number) set.add(row.claim_number);
      }
    }
  } catch {
    // network/table missing — local/mock fallback already loaded
  }
  return set;
}

/**
 * Generate the next unique claim number for the current year.
 * Considers Supabase + local drafts + mock data.
 *
 * If `groupBase` is provided (an existing CLM-YYYY-#### number), returns the
 * next available suffix variant (e.g. CLM-YYYY-####/2) instead of a new sequence.
 */
export async function generateClaimNumber(groupBase?: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const existing = await fetchExistingNumbersForYear(year);

  // Grouped suffix variant
  if (groupBase) {
    const parsed = parseClaimNumber(groupBase);
    if (!parsed) {
      throw new Error(`Invalid base claim number: ${groupBase}`);
    }
    const base = formatClaimNumber(parsed.year, parsed.seq);
    let n = 1;
    while (existing.has(`${base}/${n}`)) n++;
    if (n > 9999) throw new Error('Too many group variants for this claim');
    return `${base}/${n}`;
  }

  // Find highest existing sequence for the year, then +1
  let maxSeq = 0;
  for (const num of existing) {
    const p = parseClaimNumber(num);
    if (p && p.year === year && p.seq > maxSeq) maxSeq = p.seq;
  }
  let next = maxSeq + 1;
  // Defensive: skip any concurrent collisions
  while (existing.has(formatClaimNumber(year, next))) next++;
  if (next > 9999) {
    // Year exhausted — extend padding gracefully (still unique)
    return `CLM-${year}-${next}`;
  }
  return formatClaimNumber(year, next);
}


// ---------- Loaders ----------
export interface LoadClaimsResult {
  claims: ServiceClaim[];
  source: 'supabase' | 'mock';
  error?: string;
}

export interface LoadClaimResult {
  claim: ServiceClaim | null;
  source: 'supabase' | 'mock';
  error?: string;
}

const SELECT_COLS =
  'id, claim_number, dealer_company, dealer_contact, dealer_email, dealer_phone, ' +
  'customer_name, customer_contact, customer_email, customer_phone, ' +
  'machine_model, machine_serial, machine_year, ' +
  'delivery_date, fault_date, repair_date, ' +
  'description, repair_description, ' +
  'work_hours, driven_km, parts, work_lines, total_price_net, ' +
  'status, created_at, created_by_email';

export async function getClaimById(id: string): Promise<LoadClaimResult> {
  // Local-saved drafts always win
  const local = readLocal().find(c => c.id === id);
  if (local) return { claim: local, source: 'mock' };

  try {
    const { data, error } = await supabase
      .from('service_claims')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      const fallback = MOCK_CLAIMS.find(c => c.id === id) ?? null;
      return { claim: fallback, source: 'mock', error: error.message };
    }
    if (!data) {
      const fallback = MOCK_CLAIMS.find(c => c.id === id) ?? null;
      return { claim: fallback, source: fallback ? 'mock' : 'supabase' };
    }
    return { claim: data as unknown as ServiceClaim, source: 'supabase' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const fallback = MOCK_CLAIMS.find(c => c.id === id) ?? null;
    return { claim: fallback, source: 'mock', error: msg };
  }
}

export async function loadClaims(): Promise<LoadClaimsResult> {
  const local = readLocal();
  try {
    const { data, error } = await supabase
      .from('service_claims')
      .select(SELECT_COLS)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return { claims: [...local, ...MOCK_CLAIMS], source: 'mock', error: error.message };
    }
    if (!data || data.length === 0) {
      return { claims: [...local, ...MOCK_CLAIMS], source: 'mock' };
    }
    return { claims: [...local, ...(data as unknown as ServiceClaim[])], source: local.length > 0 ? 'mock' : 'supabase' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { claims: [...local, ...MOCK_CLAIMS], source: 'mock', error: msg };
  }
}

// ---------- Create ----------
export type NewClaimInput = Omit<ServiceClaim, 'id' | 'claim_number' | 'created_at' | 'status'> & {
  status?: ClaimStatus;
};

export interface SaveClaimResult {
  claim: ServiceClaim;
  source: 'supabase' | 'local';
  error?: string;
}

/**
 * Save a claim. Generates a unique CLM-YYYY-#### number first; on a duplicate
 * collision (e.g. concurrent insert) retries up to 3 times.
 *
 * @param groupBase Optional existing claim number to attach this claim to as a
 *                  grouped variant (CLM-YYYY-####/N).
 */
export async function saveClaim(
  input: NewClaimInput,
  status: ClaimStatus,
  groupBase?: string,
): Promise<SaveClaimResult> {
  const created_at = new Date().toISOString();
  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const MAX_ATTEMPTS = 3;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let claim_number: string;
    try {
      claim_number = await generateClaimNumber(groupBase);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Claim number generation failed';
      throw new Error(msg);
    }
    if (!claim_number) {
      throw new Error('Claim number generation failed');
    }

    const draft: ServiceClaim = { ...input, id, claim_number, created_at, status };

    try {
      const { data, error } = await supabase
        .from('service_claims')
        .insert(draft)
        .select(SELECT_COLS)
        .maybeSingle();

      if (!error && data) {
        return { claim: data as unknown as ServiceClaim, source: 'supabase' };
      }

      // Postgres unique-violation → retry with a fresh number
      const code = (error as { code?: string } | null)?.code;
      if (code === '23505' && attempt < MAX_ATTEMPTS - 1) {
        lastError = error?.message;
        continue;
      }

      // Any other Supabase error → fall back to local store, with a number
      const list = readLocal();
      // Belt-and-braces: ensure local uniqueness too
      if (list.some(c => c.claim_number === claim_number)) {
        lastError = 'Local duplicate';
        continue;
      }
      list.unshift(draft);
      writeLocal(list);
      return { claim: draft, source: 'local', error: error?.message ?? lastError };
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'Unknown error';
      const list = readLocal();
      if (list.some(c => c.claim_number === claim_number)) continue;
      list.unshift(draft);
      writeLocal(list);
      return { claim: draft, source: 'local', error: lastError };
    }
  }

  throw new Error(lastError ?? 'Could not generate a unique claim number');
}

