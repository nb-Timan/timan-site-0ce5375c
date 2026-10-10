import {beforeEach,expect,it,vi} from 'vitest';
import {changePartnerCooperation,partnerCooperationError} from '@/lib/partnerRelationsService';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
beforeEach(()=>rpc.mockReset());
const input={customerId:'child',expectedVersion:1,action:'SWITCH' as const,newDealerId:'parent',
  confirmed:true,reason:'Approved cooperation',requestId:'request',previousRelationId:'previous'};
it('retains the established customer lifecycle while typed schema release is pending',async()=>{
  rpc.mockResolvedValueOnce({error:{code:'PGRST202',message:'Function absent'},data:null})
    .mockResolvedValueOnce({error:null,data:'event'});
  expect(await changePartnerCooperation({...input,relationType:'dealer_has_dealer_customer'})).toBe('event');
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['partner_cooperation_change_typed','partner_cooperation_change']);
  expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_relation_type');
  expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_previous_relation_id');
  expect(rpc.mock.calls[1][1]).toMatchObject({p_customer_id:'child',p_expected_version:1,p_action:'SWITCH',p_new_dealer_id:'parent'});
});
it.each(['dealer_has_service_partner','importer_has_service_partner'] as const)('never substitutes customer RPC for %s',async(relationType)=>{
  const error={code:'PGRST202',message:'Function absent'};rpc.mockResolvedValue({error,data:null});
  await expect(changePartnerCooperation({...input,relationType})).rejects.toBe(error);
  expect(rpc).toHaveBeenCalledOnce();expect(partnerCooperationError(error)).toContain('frigives i databasen');
});
it('does not retry permission/state errors through a different endpoint',async()=>{
  const error={code:'42501',message:'BACKEND_ONLY'};rpc.mockResolvedValue({error,data:null});
  await expect(changePartnerCooperation({...input,relationType:'dealer_has_dealer_customer'})).rejects.toBe(error);
  expect(rpc).toHaveBeenCalledOnce();
});
