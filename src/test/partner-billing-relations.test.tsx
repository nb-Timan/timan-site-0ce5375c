import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DealerAccount } from '@/lib/dealerAccountsService';
import type { PartnerAccountRelation } from '@/lib/partnerRelationsService';
import { activeBillingBranches, groupPartnerHierarchy, type BillingPreview, type BillingRelation } from '@/lib/partnerBillingRelations';
import { PARTNER_ACCOUNT_TYPES } from '@/lib/partnerAccountTypes';
import BillingBranchesPanel, { BillingBranchList } from '@/components/portal/BillingBranchesPanel';
import BillingRelationReview from '@/components/backend/BillingRelationReview';
const {load,change}=vi.hoisted(()=>({load:vi.fn(),change:vi.fn()}));
vi.mock('@/lib/partnerBillingRelationsService',()=>({loadBillingRelations:load,changeBillingRelation:change,billingRelationError:()=> 'Review failed'}));
const main={id:'main',account_number:'10451',company_name:'Integra Group',dealer_type:'importer',customer_type_label:'Importør',parent_account_number:'10476',is_active:true} as DealerAccount;
const child={id:'service',account_number:'10953',company_name:'Integra Service',dealer_type:'service_partner',customer_type_label:'Servicepartner',parent_account_number:null,is_active:true} as DealerAccount;
const commercial={id:'commercial',source_account_id:main.id,target_account_id:child.id,relation_type:'importer_has_service_partner',active:true} as PartnerAccountRelation;
const row:BillingRelation={id:'billing',main_partner_id:main.id,main_account_number:'10451',main_company_name:main.company_name,billing_account_number:'10476',billing_account_id:null,billing_name:'NORD AUTOSERVICE',
  relation_type:'billing_branch',active:true,approved_by:'qa-backend',approved_at:'2026-10-10T12:00:00Z',approval_source:'Timan confirmed',approval_reason:'Separate financial identity',ended_at:null,
  address:'Testvej',postal_code:'1000',city:'Testby',country:'Polen',invoice_email:null,currency:'PLN',payment:'NET21',c5_invoice_account:null,version:1};
