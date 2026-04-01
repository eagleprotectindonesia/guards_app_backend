import {
  buildOfficeAttendanceDisplayRows,
  paginateOfficeAttendanceDisplayRows,
} from '../app/admin/(authenticated)/attendance/office/office-attendance-display';
import { SerializedOfficeAttendanceWithRelationsDto } from '../types/attendance';

function buildAttendance(
  overrides: Partial<SerializedOfficeAttendanceWithRelationsDto>
): SerializedOfficeAttendanceWithRelationsDto {
  return {
    id: overrides.id ?? 'attendance-1',
    recordedAt: overrides.recordedAt ?? '2026-03-28T00:00:00.000Z',
    status: overrides.status ?? 'present',
    employeeId: overrides.employeeId ?? 'employee-1',
    officeId: overrides.officeId ?? 'office-1',
    metadata: overrides.metadata ?? null,
    office: overrides.office ?? { id: 'office-1', name: 'HQ' },
    employee:
      overrides.employee ?? {
        id: 'employee-1',
        fullName: 'Jane Doe',
        employeeNumber: 'EMP-1',
      },
  };
}

describe('office attendance admin display', () => {
  test('groups present and clocked_out rows into one unified display row', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'in-1',
          recordedAt: '2026-03-28T00:05:00.000Z',
          status: 'present',
        }),
        buildAttendance({
          id: 'out-1',
          recordedAt: '2026-03-28T09:10:00.000Z',
          status: 'clocked_out',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
        }),
      ],
      async () => 8 * 60
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'in-1',
      clockInAt: '2026-03-28T00:05:00.000Z',
      clockOutAt: '2026-03-28T09:10:00.000Z',
      paidHours: '8 hrs 0 mins',
      displayStatus: 'completed',
      businessDate: '2026-03-28',
    });
  });

  test('keeps a present row open when no clocked_out exists', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'in-open',
          recordedAt: '2026-03-28T01:00:00.000Z',
          status: 'present',
        }),
      ],
      async () => 8 * 60
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'in-open',
      clockOutAt: null,
      paidHours: null,
      displayStatus: 'clocked_in',
    });
  });

  test('preserves lateness metadata in the unified row', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'late-in',
          recordedAt: '2026-03-28T01:25:00.000Z',
          status: 'present',
          metadata: { latenessMins: 25 },
        }),
        buildAttendance({
          id: 'late-out',
          recordedAt: '2026-03-28T09:00:00.000Z',
          status: 'clocked_out',
        }),
      ],
      async () => 8 * 60
    );

    expect(rows[0]).toMatchObject({
      latenessMins: 25,
      paidHours: '6 hrs 35 mins',
      displayStatus: 'late',
    });
  });

  test('caps paid hours at the scheduled duration when a session runs long', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'long-in',
          recordedAt: '2026-03-28T00:05:00.000Z',
          status: 'present',
        }),
        buildAttendance({
          id: 'long-out',
          recordedAt: '2026-03-28T11:30:00.000Z',
          status: 'clocked_out',
        }),
      ],
      async () => 8 * 60
    );

    expect(rows[0]).toMatchObject({
      paidHours: '8 hrs 0 mins',
    });
  });

  test('does not subtract break when a completed session is exactly one hour', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'exact-hour-in',
          recordedAt: '2026-03-28T08:00:00.000Z',
          status: 'present',
        }),
        buildAttendance({
          id: 'exact-hour-out',
          recordedAt: '2026-03-28T09:00:00.000Z',
          status: 'clocked_out',
        }),
      ],
      async () => 8 * 60
    );

    expect(rows[0]).toMatchObject({
      paidHours: '1 hrs 0 mins',
    });
  });

  test('does not subtract break when a completed session is shorter than one hour', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'short-in',
          recordedAt: '2026-03-28T08:00:00.000Z',
          status: 'present',
        }),
        buildAttendance({
          id: 'short-out',
          recordedAt: '2026-03-28T08:45:00.000Z',
          status: 'clocked_out',
        }),
      ],
      async () => 8 * 60
    );

    expect(rows[0]).toMatchObject({
      paidHours: '0 hrs 45 mins',
    });
  });

  test('pairs overnight attendance across calendar dates', async () => {
    const rows = await buildOfficeAttendanceDisplayRows(
      [
        buildAttendance({
          id: 'overnight-in',
          recordedAt: '2026-03-28T10:00:00.000Z',
          status: 'present',
        }),
        buildAttendance({
          id: 'overnight-out',
          recordedAt: '2026-03-28T18:30:00.000Z',
          status: 'clocked_out',
        }),
      ],
      async () => 7 * 60
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'overnight-in',
      clockOutAt: '2026-03-28T18:30:00.000Z',
      paidHours: '7 hrs 0 mins',
      businessDate: '2026-03-28',
    });
  });

  test('returns paginated unified rows with capped paid hours ready for rendering', async () => {
    const unifiedRows = paginateOfficeAttendanceDisplayRows(
      await buildOfficeAttendanceDisplayRows(
        [
          buildAttendance({
            id: 'render-in',
            recordedAt: '2026-03-28T00:05:00.000Z',
            status: 'present',
            metadata: { location: { lat: -5.1234, lng: 119.4567 }, latenessMins: 10 },
          }),
          buildAttendance({
            id: 'render-out',
            recordedAt: '2026-03-28T09:00:00.000Z',
            status: 'clocked_out',
            metadata: { location: { lat: -5.2, lng: 119.5 } },
          }),
        ],
        async () => 7 * 60
      ),
      1,
      10
    );

    expect(unifiedRows).toHaveLength(1);
    expect(unifiedRows[0]).toMatchObject({
      businessDate: '2026-03-28',
      clockInAt: '2026-03-28T00:05:00.000Z',
      clockOutAt: '2026-03-28T09:00:00.000Z',
      paidHours: '7 hrs 0 mins',
      latenessMins: 10,
      displayStatus: 'late',
      clockInMetadata: { location: { lat: -5.1234, lng: 119.4567 }, latenessMins: 10 },
      clockOutMetadata: { location: { lat: -5.2, lng: 119.5 } },
    });
  });
});
