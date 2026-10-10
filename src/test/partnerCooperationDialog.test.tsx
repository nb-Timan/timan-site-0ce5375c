import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PartnerCooperationDialog from '@/components/backend/PartnerCooperationDialog';
import type { DealerAccount } from '@/lib/dealerAccountsService';
const { change, history } = vi.hoisted(() => ({ change: vi.fn(), history: vi.fn() }));
vi.mock('@/lib/partnerRelationsService', () => ({ changePartnerCooperation: change,
  loadPartnerCooperationHistory: history, partnerCooperationError: () => 'Samarbejdet kunne ikke gemmes.' }));
const customerId = '11111111-1111-4111-8111-111111111111';
const parentId = '22222222-2222-4222-8222-222222222222';
const dealers = [
  { id:customerId,account_number:'12041',company_name:'JE Service',customer_type_label:'Forhandlerkunde' },
  { id:parentId,account_number:'10295',company_name:'AB Lauridsen',customer_type_label:'Forhandler' },
  { id:'blocked',account_number:'999',company_name:'Blocked dealer',customer_type_label:'Forhandler',is_blocked:true },
] as DealerAccount[];
const open = async (action: 'ACTIVATE' | 'END' | 'SWITCH' | 'HISTORY' = 'ACTIVATE') => {
  history.mockResolvedValue({ version:3,events:[] });
  const onClose=vi.fn(),onSaved=vi.fn().mockResolvedValue(undefined);
  render(<PartnerCooperationDialog customerId={customerId} action={action} dealers={dealers} onClose={onClose} onSaved={onSaved} />);
  await waitFor(()=>expect(screen.queryByText('Henter samarbejdshistorik…')).toBeNull());
  return {onClose,onSaved};
};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('permanent Backend cooperation actions',()=>{
  it('requires a reason and explicit new-relation approval, without guessing from C5',async()=>{
    await open();fireEvent.click(screen.getByRole('button',{name:'Godkend forhandlerrelation'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Angiv en årsag');expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox',{name:'Ny forhandler'})).toHaveValue('');
    expect(screen.queryByRole('option',{name:/Blocked dealer/})).toBeNull();
  });
  it.each(['ACTIVATE','SWITCH'] as const)('saves explicit %s with server version then reloads',async(action)=>{
    const {onClose,onSaved}=await open(action);change.mockResolvedValue('event');
    fireEvent.change(screen.getByLabelText('Ny forhandler'),{target:{value:parentId}});
    fireEvent.change(screen.getByLabelText('Årsag'),{target:{value:'Confirmed by Timan Backend'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'Jeg godkender denne nye forhandlerrelation'}));
    fireEvent.click(screen.getByRole('button',{name:action==='SWITCH'?'Skift forhandler':'Godkend forhandlerrelation'}));
    await waitFor(()=>expect(onClose).toHaveBeenCalledOnce());expect(onSaved).toHaveBeenCalledOnce();
    expect(change.mock.calls[0][0]).toMatchObject({customerId,action,newDealerId:parentId,confirmed:true,expectedVersion:3});
  });
  it('ends cooperation only with a reason, with no new dealer and no delete action',async()=>{
    const {onClose}=await open('END');change.mockResolvedValue('event');
    expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByRole('button',{name:/slet/i})).toBeNull();
    fireEvent.change(screen.getByLabelText('Årsag'),{target:{value:'Cooperation ended by Backend'}});
    fireEvent.click(screen.getByRole('button',{name:'Afslut samarbejde'}));
    await waitFor(()=>expect(onClose).toHaveBeenCalledOnce());
    expect(change.mock.calls[0][0]).toMatchObject({action:'END',newDealerId:null,reason:'Cooperation ended by Backend'});
  });
  it('does not close on failure and keeps one idempotency key for unchanged retry',async()=>{
    const {onClose}=await open('END');change.mockRejectedValue(new Error('network'));
    fireEvent.change(screen.getByLabelText('Årsag'),{target:{value:'End request'}});
    fireEvent.click(screen.getByRole('button',{name:'Afslut samarbejde'}));await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'Afslut samarbejde'}));await waitFor(()=>expect(change).toHaveBeenCalledTimes(2));
    expect(change.mock.calls[0][0].requestId).toBe(change.mock.calls[1][0].requestId);expect(onClose).not.toHaveBeenCalled();
  });
  it('clears explicit approval when a different dealer is selected',async()=>{
    await open('SWITCH');const checkbox=screen.getByRole('checkbox');fireEvent.click(checkbox);expect(checkbox).toBeChecked();
    fireEvent.change(screen.getByLabelText('Ny forhandler'),{target:{value:parentId}});expect(checkbox).not.toBeChecked();
  });
  it('shows append-only history without mutation controls in history mode',async()=>{
    await open('HISTORY');expect(screen.getByText('Samarbejdshistorik (0)')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByRole('button',{name:/godkend|afslut|skift/i})).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });
  it('keeps viewport-bounded internal scroll for narrow screens',async()=>{
    await open();expect(screen.getByRole('dialog')).toHaveClass('max-h-[90dvh]','overflow-y-auto','w-[calc(100%_-_2rem)]');
  });
});