const preview:BillingPreview={enabled:true,relations:[row],history:[],candidates:[{account_number:'10476',company_name:row.billing_name,c5_type:'0',invoice_account:null}]};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('billing relationship is presentation, never a commercial account role',()=>{
  it('keeps Integra as main and its canonical service child under it without rewriting accounts',()=>{
    const input=[child,main],before=JSON.stringify(input);
    const groups=groupPartnerHierarchy(input,[commercial],[row]);
    expect(groups).toHaveLength(1);expect(groups[0].main.account_number).toBe('10451');
    expect(groups[0].main).toBe(main);expect(groups[0].canonicalMain).toBe(true);
    expect(groups[0].main.parent_account_number).toBe('10476');
    expect(groups[0].branches.map(a=>a.account_number)).toEqual(['10953']);
    expect(JSON.stringify(input)).toBe(before);expect(PARTNER_ACCOUNT_TYPES).not.toHaveProperty('billing_branch');
  });
  it('does not attach an economic account to the commercial children or create a map role',()=>{
    const groups=groupPartnerHierarchy([main,child],[commercial],[row]);
    expect(groups[0].branches.some(a=>a.account_number==='10476')).toBe(false);
    expect(activeBillingBranches([row],main.id)).toEqual([row]);
  });
  it('keeps existing Holmsland/TBS commercial hierarchy and account objects unchanged',()=>{
    const tbs={...main,id:'tbs',account_number:'10374',company_name:'TBS Maskinpower',dealer_type:'dealer',customer_type_label:'Forhandler',parent_account_number:null};
    const holmsland={...child,id:'holmsland',account_number:'10267',company_name:'Valtec Holmsland',dealer_type:'dealer',customer_type_label:'Forhandler',parent_account_number:'10374'};
    const groups=groupPartnerHierarchy([tbs,holmsland],[],[{...row,main_partner_id:holmsland.id,billing_account_number:'10374'}]);
    expect(groups).toHaveLength(1);expect(groups[0].main).toBe(tbs);expect(groups[0].branches[0]).toBe(holmsland);
    expect(groups[0].canonicalMain).toBe(false);
  });
  it('excludes proposals, ended and unapproved rows and isolates multiple main partners',()=>{
    expect(activeBillingBranches([{...row,active:false},{...row,approved_at:null},{...row,approved_by:null}],main.id)).toEqual([]);
    expect(activeBillingBranches([row],'other')).toEqual([]);
  });
  it('shows separate badge and opens bounded read-only financial detail',()=>{
    render(<BillingBranchList rows={[row]} mainId={main.id}/>);
    expect(screen.getByRole('button',{name:/NORD AUTOSERVICE/})).toHaveTextContent('Betalingsfilial · #10476');
    fireEvent.click(screen.getByRole('button',{name:/NORD AUTOSERVICE/}));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tomt / uafklaret');
    expect(screen.getByRole('dialog')).toHaveClass('max-h-[90dvh]','overflow-y-auto');
    expect(screen.queryByRole('button',{name:/opret login|CRM|konfigur/i})).toBeNull();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(change).not.toHaveBeenCalled();
  });
  it('never loads financial information for disabled external/Academy views',()=>{
    render(<BillingBranchesPanel mainId={main.id} enabled={false}/>);
    expect(load).not.toHaveBeenCalled();expect(screen.queryByText('Betalingsfilial')).toBeNull();
  });
  it('closes financial detail when the relation ends or leaves the allowed main scope',()=>{
    const view=render(<BillingBranchList rows={[row]} mainId={main.id}/>);
    fireEvent.click(screen.getByRole('button',{name:/NORD/}));expect(screen.getByRole('dialog')).toBeInTheDocument();
    view.rerender(<BillingBranchList rows={[{...row,active:false}]} mainId={main.id}/>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('survives an unapplied separately approved migration',async()=>{
    load.mockResolvedValue({enabled:false,relations:[],history:[],candidates:[]});
    render(<BillingBranchesPanel mainId={main.id} enabled/>);
    await waitFor(()=>expect(load).toHaveBeenCalledWith(main.id));
    expect(screen.queryByRole('button',{name:/NORD/})).toBeNull();
  });
  it('discards a previous account response after a main-partner change',async()=>{
    let finish: (data:BillingPreview)=>void=()=>{};
    load.mockImplementationOnce(()=>new Promise<BillingPreview>(resolve=>{finish=resolve;})).mockResolvedValueOnce({...preview,relations:[]});
    const view=render(<BillingBranchesPanel mainId={main.id} enabled/>);
    view.rerender(<BillingBranchesPanel mainId="different" enabled/>);
    finish(preview);
    await waitFor(()=>expect(load).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button',{name:/NORD/})).toBeNull();
  });
});
describe('Backend approval lifecycle UI',()=>{
  const open=async(data=preview)=>{
    load.mockResolvedValue(data);render(<BillingRelationReview partners={[main,child]} onSaved={vi.fn().mockResolvedValue(undefined)}/>);
    fireEvent.click(screen.getByRole('button',{name:'Gennemgå betalingsfilial'}));
    fireEvent.change(screen.getByLabelText('Hovedpartner'),{target:{value:main.id}});
    await waitFor(()=>expect(load).toHaveBeenCalledWith(main.id));
  };
  it('blocks saving until the database is explicitly enabled',async()=>{
    await open({...preview,enabled:false,relations:[],candidates:[]});
    expect(await screen.findByRole('status')).toHaveTextContent('produktionsgodkendelse');
    expect(screen.getByRole('button',{name:'Gem betalingsbeslutning'})).toBeDisabled();expect(change).not.toHaveBeenCalled();
  });
  it('does not infer the selected billing account or customer type from C5',async()=>{
    await open({...preview,relations:[]});
    expect(await screen.findByLabelText('Betalingsfilial · C5-konto')).toHaveValue('');
    expect(screen.getByRole('option',{name:/NORD AUTOSERVICE/})).toHaveTextContent('C5-type 0');
    fireEvent.change(screen.getByLabelText('Handling'),{target:{value:'ACTIVATE'}});
    fireEvent.click(screen.getByRole('button',{name:'Gem betalingsbeslutning'}));
    expect(screen.getByRole('alert')).toHaveTextContent('godkend');expect(change).not.toHaveBeenCalled();
  });
  it('sends only the financial decision and version after explicit END confirmation',async()=>{
    await open({...preview,history:[{id:'h',action:'ACTIVATE',version:3,changed_at:'2026-10-10',changed_by:'qa',reason:'QA',approval_source:'QA',previous_billing_account_number:null,new_billing_account_number:'10476',new_parent_account_id:main.id}]});
    await screen.findByLabelText('Handling');
    fireEvent.change(screen.getByLabelText('Handling'),{target:{value:'END'}});
    fireEvent.change(screen.getByLabelText('Kilde'),{target:{value:'Timan decision'}});
    fireEvent.change(screen.getByLabelText('Begrundelse'),{target:{value:'Ended cooperation'}});
    fireEvent.click(screen.getByLabelText('Jeg godkender denne betalingsrelation/afslutning eksplicit'));
    change.mockResolvedValue('decision');
    fireEvent.click(screen.getByRole('button',{name:'Gem betalingsbeslutning'}));
    await waitFor(()=>expect(change).toHaveBeenCalledOnce());
    expect(change.mock.calls[0][0]).toMatchObject({mainId:main.id,accountNumber:null,action:'END',expectedVersion:3,confirmed:true});
    expect(change.mock.calls[0][0]).not.toHaveProperty('parent_account_number');
    expect(change.mock.calls[0][0]).not.toHaveProperty('billing_account_id');
  });
});
