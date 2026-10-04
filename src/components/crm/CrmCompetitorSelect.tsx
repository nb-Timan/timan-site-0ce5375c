import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { competitorGroupsForMachine, type CrmCompetitor } from '@/lib/crmCompetitorsService';
import { crmCompetitorText } from '@/lib/crmCompetitorI18n';

export const OTHER_COMPETITOR = '__other__';

export function CrmCompetitorSelect({ competitors, value, onChange, language, machine, includeOther = false, disabled = false, className = '' }: {
  competitors: CrmCompetitor[];
  value: string;
  onChange: (value: string) => void;
  language: PortalUiLanguage;
  machine?: string | null;
  includeOther?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const machineGroups = competitorGroupsForMachine(machine);
  const visible = competitors.filter(row => row.active || row.id === value);
  const relevant = visible.filter(row => row.active && row.machine_groups.some(group => machineGroups.includes(group)));
  const other = visible.filter(row => !relevant.includes(row));
  const option = (row: CrmCompetitor) => <option key={row.id} value={row.id}>{row.name}{row.active ? '' : ` (${crmCompetitorText('inactive', language)})`}</option>;
  return <select className={className} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    <option value="">{crmCompetitorText('choose', language)}</option>
    {relevant.length > 0 && <optgroup label={crmCompetitorText('relevant', language)}>{relevant.map(option)}</optgroup>}
    <optgroup label={crmCompetitorText('all', language)}>{other.map(option)}</optgroup>
    {includeOther && <option value={OTHER_COMPETITOR}>{crmCompetitorText('other', language)}</option>}
  </select>;
}
