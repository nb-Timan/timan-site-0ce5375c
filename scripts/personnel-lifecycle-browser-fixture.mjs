// Isolated UI QA: real components, synthetic data and in-memory mutations only.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';
const states=['DRAFT','READY_FOR_REVIEW','ON_LOAN','RETURN_INSPECTION','CLOSED_OK'];
const cases=states.map((status,n)=>({id:`qa-${n}`,loan_number:`U-QA-${n+1}`,case_number:`QA-${n}`,status,responsible_user_id:'qa-backend',responsible_name:'QA Timan',partner_name:'QA Partner',dealer_account_id:'qa-partner',dealer_contact_id:'qa-contact',loan_date:'2026-10-01',expected_return_date:'2026-10-20',updated_at:'2026-10-10T08:00:00Z',asset_count:2,
  return_state:{can_receive:['ON_LOAN','RETURN_INSPECTION'].includes(status),presentation_state:status==='RETURN_INSPECTION'?'PARTIALLY_RETURNED':status==='CLOSED_OK'?'RECEIVED':status},
  lifecycle_state:{can_cancel_draft:['DRAFT','READY_FOR_REVIEW'].includes(status)},
  action_state:{case_id:`qa-${n}`,can_review:status==='READY_FOR_REVIEW',can_accept:false,terms_ready:false,active_reservation_count:status==='CLOSED_OK'?0:status==='RETURN_INSPECTION'?1:2}}));
