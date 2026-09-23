import type { ReactNode } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { crmLeadText } from '@/lib/crmLeadI18n';

type CrmLeadFollowupFieldsProps = {
  nextFollowup: string;
  activity: string;
  onNextFollowupChange: (value: string) => void;
  onActivityChange: (value: string) => void;
  activityOptions: readonly string[];
  activityLabel?: (activity: string) => string;
  renderFollowup?: () => ReactNode;
  required?: boolean;
};

/**
 * Shared lead follow-up controls. Academy supplies local persistence while
 * the production editor supplies its normal repository and date helper.
 */
export function CrmLeadFollowupFields({
  nextFollowup,
  activity,
  onNextFollowupChange,
  onActivityChange,
  activityOptions,
  activityLabel = (value) => value,
  renderFollowup,
  required = false,
}: CrmLeadFollowupFieldsProps) {
  const { uiLanguage } = useLanguage();
  return (
    <>
      {renderFollowup ? renderFollowup() : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-gray-700">
            {crmLeadText('nextFollowup', uiLanguage)} {required && <span className="text-rose-500">*</span>}
          </span>
          <input
            type="date"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            value={nextFollowup}
            onChange={(event) => onNextFollowupChange(event.target.value)}
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-gray-700">
          {crmLeadText('nextActivity', uiLanguage)} {required && <span className="text-rose-500">*</span>}
        </span>
        <select
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          value={activity}
          onChange={(event) => onActivityChange(event.target.value)}
        >
          <option value="">{crmLeadText('select', uiLanguage)}</option>
          {activityOptions.map((option) => <option key={option} value={option}>{activityLabel(option)}</option>)}
        </select>
      </label>
    </>
  );
}
