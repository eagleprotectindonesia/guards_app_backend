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
