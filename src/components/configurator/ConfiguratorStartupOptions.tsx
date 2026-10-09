import {
  configuratorStartupOptionsForCountry,
  type ConfiguratorStartupOption,
} from '@/lib/configuratorStartup';

interface Props {
  country: string | null;
  value: string | null;
  translate: (key: string) => string;
  onChange: (option: ConfiguratorStartupOption) => void;
}

const LABEL_KEYS: Record<ConfiguratorStartupOption, string> = {
  no_bridge: 'startupNoBridge',
  with_bridge: 'startupWithBridge',
  other: 'startupOther',
};

export function ConfiguratorStartupOptions({ country, value, translate, onChange }: Props) {
  const options = configuratorStartupOptionsForCountry(country);

  return (
    <div className="mt-6 max-w-2xl mx-auto text-left" data-testid="configurator-startup-options">
      <h3 className="text-sm font-bold text-gray-800 mb-2">{translate('startupTitle')}</h3>
      <div className="space-y-2">
        {options.map(option => (
          <label key={option} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="deliver-startup"
              value={option}
              className="accent-emerald-600"
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span className="text-sm text-gray-700">{translate(LABEL_KEYS[option])}</span>
          </label>
        ))}
      </div>
      {!value && <p className="text-red-500 text-xs mt-2">{translate('startupRequired')}</p>}
    </div>
  );
}
