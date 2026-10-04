import type { CrmDemoResultInput } from '@/lib/crmLeadsService';
import type { CrmCompetitor } from '@/lib/crmCompetitorsService';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { demoFlowText } from '@/lib/crmDemoFlowI18n';
import { crmCompetitorText } from '@/lib/crmCompetitorI18n';
import { CrmCompetitorSelect } from '@/components/crm/CrmCompetitorSelect';

const input = 'min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

export function CrmDemoResultControls({ value, onChange, competitors, language, machine, disabled = false }: {
  value: CrmDemoResultInput;
  onChange: (next: CrmDemoResultInput) => void;
  competitors: CrmCompetitor[];
  language: PortalUiLanguage;
  machine?: string | null;
  disabled?: boolean;
}) {
  return <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
    <label className="min-w-0 space-y-1"><span className="block text-xs text-slate-600">{demoFlowText('interestSummary', language)}</span>
      <select className={input} value={value.interest_level ?? ''} disabled={disabled} onChange={event => onChange({ ...value, interest_level: event.target.value ? Number(event.target.value) : null })}>
        <option value="">{demoFlowText('notSpecified', language)}</option>
        {[1, 2, 3, 4, 5].map(number => <option key={number} value={number}>{number}/5</option>)}
      </select>
    </label>
    <label className="min-w-0 space-y-1"><span className="block text-xs text-slate-600">{demoFlowText('competitors', language)}</span>
      <select className={input} value={value.competitors_present ?? ''} disabled={disabled} onChange={event => onChange({ ...value, competitors_present: (event.target.value || null) as 'yes' | 'no' | null, competitor_id: event.target.value === 'yes' ? value.competitor_id : null })}>
        <option value="">{demoFlowText('notSpecified', language)}</option>
        <option value="yes">{demoFlowText('yes', language)}</option>
        <option value="no">{demoFlowText('no', language)}</option>
      </select>
    </label>
    {value.competitors_present === 'yes' && <label className="min-w-0 space-y-1"><span className="block text-xs text-slate-600">{crmCompetitorText('competitor', language)}</span>
      <CrmCompetitorSelect className={input} competitors={competitors} value={value.competitor_id ?? ''} onChange={id => onChange({ ...value, competitor_id: id || null })} language={language} machine={machine} disabled={disabled} />
    </label>}
  </div>;
}
