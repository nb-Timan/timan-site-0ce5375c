import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FabricPartnerReviewDialog from '@/components/backend/FabricPartnerReviewDialog';
import { buildPartnerReviewRows } from '@/lib/fabricPartnerReview';
import { comparePartnerMaster, type PortalPartnerParity } from '@/lib/fabricPartnerParity';
import type { PartnerShadowRow } from '../../supabase/functions/_shared/fabricPartnerSnapshot';
const calls=vi.hoisted(()=>({change:vi.fn(),review:vi.fn()}));
vi.mock('@/lib/fabricPartnerReviewService',()=>({savePartnerReview:calls.review,partnerReviewError:()=> 'Review failed'}));
vi.mock('@/lib/partnerRelationsService',()=>({changePartnerCooperation:calls.change,
  loadPartnerCooperationHistory:async()=>({version:0,events:[],billing:{source_count:1,invoice_account:null}}),
  partnerCooperationError:()=> 'Cooperation failed'}));
const child:PortalPartnerParity={id:'child',account_number:'10082',company_name:'Have og Park Center Svendborg',
  customer_type:'Servicepartner',customer_type_label:'Servicepartner',dealer_type:'service_partner',assigned_seller_initials:'EM',
  address_line_1:null,address_line_2:null,postal_code:null,city:null,country:null,phone:null,email:null,billing_account_number:null};
const parent={...child,id:'parent',account_number:'10151',company_name:'Reesink Turfcare A/S',customer_type:'Forhandler',customer_type_label:'Forhandler',dealer_type:'dealer'};
const source:PartnerShadowRow={company:'DAT',account_number:'10082',account_raw:'10082',company_name:child.company_name!,
  address1:null,address2:null,postal_code:null,city:null,zipcity_raw:null,zipcity_validation:'REVIEW_REQUIRED',
  country:null,iso_country:null,phone:null,email:null,c5_invoice_account_number:null,c5_group:null,c5_partner_type_code:'2',
  c5_salesrep:'EM',language:0,vat_number:null,currency:'DKK',payment:'NET21',c5_blocked:0,c5_approved:1,source_row_number:1,source_last_changed:null};
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('opens the real separate cooperation approval from Servicepartner review with blank invoice, preserving profile review',async()=>{
  const row=buildPartnerReviewRows(comparePartnerMaster([child],[source]),[],[])[0];
  const before=JSON.stringify(row), onSaved=vi.fn().mockResolvedValue(undefined),onClose=vi.fn();
  render(<FabricPartnerReviewDialog row={row} parents={[]} history={[]} cooperationPartners={[parent]}
    onClose={onClose} onSaved={onSaved}/>);
  expect(screen.getByText(/EM/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Gennemgå samarbejde'}));
  await screen.findByText('Samarbejdshistorik (0)');
  expect(screen.getByLabelText('Samarbejdspartner / overordnet partner')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Samarbejdspartner / overordnet partner'),{target:{value:'parent'}});
  expect(screen.getByLabelText('Relationstype')).toHaveValue('dealer_has_service_partner');
  fireEvent.change(screen.getByLabelText('Årsag'),{target:{value:'Timan confirmed cooperation with own billing'}});
  fireEvent.click(screen.getByRole('checkbox'));
  calls.change.mockResolvedValue('event');
  fireEvent.click(screen.getByRole('button',{name:'Godkend samarbejde'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());
  expect(onClose).toHaveBeenCalledOnce();
  expect(calls.change.mock.calls[0][0]).toMatchObject({customerId:'child',newDealerId:'parent',relationType:'dealer_has_service_partner',confirmed:true});
  expect(calls.review).not.toHaveBeenCalled();expect(JSON.stringify(row)).toBe(before);
});
