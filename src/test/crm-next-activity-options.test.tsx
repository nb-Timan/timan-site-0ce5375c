import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmLeadFollowupFields } from '@/components/crm/CrmLeadFollowupFields';
import { LanguageProvider } from '@/context/LanguageContext';
import { crmNextActivityLabel } from '@/lib/crmDemoStageI18n';
import { crmLeadActivityLabel } from '@/lib/crmLeadI18n';
import {
  CLOSE_FLOW_NEXT_ACTIVITY_OPTIONS,
  getNextActivitySelectorOptions,
  isManualNextActivityOption,
  MANUAL_NEXT_ACTIVITY_OPTIONS,
  NEXT_ACTIVITY_OPTIONS,
} from '@/lib/crmLeadsService';
import {
  NEXT_ACTIVITY_LOST,
  NEXT_ACTIVITY_NOT_RELEVANT,
  NEXT_ACTIVITY_WON,
} from '@/lib/leadStatus';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';

const NORMAL_ACTIVITY = 'Follow-up on leads';

function LegacyActivityFixture() {
  const [activity, setActivity] = useState<string>(NEXT_ACTIVITY_LOST);
  return (
    <LanguageProvider>
      <CrmLeadFollowupFields
        nextFollowup=""
        activity={activity}
        onNextFollowupChange={vi.fn()}
        onActivityChange={setActivity}
        activityOptions={getNextActivitySelectorOptions(activity)}
        disabledActivityOptions={CLOSE_FLOW_NEXT_ACTIVITY_OPTIONS}
        activityLabel={(value) => crmLeadActivityLabel(crmNextActivityLabel(value, 'da'), 'da')}
      />
    </LanguageProvider>
  );
}

describe('CRM manual Next activity options', () => {
  beforeEach(() => {
    window.localStorage.setItem('timan.language', 'da');
  });

  it('filters only the three canonical close-flow values from manual selection', () => {
    expect(CLOSE_FLOW_NEXT_ACTIVITY_OPTIONS).toEqual([
      NEXT_ACTIVITY_LOST,
      NEXT_ACTIVITY_WON,
      NEXT_ACTIVITY_NOT_RELEVANT,
    ]);
    expect(NEXT_ACTIVITY_OPTIONS).toEqual(expect.arrayContaining(CLOSE_FLOW_NEXT_ACTIVITY_OPTIONS));
    expect(MANUAL_NEXT_ACTIVITY_OPTIONS).not.toEqual(expect.arrayContaining(CLOSE_FLOW_NEXT_ACTIVITY_OPTIONS));
    expect(MANUAL_NEXT_ACTIVITY_OPTIONS).toEqual(expect.arrayContaining([
      NORMAL_ACTIVITY,
      'New lead',
      'Wants to be contacted',
      'Offer sent to the customer',
      'Customer requests a demonstration',
    ]));
  });

  it('applies the canonical filter independently of every portal language', () => {
    for (const language of PORTAL_LANGUAGE_CODES) {
      const labels = MANUAL_NEXT_ACTIVITY_OPTIONS.map((activity) =>
        crmLeadActivityLabel(crmNextActivityLabel(activity, language), language));

      for (const activity of CLOSE_FLOW_NEXT_ACTIVITY_OPTIONS) {
        const closeLabel = crmLeadActivityLabel(crmNextActivityLabel(activity, language), language);
        expect(labels, language).not.toContain(closeLabel);
        expect(isManualNextActivityOption(activity), language).toBe(false);
      }
      expect(isManualNextActivityOption(NORMAL_ACTIVITY), language).toBe(true);
    }
  });

  it('shows a saved legacy close value disabled until a valid replacement is selected', () => {
    render(<LegacyActivityFixture />);

    const select = screen.getByRole('combobox', { name: /Næste aktivitet/i });
    const legacyOption = within(select).getByRole('option', { name: 'Lukket uden ordre' });
    expect(legacyOption).toBeDisabled();
    expect(select).toHaveValue(NEXT_ACTIVITY_LOST);
    expect(within(select).queryByRole('option', { name: 'Lukket med ordre' })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Ikke relevant' })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: NORMAL_ACTIVITY } });

    expect(within(select).queryByRole('option', { name: 'Lukket uden ordre' })).not.toBeInTheDocument();
    expect(select).toHaveValue(NORMAL_ACTIVITY);
  });
});
