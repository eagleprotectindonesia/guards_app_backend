import { Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { projectLeavePolicyOutcome } from './leave-requests';
import { computeAnnualLeaveEntitledDays } from './annual-leave-policy';

type TxLike = Prisma.TransactionClient | typeof prisma;

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function dateToDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function getOrCreateAnnualLeaveBalance(employeeId: string, year: number, tx: TxLike) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { dateOfJoining: true },
  });
  if (!employee) {
    throw new Error('Employee not found');
  }
  const entitledDays = computeAnnualLeaveEntitledDays({ dateOfJoining: employee.dateOfJoining, year });
  return tx.employeeAnnualLeaveBalance.upsert({
    where: {
      employeeId_year: {
        employeeId,
        year,
      },
    },
    update: {},
    create: {
      employeeId,
      year,
      entitledDays,
      adjustedDays: 0,
      consumedDays: 0,
    },
  });
}

export async function reconcileApprovedOfficeLeavesForCoverage(
  params: {
    employeeId: string;
    startDateKey: string;
    endDateKey: string;
    adminId?: string;
  },
  tx?: TxLike
) {
  const now = new Date();
  const run = async (trx: TxLike) => {
    const requests = await trx.employeeLeaveRequest.findMany({
      where: {
        employeeId: params.employeeId,
        status: 'approved',
        employee: { role: 'office' },
        endDate: { gte: dateKeyToDate(params.startDateKey) },
        startDate: { lte: dateKeyToDate(params.endDateKey) },
      },
      include: {
        employee: {
          select: {
            id: true,
            role: true,
            gender: true,
            department: true,
          },
        },
      },
    });

    for (const request of requests) {
      const projected = await projectLeavePolicyOutcome(
        {
          request: {
            id: request.id,
            startDate: request.startDate,
            endDate: request.endDate,
            reason: request.reason,
            attachments: request.attachments,
            cycleKey: request.cycleKey,
          },
          employee: request.employee,
        },
        trx
      );

      const delta = projected.deductedAnnualDays - request.deductedAnnualDays;
      if (delta !== 0) {
        const year = request.startDate.getUTCFullYear();
        const balance = await getOrCreateAnnualLeaveBalance(request.employeeId, year, trx);
        await trx.employeeAnnualLeaveBalance.update({
          where: { id: balance.id },
          data: { consumedDays: { increment: delta } },
        });
        await trx.employeeLeaveLedgerEntry.create({
          data: {
            employeeId: request.employeeId,
            leaveRequestId: request.id,
            year,
            entryType: delta > 0 ? 'deduction' : 'reversal',
            days: Math.abs(delta),
            note: `Leave reconciliation (${request.id})`,
            createdById: params.adminId ?? null,
          },
        });
      }

      await trx.employeeLeaveRequest.update({
        where: { id: request.id },
        data: {
          isPaid: projected.unpaidDays === 0,
          deductedAnnualDays: projected.deductedAnnualDays,
          unpaidDays: projected.unpaidDays,
          policySnapshot: {
            ...(projected.policySnapshot as Record<string, unknown>),
            reconciledAt: dateToDateKey(now),
            reconciliationDeltaDays: delta,
            deductionMode: 'final',
            coverageMissingDates: [],
          } as Prisma.InputJsonValue,
        },
      });
    }
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}
