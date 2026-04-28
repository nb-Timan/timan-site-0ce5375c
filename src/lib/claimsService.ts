// Service / Claims data layer.
// Tries Supabase `service_claims` table first; falls back to mock data
// (preview-safe — no HTTP 500 if the table does not exist).

import { supabase } from '@/lib/supabase';

export type ClaimStatus = 'open' | 'in_review' | 'approved' | 'rejected' | 'closed';

export interface ServiceClaim {
  id: string;
  claim_number: string;
  machine_serial: string | null;
  machine_model: string | null;
  customer_name: string | null;
  description: string;
  status: ClaimStatus;
  created_at: string;
  created_by_email?: string | null;
}

const MOCK_CLAIMS: ServiceClaim[] = [
  {
    id: 'mock-1',
    claim_number: 'CLM-2026-0042',
    machine_serial: 'TM-RC50-001234',
    machine_model: 'RC50',
    customer_name: 'Jongshøj Maskiner',
    description: 'Hydraulisk lækage på løftearm efter 120 driftstimer.',
    status: 'in_review',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    created_by_email: 'thomas@jongshoej-maskiner.dk',
  },
  {
    id: 'mock-2',
    claim_number: 'CLM-2026-0041',
    machine_serial: 'TM-3330-000987',
    machine_model: '3330',
    customer_name: 'Nordic Greens A/S',
    description: 'Defekt startmotor — udskiftet under garanti.',
    status: 'approved',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    created_by_email: 'demo-dealer@timan.dk',
  },
  {
    id: 'mock-3',
    claim_number: 'CLM-2026-0040',
    machine_serial: 'TM-RC30-000771',
    machine_model: 'RC30',
    customer_name: 'Park & Vej Kommune',
    description: 'Display viser fejlkode E12 ved opstart.',
    status: 'open',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    created_by_email: 'demo-dealer@timan.dk',
  },
  {
    id: 'mock-4',
    claim_number: 'CLM-2025-0398',
    machine_serial: 'TM-RC50-001102',
    machine_model: 'RC50',
    customer_name: 'GreenLine Service',
    description: 'Slidskinner ønskes vurderet — slid ud over normalt.',
    status: 'closed',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    created_by_email: 'demo-dealer@timan.dk',
  },
];

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

export async function getClaimById(id: string): Promise<LoadClaimResult> {
  try {
    const { data, error } = await supabase
      .from('service_claims')
      .select('id, claim_number, machine_serial, machine_model, customer_name, description, status, created_at, created_by_email')
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
    return { claim: data as ServiceClaim, source: 'supabase' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const fallback = MOCK_CLAIMS.find(c => c.id === id) ?? null;
    return { claim: fallback, source: 'mock', error: msg };
  }
}

export async function loadClaims(): Promise<LoadClaimsResult> {
  try {
    const { data, error } = await supabase
      .from('service_claims')
      .select('id, claim_number, machine_serial, machine_model, customer_name, description, status, created_at, created_by_email')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      // Table missing / RLS / network — fall back to mock so preview still works.
      return { claims: MOCK_CLAIMS, source: 'mock', error: error.message };
    }
    if (!data || data.length === 0) {
      return { claims: MOCK_CLAIMS, source: 'mock' };
    }
    return { claims: data as ServiceClaim[], source: 'supabase' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { claims: MOCK_CLAIMS, source: 'mock', error: msg };
  }
}
