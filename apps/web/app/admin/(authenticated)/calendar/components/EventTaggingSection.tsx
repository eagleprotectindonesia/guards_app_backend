import Select from '../../components/select';

interface EventTaggingSectionProps {
  taggedAdminIds: string[];
  onChange: (ids: string[]) => void;
  initialAdmins: Array<{ id: string; name: string; email: string }>;
}

export function EventTaggingSection({ taggedAdminIds, onChange, initialAdmins }: EventTaggingSectionProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Tag Users</label>
      <Select
        isMulti
        options={initialAdmins.map(a => ({ value: a.id, label: a.email }))}
        value={initialAdmins
          .filter(a => taggedAdminIds.includes(a.id))
          .map(a => ({ value: a.id, label: a.email }))}
        onChange={selected => {
          const ids = (selected ?? []).map((s: { value: string }) => s.value);
          onChange(ids);
        }}
        placeholder="Select users to tag..."
        isClearable={false}
      />
    </div>
  );
}
