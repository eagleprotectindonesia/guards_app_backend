'use client';

import { useMemo } from 'react';
import Select from '../../components/select';
import { EventAvailabilityWarnings } from './EventAvailabilityWarnings';

interface EventTaggingSectionProps {
  taggedAdminIds: string[];
  onChange: (ids: string[]) => void;
  initialAdmins: Array<{ id: string; name: string; email: string }>;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  excludeEventId?: string;
}

export function EventTaggingSection({
  taggedAdminIds,
  onChange,
  initialAdmins,
  startDate,
  endDate,
  startTime,
  endTime,
  allDay,
  excludeEventId,
}: EventTaggingSectionProps) {
  const participants = useMemo(() => taggedAdminIds.map(id => ({ type: 'admin' as const, id })), [taggedAdminIds]);

  const nameLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of initialAdmins) {
      map.set(`admin:${a.id}`, a.name);
    }
    return map;
  }, [initialAdmins]);

  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">Tag Users</label>
      <Select
        isMulti
        options={initialAdmins.map(a => ({ value: a.id, label: a.email }))}
        value={initialAdmins.filter(a => taggedAdminIds.includes(a.id)).map(a => ({ value: a.id, label: a.email }))}
        onChange={selected => {
          const ids = (selected ?? []).map((s: { value: string }) => s.value);
          onChange(ids);
        }}
        placeholder="Select users to tag..."
        isClearable={false}
      />
      <EventAvailabilityWarnings
        participants={participants}
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        allDay={allDay}
        excludeEventId={excludeEventId}
        nameLookup={nameLookup}
      />
    </div>
  );
}
