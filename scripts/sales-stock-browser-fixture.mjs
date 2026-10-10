// Local browser QA of the real stock panels and handoff. No Supabase/Fabric writes or authentication.
// Run: node scripts/sales-stock-browser-fixture.mjs
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

const asset = (id, patch = {}) => ({
  asset_id: id, asset_instance_id: `SERIAL|DAT|${id}`, instance_ordinal: 1, company: 'DAT',
  account_number: '1010', order_number: '133225', line_number: 1, item_number: '410040-01',
  item_name: 'RC-751', line_text: `RC-751 QA ${id}`, serial_number: id, serial_number_normalized: id,
  warehouse_location_code: '2', warehouse_location_name: 'Lager 2', inventory_qty: 1, reserved_qty: 0,
  stock_last_changed: '2026-10-10T10:00:00', classification: 'LOAN_CANDIDATE', review_required: false,
  review_reason: null, identity_conflict: false, source_present: true, item_type: 'machine',
  allocated: false, sales_committed: false, brik_number: null, ...patch,
});
const assets = [
  asset('QA-RC751-01', { brik_number: 154 }),
  asset('QA-BRUSH-01', { item_number: '312010-00', line_text: 'Nr.82 Fejekost med blad B=1300', brik_number: 82, item_type: 'equipment', warehouse_location_code: '4', account_number: '1020' }),
  asset('QA-LOAN-01', { allocated: true, line_text: 'Reserveret RC-751', brik_number: 194 }),
  asset('QA-GROUP-A', { item_number: '410910-00', line_text: 'Redskab A · delt Brik', serial_number: null, serial_number_normalized: null, brik_number: 96, item_type: 'equipment' }),
  asset('QA-GROUP-B', { item_number: '411666-00', line_text: 'Redskab B · delt Brik', serial_number: null, serial_number_normalized: null, brik_number: 96, item_type: 'equipment' }),
  asset('QA-BULK', { item_number: '65101002', line_text: 'Nr. Hammerslagle', serial_number: null, serial_number_normalized: null, inventory_qty: 18, warehouse_location_code: '4' }),
  asset('QA-SALE', { sales_committed: true, line_text: 'Allerede reserveret til salg' }),
];
const modules = {
  '/__qa/language.ts': "export const useLanguage=()=>({uiLanguage:'da'});",
  '/__qa/stock.ts': `import {useQuery} from '@tanstack/react-query';
    export const useFabricLoanStock=()=>({enabled:true,canRefresh:false,canEditBrik:false,
      query:useQuery({queryKey:['qa-stock'],queryFn:async()=>{const r=await fetch('/__qa/data');return r.json();},refetchInterval:1000}),
      refresh:{isPending:false,isError:false},setBrik:{isPending:false,isError:false}});`,
  '/__qa/main.tsx': `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {BrowserRouter,Routes,Route} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import Stock from '@/pages/loans/LoanStockPanel';import Sale from '@/pages/loans/SalesStockSalePanel';
    import {consumeSalesStockHandoff,buildSalesStockConfiguratorState} from '@/lib/salesStockConfigurator';import '@/index.css';
    function Browser(){const [tab,setTab]=useState('stock');return <><h1 className='mb-4 text-xl font-semibold'>Salgslager · isoleret browser-QA</h1>
      <div role='tablist' className='mb-4 flex flex-wrap gap-4'><button role='tab' aria-selected={tab==='stock'} onClick={()=>setTab('stock')}>Salgslager</button>
      <button role='tab' aria-selected={tab==='sale'} onClick={()=>setTab('sale')}>Sælg salgslagermaskine</button></div>{tab==='stock'?<Stock/>:<Sale/>}</>;}
    function Handoff(){const [assets]=useState(consumeSalesStockHandoff);const state=buildSalesStockConfiguratorState(assets);return <><h1>Configurator handoff QA</h1>
      <p>Overførte aktiver: {assets.length}</p><pre className='whitespace-pre-wrap break-all'>{JSON.stringify({assets,units:state.machineConfigs},null,2)}</pre></>;}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><main className='mx-auto max-w-6xl p-4'>
      <Routes><Route path='/configurator' element={<Handoff/>}/><Route path='*' element={<Browser/>}/></Routes></main></BrowserRouter></QueryClientProvider>);`,
};
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime',
    'react-router-dom', '@tanstack/react-query', 'lucide-react', '@radix-ui/react-checkbox', '@radix-ui/react-popover'] },
  resolve: { alias: [
    { find: '@/hooks/useFabricLoanStock', replacement: '/__qa/stock.ts' },
    { find: '@/context/LanguageContext', replacement: '/__qa/language.ts' },
    { find: '@', replacement: resolve('src') },
  ] },
  plugins: [react(), {
    name: 'isolated-sales-stock-browser-qa',
    resolveId(id) { const key = id.replace(/^[A-Z]:/i, ''); if (modules[key]) return key; },
    load(id) { return modules[id.replace(/^[A-Z]:/i, '')]; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (req.method !== 'GET') { res.statusCode = 405; return res.end('Read-only fixture'); }
        if (url.pathname === '/__qa/data') {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ assets, active_assignments: [{ asset_id: 'QA-LOAN-01',
            loan_number: 'U-QA-6608', partner_name: 'QA Partner', partner_country: 'DK', status: 'ON_LOAN' }],
          sync: { configured: true, running: false, failed: false, stale: false, source_as_of: new Date().toISOString(),
            last_success_at: new Date().toISOString(), stale_after_seconds: 900 } }));
        }
        if (url.pathname === '/' || url.pathname === '/configurator') {
          res.setHeader('Content-Type', 'text/html');
          return res.end(await vite.transformIndexHtml(url.pathname, "<!doctype html><html lang='da'><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/__qa/main.tsx'></script></body></html>"));
        }
        next();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5192, strictPort: true },
});
await server.listen();
console.log('Isolated sales-stock QA: http://127.0.0.1:5192/');
