import {
  buildPairedSessionContextMap,
  toDisplayRowsFromPairedSessions,
} from '../app/admin/(authenticated)/attendance/office/office-attendance-display';
import type { OfficeAttendanceSessionRow } from '@repo/database';

function makePairSession(overrides: Partial<OfficeAttendanceSessionRow> = {}): OfficeAttendanceSessionRow {
  return {
    sessionId: 'pair-1',
    sessionType: 'pair',
    employeeId: 'employee-1',
    officeId: 'office-1',
    businessDate: '2026-04-01',
    clockIn: {
      id: 'in-1',
      recordedAt: new Date('2026-04-01T01:00:00.000Z'),
      metadata: { latenessMins: 0 } as never,
      picture: null,
      officeShiftId: null,
    },
    clockOut: {
      id: 'out-1',
      recordedAt: new Date('2026-04-01T09:00:00.000Z'),
      metadata: null,
    },
    standaloneStatus: null,
    standaloneRecordedAt: null,
    standaloneMetadata: null,
    employee: { id: 'employee-1', fullName: 'Jane Doe', employeeNumber: 'EMP-1' },
    office: { id: 'office-1', name: 'HQ' },
    officeShift: null,
    ...overrides,
  };
}

function makeOpenSession(overrides: Partial<OfficeAttendanceSessionRow> = {}): OfficeAttendanceSessionRow {
  return makePairSession({
    sessionId: 'open-1',
    sessionType: 'open',
    clockOut: null,
    ...overrides,
  });
}

function makeAbsentSession(overrides: Partial<OfficeAttendanceSessionRow> = {}): OfficeAttendanceSessionRow {
  return {
    sessionId: 'absent-1',
    sessionType: 'absent',
    employeeId: 'employee-1',
    officeId: 'office-1',
    businessDate: '2026-04-01',
    clockIn: null,
    clockOut: null,
    standaloneStatus: 'absent',
    standaloneRecordedAt: new Date('2026-04-01T00:00:00.000Z'),
    standaloneMetadata: null,
    employee: { id: 'employee-1', fullName: 'Jane Doe', employeeNumber: 'EMP-1' },
    office: { id: 'office-1', name: 'HQ' },
    officeShift: null,
    ...overrides,
  };
}

