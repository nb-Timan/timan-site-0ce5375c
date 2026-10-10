import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FabricPartnerComparisonPanel from '@/components/backend/FabricPartnerComparisonPanel';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
const source = {
  company: 'DAT', account_number: '12041', account_raw: ' 12041 ', company_name: 'JE Service',
  address1: null, address2: null, postal_code: '4683', city: 'Rønnede', zipcity_raw: '4683 Rønnede', zipcity_validation: 'PARSED_DK',
  country: 'Danmark', iso_country: 'DK', phone: null, email: null, c5_invoice_account_number: '12040',
  c5_group: null, c5_partner_type_code: '5', c5_salesrep: 'EM', language: 0, vat_number: null,
  currency: 'DKK', payment: '30', c5_blocked: 0, c5_approved: 1, source_row_number: 320721720, source_last_changed: null,
};
const preview = { state: { last_success_at: '2026-10-09T10:00:00Z', row_count: 1, source_as_of: '2026-10-09T10:00:00Z', last_error: null },
  shadow: [source], portal: [] };
afterEach(() => { cleanup(); rpc.mockReset(); });
describe('Backend read-only Fabric comparison', () => {
  it('uses only the guarded preview RPC and has no apply/update controls', async () => {
    rpc.mockResolvedValue({ data: preview, error: null });
    render(<FabricPartnerComparisonPanel />);
    expect(await screen.findByText('JE Service')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('fabric_partner_shadow_preview');
    expect(screen.queryByRole('button', { name: /gem|anvend|opdater fra fabric/i })).toBeNull();
  });
  it('reveals provenance and invoice account without inferred Portal hierarchy', async () => {
    rpc.mockResolvedValue({ data: preview, error: null });
    render(<FabricPartnerComparisonPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /12041 JE Service/ }));
    expect(screen.getByText('12040')).toBeInTheDocument();
    expect(screen.getByText(/320721720/)).toBeInTheDocument();
    expect(screen.queryByText('parent_account_number')).toBeNull();
  });
  it('combines search and status filter without altering source data', async () => {
    rpc.mockResolvedValue({ data: preview, error: null });
    render(<FabricPartnerComparisonPanel />);
    await screen.findByText('JE Service');
    fireEvent.click(screen.getByRole('button', { name: 'Kun C5 (1)' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12041' } });
    expect(screen.getByText('JE Service')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '99999' } });
    expect(screen.queryByText('JE Service')).toBeNull();
    expect(preview.shadow).toHaveLength(1);
  });
  it('keeps last valid display when preview reload fails', async () => {
    let shadowCalls = 0;
    rpc.mockImplementation(async name => name === 'fabric_partner_review_preview'
      ? { data: { reviews: [], contexts: [], parents: [] }, error: null }
      : ++shadowCalls === 1 ? { data: preview, error: null } : { data: null, error: { message: 'denied' } });
    render(<FabricPartnerComparisonPanel />);
    await screen.findByText('JE Service');
    fireEvent.click(screen.getByRole('button', { name: 'Genindlæs sammenligning' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('JE Service')).toBeInTheDocument();
  });
  it('does not label Portal-only rows before a first successful snapshot', async () => {
    rpc.mockResolvedValue({ data: { ...preview, state: { ...preview.state, last_success_at: null, row_count: 0 }, shadow: [] }, error: null });
    render(<FabricPartnerComparisonPanel />);
    expect(await screen.findByText(/Afventer første snapshot/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kun Portal (0)' })).toBeInTheDocument();
  });
  it('shows controlled failed sync warning while preserving source rows', async () => {
    rpc.mockResolvedValue({ data: { ...preview, state: { ...preview.state, last_error: 'SYNC_FAILED' } }, error: null });
    render(<FabricPartnerComparisonPanel />);
    expect(await screen.findByText('JE Service')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sidste gyldige snapshot vises');
  });
  it('filters dealer customers, shows review classification and has no mutation controls', async () => {
    rpc.mockResolvedValue({ data: preview, error: null });
    render(<FabricPartnerComparisonPanel />);
    await screen.findByText('JE Service');
    fireEvent.click(screen.getByRole('button', { name: 'Forhandlerkunder (1)' }));
    fireEvent.click(screen.getByRole('button', { name: /12041 JE Service/ }));
    expect(screen.getByText('REVIEW_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText(/Ingen automatisk oprettelse/)).toBeInTheDocument();
    expect(screen.getByText('C5 invoice-kæde · kildefakta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AUTO_SAFE_CANDIDATE (0)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gem|anvend|opret partner/i })).toBeNull();
  });
});
