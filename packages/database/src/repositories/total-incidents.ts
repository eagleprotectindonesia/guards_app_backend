import { AlertReason } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

type IncidentReason = 'missed_attendance' | 'missed_checkin';

export type TotalIncidentsForDashboard = {
  dateKey: string;
  total: number;
  attendance: number;
  checkin: number;
  yesterdayTotal: number;
  deltaVsYesterday: number;
  lastUpdatedAt: string;
};

function isIncidentReason(reason: AlertReason): reason is IncidentReason {
  return reason === AlertReason.missed_attendance || reason === AlertReason.missed_checkin;
}

export async function getTotalIncidentsForDashboard(now: Date, siteId?: string): Promise<TotalIncidentsForDashboard> {
  const today = getBusinessDayRange(now, BUSINESS_TIMEZONE);
  const yesterdayAnchor = new Date(today.start.getTime() - 1);
  const yesterday = getBusinessDayRange(yesterdayAnchor, BUSINESS_TIMEZONE);

  const grouped = await prisma.alert.groupBy({
    by: ['reason', 'createdAt'],
    where: {
      severity: 'critical',
      reason: { in: [AlertReason.missed_attendance, AlertReason.missed_checkin] },
      createdAt: {
        gte: yesterday.start,
        lt: today.end,
      },
      ...(siteId ? { siteId } : {}),
    },
    _count: {
      _all: true,
    },
  });

  let attendance = 0;
  let checkin = 0;
  let yesterdayTotal = 0;

  for (const row of grouped) {
    if (!isIncidentReason(row.reason)) continue;
    const createdAtMs = new Date(row.createdAt).getTime();
    const count = row._count._all;

    if (createdAtMs >= today.start.getTime() && createdAtMs < today.end.getTime()) {
      if (row.reason === AlertReason.missed_attendance) attendance += count;
      if (row.reason === AlertReason.missed_checkin) checkin += count;
    } else if (createdAtMs >= yesterday.start.getTime() && createdAtMs < yesterday.end.getTime()) {
      yesterdayTotal += count;
    }
  }

  const total = attendance + checkin;

  return {
    dateKey: today.dateKey,
    total,
    attendance,
    checkin,
    yesterdayTotal,
    deltaVsYesterday: total - yesterdayTotal,
    lastUpdatedAt: new Date().toISOString(),
  };
}
