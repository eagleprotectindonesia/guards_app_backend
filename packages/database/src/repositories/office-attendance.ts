import { db as prisma } from '../prisma/client';
import { Prisma, AttendanceStatus } from '@prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

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
  status: AttendanceStatus;
  picture?: string;
  metadata?: any;
  recordedAt?: Date;
}) {
  const { officeId, officeShiftId, employeeId, status, picture, metadata, recordedAt } = params;
  const normalizedRecordedAt = recordedAt || new Date();

  try {
    const attendance = await prisma.officeAttendance.create({
      data: {
        officeId,
        officeShiftId,
        employeeId,
        recordedAt: normalizedRecordedAt,
        status,
        picture,
        metadata,
      },
    });

    return { attendance, created: true as const };
  } catch (error) {
    if (
      officeShiftId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
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

export async function getTodayOfficeAttendance(employeeId: string, now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const { start, end } = getBusinessDayRange(now, timeZone);

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

export async function getLatestOfficeAttendanceForDay(employeeId: string, now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const { start, end } = getBusinessDayRange(now, timeZone);

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

export async function getPaginatedOfficeAttendance(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: Prisma.OfficeAttendanceOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [attendances, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.officeAttendance.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          employee: true,
          office: true,
          officeShift: true,
        },
      }),
      tx.officeAttendance.count({ where }),
    ]);
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
        },
      },
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}
