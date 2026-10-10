// Read-only isolated browser fixture: real Portal components, no production connections.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

const accounts = [
  { id:'kolding',account_number:'10138',company_name:'Danish Agro Machinery Kolding',customer_type_label:'Servicepartner' },
  { id:'ab',account_number:'10295',company_name:'AB Lauridsen Maskiner ApS',customer_type_label:'Forhandler' },
  { id:'rostofte',account_number:'10363',company_name:'Danish Agro Machinery Røstofte',customer_type_label:'Forhandlerkunde',parent_account_number:'10295',assigned_seller_initials:'EM' },
  { id:'vedbaek',account_number:'50532',company_name:'Danish Agro Machinery Vedbæk',customer_type_label:'Forhandler',parent_account_number:'10138' },
  { id:'je',account_number:'12041',company_name:'JE Service',customer_type_label:'Forhandlerkunde',parent_account_number:'10295' },
  { id:'mobile',account_number:'10285',company_name:'Mobile Service',customer_type_label:'Servicepartner' },
];
const relations = [
  { id:'r1',source_account_id:'ab',target_account_id:'rostofte',relation_type:'dealer_has_dealer_customer',active:true },
  { id:'r2',source_account_id:'ab',target_account_id:'je',relation_type:'dealer_has_dealer_customer',active:true },
  { id:'r3',source_account_id:'ab',target_account_id:'mobile',relation_type:'dealer_has_service_partner',active:true },
];
const history = { version:1,events:[{id:'event',action:'SWITCH',previous_dealer_id:'kolding',new_dealer_id:'ab',
  previous_relation_id:null,previous_relation_origin:'OBSERVED_LEGACY_POINTER',created_at:'2026-10-10T14:00:00Z',
  reviewer_name:'Isoleret Backend-test',reason:'Timan-godkendt rettelse. Tidligere tilknytning er observeret legacy, ikke et dokumenteret historisk samarbejde.'}] };
const modules = {
  '/__qa/user.ts': "export const useAppUser=()=>({appUser:{id:'qa',portal_role:'timan_backend',approved:true,is_active:true},logout:async()=>{}});",
  '/__qa/language.ts': "export const useLanguage=()=>({language:'da',setLanguage:()=>{}});",
  '/__qa/header.tsx': "export default function Header(){return <header className='border-b bg-white p-4 font-semibold'>Isoleret Partnerdata-test. Ingen production-ændringer.</header>}",
  '/__qa/footer.tsx': 'export default function Footer(){return null}',
  '/__qa/dealers.ts': `const accounts=${JSON.stringify(accounts)}; export const fetchDealerAccounts=async()=>({rows:accounts});
    export const isDealerCustomerAccount=a=>a.customer_type_label==='Forhandlerkunde';
    export const isDealerInactive=()=>false;`,
  '/__qa/relations.ts': `export const listPartnerAccountRelations=async()=>${JSON.stringify(relations)};
    export const listServicePartnerLinks=async()=>[];
    export const loadPartnerCooperationHistory=async()=>(${JSON.stringify(history)});
    export const partnerCooperationError=()=> 'Read-only browser fixture';
    ${['upsertPartnerAccountRelation','setPartnerAccountRelationActive','deletePartnerAccountRelation','changePartnerCooperation']
      .map(name=>`export const ${name}=async()=>{throw new Error('Production writes disabled in fixture')};`).join('\n')}`,
  '/__qa/main.tsx': `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BrowserRouter} from 'react-router-dom'; import Page from '@/pages/backend/BackendPartnerRelationsPage';
    import '@/index.css'; createRoot(document.getElementById('root')).render(<BrowserRouter><Page/></BrowserRouter>);`,
};
const aliases = {
  '@/context/AppUserContext':'/__qa/user.ts','@/context/LanguageContext':'/__qa/language.ts',
  '@/components/portal/PortalHeader':'/__qa/header.tsx','@/components/portal/PortalFooter':'/__qa/footer.tsx',
  '@/lib/dealerAccountsService':'/__qa/dealers.ts','@/lib/partnerRelationsService':'/__qa/relations.ts',
};
const server = await createServer({
  configFile:false,define:{__TIMAN_BUILD_ID__:JSON.stringify('isolated-partner-cooperation')},
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react-router-dom','lucide-react','@radix-ui/react-dialog']},
  resolve:{alias:[...Object.entries(aliases).map(([find,replacement])=>({find,replacement})),{find:'@',replacement:resolve('src')}]},
  plugins:[react(),{name:'isolated-partner-cooperation',
    resolveId(id){const key=id.replace(/^[A-Z]:/i,''); if(modules[key])return key;},
    load(id){return modules[id.replace(/^[A-Z]:/i,'')];},
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(req.method!=='GET'){res.statusCode=405;return res.end('Read-only fixture');}
      if(req.url==='/' || req.url?.startsWith('/portal/')){
        res.setHeader('Content-Type','text/html');
        return res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__qa/main.tsx"></script></body></html>'));
      } next();
    });},
  }],
  server:{host:'127.0.0.1',port:5196,strictPort:true},
});
await server.listen();
console.log('Read-only Partner cooperation fixture: http://127.0.0.1:5196');
process.once('SIGINT',async()=>{await server.close();process.exit(0);});
