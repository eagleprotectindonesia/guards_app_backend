export const queryKeys = {
  profile: ['profile'] as const,
  settings: ['settings'] as const,
  sessionMonitor: ['session-monitor'] as const,
  shifts: {
    active: ['active-shift'] as const,
    list: ['shifts'] as const,
  },
  chat: {
    unread: ['chat', 'unread'] as const,
    messages: (employeeId?: string) => ['chat', 'messages', employeeId] as const,
  },
};
