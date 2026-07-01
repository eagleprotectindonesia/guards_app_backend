'use client';

import Select from '../select';

type SelectFilterProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  id: string;
  instanceId: string;
  placeholder?: string;
  allLabel?: string;
};

export default function SelectFilter({
  label,
  value,
  options,
  onChange,
  id,
  instanceId,
  placeholder,
  allLabel,
}: SelectFilterProps) {
  const resolvedOptions = allLabel
    ? [{ value: '', label: allLabel }, ...options]
    : options;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      <Select
        id={id}
        instanceId={instanceId}
        options={resolvedOptions}
        value={resolvedOptions.find(option => option.value === value)}
        onChange={selectedOption => onChange(selectedOption ? selectedOption.value : '')}
        placeholder={placeholder || 'All'}
        isClearable={false}
      />
    </div>
  );
}
