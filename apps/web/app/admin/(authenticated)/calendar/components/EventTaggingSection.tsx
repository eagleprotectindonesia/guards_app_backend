import Select from '../../components/select';

interface EventTaggingSectionProps {
  taggedAdminIds: string[];
  onChange: (ids: string[]) => void;
  initialAdmins: Array<{ id: string; name: string; email: string }>;
}

export function EventTaggingSection({ taggedAdminIds, onChange, initialAdmins }: EventTaggingSectionProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Tag Admins</label>
      <Select
        isMulti
        options={initialAdmins.map(a => ({ value: a.id, label: a.name }))}
        value={initialAdmins
          .filter(a => taggedAdminIds.includes(a.id))
          .map(a => ({ value: a.id, label: a.name }))}
        onChange={selected => {
          const ids = (selected ?? []).map((s: { value: string }) => s.value);
          onChange(ids);
        }}
        placeholder="Select admins to tag..."
        isClearable={false}
      />
    </div>
  );
}
