// Local-only read-only QA of the real overview/popover components. No live data,
// authentication, Supabase connection or mutations. Run: node scripts/loan-overview-browser-fixture.mjs
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

const active = { id: 'qa-active', loan_number: 'U-QA-6608', partner_name: 'QA Partner', responsible_name: 'QA Timan', status: 'RETURN_INSPECTION', loan_date: '2026-10-01', expected_return_date: '2026-10-20', asset_count: 2, updated_at: '2026-10-10', return_state: { presentation_state: 'PARTIALLY_RETURNED', can_receive: true } };
const cases = [active, { ...active, id: 'qa-closed', loan_number: 'U-QA-6609', partner_name: 'QA Alternativ', status: 'CLOSED_OK', return_state: { presentation_state: 'RECEIVED', can_receive: false } }, { ...active, id: 'qa-cancelled', loan_number: 'U-QA-6610', status: 'CANCELLED', asset_count: 0, return_state: { presentation_state: 'CANCELLED', can_receive: false } }];
const items = [{ id: 'a', product_sku: '410040-01', product_name_snapshot: 'RC-751', serial_snapshot: 'QA-SERIAL-001' }, { id: 'b', product_sku: '730600-00', product_name_snapshot: 'Ukrudtsbørste', brik_number_snapshot: 82 }];
const details = (id) => ({
  delivery: { alternative_delivery_address: id === 'qa-closed', delivery_address: id === 'qa-cancelled' ? null : id === 'qa-closed' ? 'QA Alternativvej 2' : 'QA Historisk vej 1', delivery_postal_code: id === 'qa-cancelled' ? null : '8600', delivery_city: id === 'qa-cancelled' ? null : 'Silkeborg', delivery_country: id === 'qa-cancelled' ? null : 'DK', delivery_contact: id === 'qa-cancelled' ? null : 'Gemte QA navn' },
  notes: id === 'qa-cancelled' ? null : 'QA: Gemte bemærkning\nAnden linje\n' + 'Lang bemærkning med naturlige linjeskift.\n'.repeat(25),
  items: id === 'qa-cancelled' ? [] : items,
  returnSummary: id === 'qa-cancelled' ? [] : [{ case_item_id: 'a', receipt_status: 'RECEIVED', is_outstanding: false }, { case_item_id: 'b', receipt_status: id === 'qa-closed' ? 'RECEIVED' : null, is_outstanding: id !== 'qa-closed' }],
});
const modules = {
  '/__qa/service.ts': `const read=async(path)=>{const r=await fetch('/__qa/'+path);if(!r.ok)throw Error('QA read failed');return r.json();};export const listLoanCases=()=>read('cases');export const getLoanOverviewInfo=(id)=>read('info?case='+encodeURIComponent(id));export const updateLoanExpectedReturn=async()=>{throw Error('Read-only QA');};export const cancelLoanDraft=async()=>{throw Error('Read-only QA');};`,
  '/__qa/user.ts': "export const useAppUser=()=>({appUser:{id:'qa',portal_role:'timan_backend',approved:true,is_active:true,allowed_areas:['loans']}});",
  '/__qa/language.ts': "export const useLanguage=()=>({uiLanguage:'da'});",
  '/__qa/shell.tsx': "export default function Shell({children}){return <main className='mx-auto max-w-6xl p-4'>{children}</main>;}",
  '/__qa/stock.tsx': 'export default function Stock(){return null;}',
  '/__qa/main.tsx': "import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import LoansPage from '@/pages/loans/LoansPage';import '@/index.css';createRoot(document.getElementById('root')).render(<BrowserRouter><LoansPage/></BrowserRouter>);",
};
const aliases = { '@/lib/loanService': '/__qa/service.ts', '@/context/AppUserContext': '/__qa/user.ts', '@/context/LanguageContext': '/__qa/language.ts', '@/pages/loans/LoanShell': '/__qa/shell.tsx', '@/pages/loans/LoanStockPanel': '/__qa/stock.tsx', '@/pages/loans/SalesStockSalePanel': '/__qa/stock.tsx' };
const server = await createServer({ configFile: false,
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom', 'lucide-react', '@radix-ui/react-popover', '@radix-ui/react-dialog'] },
  resolve: { alias: [...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })), { find: '@', replacement: resolve('src') }] },
  plugins: [react(), { name: 'read-only-loan-overview-qa',
    resolveId(id) { const key = id.replace(/^[A-Z]:/i, ''); if (modules[key]) return key; },
    load(id) { return modules[id.replace(/^[A-Z]:/i, '')]; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && ['/__qa/cases', '/__qa/info'].includes(url.pathname)) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(url.pathname === '/__qa/cases' ? cases : details(url.searchParams.get('case'))));
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/portal/'))) {
        res.setHeader('Content-Type', 'text/html');
        return res.end(await s.transformIndexHtml(url.pathname, "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/__qa/main.tsx'></script></body></html>"));
      }
      next();
    }); },
  }], server: { host: '127.0.0.1', port: 5193, strictPort: true } });
await server.listen(); console.log('Read-only overview QA: http://127.0.0.1:5193/portal/loans');
