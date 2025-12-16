import 'dotenv/config';
import { PrismaClient, Shift, ShiftType, Guard, Site, Attendance } from '@prisma/client';
import { Redis } from 'ioredis';
import { calculateCheckInWindow } from './lib/scheduling';

// Configuration
const TICK_INTERVAL_MS = 5 * 1000; // 5 seconds
const FULL_SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds
const UPCOMING_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute
const LOCK_ID = 123456;
const ATTENDANCE_GRACE_PERIOD_MINS = 5;

// Prisma & Redis
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Types
type CachedShift = Shift & {
  shiftType: ShiftType;
  guard: Guard | null;
  site: Site;
  attendance: Attendance | null;
  lastAttentionIndexSent?: number;
};

class SchedulingWorker {
  private cachedShifts: CachedShift[] = [];
  private shiftStates = new Map<string, { lastAttentionIndexSent?: number }>();
  private lastFullSync = 0;
  private lastUpcomingSync = 0;

  async start() {
    console.log('Worker started with 5s tick and 30s full sync...');
    setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  private async tick() {
    try {
      if (!(await this.acquireLock())) return;

      const now = new Date();
      const nowMs = now.getTime();

      // 1. Sync Data (Active Shifts)
      const isFullSync = await this.syncActiveShifts(now, nowMs);

      // 2. Process Alerts for Active Shifts
      await this.processActiveShifts(now, nowMs);

      // 3. Broadcast Dashboard Data
      if (isFullSync) {
        await this.broadcastActiveShifts();
      }

      // 4. Broadcast Upcoming Shifts (Every 1m)
      if (nowMs - this.lastUpcomingSync > UPCOMING_SYNC_INTERVAL_MS) {
        await this.broadcastUpcomingShifts(now);
        this.lastUpcomingSync = nowMs;
      }

      await this.releaseLock();
    } catch (error) {
      console.error('Worker tick error:', error);
    }
  }

  private async acquireLock(): Promise<boolean> {
    const result: { locked: boolean }[] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_ID}) as locked`;
    return result[0]?.locked;
  }

  private async releaseLock() {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }

  private async syncActiveShifts(now: Date, nowMs: number): Promise<boolean> {
    let isFullSync = false;
    if (nowMs - this.lastFullSync > FULL_SYNC_INTERVAL_MS || this.cachedShifts.length === 0) {
      isFullSync = true;
      // --- HEAVY SYNC (Every 30s) ---
      const newShifts = await prisma.shift.findMany({
        where: {
          status: { in: ['scheduled', 'in_progress'] },
          startsAt: { lte: now },
          endsAt: { gte: now },
          guardId: { not: null },
        },
        include: { shiftType: true, guard: true, site: true, attendance: true },
      });

      // Restore state
      this.cachedShifts = newShifts.map(s => {
        const state = this.shiftStates.get(s.id);
        return { ...s, lastAttentionIndexSent: state?.lastAttentionIndexSent };
      });

      this.lastFullSync = nowMs;
    } else {
      // --- LIGHT SYNC (Every 5s) ---
      if (this.cachedShifts.length > 0) {
        const shiftIds = this.cachedShifts.map(s => s.id);
        const updates = await prisma.shift.findMany({
          where: { id: { in: shiftIds } },
          select: { id: true, lastHeartbeatAt: true, missedCount: true, status: true, attendance: true },
        });

        // Merge updates into cache
        updates.forEach(u => {
          const target = this.cachedShifts.find(s => s.id === u.id);
          if (target) {
            target.lastHeartbeatAt = u.lastHeartbeatAt;
            target.missedCount = u.missedCount;
            target.status = u.status;
            target.attendance = u.attendance;
          }
        });
      }
    }
    return isFullSync;
  }

  private async processActiveShifts(now: Date, nowMs: number) {
    for (const shift of this.cachedShifts) {
      if (shift.status !== 'scheduled' && shift.status !== 'in_progress') continue;
      if (shift.endsAt < now) continue;

      const startMs = shift.startsAt.getTime();

      // --- ATTENDANCE ALERT LOGIC ---
      const attendanceGraceMs = ATTENDANCE_GRACE_PERIOD_MINS * 60000;
      if (!shift.attendance && nowMs > startMs + attendanceGraceMs) {
        const existingAttendanceAlert = await prisma.alert.findUnique({
          where: {
            shiftId_reason_windowStart: {
              shiftId: shift.id,
              reason: 'missed_attendance',
              windowStart: shift.startsAt,
            },
          },
        });

        if (!existingAttendanceAlert) {
          console.log(`Detected missed attendance for shift ${shift.id} (Guard: ${shift.guard?.name})`);
          await this.createAlert(shift, 'missed_attendance', shift.startsAt);
        }
      }

      // --- UNIFIED CHECKIN LOGIC ---
      const windowResult = calculateCheckInWindow(
        shift.startsAt,
        shift.endsAt, // Added shift.endsAt
        shift.requiredCheckinIntervalMins,
        shift.graceMinutes,
        now,
        shift.lastHeartbeatAt
      );

      // A) Missed Checkin Alert
      if (windowResult.status === 'late') {
        // "late" means we are past the grace period of currentSlotStart
        // So check if we have alerted for this specific slot start
        const dueTime = windowResult.currentSlotStart;
        
        const existingAlert = await prisma.alert.findUnique({
          where: {
            shiftId_reason_windowStart: {
              shiftId: shift.id,
              reason: 'missed_checkin',
              windowStart: dueTime,
            },
          },
        });

        if (!existingAlert) {
           console.log(`Detected missed checkin for shift ${shift.id} (Guard: ${shift.guard?.name}) at ${dueTime.toISOString()}`);
           await this.createAlert(shift, 'missed_checkin', dueTime, true);
        }
      }

      // B) Need Attention Warning
      // We want to warn if status is 'open' BUT we are nearing the end.
      // E.g. 1 minute left.
      if (windowResult.status === 'open') {
         // remainingTimeMs is time until currentSlotEndMs
         if (windowResult.remainingTimeMs <= 60000) { // Less than 1 min left
            // Ensure we haven't sent this already for this slot
            // Identify slot by index or timestamp
            // currentSlotStart is unique for the slot.
            const slotIdentifier = windowResult.currentSlotStart.getTime();

            // Store sent state as timestamp instead of index to match new logic
            // Or map timestamp to index? calculateCheckInWindow uses internal index but returns start time.
            // Let's rely on timestamp.
            
            // We need to check if we already sent attention for THIS slot.
            // We can convert slotIdentifier back to index if needed, or just store lastAttentionTime.
            // Simplified: lastAttentionForSlotStartMs
            
            // But we stored lastAttentionIndexSent in DB/Cache.
            // Let's derive index from time.
            const intervalMs = shift.requiredCheckinIntervalMins * 60000;
            const index = Math.round((slotIdentifier - startMs) / intervalMs);

            if (shift.lastAttentionIndexSent !== index) {
               await this.sendAttentionEvent(shift, index, windowResult.currentSlotStart, now);
            }
         }
      }
    }
  }

  private async createAlert(shift: CachedShift, reason: 'missed_attendance' | 'missed_checkin', windowStart: Date, incrementMissedCount = false) {
    await prisma.$transaction(async tx => {
      const newAlert = await tx.alert.create({
        data: {
          shiftId: shift.id,
          siteId: shift.siteId,
          reason,
          severity: 'critical',
          windowStart,
        },
      });

      if (incrementMissedCount) {
        await tx.shift.update({
          where: { id: shift.id },
          data: { missedCount: { increment: 1 } },
        });
        shift.missedCount += 1; // Update cache
      }

      const alert = await tx.alert.findUnique({
        where: { id: newAlert.id },
        include: {
          site: true,
          shift: { include: { guard: true, shiftType: true } },
        },
      });

      const payload = { type: 'alert_created', alert };
      await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));
      console.log(`[MOCK] Sending notification for alert ${newAlert.id}`);
    });
  }

  private async sendAttentionEvent(shift: CachedShift, attentionIndex: number, dueTime: Date, now: Date) {
    const fakeAlert = {
      id: `transient-${shift.id}-${attentionIndex}`,
      shiftId: shift.id,
      siteId: shift.siteId,
      reason: 'missed_checkin',
      severity: 'warning',
      windowStart: dueTime,
      createdAt: now,
      resolvedAt: null,
      site: shift.site,
      shift: { ...shift },
      status: 'need_attention',
    };

    const payload = { type: 'alert_attention', alert: fakeAlert };
    await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));

    shift.lastAttentionIndexSent = attentionIndex;
    this.shiftStates.set(shift.id, { lastAttentionIndexSent: attentionIndex });
  }

  private async broadcastActiveShifts() {
    const activeSitesMap = new Map<string, { site: Site; shifts: any[] }>();

    for (const shift of this.cachedShifts) {
      if (!activeSitesMap.has(shift.siteId)) {
        activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
      }
      activeSitesMap.get(shift.siteId)?.shifts.push({
        id: shift.id,
        guard: shift.guard,
        shiftType: shift.shiftType,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        status: shift.status,
        missedCount: shift.missedCount,
        attendance: shift.attendance,
      });
    }

    const activeSitesPayload = Array.from(activeSitesMap.values());
    await redis.publish('dashboard:active-shifts', JSON.stringify(activeSitesPayload));
  }

  private async broadcastUpcomingShifts(now: Date) {
    const upcomingEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const upcomingShifts = await prisma.shift.findMany({
      where: {
        status: 'scheduled',
        startsAt: { gt: now, lte: upcomingEnd },
      },
      include: {
        shiftType: true,
        guard: true,
        site: true,
      },
      orderBy: {
        startsAt: 'asc',
      },
      take: 50,
    });
    // Broadcast to a new channel
    await redis.publish('dashboard:upcoming-shifts', JSON.stringify(upcomingShifts));
    // console.log(`[Upcoming Sync] Broadcasted ${upcomingShifts.length} upcoming shifts.`);
  }
}

new SchedulingWorker().start();