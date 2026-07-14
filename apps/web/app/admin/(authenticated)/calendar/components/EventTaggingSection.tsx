'use client';

import { useMemo } from 'react';
import Select from '../../components/select';
import { EventAvailabilityWarnings } from './EventAvailabilityWarnings';

interface EventTaggingSectionProps {
  taggedAdminIds: string[];
  onAdminsChange: (ids: string[]) => void;
  taggedDepartmentNames: string[];
  onDepartmentsChange: (names: string[]) => void;
  initialAdmins: Array<{ id: string; name: string; email: string }>;
  initialDepartments: string[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  excludeEventId?: string;
}

export function EventTaggingSection({
  taggedAdminIds,
  onAdminsChange,
  taggedDepartmentNames,
  onDepartmentsChange,
  initialAdmins,
  initialDepartments,
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
    <div className="space-y-4">
      <div>
        <label className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">Tag Users</label>
        <Select
          isMulti
          options={initialAdmins.map(a => ({ value: a.id, label: a.email }))}
          value={initialAdmins.filter(a => taggedAdminIds.includes(a.id)).map(a => ({ value: a.id, label: a.email }))}
          onChange={selected => {
            const ids = (selected ?? []).map((s: { value: string }) => s.value);
            onAdminsChange(ids);
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
      <div>
        <label className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">Tag Departments</label>
        <Select
          isMulti
          options={initialDepartments.map(name => ({ value: name, label: name }))}
          value={initialDepartments.filter(name => taggedDepartmentNames.includes(name)).map(name => ({ value: name, label: name }))}
          onChange={selected => {
            const names = (selected ?? []).map((s: { value: string }) => s.value);
            onDepartmentsChange(names);
          }}
          placeholder="Select departments to tag..."
          isClearable={false}
        />
      </div>
    </div>
  );
}
