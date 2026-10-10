// Local, read-only preparation using the real review dialog. No production requests.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// Render the actual embedded Partnerdata panel without loading the surrounding
// CRM page/auth/network graph. Read its implementation and translations unchanged.
const detailPage=readFileSync('src/pages/crm/CrmDealerDetailPage.tsx','utf8');
const collaborationPanel=`import {ArrowRight} from 'lucide-react';
  import {resolvePartnerAccountType,getPartnerAccountTypeLabel} from '@/lib/partnerAccountTypes';
  import type {DealerAccount,DealerAccountStats} from '@/lib/dealerAccountsService';
  import type {PortalUiLanguage} from '@/lib/portalLanguages';
  type DealerDetailText=Record<PortalUiLanguage,string>;
  ${detailPage.slice(detailPage.indexOf('const L ='),detailPage.indexOf('function isServicePartnerAccount'))}
  ${detailPage.slice(detailPage.indexOf('function dealerPresentationType('),detailPage.indexOf('function formatAgreementPercent('))}
  export ${detailPage.slice(detailPage.indexOf('function CollaborationPartnersPanel('),detailPage.indexOf('function crmLifecycleMeta('))}`;

const modules = {
  '/__qa/collaboration.tsx':collaborationPanel,
  '/__qa/relations.ts': `export * from '/src/lib/partnerRelationsService.ts';
    export const loadPartnerCooperationHistory=async()=>({version:0,events:[],...(location.search==='?schema=pending'?{}:{billing:{source_count:1,invoice_account:null}})});
    export const changePartnerCooperation=async()=>{throw new Error('Read-only QA: production activation disabled')};
    export const listPartnerAccountRelations=async()=>[{id:'expected-only',source_account_id:'b6f4657a-6cc7-423d-b64d-dba372c96fd5',target_account_id:'dcbfec99-6793-4d1c-bef6-c4219e1e4c6e',relation_type:'dealer_has_service_partner',active:true}];
    export const listServicePartnerLinks=async()=>[];`,
  '/__qa/supabase.ts': `export const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`,
  '/__qa/user.ts':`export const useAppUser=()=>({appUser:{id:'qa',email:'qa@example.invalid',portal_role:'timan_backend',approved:true,is_active:true},loading:false,logout:async()=>{}});`,
  '/__qa/language.ts':`export const useLanguage=()=>({language:'da',setLanguage:()=>{}});export const useOptionalLanguage=useLanguage;`,
  '/__qa/billing.ts':`export const loadBillingRelations=async()=>({enabled:false,relations:[],history:[],candidates:[]});export const billingRelationError=()=> 'Read-only fixture';export const changeBillingRelation=async()=>{throw new Error('QA writes disabled')};`,
  '/__qa/header.tsx':`export default function Header(){return <header className='border-b bg-amber-50 p-4 text-sm'>ISOLERET QA — forventet godkendt samarbejde. Production er uændret.</header>}`,
  '/__qa/footer.tsx':`export default function Footer(){return null;}`,
  '/__qa/review-service.ts': `export const savePartnerReview=async()=>{throw new Error('QA writes disabled')};
    export const partnerReviewError=()=> 'Read-only dry-run';`,
  '/__qa/main.tsx': `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BrowserRouter} from 'react-router-dom';
    import Backend from '@/pages/backend/BackendPartnerRelationsPage';
    import {CollaborationPartnersPanel} from '/__qa/collaboration.tsx';
    import Dialog from '@/components/backend/FabricPartnerReviewDialog';
    import {buildPartnerReviewRows} from '@/lib/fabricPartnerReview';
    import {comparePartnerMaster} from '@/lib/fabricPartnerParity'; import '@/index.css';
    const child={id:'dcbfec99-6793-4d1c-bef6-c4219e1e4c6e',account_number:'10082',company_name:'Have og Park Center Svendborg',
      customer_type_label:'Service Partner',customer_type:'Service Partner',dealer_type:'service_partner',assigned_seller_initials:'EM',parent_account_number:null,
      address_line_1:null,address_line_2:null,postal_code:null,city:null,country:null,phone:null,email:null,billing_account_number:null};
    const parent={...child,id:'b6f4657a-6cc7-423d-b64d-dba372c96fd5',account_number:'10151',company_name:'Reesink Turfcare A/S',
      customer_type_label:'Forhandler',customer_type:'Forhandler',dealer_type:'dealer'};
    const source={...child,company:'DAT',account_raw:'10082',c5_partner_type_code:'2',c5_invoice_account_number:null,c5_salesrep:'EM',
      address1:null,address2:null,zipcity_raw:null,zipcity_validation:'REVIEW_REQUIRED',c5_blocked:0,c5_approved:1,source_row_number:1};
    const row=buildPartnerReviewRows(comparePartnerMaster([child],[source]),[],[{account_number:'10082',source_count:1,portal_count:1,
      source_fingerprint:'fixture-only',portal_fingerprint:'fixture-only'}])[0];
    function Partnerdata(){const [open,setOpen]=React.useState(false);return <main className='mx-auto max-w-3xl space-y-4 p-4'>
      <p className='rounded border border-amber-300 bg-amber-50 p-3 text-sm'>ISOLERET QA — forventet godkendt relation, production uændret.</p>
      <h1 className='text-xl font-semibold'>Partnerdata · Reesink Turfcare A/S #10151</h1>
      <CollaborationPartnersPanel partners={[child]} stats={{}} lang='da' onOpenList={()=>setOpen(!open)}/>
      {open&&<p>Have og Park Center Svendborg · Servicepartner · #10082</p>}</main>}
    createRoot(document.getElementById('root')).render(<BrowserRouter>{location.pathname==='/backend'?<Backend/>:location.pathname==='/partnerdata'?<Partnerdata/>:<>
      <header className='p-4'>Isoleret dry-run. Verificerede konto-ID'er/type; ingen production-forbindelse.</header>
      <Dialog row={row} parents={[]} history={[]} cooperationPartners={[parent]} onClose={()=>{}} onSaved={async()=>{}}/></>}</BrowserRouter>);`,
  '/__qa/dealers.ts':`export * from '/src/lib/dealerAccountsService.ts';export const fetchDealerAccounts=async()=>({rows:[
    {id:'dcbfec99-6793-4d1c-bef6-c4219e1e4c6e',account_number:'10082',company_name:'Have og Park Center Svendborg',dealer_type:'service_partner',customer_type_label:'Servicepartner',assigned_seller_initials:'EM',parent_account_number:null},
    {id:'b6f4657a-6cc7-423d-b64d-dba372c96fd5',account_number:'10151',company_name:'Reesink Turfcare A/S',dealer_type:'dealer',customer_type_label:'Forhandler',assigned_seller_initials:'EM',parent_account_number:null}]});`,
};
const server = await createServer({
  configFile:false,
  define:{__TIMAN_BUILD_ID__:JSON.stringify('isolated-cooperation-review')},
  resolve:{alias:[{find:'@/lib/fabricPartnerReviewService',replacement:'/__qa/review-service.ts'},
    {find:'@/lib/supabase',replacement:'/__qa/supabase.ts'},
    {find:'@/lib/partnerRelationsService',replacement:'/__qa/relations.ts'},
    {find:'@/context/AppUserContext',replacement:'/__qa/user.ts'},
    {find:'@/context/LanguageContext',replacement:'/__qa/language.ts'},
    {find:'@/lib/dealerAccountsService',replacement:'/__qa/dealers.ts'},
    {find:'@/lib/partnerBillingRelationsService',replacement:'/__qa/billing.ts'},
    {find:'@/components/portal/PortalHeader',replacement:'/__qa/header.tsx'},
    {find:'@/components/portal/PortalFooter',replacement:'/__qa/footer.tsx'},
    {find:'@',replacement:resolve('src')}]},
  optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','lucide-react','react-router-dom','sonner','@radix-ui/react-dialog']},
  plugins:[react(),{name:'read-only-service-partner-review',
    resolveId(id){const key=id.replace(/^[A-Z]:/i,'');if(modules[key])return key;},
    load(id){return modules[id.replace(/^[A-Z]:/i,'')];},
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(req.method!=='GET'){res.statusCode=405;return res.end('Read-only fixture');}
      const pathname=req.url?.split('?')[0];
      if(pathname==='/'||pathname==='/backend'||pathname==='/partnerdata'){
        res.setHeader('Content-Type','text/html');
        return res.end(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__qa/main.tsx"></script></body></html>'));
      }next();
    });},
  }],server:{host:'127.0.0.1',port:5225,strictPort:true},
});
await server.listen();
console.log('Read-only Servicepartner review: http://127.0.0.1:5225');
process.once('SIGINT',async()=>{await server.close();process.exit(0);});
