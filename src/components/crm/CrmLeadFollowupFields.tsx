import type { ReactNode } from 'react';

type CrmLeadFollowupFieldsProps = {
  nextFollowup: string;
  activity: string;
  onNextFollowupChange: (value: string) => void;
  onActivityChange: (value: string) => void;
  activityOptions: readonly string[];
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
  renderFollowup,
  required = false,
}: CrmLeadFollowupFieldsProps) {
  return (
    <>
      {renderFollowup ? renderFollowup() : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-gray-700">
            Næste opfølgning {required && <span className="text-rose-500">*</span>}
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
          Næste aktivitet {required && <span className="text-rose-500">*</span>}
        </span>
        <select
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          value={activity}
          onChange={(event) => onActivityChange(event.target.value)}
        >
          <option value="">Vælg…</option>
          {activityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    </>
  );
}
