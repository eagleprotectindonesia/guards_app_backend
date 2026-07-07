export const ALL_CALENDAR_EVENT_KINDS = [
  'meeting',
  'client_meeting',
  'reminder',
  'task',
  'deadline',
  'follow_up',
  'training',
  'personal_event',
  'other',
] as const;

export type CalendarEventKind = (typeof ALL_CALENDAR_EVENT_KINDS)[number];

export const KINDS_WITH_END_DATE = new Set<CalendarEventKind>([
  'meeting',
  'client_meeting',
  'deadline',
  'follow_up',
  'training',
  'personal_event',
  'other',
]);

export const KINDS_WITH_TIME = new Set<CalendarEventKind>([
  'meeting',
  'client_meeting',
  'reminder',
  'follow_up',
  'training',
  'personal_event',
  'other',
]);

export const KINDS_WITH_LOCATION = new Set<CalendarEventKind>([
  'meeting',
  'client_meeting',
  'training',
  'personal_event',
  'other',
]);

export const KINDS_WITH_PRIORITY = new Set<CalendarEventKind>([
  'meeting',
  'client_meeting',
  'task',
  'deadline',
  'follow_up',
  'training',
  'personal_event',
  'other',
]);

export const KIND_COLORS: Record<string, string> = {
  holiday: '#FF9500',
  office_memo: '#AF52DE',
  leave: '#34C759',
  meeting: '#FF3B30',
  client_meeting: '#FF2D55',
  reminder: '#FF9500',
  task: '#34C759',
  deadline: '#FF3B30',
  follow_up: '#FF9500',
  training: '#007AFF',
  personal_event: '#007AFF',
  other: '#AF52DE',
};

export const KIND_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  leave: 'Leave',
  office_memo: 'Memo',
  meeting: 'Meeting',
  client_meeting: 'Client',
  reminder: 'Reminder',
  task: 'Task',
  deadline: 'Deadline',
  follow_up: 'Follow-up',
  training: 'Training',
  personal_event: 'Personal',
  other: 'Other',
};

export interface ReminderPreset {
  labelKey: string;
  minutes: number;
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  { labelKey: 'reminderAtEvent', minutes: 0 },
  { labelKey: 'reminder10Min', minutes: 10 },
  { labelKey: 'reminder30Min', minutes: 30 },
  { labelKey: 'reminder1Hour', minutes: 60 },
  { labelKey: 'reminder1Day', minutes: 1440 },
  { labelKey: 'reminder3Days', minutes: 4320 },
  { labelKey: 'reminder1Week', minutes: 10080 },
];

const APP_TZ_OFFSET_HOURS = 8;

export function computeReminderScheduledAt(startDate: string, startTime: string | null, offsetMinutes: number): Date {
  const [y, m, d] = startDate.split('-').map(Number);
  const [hh = 0, mm = 0] = (startTime ?? '00:00').split(':').map(Number);
  const utcHours = hh - APP_TZ_OFFSET_HOURS;
  const utcMs = Date.UTC(y, m - 1, d, utcHours, mm, 0);
  return new Date(utcMs - offsetMinutes * 60_000);
}
