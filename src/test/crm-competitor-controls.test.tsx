import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CrmDemoResultControls } from '@/components/crm/CrmDemoResultControls';
import { CrmCompetitorSelect } from '@/components/crm/CrmCompetitorSelect';
import type { CrmDemoResultInput } from '@/lib/crmLeadsService';
import type { CrmCompetitor } from '@/lib/crmCompetitorsService';
import { crmCompetitorText } from '@/lib/crmCompetitorI18n';

const competitor = (id: string, name: string, active: boolean, machine_groups: CrmCompetitor['machine_groups']): CrmCompetitor => ({
  id, name, active, machine_groups, country_code: null, website_url: null, created_at: '', updated_at: '',
});
const rows = [competitor('hako', 'Hako', true, ['RC-1000s']), competitor('vitra', 'Vitra', true, ['Timan 3330']), competitor('old', 'Old brand', false, [])];

function ResultForm() {
  const [value, setValue] = useState<CrmDemoResultInput>({ interest_level: 4, competitors_present: 'yes', competitor_id: 'hako' });
  return <><CrmDemoResultControls value={value} onChange={setValue} competitors={rows} language="da" machine="RC-1000s" />
    <output>{JSON.stringify(value)}</output></>;
}

describe('canonical demo competitor controls', () => {
  it('keeps interest editable and clears the selected competitor when presence changes to no', () => {
    render(<ResultForm />);
    expect(screen.getByLabelText('Konkurrent')).toHaveValue('hako');
    fireEvent.change(screen.getByLabelText('Kundens interesse'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Konkurrenter til stede?'), { target: { value: 'no' } });
    expect(screen.queryByLabelText('Konkurrent')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('"interest_level":5');
    expect(screen.getByRole('status')).toHaveTextContent('"competitor_id":null');
    fireEvent.change(screen.getByLabelText('Konkurrenter til stede?'), { target: { value: 'yes' } });
    expect(screen.getByLabelText('Konkurrent')).toHaveValue('');
  });

  it('shows relevant active competitors first and retains a selected inactive historical relation', () => {
    const { rerender } = render(<CrmCompetitorSelect competitors={rows} value="" onChange={() => {}} language="da" machine="RC-1000s" />);
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([crmCompetitorText('choose', 'da'), 'Hako', 'Vitra']);
    rerender(<CrmCompetitorSelect competitors={rows} value="old" onChange={() => {}} language="da" machine="RC-1000s" />);
    expect(screen.getByRole('option', { name: /Old brand/ })).toBeInTheDocument();
  });
});
