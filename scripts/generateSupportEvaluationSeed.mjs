import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPPORT_EVALUATION_GOLDEN_SET, SUPPORT_EVALUATION_SUITES } from '../src/lib/supportEvaluationGoldenSet.ts';

const output = process.argv[2];
if (!output) throw new Error('Usage: node --experimental-strip-types scripts/generateSupportEvaluationSeed.mjs <migration-file>');
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const array = (values) => `array[${values.map(literal).join(',')}]::text[]`;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const suiteCases = (suite) => {
  if (suite.key === 'FULL') return SUPPORT_EVALUATION_GOLDEN_SET;
  if (suite.key === 'SMOKE') return [
    ...SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category !== 'SECURITY_AUTHORIZATION' && item.tags.includes('smoke')).slice(0, 15),
    ...SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category === 'SECURITY_AUTHORIZATION').slice(0, 5),
  ];
  if (suite.key === 'SECURITY') return SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category === 'SECURITY_AUTHORIZATION');
  if (suite.key === 'MULTILINGUAL') return SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.tags.includes('cross-language'));
  if (suite.key === 'CONFIDENCE') return SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category === 'CONFIDENCE_FALLBACK');
  if (suite.key === 'ACTIONS') return SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.tags.includes('action-parity'));
  if (suite.key === 'ROLE_READINESS') return SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.category === 'SECURITY_AUTHORIZATION');
  return SUPPORT_EVALUATION_GOLDEN_SET.filter((item) => item.expected.sourceRevisionIds?.length || item.expected.citationIds?.length);
};

const lines = [
  '-- Generated from src/lib/supportEvaluationGoldenSet.ts. Do not hand-edit.',
  'do $$',
  'declare',
  '  v_approver uuid;',
  '  v_suite uuid;',
  '  v_suite_version uuid;',
  '  v_case uuid;',
  '  v_case_version uuid;',
  'begin',
  "  select id into v_approver from public.app_users where portal_role::text='timan_backend' and coalesce(approved,false) and coalesce(is_active,false) order by created_at limit 1;",
  "  if v_approver is null then raise exception 'PHASE8_APPROVER_NOT_FOUND'; end if;",
];

for (const testCase of SUPPORT_EVALUATION_GOLDEN_SET) {
  lines.push(
    `  insert into public.support_evaluation_cases(case_key,created_by) values(${literal(testCase.key)},v_approver) on conflict(case_key) do update set case_key=excluded.case_key returning id into v_case;`,
    `  insert into public.support_evaluation_case_versions(case_id,version_number,status,title,category,language,actor_fixture,page_context,request_text,expected_result,severity,tags,is_critical,content_hash,source_kind,approved_by,approved_at,created_by) values(v_case,${testCase.version},'APPROVED',${literal(testCase.title)},${literal(testCase.category)},${literal(testCase.language)},${json(testCase.actor)},${literal(testCase.pageContext)},${literal(testCase.request)},${json(testCase.expected)},${literal(testCase.severity)},${array(testCase.tags)},${testCase.critical},${literal(hash(testCase))},${literal(testCase.tags.includes('action-parity') ? 'ACTION_PARITY' : testCase.category === 'SECURITY_AUTHORIZATION' ? 'SECURITY_CORPUS' : 'GOLDEN_SET')},v_approver,now(),v_approver) on conflict(case_id,version_number) do nothing;`,
  );
}

for (const suite of SUPPORT_EVALUATION_SUITES) {
  const members = suiteCases(suite);
  lines.push(
    `  insert into public.support_evaluation_suites(suite_key,title,description,created_by) values(${literal(suite.key)},${literal(suite.title)},${literal(`Phase 8 ${suite.key} suite`)},v_approver) on conflict(suite_key) do update set title=excluded.title returning id into v_suite;`,
    `  insert into public.support_evaluation_suite_versions(suite_id,version_number,status,tier,content_hash,case_count,configuration,approved_by,approved_at,created_by) values(v_suite,1,'APPROVED',${literal(suite.tier)},${literal(hash(members.map((item) => item.key)))},${members.length},${json({ tags: suite.tags })},v_approver,now(),v_approver) on conflict(suite_id,version_number) do nothing;`,
    '  select id into v_suite_version from public.support_evaluation_suite_versions where suite_id=v_suite and version_number=1;',
  );
  members.forEach((testCase, index) => lines.push(
    `  select cv.id into v_case_version from public.support_evaluation_case_versions cv join public.support_evaluation_cases c on c.id=cv.case_id where c.case_key=${literal(testCase.key)} and cv.version_number=${testCase.version};`,
    `  insert into public.support_evaluation_suite_cases(suite_version_id,case_version_id,sort_order,is_required) values(v_suite_version,v_case_version,${index + 1},true) on conflict(suite_version_id,case_version_id) do nothing;`,
  ));
}
lines.push('end $$;', '');
writeFileSync(resolve(output), lines.join('\n'), 'utf8');
console.log(JSON.stringify({ output: resolve(output), cases: SUPPORT_EVALUATION_GOLDEN_SET.length, suites: SUPPORT_EVALUATION_SUITES.length }));
