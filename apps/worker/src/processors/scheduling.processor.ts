import { Shift, ShiftType, Site, Attendance } from '@prisma/client';
import { calculateCheckInWindow, CHECK_SHIFTS_JOB_NAME } from '@repo/shared';
import { db as prisma, ExtendedEmployee } from '@repo/database';
import { getActiveShifts, getShiftsUpdates, getUpcomingShifts, createMissedCheckinAlert } from '@repo/database';
import { Job } from 'bullmq';
import { getRedisConnection } from '../infrastructure/redis';

// Configuration
const FULL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (safety fallback)
const UPCOMING_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute
const ATTENDANCE_GRACE_PERIOD_MINS = 5;

// Types
type CachedShift = Shift & {
  shiftType: ShiftType;
  employee: ExtendedEmployee | null;
  site: Site;
  attendance: Attendance | null;
  lastAttentionIndexSent?: number;
};

type ShiftState = {
  lastAttentionIndexSent?: number;
  processedAlerts: Set<string>; // Format: "reason:timestamp"
};

type BroadcastedShift = {
  id: string;
  employee: ExtendedEmployee | null;
  shiftType: ShiftType;
  startsAt: Date;
  endsAt: Date;
  status: string;
  missedCount: number;
  attendance: Attendance | null;
};

export class SchedulingProcessor {
  private cachedShifts = new Map<string, CachedShift>();
  private shiftStates = new Map<string, ShiftState>();
  private lastFullSync = 0;
  private lastUpcomingSync = 0;
  private needsFullSync = true;

  constructor() {
    this.setupEventListener();
  }

  private setupEventListener() {
    const redis = getRedisConnection().duplicate();
    redis.subscribe('events:shifts', err => {
      if (err) {
        console.error('[SchedulingProcessor] Redis subscribe error:', err);
      }
    });

    redis.on('message', (channel) => {
      if (channel === 'events:shifts') {
        console.log('[SchedulingProcessor] Received shift change event, triggering sync.');
        this.needsFullSync = true;
      }
    });
  }

  async process(job: Job) {
    if (job.name === CHECK_SHIFTS_JOB_NAME) {
      await this.tick();
    }
  }

  private getShiftState(shiftId: string): ShiftState {
    let state = this.shiftStates.get(shiftId);
    if (!state) {
      state = { processedAlerts: new Set() };
      this.shiftStates.set(shiftId, state);
    }
    return state;
  }

  private async tick() {
    try {
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
    } catch (error) {
      console.error(`[SchedulingProcessor] Tick error:`, error);
    }
  }

  private async publish<T>(channel: string, payload: T) {
    const redis = getRedisConnection();
    const message = Array.isArray(payload)
      ? JSON.stringify(payload)
      : JSON.stringify({
          ...payload,
          version: 1,
          _timestamp: Date.now(),
        });
    await redis.publish(channel, message);
  }

