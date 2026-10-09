import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { formatEditableDanishNumber, parseDanishNumericInput } from '@/lib/driftberegnerNumericInput';

type DriftNumericInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
  formatDisplay?: (value: number) => string;
};

/** Keeps in-progress numeric text separate from the calculator's last valid value. */
export function DriftNumericInput({
  value,
  onValueChange,
  formatDisplay = formatEditableDanishNumber,
  inputMode = 'decimal',
  onFocus,
  onBlur,
  onKeyDown,
  ...inputProps
}: DriftNumericInputProps) {
  const [rawValue, setRawValue] = useState(() => formatDisplay(value));
  const [isEditing, setIsEditing] = useState(false);
  const lastValidValue = useRef(value);

  useEffect(() => {
    lastValidValue.current = value;
    if (!isEditing) {
      setRawValue(formatDisplay(value));
    }
  }, [formatDisplay, isEditing, value]);

  const commit = () => {
    const parsed = parseDanishNumericInput(rawValue);
    const committedValue = parsed ?? lastValidValue.current;

    if (parsed !== null) {
      lastValidValue.current = parsed;
      onValueChange(parsed);
    }

    setIsEditing(false);
    setRawValue(formatDisplay(committedValue));
  };

  return (
    <input
      {...inputProps}
      type="text"
      inputMode={inputMode}
      value={rawValue}
      onFocus={(event) => {
        setIsEditing(true);
        setRawValue(formatEditableDanishNumber(value));
        onFocus?.(event);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setRawValue(nextValue);

        const parsed = parseDanishNumericInput(nextValue);
        if (parsed !== null) {
          lastValidValue.current = parsed;
          onValueChange(parsed);
        }
      }}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
