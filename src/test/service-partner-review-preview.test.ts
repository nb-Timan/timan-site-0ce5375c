import { describe, expect, it } from 'vitest';
import { buildPartnerReviewRows } from '@/lib/fabricPartnerReview';
import { comparePartnerMaster, type PortalPartnerParity } from '@/lib/fabricPartnerParity';
import { partnerReviewBillingLabel, previewServicePartnerCooperation, servicePartnerReviewCandidates } from '@/lib/servicePartnerReviewPreview';
import type { PartnerShadowRow } from '../../supabase/functions/_shared/fabricPartnerSnapshot';

const child: PortalPartnerParity = {
  id: 'dcbfec99-6793-4d1c-bef6-c4219e1e4c6e', account_number: '10082', company_name: 'Have og Park Center Svendborg',
  address_line_1: null, address_line_2: null, postal_code: null, city: null, country: null,
  phone: null, email: null, billing_account_number: null, customer_type_label: 'Service Partner',
  customer_type: 'Service Partner', dealer_type: 'service_partner', assigned_seller_initials: 'EM', parent_account_number: null,
};
const parent: PortalPartnerParity = { ...child, id: 'b6f4657a-6cc7-423d-b64d-dba372c96fd5',
  account_number: '10151', company_name: 'Reesink Turfcare A/S', customer_type_label: 'Forhandler', customer_type: 'Forhandler', dealer_type: 'dealer' };
const source: PartnerShadowRow = {
  company:'DAT',account_number:'10082',account_raw:'10082',company_name:child.company_name!,
  address1:null,address2:null,postal_code:null,city:null,zipcity_raw:null,zipcity_validation:'REVIEW_REQUIRED',
  country:null,iso_country:null,phone:null,email:null,c5_invoice_account_number:null,c5_group:null,c5_partner_type_code:'2',
  c5_salesrep:'EM',language:0,vat_number:null,currency:'DKK',payment:'NET21',c5_blocked:0,c5_approved:1,
  source_row_number:1,source_last_changed:null,
};
const row = () => buildPartnerReviewRows(comparePartnerMaster([child],[source]),[],[])[0];

describe('read-only Servicepartner review preparation', () => {
  it('does not interpret empty C5 invoice field as own billing', () => {
    expect(partnerReviewBillingLabel(row())).toContain('tom · samarbejde kan godkendes');
    expect(partnerReviewBillingLabel(row())).not.toContain('Egen konto');
  });
  it('only confirms own billing when the explicit C5 account equals this account', () => {
    const r = row(); r.c5[0] = { ...source, c5_invoice_account_number: '10082' };
    expect(partnerReviewBillingLabel(r)).toContain('Egen konto #10082');
    r.c5[0] = { ...source, c5_invoice_account_number: '10151' };
    expect(partnerReviewBillingLabel(r)).toContain('Konto #10151');
    r.c5.push(source);
    expect(partnerReviewBillingLabel(r)).toContain('entydig C5-kilde mangler');
  });
  it('uses Reesinks actual dealer type without pretending it is an importer', () => {
    const r = row(); const before = JSON.stringify({r,parent});
    const result = previewServicePartnerCooperation(r,parent.id,[parent],'Timan har oplyst samarbejdet.');
    expect(result).toMatchObject({ source_account_id:parent.id,target_account_id:child.id,
      relation_type:'dealer_has_service_partner',parent_type:'dealer',seller:'EM',canApply:false });
    expect(result.billing).toContain('tom');
    expect(result.readyForApproval).toBe(true);
    expect(result).not.toHaveProperty('billing_account_id');
    expect(result).not.toHaveProperty('invoice_account');
    expect(JSON.stringify({r,parent})).toBe(before);
  });
  it('reuses canonical importer relation when the real parent is an importer', () => {
    const importer = {...parent,customer_type_label:'Importør',customer_type:'Importør',dealer_type:'importer'};
    expect(previewServicePartnerCooperation(row(),parent.id,[importer],'Verified').relation_type).toBe('importer_has_service_partner');
  });
  it('rejects self, non-parent types and duplicate account identities', () => {
    expect(servicePartnerReviewCandidates(row(),[child,parent,{...parent,id:'duplicate'}])).toEqual([]);
    expect(servicePartnerReviewCandidates(row(),[{...parent,dealer_type:'service_partner',customer_type_label:'Servicepartner',customer_type:'Servicepartner'}])).toEqual([]);
    expect(previewServicePartnerCooperation(row(),'unknown',[parent],'').blockers).toHaveLength(2);
  });
  it('never applies a proposal, even when all local facts and reason are present', () => {
    const r = row(); r.c5[0] = {...source,c5_invoice_account_number:'10082'};
    const result = previewServicePartnerCooperation(r,parent.id,[parent],'Confirmed business relationship');
    expect(result.canApply).toBe(false);
    expect(result.blockers).toHaveLength(0);
    expect(result.explicitProductionApprovalRequired).toBe(true);
  });
  it('does not derive cooperation validity from legacy billing or C5 type, but rejects wrong Portal types', () => {
    const r = row(); r.portal[0] = {...child,parent_account_number:'99999'};
    expect(previewServicePartnerCooperation(r,parent.id,[parent],'Confirmed').readyForApproval).toBe(true);
    r.c5[0] = {...source,c5_partner_type_code:'5'};
    expect(previewServicePartnerCooperation(r,parent.id,[parent],'Confirmed').readyForApproval).toBe(true);
    r.portal[0] = {...child,dealer_type:'dealer',customer_type_label:'Forhandler',customer_type:'Forhandler'};
    expect(previewServicePartnerCooperation(r,parent.id,[parent],'Confirmed').readyForApproval).toBe(false);
  });
});