const contact={id:'qa-contact',dealer_account_id:'qa-partner',contact_area:'director',name:'QA Employee',role_title:'Direktør',email:null,phone:null,is_primary:false,created_at:'2026-01-01',updated_at:'2026-01-01'};
const history={users:[{id:'qa-user',name:'QA Login',company:'QA Partner',role:'timan_dealer',is_active:false,approved:true,status:'blocked',created_at:'2026-01-01',last_login_at:null}],contacts:[],events:[{id:'qa-event',at:'2026-10-09T10:00:00Z',actor:'QA Backend',record_id:'qa-user',record_type:'app_users',label:'QA Login',action:'update',server_recorded:true,old:{is_active:true},new:{is_active:false}}]};
let removed=false;
const common="const read=async(p)=>{const r=await fetch('/__qa/'+p);if(!r.ok)throw Error(await r.text());return r.json();};const write=async(p,data)=>{const r=await fetch('/__qa/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};";
const modules={
  '/__qa/loans.ts':common+`export const listLoanCases=()=>read('cases');export const getLoanCaseActionState=id=>read('actions?id='+id);export const getLoanOverviewInfo=async()=>({delivery:{},notes:'Synthetic QA',items:[],returnSummary:[]});export const updateLoanExpectedReturn=async()=>{throw Error('Out of QA scope');};export const cancelLoanDraft=(id,at,reason,key)=>write('cancel',{id,at,reason,key});export const getLoanApprovalData=id=>read('approval?id='+id);export const createLoanCaseVersion=async()=>{throw Error('QA: no approved terms');};export const acceptLoanCaseVersion=async()=>{throw Error('QA: no approved terms');};`,
  '/__qa/repository.ts':common+`const repo={listDealerContacts:()=>read('contacts'),listRemovedDealerContactAreas:async()=>[],deleteDealerContact:id=>write('remove',{id}),archiveLegacyDealerContact:async()=>{throw Error('QA canonical contact only');},upsertDealerContact:async()=>{throw Error('No QA editing');},updateDealerAccount:async()=>{throw Error('No QA editing');},fetchActiveDealerContractPaymentTerm:async()=>({paymentTerm:null})};export const getPartnerDataRepository=()=>repo;`,
  '/__qa/supabase.ts':common+`export const supabase={rpc:async(name)=>{if(name!=='backend_personnel_history')throw Error('Unexpected QA RPC');return {data:await read('history'),error:null};}};`,
  '/__qa/user.ts':"export const useAppUser=()=>({appUser:{id:'qa-backend',portal_role:'timan_backend',approved:true,is_active:true,allowed_areas:['loans']}});",
  '/__qa/language.ts':"export const useLanguage=()=>({uiLanguage:'da'});",
  '/__qa/shell.tsx':"export default function Shell({children}){return <main className='mx-auto max-w-6xl p-4'>{children}</main>;}",
  '/__qa/empty.tsx':'export default function Empty(){return null;}',
  '/__qa/main.tsx':`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Link,Route,Routes}from'react-router-dom';import LoansPage from '@/pages/loans/LoansPage';import LoanAcceptancePage from '@/pages/loans/LoanAcceptancePage';import DealerProfileEditor from '@/components/portal/DealerProfileEditor';import BackendPersonnelHistory from '@/components/backend/BackendPersonnelHistory';import '@/index.css';const dealer={id:'qa-partner',account_number:'QA',company_name:'QA Partner',payment_terms:null};createRoot(document.getElementById('root')).render(<BrowserRouter><header className='flex flex-wrap gap-3 border-b p-3 text-xs'><strong>ISOLERET QA · ingen produktionsforbindelse</strong><Link to='/portal/loans'>Udlån</Link><Link to='/contacts'>Kontakter</Link><Link to='/history'>Historik</Link></header><Routes><Route path='/portal/loans' element={<LoansPage/>}/><Route path='/portal/loans/:caseId/accept' element={<LoanAcceptancePage/>}/><Route path='/portal/loans/:caseId/return' element={<p className='p-4'>QA: eksisterende returflow åbnet. Returkomponent og SQL testes separat.</p>}/><Route path='/contacts' element={<main className='mx-auto max-w-4xl p-4'><DealerProfileEditor dealer={dealer} language='da' canEdit canManageFinancialTerms effectiveUserId={null}/></main>}/><Route path='/history' element={<main className='mx-auto max-w-4xl p-4'><BackendPersonnelHistory/></main>}/></Routes></BrowserRouter>);`,
};
const aliases={'@/lib/loanService':'/__qa/loans.ts','@/lib/partnerDataRepository':'/__qa/repository.ts','@/lib/supabase':'/__qa/supabase.ts','@/context/AppUserContext':'/__qa/user.ts','@/context/LanguageContext':'/__qa/language.ts','@/pages/loans/LoanShell':'/__qa/shell.tsx','@/pages/loans/LoanStockPanel':'/__qa/empty.tsx','@/pages/loans/SalesStockSalePanel':'/__qa/empty.tsx','@/components/crm/AddressAutocomplete':'/__qa/empty.tsx'};
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react-router-dom','lucide-react','@radix-ui/react-dialog','@radix-ui/react-alert-dialog','@radix-ui/react-popover']},resolve:{alias:[...Object.entries(aliases).map(([find,replacement])=>({find,replacement})),{find:'@',replacement:resolve('src')}]},plugins:[react(),{name:'isolated-personnel-qa',resolveId(id){const key=id.replace(/^[A-Z]:/i,'');if(modules[key])return key;},load(id){return modules[id.replace(/^[A-Z]:/i,'')];},configureServer(s){s.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/__qa/') && !modules[url.pathname]){
    res.setHeader('Content-Type','application/json');
    if(req.method==='POST'){
      let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      if(url.pathname==='/__qa/cancel'){const item=cases.find(c=>c.id===body.id);if(!item?.lifecycle_state.can_cancel_draft){res.statusCode=409;return res.end('QA: issued asset cannot be cancelled');}item.status='CANCELLED';item.return_state.presentation_state='CANCELLED';item.lifecycle_state.can_cancel_draft=false;item.action_state.active_reservation_count=0;return res.end(JSON.stringify({ok:true}));}
      if(url.pathname==='/__qa/remove' && body.id===contact.id){removed=true;history.contacts=[{...contact,company:'QA Partner',account:'QA',area:'director',removed_at:'2026-10-10T10:00:00Z',removed_by:'QA Backend'}];return res.end(JSON.stringify({ok:true}));}
      res.statusCode=400;return res.end('Unexpected QA mutation');
    }
    const id=url.searchParams.get('id'),item=cases.find(c=>c.id===id);
    if(url.pathname==='/__qa/cases')return res.end(JSON.stringify(cases));
    if(url.pathname==='/__qa/contacts')return res.end(JSON.stringify(removed?[]:[contact]));
    if(url.pathname==='/__qa/history')return res.end(JSON.stringify(history));
    if(url.pathname==='/__qa/actions')return res.end(JSON.stringify(item?.action_state));
    if(url.pathname==='/__qa/approval')return res.end(JSON.stringify({number:item?.loan_number,state:item?.action_state,terms:null,versionId:null}));
    res.statusCode=404;return res.end('Unknown QA read');
  }
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname.startsWith('/portal/')||['/contacts','/history'].includes(url.pathname))){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");return res.end(await s.transformIndexHtml(url.pathname,"<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/__qa/main.tsx'></script></body></html>"));}
  next();
});}}],server:{host:'127.0.0.1',port:5231,strictPort:true}});
await server.listen();console.log('Isolated lifecycle QA: http://127.0.0.1:5231/portal/loans');
