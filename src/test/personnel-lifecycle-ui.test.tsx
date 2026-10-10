import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DealerAccount } from '@/lib/dealerAccountsService';
import DealerProfileEditor from '@/components/portal/DealerProfileEditor';
import LoanNextAction from '@/pages/loans/LoanNextAction';
import LoanAcceptancePage from '@/pages/loans/LoanAcceptancePage';
import BackendPersonnelHistory from '@/components/backend/BackendPersonnelHistory';
import { personnelDate, userLifecycleFacts, type PersonnelUser } from '@/lib/backendPersonnelHistory';
import { t } from '@/lib/i18n/translations';
const qa=vi.hoisted(()=>({
  listDealerContacts:vi.fn(),listRemovedDealerContactAreas:vi.fn(),deleteDealerContact:vi.fn(),archiveLegacyDealerContact:vi.fn(),upsertDealerContact:vi.fn(),
  fetchActiveDealerContractPaymentTerm:vi.fn(),updateDealerAccount:vi.fn(),getLoanApprovalData:vi.fn(),createLoanCaseVersion:vi.fn(),acceptLoanCaseVersion:vi.fn(),fetchPersonnelHistory:vi.fn(),
}));
vi.mock('@/lib/partnerDataRepository',()=>({getPartnerDataRepository:()=>qa}));
vi.mock('@/lib/loanService',()=>({getLoanApprovalData:qa.getLoanApprovalData,createLoanCaseVersion:qa.createLoanCaseVersion,acceptLoanCaseVersion:qa.acceptLoanCaseVersion}));
vi.mock('@/lib/backendPersonnelHistory',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/backendPersonnelHistory')>(),fetchPersonnelHistory:qa.fetchPersonnelHistory}));
vi.mock('@/context/LanguageContext',()=>({useLanguage:()=>({uiLanguage:'da'})}));
vi.mock('@/pages/loans/LoanShell',()=>({default:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('@/components/crm/AddressAutocomplete',()=>({default:()=>null}));
const label=(k:string)=>t(k,'da');
const dealer={id:'qa-partner',account_number:'QA',company_name:'QA Partner',payment_terms:null} as DealerAccount;
const person={id:'qa-contact',dealer_account_id:dealer.id,contact_area:'director',name:'QA Employee',role_title:'Direktør',email:null,phone:null,is_primary:false,created_at:'2026-01-01',updated_at:'2026-01-01'};
beforeEach(()=>{vi.clearAllMocks();qa.listDealerContacts.mockResolvedValue([person]);qa.listRemovedDealerContactAreas.mockResolvedValue([]);qa.fetchActiveDealerContractPaymentTerm.mockResolvedValue({paymentTerm:null});qa.deleteDealerContact.mockResolvedValue({ok:true});});
afterEach(cleanup);
const profile=()=>render(<MemoryRouter><DealerProfileEditor dealer={dealer} language="da" canEdit canManageFinancialTerms effectiveUserId={null}/></MemoryRouter>);
const approval=()=>render(<MemoryRouter initialEntries={['/portal/loans/qa/accept']}><Routes><Route path="/portal/loans/:caseId/accept" element={<LoanAcceptancePage/>}/></Routes></MemoryRouter>);
describe('contact confirmation and identity separation',()=>{
  it('cancel leaves both contact persistence and login identity untouched',async()=>{
    profile();await screen.findByDisplayValue('QA Employee');
    fireEvent.click(screen.getAllByRole('button',{name:'Fjern'})[0]);
    expect(screen.getByRole('alertdialog',{name:'Vil du fjerne denne medarbejder?'})).toBeInTheDocument();
    expect(screen.getByText('QA Employee · QA Partner #QA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Annuller'}));
    expect(qa.deleteDealerContact).not.toHaveBeenCalled();expect(screen.getByDisplayValue('QA Employee')).toBeInTheDocument();
  });
  it('only confirmation removes the canonical contact through existing scoped operation',async()=>{
    profile();await screen.findByDisplayValue('QA Employee');fireEvent.click(screen.getAllByRole('button',{name:'Fjern'})[0]);
    fireEvent.click(screen.getByRole('button',{name:'Fjern medarbejder'}));
    await waitFor(()=>expect(qa.deleteDealerContact).toHaveBeenCalledWith(person.id,null));
    await waitFor(()=>expect(screen.queryByDisplayValue('QA Employee')).not.toBeInTheDocument());
    expect(qa.updateDealerAccount).not.toHaveBeenCalled();expect(qa.upsertDealerContact).not.toHaveBeenCalled();
  });
});
describe('canonical approval next step',()=>{
  it('no authorized action means no new control',()=>{render(<MemoryRouter><LoanNextAction caseId="qa" state={{case_id:'qa',can_review:false,can_accept:false,terms_ready:false,active_reservation_count:1}} label={label}/></MemoryRouter>);expect(screen.queryByRole('link')).not.toBeInTheDocument();});
  it('ready for review links to existing accept route without introducing a receipt',()=>{render(<MemoryRouter><LoanNextAction caseId="qa" state={{case_id:'qa',can_review:true,can_accept:false,terms_ready:false,active_reservation_count:1}} label={label}/></MemoryRouter>);expect(screen.getByRole('link',{name:'Godkend kontrol'})).toHaveAttribute('href','/portal/loans/qa/accept');expect(screen.queryByText('Modtag')).not.toBeInTheDocument();});
  it('missing approved terms visibly block release',async()=>{qa.getLoanApprovalData.mockResolvedValue({number:'U-QA',state:{can_review:true,can_accept:false,terms_ready:false},terms:null});approval();expect(await screen.findByText(label('loansTermsMissing'))).toBeInTheDocument();expect(screen.getByRole('button',{name:label('loansCreateVersion')})).toBeDisabled();expect(qa.createLoanCaseVersion).not.toHaveBeenCalled();});
  it('review confirmation creates the existing canonical version exactly once',async()=>{qa.getLoanApprovalData.mockResolvedValue({number:'U-QA',state:{can_review:true,can_accept:false,terms_ready:true},terms:{title:'QA approved terms',body:'QA terms only'}});qa.createLoanCaseVersion.mockResolvedValue(1);approval();await screen.findByText('QA approved terms');fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:label('loansCreateVersion')}));await waitFor(()=>expect(qa.createLoanCaseVersion).toHaveBeenCalledWith('qa',true));expect(qa.acceptLoanCaseVersion).not.toHaveBeenCalled();});
});
describe('Backend documented history',()=>{
  const user={id:'qa-user',name:'QA User',company:'QA Partner',role:'timan_dealer',is_active:false,approved:true,status:'blocked',created_at:'2026-01-01',last_login_at:null} satisfies PersonnelUser;
  it('does not invent activation/deactivation/archive dates',()=>{const facts=userLifecycleFacts(user,[]);expect(facts.status).toBe('Portal-login deaktiveret');expect(facts.activated).toBeUndefined();expect(facts.deactivated).toBeUndefined();expect(facts.archived).toBeUndefined();expect(personnelDate(null)).toBe('Ikke registreret');expect(personnelDate('invalid')).toBe('Ikke registreret');});
  it('uses existing recorded actor/date without treating deactivation as archival',()=>{const event={id:'event',at:'2026-10-10T10:00:00Z',actor:'QA Backend',record_id:user.id,record_type:'app_users',label:'QA User',action:'update',server_recorded:true,old:{is_active:true},new:{is_active:false}};const facts=userLifecycleFacts(user,[event]);expect(facts.deactivated?.actor).toBe('QA Backend');expect(facts.archived).toBeUndefined();});
  it('shows contact removal separately from login deactivation',async()=>{qa.fetchPersonnelHistory.mockResolvedValue({users:[user],contacts:[{id:'qa-contact',name:'QA Employee',company:'QA Partner',account:'QA',area:'sales',removed_at:'2026-10-10T10:00:00Z',removed_by:null}],events:[]});render(<BackendPersonnelHistory/>);fireEvent.click(screen.getByRole('button',{name:'Vis historik'}));await screen.findByText('Fjernet fra kontaktlisten (1)');expect(screen.getByText(/Portal-login uændret/)).toBeInTheDocument();expect(screen.getByText(/Portal-login deaktiveret/)).toBeInTheDocument();});
  it('does not fall back to fabricated histories if the server denies access',async()=>{qa.fetchPersonnelHistory.mockRejectedValue(Error('Backend history access required'));render(<BackendPersonnelHistory/>);fireEvent.click(screen.getByRole('button',{name:'Vis historik'}));expect(await screen.findByRole('alert')).toHaveTextContent('Backend history access required');expect(screen.queryByText('QA User')).not.toBeInTheDocument();});
});
