type OfficeScheduleContextLike = {
  isWorkingDay?: boolean;
  scheduledStartStr?: string | null;
  scheduledEndStr?: string | null;
  businessDateStr?: string | null;
  startMinutes?: number | null;
  endMinutes?: number | null;
  schedule?: {
    name?: string | null;
  } | null;
  businessDay?: {
    dateKey?: string | null;
  } | null;
} | null | undefined;

function formatMinutesAsTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const normalized = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getOfficeScheduleDisplayState(scheduleContext: OfficeScheduleContextLike) {
  return {
    isWorkingDay: Boolean(scheduleContext?.isWorkingDay),
    scheduleName: scheduleContext?.schedule?.name ?? null,
    businessDate: scheduleContext?.businessDateStr ?? scheduleContext?.businessDay?.dateKey ?? null,
    scheduledStartStr: scheduleContext?.scheduledStartStr ?? formatMinutesAsTime(scheduleContext?.startMinutes),
    scheduledEndStr: scheduleContext?.scheduledEndStr ?? formatMinutesAsTime(scheduleContext?.endMinutes),
  };
}
