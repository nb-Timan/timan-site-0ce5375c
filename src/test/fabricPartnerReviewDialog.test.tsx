import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FabricPartnerReviewDialog from '@/components/backend/FabricPartnerReviewDialog';
import { comparePartnerMaster } from '@/lib/fabricPartnerParity';
import { buildPartnerReviewRows } from '@/lib/fabricPartnerReview';
import type { PartnerShadowRow } from '../../supabase/functions/_shared/fabricPartnerSnapshot';
const { savePartnerReview } = vi.hoisted(() => ({ savePartnerReview: vi.fn() }));
vi.mock('@/lib/fabricPartnerReviewService', () => ({ savePartnerReview, partnerReviewError: () => 'Beslutningen kunne ikke gemmes.' }));
const source: PartnerShadowRow = { company:'DAT',account_number:'12041',account_raw:'12041',company_name:'JE Service',
  address1:'Testvej 1',address2:null,postal_code:'4683',city:'Rønnede',zipcity_raw:'4683 Rønnede',zipcity_validation:'PARSED_DK',
  country:'Danmark',iso_country:'DK',phone:null,email:null,c5_invoice_account_number:'12040',c5_group:null,c5_partner_type_code:'5',
  c5_salesrep:'EM',language:0,vat_number:null,currency:'DKK',payment:'30',c5_blocked:0,c5_approved:1,
  source_row_number:320721720,source_last_changed:null };
const parent={id:'bc6ae72c-b653-4995-a446-dfdd540b01d1',account_number:'10295',company_name:'AB Lauridsen'};
const row=buildPartnerReviewRows(comparePartnerMaster([], [source]),[],[{account_number:'12041',source_fingerprint:'source',portal_fingerprint:'portal',source_count:1,portal_count:0}])[0];
const open = (overrides={}) => {
  const onClose=vi.fn(),onSaved=vi.fn().mockResolvedValue(undefined);
  render(<FabricPartnerReviewDialog row={row} parents={[parent]} history={[]} onClose={onClose} onSaved={onSaved} {...overrides} />);
  return {onClose,onSaved};
};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('separate Backend review decisions',()=>{
  it('shows source facts, protected owner and exact field choices without import',()=>{
    open();expect(screen.getByRole('dialog')).toHaveTextContent('JE Service');
    expect(screen.getByText('12040')).toBeInTheDocument();
    expect(screen.getByLabelText('Godkendt overordnet forhandler')).toHaveValue('');
    expect(screen.getAllByRole('combobox')).toHaveLength(9);
    expect(screen.queryByRole('button',{name:/overfør|opret partner|importér/i})).toBeNull();
  });
  it('requires documented reason and explicit parent before approval',async()=>{
    open();fireEvent.change(screen.getByLabelText('Beslutning'),{target:{value:'APPROVED'}});
    fireEvent.click(screen.getByRole('button',{name:'Gem beslutning'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('begrundelse');expect(savePartnerReview).not.toHaveBeenCalled();
  });
  it('saves validated approval only then refreshes and closes',async()=>{
    const {onClose,onSaved}=open();savePartnerReview.mockResolvedValue('decision');
    fireEvent.change(screen.getByLabelText('Beslutning'),{target:{value:'APPROVED'}});
    fireEvent.change(screen.getByLabelText('Godkendt overordnet forhandler'),{target:{value:parent.id}});
    fireEvent.change(screen.getByLabelText('Kommentar / dokumenteret begrundelse'),{target:{value:'Verified invoice chain'}});
    fireEvent.click(screen.getByRole('button',{name:'Gem beslutning'}));
    await waitFor(()=>expect(onClose).toHaveBeenCalledOnce());expect(onSaved).toHaveBeenCalledOnce();
    expect(savePartnerReview.mock.calls[0][1]).toMatchObject({status:'APPROVED',parent_dealer_id:parent.id,fields:{city:'C5'}});
  });
  it('keeps form on failure and reuses request ID on unchanged retry',async()=>{
    const {onClose}=open();savePartnerReview.mockRejectedValue(new Error('network'));
    fireEvent.click(screen.getByRole('button',{name:'Gem beslutning'}));await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'Gem beslutning'}));await waitFor(()=>expect(savePartnerReview).toHaveBeenCalledTimes(2));
    expect(savePartnerReview.mock.calls[0][2]).toBe(savePartnerReview.mock.calls[1][2]);expect(onClose).not.toHaveBeenCalled();
  });
  it.each(['IGNORED','NEEDS_CLARIFICATION','PENDING'])('persists %s independently of type approval',async(status)=>{
    const {onClose}=open();savePartnerReview.mockResolvedValue('decision');
    fireEvent.change(screen.getByLabelText('Beslutning'),{target:{value:status}});
    fireEvent.click(screen.getByRole('button',{name:'Gem beslutning'}));await waitFor(()=>expect(onClose).toHaveBeenCalledOnce());
    expect(savePartnerReview.mock.calls[0][1].status).toBe(status);
  });
  it('uses viewport-bounded internal scrolling for mobile',()=>{
    open();expect(screen.getByRole('dialog')).toHaveClass('max-h-[90dvh]','overflow-y-auto','w-[calc(100%_-_2rem)]');
  });
});
