// Isolated browser QA using the real form/overview. No Supabase or Fabric connections.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

// Opt in to real header/shell navigation while rejecting every fixture write.
const navigationQA = process.env.NAVIGATION_QA === '1';
const loanCase = {
  id: 'qa-checkout', loan_number: 'U-QA-CHECKOUT', status: 'DRAFT',
  responsible_user_id: 'qa', dealer_account_id: 'partner', dealer_contact_id: 'contact',
  loan_date: '2026-10-09', expected_return_date: '2026-10-20',
  alternative_delivery_address: false, notes: 'Isolated checkout UX QA',
};
const items = [{
  id: 'qa-machine', case_id: loanCase.id, item_type: 'machine', product_sku: '410040',
  product_name_snapshot: 'RC-751 QA', planning_supply_unit_id: 'qa-unit',
  serial_snapshot: 'QA-CHECKOUT-001', brik_number_snapshot: 900003,
  usage_reading_value: 12, usage_reading_unit: 'hours', warehouse_snapshot: 'Lager 2',
}];
const photos = [{
  id: 'qa-photo', case_id: loanCase.id, case_item_id: items[0].id, photo_kind: 'serial_plate',
  file_name: 'qa-evidence.png', preview_url: '/messe/machines/rc-751-sketch.png',
}];
const history = [];
const services = `
const request = async (path, body) => {
  const response = await fetch('/__qa/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!response.ok) throw new Error(await response.text());
  return response.json();
};
export const getLoanCase = () => request('data');
export const listLoanCaseHistory = () => request('history');
export const listLoanCases = () => request('cases');
export const listLoanSellers = async () => [{ id: 'qa', display_name: 'QA Timan', initials: 'QA' }];
export const listLoanPartners = async () => [{ id: 'partner', company_name: 'Isoleret QA', account_number: 'QA' }];
export const listLoanContacts = async () => [{ id: 'contact', name: 'QA kontakt' }];
export const updateLoanCaseRelationships = (id, input) => request('relationships', input);
export const updateLoanDraft = (id, input) => request('draft', input);
export const updateLoanItemUsage = (id, itemId, input) => request('usage', { itemId, ...input });
export const confirmLoanDraftSerials = (id, confirmed) => request('confirmation', { confirmed });
export const submitLoanCaseForReview = (id, confirmed) => request('review', { confirmed });
${['createLoanCase', 'removeLoanItem', 'removeLoanItemPhoto', 'reopenLoanForEdit', 'uploadLoanItemPhoto', 'validateLoanImage', 'cancelLoanDraft', 'updateLoanExpectedReturn', 'receiveLoanAssets', 'removeLoanReturnPhoto', 'uploadLoanReturnPhoto'].map((name) => `export const ${name} = async () => { throw new Error('Not supported in isolated checkout fixture'); };`).join('\n')}
`;
const modules = {
  '/__qa/service.ts': services,
  '/__qa/user.ts': "export const useAppUser = () => ({ appUser: { id: 'qa', email: 'navigation@example.invalid', display_name: 'QA', portal_role: 'timan_backend', approved: true, is_active: true, allowed_areas: ['loans'] }, logout: async () => {}, refreshAppUser: async () => null, setAppUser: () => {} });",
  '/__qa/language.ts': "export const useLanguage = () => ({ language: 'da', uiLanguage: 'da', setLanguage: () => {} });",
  '/__qa/notifications.ts': 'export const fetchPendingUserCount = async () => 0;',
  '/__qa/academy.ts': "export const ACADEMY_PORTAL_BASICS = 'portal_basics'; export const ACADEMY_PARTNER_MAP = 'partner_map'; export const academySandbox = { isActive: () => false, getActiveCase: () => null };",
  '/__qa/curriculum.ts': 'export const clearLocalAcademyEnrollment = () => {};',
  '/__qa/shell.tsx': "export default function Shell({ children }) { return <main className='mx-auto max-w-6xl p-4'>{children}</main>; }",
  '/__qa/stock.tsx': 'export default function Stock() { return null; }',
  '/__qa/fabric.ts': "export const addFabricLoanAsset = async () => { throw new Error('No Fabric writes in fixture'); };",
  '/__qa/main.tsx': `import React from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter, Routes, Route } from 'react-router-dom'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { Toaster } from 'sonner'; import CasePage from '@/pages/loans/LoanCasePage'; import LoansPage from '@/pages/loans/LoansPage'; import ReturnPage from '@/pages/loans/LoanReturnPage'; import AcceptancePage from '@/pages/loans/LoanAcceptancePage'; import Shell from '@/pages/loans/LoanShell'; import '@/index.css'; createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><Routes><Route path='/portal/loans/new' element={<CasePage/>}/><Route path='/portal/loans/:caseId/return' element={<ReturnPage/>}/><Route path='/portal/loans/:caseId/accept' element={<AcceptancePage/>}/><Route path='/portal/loans/:caseId' element={<CasePage/>}/><Route path='/portal/loans' element={<LoansPage/>}/><Route path='/portal/salg-marketing' element={<Shell><h1>Salg</h1></Shell>}/><Route path='/portal' element={<Shell><h1>Portal</h1></Shell>}/></Routes><Toaster/></BrowserRouter></QueryClientProvider>);`,
};
const aliases = {
  '@/lib/loanService': '/__qa/service.ts', '@/context/AppUserContext': '/__qa/user.ts',
  '@/context/LanguageContext': '/__qa/language.ts',
  ...(navigationQA ? {
    '@/lib/dealerAccountsService': '/__qa/notifications.ts',
    '@/lib/academySandbox': '/__qa/academy.ts', '@/lib/academyCurriculum': '/__qa/curriculum.ts',
    '@/components/portal/BackendSideNav': '/__qa/stock.tsx',
  } : { '@/pages/loans/LoanShell': '/__qa/shell.tsx' }),
  '@/pages/loans/LoanStockPanel': '/__qa/stock.tsx', '@/lib/fabricLoanStockService': '/__qa/fabric.ts',
  '@/pages/loans/SalesStockSalePanel': '/__qa/stock.tsx',
};
const server = await createServer({
  configFile: false, define: { __TIMAN_BUILD_ID__: JSON.stringify('local-checkout-qa') },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom', '@tanstack/react-query', 'lucide-react', '@radix-ui/react-dialog', 'sonner'] },
  resolve: { alias: [...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })), { find: '@', replacement: resolve('src') }] },
  plugins: [react(), {
    name: 'isolated-loan-checkout-fixture',
    resolveId(id) { const key = id.replace(/^[A-Z]:/i, ''); if (modules[key]) return key; },
    load(id) { return modules[id.replace(/^[A-Z]:/i, '')]; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const send = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        if (url.pathname === '/__qa/data') return send({ loanCase, items, photos, returnSummary: [], returnState: { can_receive: false } });
        if (url.pathname === '/__qa/history') return send(history);
        if (url.pathname === '/__qa/cases') return send([{ ...loanCase, partner_name: 'Isoleret QA', responsible_name: 'QA Timan', asset_count: items.length }]);
        if (req.method === 'POST' && url.pathname.startsWith('/__qa/')) {
          if (navigationQA) { res.statusCode = 405; return res.end('Read-only navigation QA'); }
          const chunks = []; for await (const chunk of req) chunks.push(chunk);
          const input = JSON.parse(Buffer.concat(chunks).toString());
          if (url.pathname === '/__qa/draft') Object.assign(loanCase, { loan_date: input.loanDate, expected_return_date: input.expectedReturnDate, notes: input.notes });
          else if (url.pathname === '/__qa/usage') Object.assign(items.find((item) => item.id === input.itemId), { usage_reading_value: input.value, usage_reading_unit: input.unit, driving_use_limit: input.limit });
          else if (url.pathname === '/__qa/confirmation') loanCase.serial_numbers_confirmed_at = input.confirmed ? new Date().toISOString() : null;
          else if (url.pathname === '/__qa/relationships') Object.assign(loanCase, { responsible_user_id: input.sellerId, dealer_account_id: input.partnerId, dealer_contact_id: input.contactId });
          else if (url.pathname === '/__qa/review') {
            if (!input.confirmed) { res.statusCode = 400; return res.end('QA confirmation required'); }
            loanCase.status = 'READY_FOR_REVIEW';
            loanCase.serial_numbers_confirmed_at = new Date().toISOString();
            history.push({ id: crypto.randomUUID(), event_type: 'READY_FOR_REVIEW', created_at: loanCase.serial_numbers_confirmed_at, actor_name: 'QA Timan', metadata: {} });
          } else { res.statusCode = 404; return res.end('Unsupported fixture action'); }
          return send({ ok: true });
        }
        if (req.method === 'GET' && url.pathname.startsWith('/portal/')) {
          res.setHeader('Content-Type', 'text/html');
          return res.end(await vite.transformIndexHtml(url.pathname, "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/__qa/main.tsx'></script></body></html>"));
        }
        next();
      });
    },
  }], server: { host: '127.0.0.1', port: Number(process.env.PORT ?? 5193), strictPort: true },
});
await server.listen();
console.log(`Isolated checkout QA: http://127.0.0.1:${server.config.server.port}/portal/loans/qa-checkout`);
