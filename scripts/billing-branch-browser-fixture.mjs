// Expected approved state in a local fixture; no production relationship is created.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const main={id:'4272d57f-283f-4d27-bc2b-9c70ead7c077',account_number:'10451',company_name:'Integra Group Sp z o.o.',dealer_type:'importer',customer_type_label:'Importør',parent_account_number:'10476',assigned_seller_initials:'BP',is_active:true,is_blocked:false,is_deleted:false};
const service={...main,id:'e82b8f96-cd7f-4dc5-a839-b7be28c04692',account_number:'10953',company_name:'Integra Service Sp. z o.o.',dealer_type:'service_partner',customer_type_label:'Servicepartner',parent_account_number:null};
const financial={id:'qa-financial-relation',main_partner_id:main.id,main_account_number:'10451',main_company_name:main.company_name,billing_account_number:'10476',billing_account_id:null,billing_name:'NORD AUTOSERVICE Sp.Z.o.o.SP.K',relation_type:'billing_branch',active:true,approved_by:'qa-reviewer',approved_at:'2026-10-10T12:00:00Z',approval_source:'ISOLERET QA',approval_reason:'Forventet godkendt visning — ikke oprettet i production',ended_at:null,address:null,postal_code:null,city:null,country:'Polen',invoice_email:null,currency:'PLN',payment:null,c5_invoice_account:null,version:1};
const preview={enabled:true,relations:[financial],history:[],candidates:[{account_number:'10476',company_name:financial.billing_name,c5_type:'0',invoice_account:null}]};
const commercial=[{id:'existing-service',source_account_id:main.id,target_account_id:service.id,relation_type:'importer_has_service_partner',active:true}];
const modules={
  '/__qa/user.ts':`export const useAppUser=()=>({appUser:{id:'qa',email:'qa@example.invalid',portal_role:'timan_backend',approved:true,is_active:true},loading:false,logout:async()=>{}});`,
  '/__qa/language.ts':`export const useLanguage=()=>({language:'da',setLanguage:()=>{}});`,
  '/__qa/supabase.ts':`export const supabase={auth:{getSession:async()=>({data:{session:{}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`,
  '/__qa/format.ts':`export * from '/src/lib/formatCountry.ts';export const useCountryFormatter=()=>({formatCountry:v=>v??'—'});export const formatCountry=v=>v??'—';`,
  '/__qa/backendusers.ts':`export const fetchBackendUsers=async()=>({users:[]});`,
  '/__qa/dealers.ts':`export * from '/src/lib/dealerAccountsService.ts';export const fetchDealerAccounts=async()=>({rows:${JSON.stringify([main,service])}});export const fetchDealerAccountStats=async()=>({rows:[]});`,
  '/__qa/billing.ts':`export const loadBillingRelations=async(id)=>({...${JSON.stringify(preview)},relations:${JSON.stringify(preview.relations)}.filter(r=>!id||r.main_partner_id===id)});
    export const changeBillingRelation=async()=>{throw new Error('Read-only fixture: production writes disabled')};export const billingRelationError=()=> 'Read-only fixture';`,
  '/__qa/relations.ts':`export * from '/src/lib/partnerRelationsService.ts';export const listPartnerAccountRelations=async()=>${JSON.stringify(commercial)};`,
  '/__qa/header.tsx':`export default function Header(){return <header className='border-b bg-amber-50 p-4 text-sm'>ISOLERET QA — forventet godkendt visning. Ingen production-forbindelse eller ændring.</header>}`,
  '/__qa/footer.tsx':`export default function Footer(){return null;}`,
  '/__qa/comparison.tsx':`export default function Comparison(){return null;}`,
  '/__qa/main.tsx':`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
    import Backend from '@/pages/backend/BackendDealerAccountsPage';import BillingBranchesPanel from '@/components/portal/BillingBranchesPanel';
    import {getPartnerAccountTypeLabel,resolvePartnerAccountType} from '@/lib/partnerAccountTypes';import '@/index.css';
    const main=${JSON.stringify(main)},service=${JSON.stringify(service)};
    function Partnerdata(){return <main className='mx-auto max-w-2xl space-y-4 p-4'>
      <p className='rounded border border-amber-300 bg-amber-50 p-3 text-sm'>ISOLERET QA — forventet relation, production uændret.</p>
      <h1 className='text-xl font-semibold'>Partnerdata · {main.company_name} #{main.account_number}</h1>
      <p>{getPartnerAccountTypeLabel(resolvePartnerAccountType(main),'da')} · Hovedpartner</p>
      <section className='space-y-3 rounded-xl border bg-white p-4'><h2 className='font-semibold'>Samarbejdspartnere</h2>
        <div className='rounded border border-cyan-200 p-3'>{service.company_name}<p className='text-xs'>Servicepartner · #{service.account_number}</p></div>
        <BillingBranchesPanel mainId={main.id} enabled/></section></main>}
    createRoot(document.getElementById('root')).render(<BrowserRouter>{location.pathname==='/partnerdata'?<Partnerdata/>:<Backend/>}</BrowserRouter>);`,
};
const aliases={'@/context/AppUserContext':'/__qa/user.ts','@/context/LanguageContext':'/__qa/language.ts','@/lib/supabase':'/__qa/supabase.ts',
  '@/lib/formatCountry':'/__qa/format.ts','@/lib/backendUsersService':'/__qa/backendusers.ts','@/lib/dealerAccountsService':'/__qa/dealers.ts',
  '@/lib/partnerBillingRelationsService':'/__qa/billing.ts','@/lib/partnerRelationsService':'/__qa/relations.ts','@/components/portal/PortalHeader':'/__qa/header.tsx',
  '@/components/portal/PortalFooter':'/__qa/footer.tsx','@/components/backend/FabricPartnerComparisonPanel':'/__qa/comparison.tsx'};
const server=await createServer({configFile:false,
  define:{__TIMAN_BUILD_ID__:JSON.stringify('isolated-billing-branch')},
  resolve:{alias:[...Object.entries(aliases).map(([find,replacement])=>({find,replacement})),{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react-router-dom','lucide-react','@supabase/supabase-js','@radix-ui/react-dialog']},
  plugins:[react(),{name:'billing-branch-read-only',resolveId(id){const key=id.replace(/^[A-Z]:/i,'');if(modules[key])return key;},load(id){return modules[id.replace(/^[A-Z]:/i,'')];},
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(req.method!=='GET'){res.statusCode=405;return res.end('Read-only fixture');}
      if(req.url==='/'||req.url==='/partnerdata'){res.setHeader('Content-Type','text/html');return res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__qa/main.tsx"></script></body></html>'));}next();
    });},
  }],server:{host:'127.0.0.1',port:5226,strictPort:true},
});
await server.listen();console.log('Read-only billing branch fixture: http://127.0.0.1:5226 (/partnerdata)');
process.once('SIGINT',async()=>{await server.close();process.exit(0);});
