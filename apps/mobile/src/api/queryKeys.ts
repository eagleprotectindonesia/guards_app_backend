export const queryKeys = {
  profile: ['profile'] as const,
  settings: ['settings'] as const,
  sessionMonitor: ['session-monitor'] as const,
  officeAttendance: {
    today: ['office-attendance', 'today'] as const,
    weekly: ['office-attendance', 'weekly'] as const,
  },
  shifts: {
    active: ['active-shift'] as const,
    list: ['shifts'] as const,
  },
  chat: {
    unread: ['chat', 'unread'] as const,
    messages: (employeeId?: string) => ['chat', 'messages', employeeId] as const,
    directLatest: (employeeId?: string) => ['chat', 'direct-latest', employeeId] as const,
    inbox: ['chat', 'inbox'] as const,
    groupList: ['chat', 'groups'] as const,
    groupMessages: (groupId?: string) => ['chat', 'group-messages', groupId] as const,
    groupMetadata: (groupId: string) => ['chat', 'group-metadata', groupId] as const,
  },
  leaveRequests: {
    list: ['leave-requests'] as const,
  },
  announcements: {
    list: ['announcements'] as const,
  },
  tickets: {
    list: ['tickets'] as const,
  },
  calendar: {
    list: (from: string, to: string) => ['calendar', from, to] as const,
    item: (type: string, id: string) => ['calendar', 'item', type, id] as const,
  },
};
