import { Shift, ShiftType, Guard, Site, Attendance } from '@prisma/client';
import { Redis } from 'ioredis';
import { calculateCheckInWindow } from '../lib/scheduling';
import { prisma } from '../lib/prisma';
import { BaseWorker } from './base-worker';
import {
  getActiveShifts,
  getShiftsUpdates,
  getUpcomingShifts,
  createMissedCheckinAlert,
} from '../lib/data-access/shifts';

// Configuration
const TICK_INTERVAL_MS = 5 * 1000; // 5 seconds
const FULL_SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds
const UPCOMING_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute
const ATTENDANCE_GRACE_PERIOD_MINS = 5;

// Types
type CachedShift = Shift & {
  shiftType: ShiftType;
  guard: Guard | null;
  site: Site;
  attendance: Attendance | null;
  lastAttentionIndexSent?: number;
};

type BroadcastedShift = {
  id: string;
  guard: Guard | null;
  shiftType: ShiftType;
  startsAt: Date;
  endsAt: Date;
  status: string;
  missedCount: number;
  attendance: Attendance | null;
};

export class SchedulingWorker extends BaseWorker {
  name = 'SchedulingWorker';
  private cachedShifts: CachedShift[] = [];
  private shiftStates = new Map<string, { lastAttentionIndexSent?: number }>();
  private lastFullSync = 0;
  private lastUpcomingSync = 0;
  private redis: Redis;

  constructor() {
    super();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async start() {
    console.log(`[${this.name}] Started with 5s tick and 30s full sync...`);
    this.runLoop();
  }

  private async runLoop() {
    while (!this.isShuttingDown) {
      const startedAt = Date.now();

      try {
        await this.tick();
      } catch (err) {
        console.error(`[${this.name}] Loop error:`, err);
      }

      const elapsed = Date.now() - startedAt;
      const sleepMs = Math.max(0, TICK_INTERVAL_MS - elapsed);

      if (!this.isShuttingDown) {
        await new Promise(res => setTimeout(res, sleepMs));
      }
    }

    console.log(`[${this.name}] Loop exited`);
    await this.cleanup();
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
      console.error(`[${this.name}] Tick error:`, error);
      // Ensure lock is released in case of error, though expiration handles it eventually
      await this.releaseLock();
    }
  }

  private async publish<T>(channel: string, payload: T) {
    const message = Array.isArray(payload)
      ? JSON.stringify(payload)
      : JSON.stringify({
          ...payload,
          version: 1,
          _timestamp: Date.now(),
        });
    await this.redis.publish(channel, message);
  }

  private async cleanup() {
    try {
      await this.redis.quit();
      console.log(`[${this.name}] Redis connection closed.`);
    } catch (e) {
      console.error(`[${this.name}] Error closing Redis:`, e);
    }
    // We do NOT disconnect prisma here as it might be shared
    console.log(`[${this.name}] Cleanup complete.`);
  }

  private async acquireLock(): Promise<boolean> {
    const result = await this.redis.set('worker:lock', 'locked', 'EX', 60, 'NX');
    return result === 'OK';
  }

  private async releaseLock() {
    await this.redis.del('worker:lock');
  }

