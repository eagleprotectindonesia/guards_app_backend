import { findParticipantAvailabilityConflicts } from './calendar-events';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    calendarEvent: {
      findMany: jest.fn(),
    },
  },
}));

const mockedFindMany = prisma.calendarEvent.findMany as jest.Mock;

function mockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    kind: 'meeting',
    title: 'Test Event',
    startDate: new Date('2026-07-10'),
    endDate: new Date('2026-07-10'),
    startTime: null,
    endTime: null,
    allDay: false,
    employeeId: null,
    adminId: null,
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findParticipantAvailabilityConflicts', () => {
  const baseParams = {
    participants: [{ type: 'admin' as const, id: 'admin-1' }],
    fromDate: new Date('2026-07-10'),
    toDate: new Date('2026-07-10'),
    allDay: false,
    startTime: null,
    endTime: null,
  };

  test('returns empty for zero participants', async () => {
    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      participants: [],
    });
    expect(result).toEqual({});
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  test('returns events owned by the participant', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ adminId: 'admin-1' }),
    ]);

    const result = await findParticipantAvailabilityConflicts(baseParams);
    expect(result).toEqual({
      'admin:admin-1': [
        expect.objectContaining({ id: 'event-1', title: 'Test Event', ownerType: 'admin', ownerId: 'admin-1' }),
      ],
    });
  });

  test('excludes events outside the date range', async () => {
    mockedFindMany.mockResolvedValue([]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      fromDate: new Date('2026-07-11'),
      toDate: new Date('2026-07-11'),
    });
    expect(result).toEqual({ 'admin:admin-1': [] });
  });

  test('includes multi-day events spanning the range', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ startDate: new Date('2026-07-08'), endDate: new Date('2026-07-12'), adminId: 'admin-1' }),
    ]);

    const result = await findParticipantAvailabilityConflicts(baseParams);
    expect(result['admin:admin-1']).toHaveLength(1);
    expect(result['admin:admin-1'][0].id).toBe('event-1');
  });

  test('excludes timed event with non-overlapping time', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ startTime: '09:00', endTime: '12:00', adminId: 'admin-1' }),
    ]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      startTime: '14:00',
      endTime: '16:00',
    });
    expect(result['admin:admin-1']).toHaveLength(0);
  });

  test('includes timed event with overlapping time', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ startTime: '10:00', endTime: '15:00', adminId: 'admin-1' }),
    ]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      startTime: '14:00',
      endTime: '16:00',
    });
    expect(result['admin:admin-1']).toHaveLength(1);
  });

  test('flags all-day event when query is timed (any date overlap)', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ allDay: true, startDate: new Date('2026-07-10'), endDate: new Date('2026-07-10'), adminId: 'admin-1' }),
    ]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      startTime: '09:00',
      endTime: '17:00',
    });
    expect(result['admin:admin-1']).toHaveLength(1);
  });

  test('flags timed event when query is all-day (any date overlap)', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ startTime: '09:00', endTime: '17:00', adminId: 'admin-1' }),
    ]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      allDay: true,
      startTime: null,
      endTime: null,
    });
    expect(result['admin:admin-1']).toHaveLength(1);
  });

  test('excludeEventId filters out the event being edited', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ adminId: 'admin-1' }),
    ]);

    await findParticipantAvailabilityConflicts({
      ...baseParams,
      excludeEventId: 'event-1',
    });

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { id: 'event-1' },
          OR: expect.arrayContaining([{ adminId: { in: ['admin-1'] } }]),
        }),
      })
    );
  });

  test('surfaces admin tagged in events owned by other admins', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({
        adminId: 'admin-2',
        tags: [{ id: 'tag-1', participantType: 'admin', employeeId: null, adminId: 'admin-1' }],
      }),
    ]);

    const result = await findParticipantAvailabilityConflicts(baseParams);
    expect(result['admin:admin-1']).toHaveLength(1);
  });

  test('excludes soft-deleted events', async () => {
    mockedFindMany.mockResolvedValue([]);

    const result = await findParticipantAvailabilityConflicts(baseParams);
    expect(result['admin:admin-1']).toEqual([]);
  });

  test('groups conflicts by participant key for multiple participants', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ id: 'ev-1', adminId: 'admin-1', title: 'Admin 1 Event' }),
      mockEvent({ id: 'ev-2', adminId: 'admin-2', title: 'Admin 2 Event' }),
    ]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      participants: [
        { type: 'admin', id: 'admin-1' },
        { type: 'admin', id: 'admin-2' },
      ],
    });
    expect(result['admin:admin-1']).toHaveLength(1);
    expect(result['admin:admin-2']).toHaveLength(1);
  });

  test('employee participant matches by employeeId and tags', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({ id: 'ev-emp', employeeId: 'emp-1', title: 'Emp Owned' }),
      mockEvent({
        id: 'ev-tagged',
        adminId: 'admin-1',
        tags: [{ id: 'tag-2', participantType: 'employee', employeeId: 'emp-1', adminId: null }],
        title: 'Emp Tagged',
      }),
    ]);

    const result = await findParticipantAvailabilityConflicts({
      ...baseParams,
      participants: [{ type: 'employee', id: 'emp-1' }],
      fromDate: new Date('2026-07-10'),
      toDate: new Date('2026-07-10'),
      allDay: true,
    });
    expect(result['employee:emp-1']).toHaveLength(2);
  });

  test('no duplicate conflicts when participant is both owner and tagged', async () => {
    mockedFindMany.mockResolvedValue([
      mockEvent({
        adminId: 'admin-1',
        tags: [{ id: 'tag-3', participantType: 'admin', employeeId: null, adminId: 'admin-1' }],
      }),
    ]);

    const result = await findParticipantAvailabilityConflicts(baseParams);
    expect(result['admin:admin-1']).toHaveLength(1);
  });
});
