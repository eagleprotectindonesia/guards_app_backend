'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { checkTagAvailability } from '../actions';
import type { AvailabilityConflict, ParticipantKey } from '@repo/database';

const INITIAL_VISIBLE = 5;

interface EventAvailabilityWarningsProps {
  participants: Array<{ type: 'employee' | 'admin'; id: string }>;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  excludeEventId?: string;
  nameLookup: Map<string, string>;
}

function stableKey(data: unknown): string {
  return JSON.stringify(data);
}

export function EventAvailabilityWarnings({
  participants,
  startDate,
  endDate,
  startTime,
  endTime,
  allDay,
  excludeEventId,
  nameLookup,
}: EventAvailabilityWarningsProps) {
  const [expanded, setExpanded] = useState(false);

  const queryKey = useMemo(
    () => [
      'calendar',
      'tag-availability',
      stableKey({
        participants: participants.map(p => `${p.type}:${p.id}`).sort(),
        startDate,
        endDate,
        startTime,
        endTime,
        allDay,
        excludeEventId,
      }),
    ],
    [participants, startDate, endDate, startTime, endTime, allDay, excludeEventId]
  );

  const { data, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      if (participants.length === 0) return { conflicts: {} as Record<ParticipantKey, AvailabilityConflict[]> };
      return checkTagAvailability({
        startDate,
        endDate,
        startTime: startTime || null,
        endTime: endTime || null,
        allDay,
        participants,
        excludeEventId,
      });
    },
    enabled: participants.length > 0 && !!startDate,
    staleTime: 30_000,
  });

  const allConflicts: Array<{ name: string; conflict: AvailabilityConflict }> = useMemo(() => {
    if (!data?.conflicts) return [];
    const entries: Array<{ name: string; conflict: AvailabilityConflict }> = [];
    for (const [key, conflicts] of Object.entries(data.conflicts)) {
      const name = nameLookup.get(key) ?? key;
      for (const c of conflicts) {
        entries.push({ name, conflict: c });
      }
    }
    entries.sort((a, b) => a.conflict.startDate.localeCompare(b.conflict.startDate));
    return entries;
  }, [data, nameLookup]);

  if (participants.length === 0 || !startDate) return null;

  const count = allConflicts.length;
  const visible = expanded ? allConflicts : allConflicts.slice(0, INITIAL_VISIBLE);
  const hasMore = count > INITIAL_VISIBLE;

  function formatRange(c: AvailabilityConflict): string {
    let s = c.startDate;
    if (c.startDate !== c.endDate) {
      s += ` – ${c.endDate}`;
    }
    if (!c.allDay && c.startTime && c.endTime) {
      s += ` ${c.startTime} – ${c.endTime}`;
    } else if (!c.allDay && c.startTime) {
      s += ` ${c.startTime}`;
    }
    return s;
  }

  return (
    <div className="space-y-1">
      {isFetching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking availability...
        </div>
      )}

      {!isFetching && count > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">Availability conflicts ({count})</span>
          </div>
          <ul className="mt-2 space-y-1">
            {visible.map((entry, i) => (
              <li key={`${entry.conflict.id}-${i}`} className="text-xs text-amber-300">
                <span className="font-medium">{entry.name}</span> — &ldquo;{entry.conflict.title}&rdquo;
                {' on '}
                <span className="text-amber-200">{formatRange(entry.conflict)}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-1 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Show {count - INITIAL_VISIBLE} more
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
