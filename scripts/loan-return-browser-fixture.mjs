// Local-only browser fixture for the actual receipt/detail components. No production connections.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const caseId='qa-return';
const loanCase={id:caseId,loan_number:'U-QA-RETURN',responsible_user_id:'qa',created_by:'qa',dealer_account_id:'partner',dealer_contact_id:'contact',status:'ON_LOAN',loan_date:'2026-10-01',expected_return_date:'2026-10-20'};
const item=(id,sku,name,serial,brik,reading=null,unit=null)=>({id,case_id:caseId,item_type:serial?'machine':'equipment',product_sku:sku,product_name_snapshot:name,serial_snapshot:serial,brik_number_snapshot:brik,usage_reading_value:reading,usage_reading_unit:unit,asset_instance_id_snapshot:`${serial?'SERIAL':'LINE'}|DAT|${id}`});
const items=[item('machine','410040','RC-751','QA-RC751-001',194,12,'hours'),item('component-a','210100','Komponent A',null,96),item('component-b','210123','Komponent B',null,96),item('km-machine','411000','RC-1000s','QA-RC1000-002',195,120,'km')];
const summary=items.map(i=>({case_item_id:i.id,item_type:i.item_type,product_sku:i.product_sku,product_name:i.product_name_snapshot,serial_number:i.serial_snapshot,brik_number:i.brik_number_snapshot,checkout_usage_reading:i.usage_reading_value,usage_reading_unit:i.usage_reading_unit,is_outstanding:true,receipt_status:null}));
const photos=[]; const history=[]; const photoBytes=new Map(); const requests=new Map();
// Seed non-personal meter evidence so browser layout/save QA does not depend on extension file access.
for (const id of ['machine','km-machine']) {
  const preview_url='/__qa/photo/seed-'+id;
  photoBytes.set(preview_url,readFileSync('public/messe/machines/rc-751-sketch.png'));
  photos.push({id:'seed-'+id,case_id:caseId,case_item_id:id,photo_kind:'return_meter',preview_url,file_name:'qa-meter.png'});
}
const state=()=>({loanCase,items,photos,returnSummary:summary,returnState:{case_id:caseId,can_receive:summary.some(i=>i.is_outstanding),presentation_state:summary.some(i=>i.receipt_status==='REVIEW_REQUIRED')?'REVIEW_REQUIRED':summary.every(i=>!i.is_outstanding)?'RECEIVED':summary.some(i=>i.receipt_status==='RECEIVED')?'PARTIALLY_RETURNED':'ON_LOAN'}});
const services=`
const request=async(path,body)=>{const r=await fetch('/__qa/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});if(!r.ok)throw new Error(await r.text());return r.json();};
export const getLoanCase=()=>request('data');
export const listLoanCaseHistory=()=>request('history');
export const listLoanSellers=async()=>[{id:'qa',display_name:'QA Timan',initials:'QA'}];
export const listLoanPartners=async()=>[{id:'partner',company_name:'Isoleret QA',account_number:'QA'}];
export const listLoanContacts=async()=>[{id:'contact',name:'QA'}];
export const receiveLoanAssets=(caseId,key,items,notes)=>request('receive',{caseId,key,items,notes});
export const uploadLoanReturnPhoto=async(caseId,itemId,file,kind)=>{const r=await fetch('/__qa/photo',{method:'POST',headers:{'x-item':itemId,'x-kind':kind,'Content-Type':file.type},body:await file.arrayBuffer()});if(!r.ok)throw new Error(await r.text());};
export const removeLoanReturnPhoto=(caseId,photo)=>request('remove-photo',{id:photo.id});
${['createLoanCase','confirmLoanDraftSerials','removeLoanItem','removeLoanItemPhoto','reopenLoanForEdit','submitLoanCaseForReview','updateLoanDraft','updateLoanCaseRelationships','updateLoanItemUsage','uploadLoanItemPhoto','validateLoanImage'].map(name=>`export const ${name}=async()=>{throw new Error('Not supported by read-only return fixture');};`).join('\n')}
`;
const modules={
  '/__qa/service.ts':services,
  '/__qa/user.ts':"export const useAppUser=()=>({appUser:{id:'qa',portal_role:'timan_backend',approved:true,is_active:true,allowed_areas:['loans']}});",
  '/__qa/language.ts':"export const useLanguage=()=>({uiLanguage:'da'});",
  '/__qa/shell.tsx':"export default function Shell({children}){return <main className='mx-auto max-w-6xl p-4'>{children}</main>;}",
  '/__qa/stock.tsx':"export default function Stock(){return null;}",
  '/__qa/fabric.ts':"export const addFabricLoanAsset=async()=>{throw new Error('No Fabric writes in fixture');};",
  '/__qa/main.tsx':`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,Link} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import ReturnPage from '@/pages/loans/LoanReturnPage';import CasePage from '@/pages/loans/LoanCasePage';import '@/index.css';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><Routes><Route path='/portal/loans/:caseId/return' element={<ReturnPage/>}/><Route path='/portal/loans/:caseId' element={<CasePage/>}/><Route path='*' element={<Link to='/portal/loans/qa-return/return'>Modtag QA-udlån</Link>}/></Routes></BrowserRouter></QueryClientProvider>);`,
};
const aliases={
  '@/lib/loanService':'/__qa/service.ts','@/context/AppUserContext':'/__qa/user.ts','@/context/LanguageContext':'/__qa/language.ts',
  '@/pages/loans/LoanShell':'/__qa/shell.tsx','@/pages/loans/LoanStockPanel':'/__qa/stock.tsx','@/lib/fabricLoanStockService':'/__qa/fabric.ts',
};
const server=await createServer({configFile:false,define:{__TIMAN_BUILD_ID__:JSON.stringify('local-return-qa')},
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react-router-dom','@tanstack/react-query','lucide-react','@radix-ui/react-dialog']},
  resolve:{alias:[...Object.entries(aliases).map(([find,replacement])=>({find,replacement})),{find:'@',replacement:resolve('src')}]},
  plugins:[react(),{name:'isolated-loan-receipt-fixture',resolveId(id){const key=id.replace(/^[A-Z]:/i,'');if(modules[key])return key;},load(id){return modules[id.replace(/^[A-Z]:/i,'')];},configureServer(s){
    s.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url,'http://127.0.0.1');
      const send=(data)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
      if(url.pathname==='/__qa/data')return send(state());
      if(url.pathname==='/__qa/history')return send(history);
      if(url.pathname.startsWith('/__qa/photo/')&&photoBytes.has(url.pathname)){res.setHeader('Content-Type','image/png');return res.end(photoBytes.get(url.pathname));}
      if(req.method==='POST'&&url.pathname.startsWith('/__qa/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
        if(url.pathname==='/__qa/photo'){
          const id=crypto.randomUUID();const preview_url='/__qa/photo/'+id;photoBytes.set(preview_url,bytes);
          photos.push({id,case_id:caseId,case_item_id:req.headers['x-item'],photo_kind:req.headers['x-kind'],preview_url,file_name:'qa-meter.png'});return send({ok:true});
        }
        const input=JSON.parse(bytes.toString());
        if(url.pathname==='/__qa/remove-photo'){const index=photos.findIndex(p=>p.id===input.id&&!p.return_item_inspection_id);if(index>=0)photos.splice(index,1);return send({ok:true});}
        if(url.pathname==='/__qa/receive'){
          if(requests.has(input.key))return send(requests.get(input.key));
          for(const received of input.items){
            const asset=summary.find(i=>i.case_item_id===received.caseItemId);
            Object.assign(asset,{receipt_status:received.requiresReview?'REVIEW_REQUIRED':'RECEIVED',is_outstanding:received.requiresReview,serial_confirmed:received.serialConfirmed,brik_confirmed:Number(received.brikNumber)===asset.brik_number,returned_at:new Date().toISOString(),returned_by_name:'QA Timan',return_usage_reading:received.returnReading?Number(received.returnReading):null,calculated_usage:received.returnReading?Number(received.returnReading)-asset.checkout_usage_reading:null,notes:received.discrepancyNote||received.note,lower_reading_explanation:received.lowerReadingExplanation});
            for(const p of photos.filter(p=>p.case_item_id===received.caseItemId&&!p.return_item_inspection_id))p.return_item_inspection_id=input.key;
            history.push({id:crypto.randomUUID(),event_type:received.requiresReview?'ASSET_RETURN_REVIEW_REQUIRED':'ASSET_RECEIVED',actor_name:'QA Timan',created_at:new Date().toISOString(),metadata:{}});
          }
          loanCase.status=summary.some(i=>i.is_outstanding)?'RETURN_INSPECTION':'CLOSED_OK';requests.set(input.key,input.key);return send(input.key);
        }
      }
      if(req.method==='GET'&&(url.pathname==='/'||url.pathname.startsWith('/portal/'))){
        res.setHeader('Content-Type','text/html');return res.end(await s.transformIndexHtml(url.pathname,"<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/__qa/main.tsx'></script></body></html>"));
      }
      next();
    });
  }}],server:{host:'127.0.0.1',port:5191,strictPort:true}});
await server.listen();console.log('Isolated receipt QA: http://127.0.0.1:5191/portal/loans/qa-return/return');
