import { db as prisma } from '../prisma/client';
import { Prisma, OfficeAttendanceStatus, AttendanceStatus, ShiftStatus } from '@prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';
import { resolveOfficeAttendanceContextForEmployee } from './office-attendance-context';
import { getSystemSetting } from './settings';
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING } from '@repo/shared';
import { getOfficeDayOverrideAnchorDates, resolveOfficeDayOverrideAnchorsForEmployee } from './office-day-overrides';
import { redis } from '../redis/client';

const ONSITE_ATTENDED_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.present,
  AttendanceStatus.late,
  AttendanceStatus.clocked_out,
];

const OFFICE_ATTENDED_STATUSES: OfficeAttendanceStatus[] = [
  OfficeAttendanceStatus.present,
  OfficeAttendanceStatus.late,
  OfficeAttendanceStatus.clocked_out,
];

export async function getOfficeAttendanceById(id: string) {
  return prisma.officeAttendance.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          fullName: true,
          phone: true,
          employeeNumber: true,
        },
      },
      office: {
        select: {
          name: true,
          address: true,
        },
      },
      officeShift: {
        include: {
          officeShiftType: true,
        },
      },
    },
  });
}

export async function recordOfficeAttendance(params: {
  officeId?: string | null;
  officeShiftId?: string | null;
  employeeId: string;
  status: OfficeAttendanceStatus;
  picture?: string;
  metadata?: any;
  recordedAt?: Date;
  businessDate?: Date;
}) {
  const { officeId, officeShiftId, employeeId, status, picture, metadata, recordedAt, businessDate } = params;
  const normalizedRecordedAt = recordedAt || new Date();

  try {
    const attendance = await prisma.officeAttendance.create({
      data: {
        officeId,
        officeShiftId,
        employeeId,
        businessDate,
        recordedAt: normalizedRecordedAt,
        status,
        picture,
        metadata,
      },
    });

    return { attendance, created: true as const };
  } catch (error) {
    if (officeShiftId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existingAttendance = await prisma.officeAttendance.findFirst({
        where: {
          officeShiftId,
          status,
        },
        orderBy: {
          recordedAt: 'asc',
        },
      });

      if (existingAttendance) {
        return { attendance: existingAttendance, created: false as const };
      }
    }

    throw error;
  }
}

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function dateToDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function listDateKeysInclusive(startDateKey: string, endDateKey: string) {
  const keys: string[] = [];
  const cursor = dateKeyToDate(startDateKey);
  const end = dateKeyToDate(endDateKey);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(dateToDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export async function ensureNoOfficeAttendanceConflictForLeaveRange(
  employeeId: string,
  startDateKey: string,
  endDateKey: string
) {
  const dateKeys = listDateKeysInclusive(startDateKey, endDateKey);
  const conflicts = await prisma.officeAttendance.findMany({
    where: {
      employeeId,
      status: { in: ['present', 'late', 'clocked_out'] },
      businessDate: {
        gte: dateKeyToDate(startDateKey),
        lte: dateKeyToDate(endDateKey),
      },
    },
    select: { businessDate: true, recordedAt: true },
  });

  if (conflicts.length === 0) return;

  const conflictDays = new Set(conflicts.map(item => dateToDateKey(item.businessDate ?? item.recordedAt)));
  const overlapping = dateKeys.filter(key => conflictDays.has(key));
  if (overlapping.length > 0) {
    throw new Error(`Cannot process leave: office attendance already exists for ${overlapping.join(', ')}`);
  }
}

export async function upsertOfficeLeaveStatusesForDateKeys(
  params: {
    employeeId: string;
    dateKeys: string[];
    status: 'pending_leave' | 'leave';
    note: string;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  for (const dateKey of params.dateKeys) {
    const recordedAt = dateKeyToDate(dateKey);
    const existing = await tx.officeAttendance.findMany({
      where: {
        employeeId: params.employeeId,
        businessDate: recordedAt,
        status: { in: ['pending_leave', 'leave', 'absent'] },
      },
      orderBy: { recordedAt: 'asc' },
    });

    if (existing.length > 0) {
      await tx.officeAttendance.update({
        where: { id: existing[0].id },
        data: {
          status: params.status,
          metadata: { note: params.note },
        },
      });
      if (existing.length > 1) {
        await tx.officeAttendance.deleteMany({
          where: {
            id: { in: existing.slice(1).map(row => row.id) },
          },
        });
      }
      continue;
    }

    await tx.officeAttendance.create({
      data: {
        employeeId: params.employeeId,
        businessDate: recordedAt,
        recordedAt,
        status: params.status,
        metadata: { note: params.note },
      },
    });
  }
}

export async function resolveRejectedPendingLeaveStatuses(
  params: {
    employeeId: string;
    dateKeys: string[];
    now?: Date;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  await resolvePendingLeaveStatusesByAction(
    {
      employeeId: params.employeeId,
      dateKeys: params.dateKeys,
      now: params.now,
      absentNote: 'Rejected leave converted to absent',
    },
    tx
  );
}

export async function resolveCancelledPendingLeaveStatuses(
  params: {
    employeeId: string;
    dateKeys: string[];
    now?: Date;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  await resolvePendingLeaveStatusesByAction(
    {
      employeeId: params.employeeId,
      dateKeys: params.dateKeys,
      now: params.now,
      absentNote: 'Cancelled leave converted to absent',
    },
    tx
  );
}

async function resolvePendingLeaveStatusesByAction(
  params: {
    employeeId: string;
    dateKeys: string[];
    now?: Date;
    absentNote: string;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const now = params.now ?? new Date();
  const todayDateKey = getBusinessDayRange(now, BUSINESS_TIMEZONE).dateKey;
  const todayContext = params.dateKeys.includes(todayDateKey)
    ? await resolveOfficeAttendanceContextForEmployee(params.employeeId, now)
    : null;
  for (const dateKey of params.dateKeys) {
    const rows = await tx.officeAttendance.findMany({
      where: {
        employeeId: params.employeeId,
        businessDate: dateKeyToDate(dateKey),
        status: 'pending_leave',
      },
      orderBy: { recordedAt: 'asc' },
    });
    if (rows.length === 0) continue;
    const shouldConvertToAbsent =
      dateKey < todayDateKey || (dateKey === todayDateKey && Boolean(todayContext?.isAfterEnd));
    if (shouldConvertToAbsent) {
      await tx.officeAttendance.update({
        where: { id: rows[0].id },
        data: { status: 'absent', metadata: { note: params.absentNote } },
      });
      if (rows.length > 1) {
        await tx.officeAttendance.deleteMany({
          where: {
            id: { in: rows.slice(1).map(row => row.id) },
          },
        });
      }
    } else {
      await tx.officeAttendance.deleteMany({
        where: {
          id: { in: rows.map(row => row.id) },
        },
      });
    }
  }
}

export async function clearPendingOfficeLeaveStatusesForDateKeys(
  params: {
    employeeId: string;
    dateKeys: string[];
    now?: Date;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  await resolveCancelledPendingLeaveStatuses(
    {
      employeeId: params.employeeId,
      dateKeys: params.dateKeys,
      now: params.now,
    },
    tx
  );
}

export async function finalizeOfficeDailyAbsences(now = new Date()) {
  const leaveEffectsSetting = await getSystemSetting(ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING);
  const leaveEffectsEnabled = leaveEffectsSetting?.value === '1';
  const blockingStatuses: OfficeAttendanceStatus[] = leaveEffectsEnabled
    ? ['present', 'late', 'clocked_out', 'pending_leave', 'leave', 'absent']
    : ['present', 'late', 'clocked_out', 'absent'];

  const employees = await prisma.employee.findMany({
    where: { role: 'office', status: true, deletedAt: null },
    select: { id: true },
  });

  let created = 0;
  for (const employee of employees) {
    const context = await resolveOfficeAttendanceContextForEmployee(employee.id, now);
    const anchorDates = getOfficeDayOverrideAnchorDates(now);
    let dateKey: string | null = null;

    if (context.isWorkingDay && context.isAfterEnd && context.businessDay?.dateKey) {
      dateKey = context.businessDay.dateKey;
    } else {
      const overrideAnchors = await resolveOfficeDayOverrideAnchorsForEmployee(employee.id, now);
      if (overrideAnchors.currentOverride?.overrideType !== 'shift_override') continue;

      const endedShift = await prisma.officeShift.findFirst({
        where: {
          employeeId: employee.id,
          deletedAt: null,
          status: {
            not: 'cancelled',
          },
          date: dateKeyToDate(anchorDates.currentDateKey),
          endsAt: {
            lte: now,
          },
        },
        select: {
          id: true,
        },
        orderBy: {
          endsAt: 'desc',
        },
      });
      if (!endedShift) continue;
      dateKey = anchorDates.currentDateKey;
    }

    if (!dateKey) continue;
    const businessDate = dateKeyToDate(dateKey);
    const hasBlocking = await prisma.officeAttendance.findFirst({
      where: {
        employeeId: employee.id,
        businessDate,
        status: { in: blockingStatuses },
      },
      select: { id: true },
    });
    if (hasBlocking) continue;

    const approvedLeave = await prisma.employeeLeaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: 'approved',
        startDate: {
          lte: businessDate,
        },
        endDate: {
          gte: businessDate,
        },
      },
      select: {
        id: true,
      },
    });
    if (approvedLeave) continue;

    await prisma.officeAttendance.create({
      data: {
        employeeId: employee.id,
        businessDate,
        recordedAt: businessDate,
        status: 'absent',
        metadata: { note: 'Auto finalized absent (worker)' },
      },
    });
    created += 1;
  }

  return { created };
}

export async function getTodayOfficeAttendance(employeeId: string, now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const { dateKey } = getBusinessDayRange(now, timeZone);
  const businessDate = dateKeyToDate(dateKey);

  return prisma.officeAttendance.findMany({
    where: {
      employeeId,
      businessDate,
    },
    include: {
      office: true,
      officeShift: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getLatestOfficeAttendanceForDay(
  employeeId: string,
  now = new Date(),
  timeZone = BUSINESS_TIMEZONE
) {
  const { dateKey } = getBusinessDayRange(now, timeZone);
  const businessDate = dateKeyToDate(dateKey);

  return prisma.officeAttendance.findFirst({
    where: {
      employeeId,
      businessDate,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getLatestOfficeAttendanceForEmployee(employeeId: string) {
  return prisma.officeAttendance.findFirst({
    where: {
      employeeId,
    },
    include: {
      office: true,
      officeShift: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getLatestOfficeAttendanceInRange(employeeId: string, start: Date, end: Date) {
  return prisma.officeAttendance.findFirst({
    where: {
      employeeId,
      recordedAt: {
        gte: start,
        lt: end,
      },
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getOfficeAttendanceInRange(employeeId: string, start: Date, end: Date) {
  return prisma.officeAttendance.findMany({
    where: {
      employeeId,
      recordedAt: {
        gte: start,
        lt: end,
      },
    },
    include: {
      office: true,
      officeShift: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getPaginatedOfficeAttendance(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: Prisma.OfficeAttendanceOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [attendances, totalCount] = await prisma.$transaction(async tx => {
    const attendances = await tx.officeAttendance.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        employee: true,
        office: true,
        officeShift: true,
      },
    });
    const totalCount = await tx.officeAttendance.count({ where });
    return [attendances, totalCount] as const;
  });

  return { attendances, totalCount };
}

export async function listOfficeAttendance(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: Prisma.OfficeAttendanceOrderByWithRelationInput;
}) {
  const { where, orderBy } = params;

  return prisma.officeAttendance.findMany({
    where,
    orderBy,
    include: {
      employee: true,
      office: true,
      officeShift: true,
    },
  });
}

export type OfficeAttendanceSessionRow = {
  sessionId: string;
  sessionType: 'pair' | 'open' | 'absent' | 'leave' | 'pending_leave';
  employeeId: string;
  officeId: string | null;
  businessDate: string | null;
  clockIn: {
    id: string;
    recordedAt: Date;
    metadata: OfficeAttendanceMetadataJson | null;
    picture: string | null;
    officeShiftId: string | null;
  } | null;
  clockOut: {
    id: string;
    recordedAt: Date;
    metadata: OfficeAttendanceMetadataJson | null;
  } | null;
  standaloneStatus: 'absent' | 'leave' | 'pending_leave' | null;
  standaloneRecordedAt: Date | null;
  standaloneMetadata: OfficeAttendanceMetadataJson | null;
  employee: {
    id: string;
    fullName: string;
    employeeNumber: string | null;
  } | null;
  office: {
    id: string;
    name: string;
  } | null;
  officeShift: {
    id: string;
    officeShiftType: {
      name: string;
      startTime: string;
      endTime: string;
    } | null;
    lastUpdatedBy: {
      name: string;
    } | null;
  } | null;
};

type OfficeAttendanceMetadataJson = Prisma.JsonValue | null;

const PAIR_SORT_MAP: Record<string, Prisma.Sql> = {
  businessDate: Prisma.sql`s.business_date ASC, s.clock_in_at ASC, s.clock_in_id ASC`,
  businessDateDesc: Prisma.sql`s.business_date DESC, s.clock_in_at DESC, s.clock_in_id DESC`,
  employeeNumber: Prisma.sql`e.employee_number ASC, s.clock_in_at ASC, s.clock_in_id ASC`,
  employeeNumberDesc: Prisma.sql`e.employee_number DESC, s.clock_in_at DESC, s.clock_in_id DESC`,
  office: Prisma.sql`o.name ASC, s.clock_in_at ASC, s.clock_in_id ASC`,
  officeDesc: Prisma.sql`o.name DESC, s.clock_in_at DESC, s.clock_in_id DESC`,
};

function buildPairedSessionsWhereFragment(where: Prisma.OfficeAttendanceWhereInput): {
  whereSql: Prisma.Sql;
  businessDateFilter: Prisma.Sql;
} {
  const conditions: Prisma.Sql[] = [];
  let businessDateGte: Date | null = null;
  let businessDateLte: Date | null = null;

  const businessDateFilter = where.businessDate;
  if (businessDateFilter && typeof businessDateFilter === 'object' && !(businessDateFilter instanceof Date)) {
    if (businessDateFilter.gte instanceof Date) {
      businessDateGte = businessDateFilter.gte;
      conditions.push(Prisma.sql`s.business_date >= ${businessDateFilter.gte}::date`);
    }
    if (businessDateFilter.lte instanceof Date) {
      businessDateLte = businessDateFilter.lte;
      conditions.push(Prisma.sql`s.business_date <= ${businessDateFilter.lte}::date`);
    }
  }

  if (where.employee && typeof where.employee === 'object' && 'employeeNumber' in where.employee) {
    conditions.push(Prisma.sql`e.employee_number = ${where.employee.employeeNumber}`);
  }

  const whereSql =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.sql``;

  const cteConditions: Prisma.Sql[] = [];
  if (businessDateGte) {
    cteConditions.push(Prisma.sql`oa.business_date >= ${businessDateGte}::date`);
  }
  if (businessDateLte) {
    cteConditions.push(Prisma.sql`oa.business_date <= ${businessDateLte}::date`);
  }
  const businessDateRange =
    cteConditions.length > 0
      ? Prisma.sql`AND ${Prisma.join(cteConditions, ' AND ')}`
      : Prisma.sql``;

  return { whereSql, businessDateFilter: businessDateRange };
}

export async function getPairedOfficeAttendanceSessions(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: 'businessDate' | 'employeeNumber' | 'office';
  orderDirection: 'asc' | 'desc';
  skip: number;
  take: number;
}): Promise<{ sessions: OfficeAttendanceSessionRow[]; total: number }> {
  const { where, orderBy, orderDirection, skip, take } = params;

  const sortKey = `${orderBy}${orderDirection === 'desc' ? 'Desc' : ''}`;
  const orderBySql = PAIR_SORT_MAP[sortKey] ?? PAIR_SORT_MAP.businessDate;
  const { whereSql, businessDateFilter } = buildPairedSessionsWhereFragment(where);

  const rows = await prisma.$queryRaw<Array<RawPairedSessionRow>>(Prisma.sql`
    WITH clock_ins AS (
      SELECT
        oa.id,
        oa.employee_id,
        oa.office_id,
        oa.business_date,
        oa.recorded_at,
        oa.metadata,
        oa.picture,
        oa.status,
        oa.office_shift_id,
        ROW_NUMBER() OVER (
          PARTITION BY oa.employee_id
          ORDER BY oa.recorded_at ASC, oa.id ASC
        ) AS rn
      FROM office_attendance oa
      WHERE oa.status IN ('present', 'late') ${businessDateFilter}
    ),
    clock_outs AS (
      SELECT
        oa.id,
        oa.employee_id,
        oa.recorded_at,
        oa.metadata,
        ROW_NUMBER() OVER (
          PARTITION BY oa.employee_id
          ORDER BY oa.recorded_at ASC, oa.id ASC
        ) AS rn
      FROM office_attendance oa
      WHERE oa.status = 'clocked_out' ${businessDateFilter}
    ),
    paired AS (
      SELECT
        ci.id AS clock_in_id,
        co.id AS clock_out_id,
        ci.employee_id,
        ci.office_id,
        ci.business_date,
        ci.recorded_at AS clock_in_at,
        co.recorded_at AS clock_out_at,
        ci.metadata AS clock_in_metadata,
        co.metadata AS clock_out_metadata,
        ci.picture AS clock_in_picture,
        ci.office_shift_id,
        'pair'::text AS session_type
      FROM clock_ins ci
      INNER JOIN clock_outs co
        ON co.employee_id = ci.employee_id
        AND co.rn = ci.rn
    ),
    open_sessions AS (
      SELECT
        ci.id AS clock_in_id,
        NULL::text AS clock_out_id,
        ci.employee_id,
        ci.office_id,
        ci.business_date,
        ci.recorded_at AS clock_in_at,
        NULL::timestamptz AS clock_out_at,
        ci.metadata AS clock_in_metadata,
        NULL::jsonb AS clock_out_metadata,
        ci.picture AS clock_in_picture,
        ci.office_shift_id,
        'open'::text AS session_type
      FROM clock_ins ci
      WHERE NOT EXISTS (
        SELECT 1 FROM clock_outs co
        WHERE co.employee_id = ci.employee_id AND co.rn = ci.rn
      )
    ),
    standalone AS (
      SELECT
        oa.id AS clock_in_id,
        NULL::text AS clock_out_id,
        oa.employee_id,
        oa.office_id,
        oa.business_date,
        oa.recorded_at AS clock_in_at,
        NULL::timestamptz AS clock_out_at,
        NULL::jsonb AS clock_in_metadata,
        NULL::jsonb AS clock_out_metadata,
        NULL::text AS clock_in_picture,
        oa.office_shift_id,
        oa.status::text AS session_type
      FROM office_attendance oa
      WHERE oa.status IN ('absent', 'leave', 'pending_leave') ${businessDateFilter}
    ),
    sessions AS (
      SELECT * FROM paired
      UNION ALL
      SELECT * FROM open_sessions
      UNION ALL
      SELECT * FROM standalone
    )
    SELECT
      s.clock_in_id,
      s.clock_out_id,
      s.employee_id,
      s.office_id,
      s.business_date,
      s.clock_in_at,
      s.clock_out_at,
      s.clock_in_metadata,
      s.clock_out_metadata,
      s.clock_in_picture,
      s.office_shift_id,
      s.session_type,
      e.id AS emp_id,
      e.full_name AS emp_full_name,
      e.employee_number AS emp_employee_number,
      o.id AS office_id_joined,
      o.name AS office_name,
      os.id AS os_id,
      ost.id AS ost_id,
      ost.name AS ost_name,
      ost.start_time AS ost_start_time,
      ost.end_time AS ost_end_time,
      oslu.id AS oslu_id,
      oslu.name AS oslu_name
    FROM sessions s
    LEFT JOIN employees e ON e.id = s.employee_id
    LEFT JOIN offices o ON o.id = s.office_id
    LEFT JOIN office_shifts os ON os.id = s.office_shift_id AND os.deleted_at IS NULL
    LEFT JOIN office_shift_types ost ON ost.id = os.office_shift_type_id
    LEFT JOIN admins oslu ON oslu.id = os.last_updated_by_id
    ${whereSql}
    ORDER BY ${orderBySql}
    OFFSET ${skip} LIMIT ${take}
  `);

  const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH clock_ins AS (
      SELECT
        oa.id,
        oa.employee_id,
        oa.business_date,
        ROW_NUMBER() OVER (
          PARTITION BY oa.employee_id
          ORDER BY oa.recorded_at ASC, oa.id ASC
        ) AS rn
      FROM office_attendance oa
      WHERE oa.status IN ('present', 'late') ${businessDateFilter}
    ),
    clock_outs AS (
      SELECT
        oa.employee_id,
        ROW_NUMBER() OVER (
          PARTITION BY oa.employee_id
          ORDER BY oa.recorded_at ASC, oa.id ASC
        ) AS rn
      FROM office_attendance oa
      WHERE oa.status = 'clocked_out' ${businessDateFilter}
    ),
    paired AS (
      SELECT ci.id, ci.employee_id, ci.business_date
      FROM clock_ins ci
      INNER JOIN clock_outs co ON co.employee_id = ci.employee_id AND co.rn = ci.rn
    ),
    open_sessions AS (
      SELECT ci.id, ci.employee_id, ci.business_date
      FROM clock_ins ci
      WHERE NOT EXISTS (SELECT 1 FROM clock_outs co WHERE co.employee_id = ci.employee_id AND co.rn = ci.rn)
    ),
    standalone AS (
      SELECT oa.id, oa.employee_id, oa.business_date
      FROM office_attendance oa
      WHERE oa.status IN ('absent', 'leave', 'pending_leave') ${businessDateFilter}
    ),
    sessions AS (
      SELECT * FROM paired
      UNION ALL
      SELECT * FROM open_sessions
      UNION ALL
      SELECT * FROM standalone
    )
    SELECT COUNT(*)::bigint AS count
    FROM sessions s
    LEFT JOIN employees e ON e.id = s.employee_id
    ${whereSql}
  `);

  const total = totalRows.length > 0 ? Number(totalRows[0].count) : 0;
  return { sessions: rows.map(mapRawPairedSession), total };
}

type RawPairedSessionRow = {
  clock_in_id: string;
  clock_out_id: string | null;
  employee_id: string;
  office_id: string | null;
  business_date: Date | null;
  clock_in_at: Date;
  clock_out_at: Date | null;
  clock_in_metadata: Prisma.JsonValue | null;
  clock_out_metadata: Prisma.JsonValue | null;
  clock_in_picture: string | null;
  office_shift_id: string | null;
  session_type: 'pair' | 'open' | 'absent' | 'leave' | 'pending_leave';
  emp_id: string | null;
  emp_full_name: string | null;
  emp_employee_number: string | null;
  office_id_joined: string | null;
  office_name: string | null;
  os_id: string | null;
  ost_id: string | null;
  ost_name: string | null;
  ost_start_time: string | null;
  ost_end_time: string | null;
  oslu_id: string | null;
  oslu_name: string | null;
};

function mapRawPairedSession(row: RawPairedSessionRow): OfficeAttendanceSessionRow {
  const standaloneStatus =
    row.session_type === 'absent' || row.session_type === 'leave' || row.session_type === 'pending_leave'
      ? row.session_type
      : null;

  return {
    sessionId: row.clock_in_id,
    sessionType: row.session_type,
    employeeId: row.employee_id,
    officeId: row.office_id,
    businessDate: row.business_date ? row.business_date.toISOString().slice(0, 10) : null,
    clockIn: row.session_type === 'pair' || row.session_type === 'open'
      ? {
          id: row.clock_in_id,
          recordedAt: row.clock_in_at,
          metadata: row.clock_in_metadata,
          picture: row.clock_in_picture,
          officeShiftId: row.office_shift_id,
        }
      : null,
    clockOut:
      row.session_type === 'pair' && row.clock_out_id
        ? {
            id: row.clock_out_id,
            recordedAt: row.clock_out_at as Date,
            metadata: row.clock_out_metadata,
          }
        : null,
    standaloneStatus,
    standaloneRecordedAt: standaloneStatus ? row.clock_in_at : null,
    standaloneMetadata: standaloneStatus ? row.clock_in_metadata : null,
    employee: row.emp_id
      ? {
          id: row.emp_id,
          fullName: row.emp_full_name ?? '',
          employeeNumber: row.emp_employee_number,
        }
      : null,
    office:
      row.office_id && row.office_id_joined
        ? {
            id: row.office_id_joined,
            name: row.office_name ?? '',
          }
        : null,
    officeShift: row.os_id
      ? {
          id: row.os_id,
          officeShiftType: row.ost_id
            ? {
                name: row.ost_name ?? '',
                startTime: row.ost_start_time ?? '',
                endTime: row.ost_end_time ?? '',
              }
            : null,
          lastUpdatedBy: row.oslu_id ? { name: row.oslu_name ?? '' } : null,
        }
      : null,
  };
}

export async function getOfficeAttendanceExportBatch(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  take: number;
  cursor?: string;
}) {
  const { where, take, cursor } = params;
  return prisma.officeAttendance.findMany({
    take,
    where,
    orderBy: { id: 'asc' },
    include: {
      office: true,
      employee: true,
      officeShift: {
        include: {
          officeShiftType: true,
          lastUpdatedBy: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}

export async function getLatestOfficeShiftEditChangelogs(officeShiftIds: string[]) {
  if (officeShiftIds.length === 0) {
    return [];
  }

  return prisma.changelog.findMany({
    where: {
      entityType: 'OfficeShift',
      action: {
        in: ['UPDATE'],
      },
      entityId: {
        in: officeShiftIds,
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      admin: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getEmployeeOfficeDayOverrideChangelogsForDates(params: {
  employeeIds: string[];
  dateKeys: string[];
}) {
  const { employeeIds, dateKeys } = params;
  if (employeeIds.length === 0 || dateKeys.length === 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM changelogs
    WHERE entity_type = 'EmployeeOfficeDayOverride'
      AND details->>'employeeId' IN (${Prisma.join(employeeIds)})
      AND details->>'date' IN (${Prisma.join(dateKeys)})
    ORDER BY created_at ASC, id ASC
  `);

  if (rows.length === 0) {
    return [];
  }

  return prisma.changelog.findMany({
    where: {
      id: {
        in: rows.map(row => row.id),
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      admin: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getOfficePresentCountForDate(date: Date = new Date()): Promise<number> {
  const today = getBusinessDayRange(date, BUSINESS_TIMEZONE);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);

  return prisma.officeShift.count({
    where: {
      deletedAt: null,
      status: { not: ShiftStatus.cancelled },
      date: todayDate,
      officeAttendances: { some: { status: { in: OFFICE_ATTENDED_STATUSES } } },
    },
  });
}

export async function getOfficeLateCountForDate(date: Date = new Date()): Promise<number> {
  const today = getBusinessDayRange(date, BUSINESS_TIMEZONE);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);

  return prisma.officeShift.count({
    where: {
      deletedAt: null,
      status: { not: ShiftStatus.cancelled },
      date: todayDate,
      officeAttendances: { some: { status: OfficeAttendanceStatus.late } },
    },
  });
}

export async function getOfficeAbsentCountForDate(date: Date = new Date()): Promise<number> {
  const today = getBusinessDayRange(date, BUSINESS_TIMEZONE);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);

  return prisma.officeShift.count({
    where: {
      deletedAt: null,
      status: { not: ShiftStatus.cancelled },
      date: todayDate,
      officeAttendances: { some: { status: OfficeAttendanceStatus.absent } },
    },
  });
}

export async function getDailyAttendanceStats(date: Date): Promise<{ present: number; late: number; absent: number }> {
  const dateStr = date.toISOString().slice(0, 10);
  const cacheKey = `office-attendance:daily:${dateStr}`;

  const todayStr = new Date().toISOString().slice(0, 10);
  const isPastDay = dateStr < todayStr;

  if (isPastDay) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fall through
      }
    }
  }

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const attendances = await prisma.officeAttendance.findMany({
    where: {
      recordedAt: { gte: startOfDay, lte: endOfDay },
      status: { in: ['present', 'late', 'absent', 'clocked_out'] },
    },
    select: {
      status: true,
    },
  });

  const stats = { present: 0, late: 0, absent: 0 };
  for (const att of attendances) {
    if (att.status === 'present' || att.status === 'clocked_out') {
      stats.present++;
    } else if (att.status === 'late') {
      stats.late++;
    } else if (att.status === 'absent') {
      stats.absent++;
    }
  }

  if (isPastDay) {
    await redis.set(cacheKey, JSON.stringify(stats), 'EX', 2592000); // 30 days
  } else {
    await redis.set(cacheKey, JSON.stringify(stats), 'EX', 60); // 60 seconds
  }

  return stats;
}

export async function getOfficeWeeklyAttendanceTrend(endDate: Date = new Date(), days: number = 7): Promise<Array<{ date: string; present: number; late: number; absent: number }>> {
  const result: Array<{ date: string; present: number; late: number; absent: number }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const targetDate = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dateLabel = targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    const stats = await getDailyAttendanceStats(targetDate);
    result.push({
      date: dateLabel,
      ...stats,
    });
  }

  return result;
}

export async function getOnsitePresentCountForDate(date: Date = new Date()): Promise<number> {
  const today = getBusinessDayRange(date, BUSINESS_TIMEZONE);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);

  return prisma.shift.count({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      status: { not: ShiftStatus.cancelled },
      date: todayDate,
      employee: { role: 'on_site' },
      attendance: { is: { status: { in: ONSITE_ATTENDED_STATUSES } } },
    },
  });
}

export async function getOnsiteLateCountForDate(date: Date = new Date()): Promise<number> {
  const today = getBusinessDayRange(date, BUSINESS_TIMEZONE);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);

  return prisma.shift.count({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      status: { not: ShiftStatus.cancelled },
      date: todayDate,
      employee: { role: 'on_site' },
      attendance: { is: { status: AttendanceStatus.late } },
    },
  });
}

export async function getOnsiteAbsentCountForDate(date: Date = new Date()): Promise<number> {
  const today = getBusinessDayRange(date, BUSINESS_TIMEZONE);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);

  return prisma.shift.count({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      status: { not: ShiftStatus.cancelled },
      date: todayDate,
      employee: { role: 'on_site' },
      attendance: { is: { status: AttendanceStatus.absent } },
    },
  });
}