  private async syncActiveShifts(now: Date, nowMs: number): Promise<boolean> {
    let isFullSync = false;
    if (nowMs - this.lastFullSync > FULL_SYNC_INTERVAL_MS || this.cachedShifts.length === 0) {
      isFullSync = true;
      // --- HEAVY SYNC (Every 30s) ---
      const newShifts = await getActiveShifts(now);

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
        const updates = await getShiftsUpdates(shiftIds);

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
      const intervalMs = shift.requiredCheckinIntervalMins * 60000;

      // --- CLEAR ATTENTION IF CHECKED IN ---
      if (typeof shift.lastAttentionIndexSent === 'number') {
        const warningIndex = shift.lastAttentionIndexSent;

        if (warningIndex === -1) {
          // Attendance attention clearing
          if (shift.attendance) {
            await this.clearAttentionEvent(shift, warningIndex);
            shift.lastAttentionIndexSent = undefined;
            this.shiftStates.set(shift.id, { lastAttentionIndexSent: undefined });
          }
        } else {
          const warningSlotStart = startMs + warningIndex * intervalMs;

          // If we have a heartbeat AFTER the start of the warned slot
          if (shift.lastHeartbeatAt && shift.lastHeartbeatAt.getTime() >= warningSlotStart) {
            await this.clearAttentionEvent(shift, warningIndex);
            shift.lastAttentionIndexSent = undefined;
            this.shiftStates.set(shift.id, { lastAttentionIndexSent: undefined });
          }
        }
      }

      // --- ATTENDANCE ALERT LOGIC ---
      const attendanceGraceMs = ATTENDANCE_GRACE_PERIOD_MINS * 60000;
      const attendanceDeadline = startMs + attendanceGraceMs;

      if (!shift.attendance) {
        // 1. Attention (Warning)
        const timeUntilDeadline = attendanceDeadline - nowMs;
        if (timeUntilDeadline <= 60000 && timeUntilDeadline > 0) {
          if (shift.lastAttentionIndexSent !== -1) {
            await this.sendAttentionEvent(shift, -1, shift.startsAt, now, 'missed_attendance');
          }
        }

        // 2. Alert (Missed)
        if (nowMs > attendanceDeadline) {
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
            console.log(
              `[${this.name}] Detected missed attendance for shift ${shift.id} (Guard: ${shift.guard?.name})`
            );
            await this.createAlert(shift, 'missed_attendance', shift.startsAt);
          }
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
          console.log(
            `[${this.name}] Detected missed checkin for shift ${shift.id} (Guard: ${shift.guard?.name}) at ${dueTime.toISOString()}`
          );
          await this.createAlert(shift, 'missed_checkin', dueTime, true);
        }
      }

      // B) Need Attention Warning
      // We want to warn if status is 'open' BUT we are nearing the end.
      // E.g. 1 minute left.
      if (windowResult.status === 'open') {
        // remainingTimeMs is time until currentSlotEndMs
        if (windowResult.remainingTimeMs <= 60000) {
          // Less than 1 min left
          // Ensure we haven't sent this already for this slot
          // Identify slot by index or timestamp
          // currentSlotStart is unique for the slot.
          const slotIdentifier = windowResult.currentSlotStart.getTime();

          const index = Math.round((slotIdentifier - startMs) / intervalMs);

          if (shift.lastAttentionIndexSent !== index) {
            await this.sendAttentionEvent(shift, index, windowResult.currentSlotStart, now);
          }
        }
      }
    }
  }

  private async createAlert(
    shift: CachedShift,
    reason: 'missed_attendance' | 'missed_checkin',
    windowStart: Date,
    incrementMissedCount = false
  ) {
    const alert = await createMissedCheckinAlert({
      shiftId: shift.id,
      siteId: shift.siteId,
      reason,
      windowStart,
      incrementMissedCount,
    });

    if (alert) {
      if (incrementMissedCount) {
        shift.missedCount += 1; // Update cache
      }
      const payload = { type: 'alert_created', alert };
      await this.publish(`alerts:site:${shift.siteId}`, payload);
    }
  }

  private async clearAttentionEvent(shift: CachedShift, attentionIndex: number) {
    const alertId = `transient-${shift.id}-${attentionIndex}`;
    const payload = { type: 'alert_cleared', alertId };
    await this.publish(`alerts:site:${shift.siteId}`, payload);
  }

  private async sendAttentionEvent(
    shift: CachedShift,
    attentionIndex: number,
    dueTime: Date,
    now: Date,
    reason: 'missed_checkin' | 'missed_attendance' = 'missed_checkin'
  ) {
    const fakeAlert = {
      id: `transient-${shift.id}-${attentionIndex}`,
      shiftId: shift.id,
      siteId: shift.siteId,
      reason,
      severity: 'warning',
      windowStart: dueTime,
      createdAt: now,
      resolvedAt: null,
      site: shift.site,
      shift: { ...shift },
      status: 'need_attention',
    };

    const payload = { type: 'alert_attention', alert: fakeAlert };
    await this.publish(`alerts:site:${shift.siteId}`, payload);

    shift.lastAttentionIndexSent = attentionIndex;
    this.shiftStates.set(shift.id, { lastAttentionIndexSent: attentionIndex });
  }

  private async broadcastActiveShifts() {
    const activeSitesMap = new Map<string, { site: Site; shifts: BroadcastedShift[] }>();

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
    await this.publish('dashboard:active-shifts', activeSitesPayload);
  }

  private async broadcastUpcomingShifts(now: Date) {
    const upcomingShifts = await getUpcomingShifts(now);
    // Broadcast to a new channel
    await this.publish('dashboard:upcoming-shifts', upcomingShifts);
  }
}
