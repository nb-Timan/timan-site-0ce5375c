#!/usr/bin/env node
/**
 * Register an internal site/product change for Marketing review.
 *
 * Required env:
 * - VITE_SUPABASE_URL or SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Example:
 * node scripts/registerSiteChange.mjs --title "Forhandlere kan oprette egne leads" --files "src/pages/crm/CrmLeadsPage.tsx" --user-impact 9 --technical-impact 7 --roles timan_dealer,dealer_user
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(key.slice(2), next && !next.startsWith('--') ? next : 'true');
  if (next && !next.startsWith('--')) i += 1;
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const title = args.get('title') || '';
if (!title.trim()) {
  console.error('Missing --title.');
  process.exit(1);
}

const files = (args.get('files') || '').split(',').map((v) => v.trim()).filter(Boolean);
const userImpact = clampScore(args.get('user-impact') || args.get('userImpact') || '3');
const technicalImpact = clampScore(args.get('technical-impact') || args.get('technicalImpact') || '3');
const moduleName = args.get('module') || inferModule(files);
const recommendation = args.get('recommendation') || recommend(userImpact, technicalImpact);
const roles = (args.get('roles') || inferRoles(moduleName)).split(',').map((v) => v.trim()).filter(Boolean);
const sourceRef = args.get('source-ref') || args.get('sourceRef') || process.env.GITHUB_SHA || 'local';

const payload = {
  source: args.get('source') || 'codex',
  source_ref: sourceRef,
  implemented_at: new Date().toISOString(),
  title_internal: title,
  description_internal: args.get('description') || null,
  technical_description: args.get('technical-description') || args.get('technicalDescription') || (files.length ? `Changed files: ${files.join(', ')}` : null),
  title_public: args.get('public-title') || null,
  description_public: args.get('public-description') || null,
  localized_content: {
    da: {
      title: args.get('public-title') || title,
      description: args.get('public-description') || '',
      note: args.get('public-title') || title,
      module_label: moduleName,
      change_type_label: args.get('type') || 'improvement',
    },
  },
  module: moduleName,
  change_type: args.get('type') || 'improvement',
  affected_roles: roles.length ? roles : ['all'],
  user_impact_score: userImpact,
  technical_impact_score: technicalImpact,
  publish_recommendation: recommendation,
  is_important: args.get('important') === 'true' || userImpact >= 9,
  status: 'new',
};

const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/site_change_entries`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}

console.log(text);

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function recommend(user, technical) {
  if (user >= 8) return 'publish';
  if (user <= 2 && technical <= 5) return 'internal';
  return 'maybe';
}

function inferModule(filesList) {
  const haystack = filesList.join('\n').toLowerCase();
  if (haystack.includes('/crm/') || haystack.includes('crm')) return 'crm';
  if (haystack.includes('lead')) return 'leads';
  if (haystack.includes('dealer')) return 'dealer_data';
  if (haystack.includes('partner-map') || haystack.includes('partnermap') || haystack.includes('map')) return 'map';
  if (haystack.includes('messe')) return 'messe';
  if (haystack.includes('tsb')) return 'tsb';
  if (haystack.includes('warranty')) return 'warranty';
  if (haystack.includes('claim')) return 'claims';
  if (haystack.includes('news') || haystack.includes('marketing')) return 'marketing';
  if (haystack.includes('backend')) return 'backend';
  return 'backend';
}

function inferRoles(moduleName) {
  if (moduleName === 'backend' || moduleName === 'users') return 'timan_backend';
  if (moduleName === 'service' || moduleName === 'tsb' || moduleName === 'claims' || moduleName === 'warranty') return 'timan_service,timan_service_partner,timan_dealer,dealer_user';
  if (moduleName === 'dealer_data' || moduleName === 'dealer_portal' || moduleName === 'messe') return 'timan_dealer,dealer_user,timan_importer,timan_service_partner';
  if (moduleName === 'crm' || moduleName === 'leads' || moduleName === 'budget' || moduleName === 'quotes' || moduleName === 'orders') return 'timan_seller,timan_backend';
  return 'all';
}
