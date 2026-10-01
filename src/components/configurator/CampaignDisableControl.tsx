import { Switch } from '@/components/ui/switch';

type CampaignDisableControlProps = {
  visible: boolean;
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onCheckedChange: (checked: boolean) => void;
};

export function CampaignDisableControl({
  visible,
  checked,
  disabled = false,
  label,
  hint,
  onCheckedChange,
}: CampaignDisableControlProps) {
  if (!visible) return null;

  return (
    <div className="mt-3 flex min-w-0 items-center justify-between gap-3" data-testid="campaign-disable-control">
      <div className="min-w-0 flex-1">
        <label htmlFor="configurator-campaign-disabled" className="block text-sm font-semibold text-gray-800">
          {label}
        </label>
        <p className="max-w-full text-xs text-gray-500">{hint}</p>
      </div>
      <Switch
        id="configurator-campaign-disabled"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