describe('toDisplayRowsFromPairedSessions', () => {
  test('caps paid hours at the scheduled minutes for completed sessions', () => {
    const session = makePairSession();
    const contextMap = new Map<string, { context: { windowEnd: null }; scheduledPaidMinutes: number }>();
    contextMap.set('employee-1|2026-04-01', { context: { windowEnd: null }, scheduledPaidMinutes: 7 * 60 });

    const rows = toDisplayRowsFromPairedSessions({
      sessions: [session],
      contextMap,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'in-1',
      clockInAt: '2026-04-01T01:00:00.000Z',
      clockOutAt: '2026-04-01T09:00:00.000Z',
      paidHours: '7 hrs 0 mins',
      displayStatus: 'completed',
      businessDate: '2026-04-01',
    });
  });

  test('marks lateness correctly when metadata reports late clock-in', () => {
    const session = makePairSession({
      clockIn: {
        id: 'in-1',
        recordedAt: new Date('2026-04-01T01:30:00.000Z'),
        metadata: { latenessMins: 30 } as never,
        picture: null,
        officeShiftId: null,
      },
    });
    const contextMap = new Map<string, { context: { windowEnd: null }; scheduledPaidMinutes: number }>();
    contextMap.set('employee-1|2026-04-01', { context: { windowEnd: null }, scheduledPaidMinutes: 8 * 60 });

    const rows = toDisplayRowsFromPairedSessions({
      sessions: [session],
      contextMap,
    });

    expect(rows[0]).toMatchObject({
      latenessMins: 30,
      displayStatus: 'late',
    });
  });

  test('keeps open sessions unpaid when the cached context has no windowEnd', () => {
    const session = makeOpenSession();
    const contextMap = new Map<string, { context: { windowEnd: null }; scheduledPaidMinutes: number }>();
    contextMap.set('employee-1|2026-04-01', { context: { windowEnd: null }, scheduledPaidMinutes: 480 });

    const rows = toDisplayRowsFromPairedSessions({
      sessions: [session],
      contextMap,
      now: new Date('2026-04-02T01:00:00.000Z'),
    });

    expect(rows[0]).toMatchObject({
      id: 'in-1',
      clockOutAt: null,
      paidHours: null,
      displayStatus: 'clocked_in',
    });
  });

  test('emits absent rows with minimal details', () => {
    const session = makeAbsentSession();
    const contextMap = new Map<string, { context: { windowEnd: null }; scheduledPaidMinutes: number }>();

    const rows = toDisplayRowsFromPairedSessions({
      sessions: [session],
      contextMap,
    });

    expect(rows[0]).toMatchObject({
      id: 'absent-1',
      displayStatus: 'absent',
      businessDate: '2026-04-01',
      paidHours: null,
      clockOutAt: null,
      clockInPicture: null,
    });
  });

  test('preserves the input order (sorting is the SQL query\'s responsibility)', () => {
    const older = makePairSession({
      sessionId: 'old',
      clockIn: {
        id: 'old-in',
        recordedAt: new Date('2026-04-01T01:00:00.000Z'),
        metadata: null,
        picture: null,
        officeShiftId: null,
      },
      clockOut: {
        id: 'old-out',
        recordedAt: new Date('2026-04-01T09:00:00.000Z'),
        metadata: null,
      },
    });
    const newer = makePairSession({
      sessionId: 'new',
      clockIn: {
        id: 'new-in',
        recordedAt: new Date('2026-04-02T01:00:00.000Z'),
        metadata: null,
        picture: null,
        officeShiftId: null,
      },
      clockOut: {
        id: 'new-out',
        recordedAt: new Date('2026-04-02T09:00:00.000Z'),
        metadata: null,
      },
    });
    const contextMap = new Map<string, { context: { windowEnd: null }; scheduledPaidMinutes: number }>();
    contextMap.set('employee-1|2026-04-01', { context: { windowEnd: null }, scheduledPaidMinutes: 480 });
    contextMap.set('employee-1|2026-04-02', { context: { windowEnd: null }, scheduledPaidMinutes: 480 });

    const rows = toDisplayRowsFromPairedSessions({
      sessions: [older, newer],
      contextMap,
    });

    expect(rows.map(r => r.id)).toEqual(['old-in', 'new-in']);
  });
});

describe('buildPairedSessionContextMap', () => {
  test('deduplicates context lookups by (employeeId, businessDate)', async () => {
    const session1 = makePairSession();
    const session2 = makePairSession({
      sessionId: 'pair-2',
      clockIn: {
        id: 'in-2',
        recordedAt: new Date('2026-04-01T03:00:00.000Z'),
        metadata: null,
        picture: null,
        officeShiftId: null,
      },
    });
    const resolveContext = jest.fn().mockResolvedValue({ windowEnd: null });
    const getScheduledPaidMinutes = jest.fn().mockResolvedValue(480);

    const map = await buildPairedSessionContextMap({
      sessions: [session1, session2],
      resolveContext: resolveContext as never,
      getScheduledPaidMinutes: getScheduledPaidMinutes as never,
    });

    expect(resolveContext).toHaveBeenCalledTimes(1);
    expect(getScheduledPaidMinutes).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(1);
    expect(map.get('employee-1|2026-04-01')).toEqual({
      context: { windowEnd: null },
      scheduledPaidMinutes: 480,
    });
  });

  test('skips standalone sessions that do not need context resolution', async () => {
    const resolveContext = jest.fn();
    const getScheduledPaidMinutes = jest.fn();

    const map = await buildPairedSessionContextMap({
      sessions: [makeAbsentSession()],
      resolveContext: resolveContext as never,
      getScheduledPaidMinutes: getScheduledPaidMinutes as never,
    });

    expect(map.size).toBe(0);
    expect(resolveContext).not.toHaveBeenCalled();
    expect(getScheduledPaidMinutes).not.toHaveBeenCalled();
  });
});
