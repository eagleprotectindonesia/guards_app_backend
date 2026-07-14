import { GET } from '../../app/api/employee/my/calendar/route';
import { NextResponse } from 'next/server';

const mockGetAuthenticatedEmployee = jest.fn();
const mockEventFindMany = jest.fn();
const mockListCalendarEventsForDepartmentMembers = jest.fn();

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  prisma: {
    holidayCalendarEntry: { findMany: jest.fn() },
    officeMemo: { findMany: jest.fn() },
    employeeLeaveRequest: { findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
  },
  listCalendarEventsForDepartmentMembers: jest.fn(),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
      })),
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();

  const auth = jest.requireMock('@/lib/employee-auth');
  auth.getAuthenticatedEmployee = mockGetAuthenticatedEmployee;

  const db = jest.requireMock('@repo/database');
  db.prisma.holidayCalendarEntry.findMany = jest.fn();
  db.prisma.officeMemo.findMany = jest.fn();
  db.prisma.employeeLeaveRequest.findMany = jest.fn();
  db.prisma.calendarEvent.findMany = mockEventFindMany;
  db.listCalendarEventsForDepartmentMembers = mockListCalendarEventsForDepartmentMembers;
});

function makeCalendarEvent(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'event-1',
    employeeId: null,
    adminId: 'admin-1',
    kind: 'meeting',
    title: 'Test Event',
    description: null,
    startDate: new Date('2026-07-14T00:00:00Z'),
    endDate: new Date('2026-07-14T00:00:00Z'),
    startTime: null,
    endTime: null,
    allDay: true,
    location: null,
    latitude: null,
    longitude: null,
    clientName: null,
    trainerName: null,
    priority: 'normal',
    reminderMinutesBefore: null,
    reminderScheduledAt: null,
    reminderSentAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    taggedDepartmentNames: [],
    employee: null,
    admin: { id: 'admin-1', name: 'Test Admin' },
    tags: [],
  };
  return { ...base, ...overrides };
}

function mockRequest(searchParams: string): Request {
  return { url: `http://localhost:3000/api/employee/my/calendar?${searchParams}` } as Request;
}

describe('Employee Calendar Aggregation', () => {
  describe('timezone handling', () => {
    test('returns local-timezone date (not UTC) for a department-tagged event', async () => {
      mockGetAuthenticatedEmployee.mockResolvedValue({ id: 'emp-1', department: 'Security', fullName: 'Test Employee' });
      mockEventFindMany.mockResolvedValue([]);
      mockListCalendarEventsForDepartmentMembers.mockResolvedValue([
        makeCalendarEvent({
          id: 'dept-event-1',
          startDate: new Date('2026-07-14T00:00:00Z'),
          endDate: new Date('2026-07-14T00:00:00Z'),
          startTime: '08:00',
          endTime: '09:00',
          allDay: false,
          taggedDepartmentNames: ['Security'],
        }),
      ]);

      const req = mockRequest('from=2026-07-14&to=2026-07-14&showSystemItems=false');
      const response = await GET(req);
      const body = await response.json();

      expect(body.items).toHaveLength(1);
      expect(body.items[0].originalId).toBe('dept-event-1');

      // Should be local date (2026-07-14), NOT UTC (2026-07-13)
      expect(body.items[0].date).toBe('2026-07-14');
      expect(body.items[0].startsAt).toBe('2026-07-14T08:00:00');
      expect(body.items[0].endsAt).toBe('2026-07-14T09:00:00');
    });

    test('returns local-timezone date for a multi-day event spanning 3 days', async () => {
      mockGetAuthenticatedEmployee.mockResolvedValue({ id: 'emp-1', department: 'Security', fullName: 'Test Employee' });
      mockEventFindMany.mockResolvedValue([]);
      mockListCalendarEventsForDepartmentMembers.mockResolvedValue([
        makeCalendarEvent({
          id: 'multi-day-1',
          startDate: new Date('2026-07-13T00:00:00Z'),
          endDate: new Date('2026-07-15T00:00:00Z'),
          allDay: true,
          taggedDepartmentNames: ['Security'],
        }),
      ]);

      const req = mockRequest('from=2026-07-13&to=2026-07-15&showSystemItems=false');
      const response = await GET(req);
      const body = await response.json();

      expect(body.items).toHaveLength(3);
      const dates = body.items.map((i: { date: string }) => i.date).sort();
      expect(dates).toEqual(['2026-07-13', '2026-07-14', '2026-07-15']);
    });

    test('deduplicates events that appear in both own-events and department-events', async () => {
      mockGetAuthenticatedEmployee.mockResolvedValue({ id: 'emp-1', department: 'IT', fullName: 'Test Employee' });

      const sharedEvent = makeCalendarEvent({
        id: 'shared-1',
        employeeId: 'emp-1',
        startDate: new Date('2026-07-14T00:00:00Z'),
        endDate: new Date('2026-07-14T00:00:00Z'),
        allDay: true,
        taggedDepartmentNames: ['IT'],
      });
      mockEventFindMany.mockResolvedValue([sharedEvent]);
      mockListCalendarEventsForDepartmentMembers.mockResolvedValue([sharedEvent]);

      const req = mockRequest('from=2026-07-14&to=2026-07-14&showSystemItems=false');
      const response = await GET(req);
      const body = await response.json();

      expect(body.items).toHaveLength(1);
    });

    test('excludes events that are before the query range (Prisma DATE boundary)', async () => {
      mockGetAuthenticatedEmployee.mockResolvedValue({ id: 'emp-1', department: 'Security', fullName: 'Test Employee' });
      mockEventFindMany.mockResolvedValue([]);
      mockListCalendarEventsForDepartmentMembers.mockResolvedValue([
        makeCalendarEvent({
          id: 'prev-day-event',
          startDate: new Date('2026-07-16T00:00:00Z'),
          endDate: new Date('2026-07-16T00:00:00Z'),
          taggedDepartmentNames: ['Security'],
        }),
      ]);

      // Query for July 17 — the July 16 event should be excluded by expandToDays
      const req = mockRequest('from=2026-07-17&to=2026-07-17&showSystemItems=false');
      const response = await GET(req);
      const body = await response.json();

      expect(body.items).toHaveLength(0);
    });
  });

  describe('permissions for department-tagged events', () => {
    test('returns 401 when employee is not authenticated', async () => {
      mockGetAuthenticatedEmployee.mockResolvedValue(null);

      const req = mockRequest('from=2026-07-14&to=2026-07-14&showSystemItems=false');
      const response = await GET(req);

      expect(response.status).toBe(401);
    });

    test('does not call department query when employee has no department', async () => {
      mockGetAuthenticatedEmployee.mockResolvedValue({ id: 'emp-1', department: null, fullName: 'Test Employee' });
      mockEventFindMany.mockResolvedValue([]);

      const req = mockRequest('from=2026-07-14&to=2026-07-14&showSystemItems=false');
      await GET(req);

      expect(mockListCalendarEventsForDepartmentMembers).not.toHaveBeenCalled();
    });
  });
});