  private async syncActiveShifts(now: Date, nowMs: number): Promise<boolean> {
    let isFullSync = false;
    const timeSinceLastSync = nowMs - this.lastFullSync;

    if (this.needsFullSync || timeSinceLastSync > FULL_SYNC_INTERVAL_MS || this.cachedShifts.size === 0) {
      isFullSync = true;
      this.needsFullSync = false;
      const newShifts = await getActiveShifts(now);

      // Clean up states for shifts no longer active
      const activeIds = new Set(newShifts.map(s => s.id));
      for (const id of this.shiftStates.keys()) {
        if (!activeIds.has(id)) {
          this.shiftStates.delete(id);
        }
      }

      this.cachedShifts.clear();
      newShifts.forEach(s => {
        const state = this.getShiftState(s.id);
        this.cachedShifts.set(s.id, {
          ...s,
          lastAttentionIndexSent: state.lastAttentionIndexSent,
        });
      });

      this.lastFullSync = nowMs;
    } else {
      if (this.cachedShifts.size > 0) {
        const shiftIds = Array.from(this.cachedShifts.keys());
        const updates = await getShiftsUpdates(shiftIds);

        updates.forEach(u => {
          const target = this.cachedShifts.get(u.id);
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
    for (const shift of this.cachedShifts.values()) {
      if (shift.status !== 'scheduled' && shift.status !== 'in_progress') continue;
      if (shift.endsAt < now) continue;

      const state = this.getShiftState(shift.id);
      const startMs = shift.startsAt.getTime();
      const intervalMs = shift.requiredCheckinIntervalMins * 60000;

      if (typeof shift.lastAttentionIndexSent === 'number') {
        const warningIndex = shift.lastAttentionIndexSent;

        if (warningIndex === -1) {
          if (shift.attendance) {
            await this.clearAttentionEvent(shift, warningIndex);
            shift.lastAttentionIndexSent = undefined;
            state.lastAttentionIndexSent = undefined;
          }
        } else {
          const warningSlotStart = startMs + warningIndex * intervalMs;
          if (shift.lastHeartbeatAt && shift.lastHeartbeatAt.getTime() >= warningSlotStart) {
            await this.clearAttentionEvent(shift, warningIndex);
            shift.lastAttentionIndexSent = undefined;
            state.lastAttentionIndexSent = undefined;
          }
        }
      }

      const attendanceGraceMs = ATTENDANCE_GRACE_PERIOD_MINS * 60000;
      const attendanceDeadline = startMs + attendanceGraceMs;
      const attendanceAlertKey = `missed_attendance:${shift.startsAt.getTime()}`;

      if (!shift.attendance && !state.processedAlerts.has(attendanceAlertKey)) {
        const timeUntilDeadline = attendanceDeadline - nowMs;
        if (timeUntilDeadline <= 60000 && timeUntilDeadline > 0) {
          if (shift.lastAttentionIndexSent !== -1) {
            await this.sendAttentionEvent(shift, -1, shift.startsAt, now, 'missed_attendance');
          }
        }

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
            console.log(`[SchedulingProcessor] Detected missed attendance for shift ${shift.id}`);
            await this.createAlert(shift, 'missed_attendance', shift.startsAt);
          }
          state.processedAlerts.add(attendanceAlertKey);
        }
      }

      const windowResult = calculateCheckInWindow(
        shift.startsAt,
        shift.endsAt,
        shift.requiredCheckinIntervalMins,
        shift.graceMinutes,
        now,
        shift.lastHeartbeatAt
      );

      if (windowResult.status === 'late') {
        const dueTime = windowResult.currentSlotStart;
        const checkinAlertKey = `missed_checkin:${dueTime.getTime()}`;

        if (!state.processedAlerts.has(checkinAlertKey)) {
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
              `[SchedulingProcessor] Detected missed checkin for shift ${shift.id} at ${dueTime.toISOString()}`
            );
            await this.createAlert(shift, 'missed_checkin', dueTime, true);
          }
          state.processedAlerts.add(checkinAlertKey);
        }
      }

      if (windowResult.status === 'open') {
        if (windowResult.remainingTimeMs <= 60000) {
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
        shift.missedCount += 1;
      }
      const payload = { type: 'alert_created', alert };
      await this.publish(`alerts:site:${shift.siteId}`, payload);
    }
  }

  private async clearAttentionEvent(shift: CachedShift, attentionIndex: number) {
    const alertId = `transient-${shift.id}-${attentionIndex}`;
    const payload = { type: 'alert_cleared', alertId };
    await this.publish(`alerts:site:${shift.siteId}`, payload);

    const redis = getRedisConnection();
    const redisKey = `alert:warning:${shift.siteId}:${alertId}`;
    await redis.del(redisKey);
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

    const redis = getRedisConnection();
    const redisKey = `alert:warning:${shift.siteId}:${fakeAlert.id}`;
    await redis.set(redisKey, JSON.stringify(fakeAlert), 'EX', 60);

    shift.lastAttentionIndexSent = attentionIndex;
    const state = this.getShiftState(shift.id);
    state.lastAttentionIndexSent = attentionIndex;
  }

  private async broadcastActiveShifts() {
    const activeSitesMap = new Map<string, { site: Site; shifts: BroadcastedShift[] }>();

    for (const shift of this.cachedShifts.values()) {
      if (!activeSitesMap.has(shift.siteId)) {
        activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
      }
      activeSitesMap.get(shift.siteId)?.shifts.push({
        id: shift.id,
        employee: shift.employee,
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
    await this.publish('dashboard:upcoming-shifts', upcomingShifts);
  }
}
