import 'dotenv/config';
import { PrismaClient, Shift, ShiftType, Guard, Site, Attendance } from '@prisma/client';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const TICK_INTERVAL_MS = 5 * 1000; // 5 seconds
const FULL_SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds
const LOCK_ID = 123456;
const ATTENDANCE_GRACE_PERIOD_MINS = 5;

// Type definition for the cached shift with relations
type CachedShift = Shift & {
  shiftType: ShiftType;
  guard: Guard | null;
  site: Site;
  attendance: Attendance | null;
  lastAttentionIndexSent?: number;
};

// Global State
let cachedShifts: CachedShift[] = [];
let lastFullSync = 0;
const shiftStates = new Map<string, { lastAttentionIndexSent?: number }>();

async function runWorker() {
  console.log('Worker started with 5s tick and 30s full sync...');

  setInterval(async () => {
    try {
      // 1. Advisory Lock
      const result: { locked: boolean }[] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_ID}) as locked`;
      const locked = result[0]?.locked;

      if (!locked) {
        // console.log('Could not acquire lock, skipping...');
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();

      // 2. Data Synchronization
      let isFullSync = false;
      if (nowMs - lastFullSync > FULL_SYNC_INTERVAL_MS || cachedShifts.length === 0) {
        isFullSync = true;
        // --- HEAVY SYNC (Every 30s) ---
        // Discover active shifts and load full metadata
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
        cachedShifts = newShifts.map(s => {
          const state = shiftStates.get(s.id);
          return { ...s, lastAttentionIndexSent: state?.lastAttentionIndexSent };
        });

        lastFullSync = nowMs;
        // console.log(`[Full Sync] Loaded ${cachedShifts.length} active shifts.`);
      } else {
        // --- LIGHT SYNC (Every 5s) ---
        // Refresh only dynamic fields (heartbeat, missedCount) for currently cached shifts
        if (cachedShifts.length > 0) {
          const shiftIds = cachedShifts.map(s => s.id);
          const updates = await prisma.shift.findMany({
            where: { id: { in: shiftIds } },
            select: { id: true, lastHeartbeatAt: true, missedCount: true, status: true, attendance: true },
          });

          // Merge updates into cache
          updates.forEach(u => {
            const target = cachedShifts.find(s => s.id === u.id);
            if (target) {
              target.lastHeartbeatAt = u.lastHeartbeatAt;
              target.missedCount = u.missedCount;
              target.status = u.status; // Status might change (e.g. to completed)
              target.attendance = u.attendance;
            }
          });
        }
      }

      // 3. Process Logic (Uses cachedShifts with fresh heartbeats)
      const activeSitesMap = new Map<string, { site: Site; shifts: any[] }>();

      for (const shift of cachedShifts) {
        // Double check validity (in case status changed in Light Sync or time passed)
        if (shift.status !== 'scheduled' && shift.status !== 'in_progress') continue;
        if (shift.endsAt < now) continue;

        const startMs = shift.startsAt.getTime();

        // --- ATTENDANCE ALERT LOGIC START ---
        const attendanceGraceMs = ATTENDANCE_GRACE_PERIOD_MINS * 60000;

        // If attendance is missing and we are past start + grace period
        if (!shift.attendance && nowMs > startMs + attendanceGraceMs) {
          // Check if alert exists
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

            await prisma.$transaction(async tx => {
              const newAlert = await tx.alert.create({
                data: {
                  shiftId: shift.id,
                  siteId: shift.siteId,
                  reason: 'missed_attendance',
                  severity: 'critical',
                  windowStart: shift.startsAt,
                },
              });

              const alert = await tx.alert.findUnique({
                where: { id: newAlert.id },
                include: {
                  site: true,
                  shift: {
                    include: {
                      guard: true,
                      shiftType: true,
                    },
                  },
                },
              });

              const payload = {
                type: 'alert_created',
                alert,
              };
              await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));
              console.log(`[MOCK] Sending notification for alert ${newAlert.id}`);
            });
          }
        }
        // --- ATTENDANCE ALERT LOGIC END ---

        // --- CHECKIN ALERT LOGIC START ---
        const intervalMs = shift.requiredCheckinIntervalMins * 60000;
        const graceMs = shift.graceMinutes * 60000;

        const elapsedSinceStart = nowMs - startMs;
        const passedIntervalIndex = Math.floor((elapsedSinceStart - graceMs) / intervalMs);

        if (passedIntervalIndex >= 0) {
          const dueTime = new Date(startMs + passedIntervalIndex * intervalMs);

          // Check if we have a valid heartbeat for THIS interval
          const lastHeartbeat = shift.lastHeartbeatAt;
          const hasCheckedInForSlot = lastHeartbeat && lastHeartbeat.getTime() >= dueTime.getTime();

          if (!hasCheckedInForSlot) {
            // Check if alert exists for this due time
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
                `Detected missed checkin for shift ${shift.id} (Guard: ${
                  shift.guard?.name
                }) at ${dueTime.toISOString()}`
              );

              // Create Alert & Update Shift
              await prisma.$transaction(async tx => {
                const newAlert = await tx.alert.create({
                  data: {
                    shiftId: shift.id,
                    siteId: shift.siteId,
                    reason: 'missed_checkin',
                    severity: 'critical',
                    windowStart: dueTime,
                  },
                });

                await tx.shift.update({
                  where: { id: shift.id },
                  data: {
                    missedCount: { increment: 1 },
                  },
                });

                // Update local cache immediately to reflect the incremented missedCount
                shift.missedCount += 1;

                const alert = await tx.alert.findUnique({
                  where: { id: newAlert.id },
                  include: {
                    site: true,
                    shift: {
                      include: {
                        guard: true,
                        shiftType: true,
                      },
                    },
                  },
                });

                const payload = {
                  type: 'alert_created',
                  alert,
                };
                await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));
                console.log(`[MOCK] Sending notification for alert ${newAlert.id}`);
              });
            }
          }
        }
        // --- CHECKIN ALERT LOGIC END ---

        // --- NEED ATTENTION LOGIC START ---
        // Check for upcoming grace period end (1 minute warning)
        const attentionOffset = graceMs - 60000;
        const attentionIndex = Math.floor((elapsedSinceStart - attentionOffset) / intervalMs);

        // If we are in the attention window (e.g. 1 min before grace ends)
        // AND we haven't already passed the grace period (which would be an Alert)
        if (attentionIndex >= 0 && attentionIndex > passedIntervalIndex) {
          if (shift.lastAttentionIndexSent !== attentionIndex) {
            const dueTime = new Date(startMs + attentionIndex * intervalMs);
            const lastHeartbeat = shift.lastHeartbeatAt;
            const hasCheckedInForSlot = lastHeartbeat && lastHeartbeat.getTime() >= dueTime.getTime();

            if (!hasCheckedInForSlot) {
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
                shift: {
                  ...shift,
                },
                status: 'need_attention',
              };

              const payload = {
                type: 'alert_attention',
                alert: fakeAlert,
              };
              await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));

              // Mark as sent
              shift.lastAttentionIndexSent = attentionIndex;
              shiftStates.set(shift.id, { lastAttentionIndexSent: attentionIndex });
            }
          }
        }
        // --- NEED ATTENTION LOGIC END ---

        // Aggregate for Dashboard
        if (isFullSync) {
          if (!activeSitesMap.has(shift.siteId)) {
            activeSitesMap.set(shift.siteId, {
              site: shift.site,
              shifts: [],
            });
          }
          activeSitesMap.get(shift.siteId)?.shifts.push({
            id: shift.id,
            guard: shift.guard,
            shiftType: shift.shiftType,
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            status: shift.status,
            // checkInCount: shift.checkInCount,
            missedCount: shift.missedCount,
          });
        }
      }

      // Publish Active Shifts Broadcast
      if (isFullSync) {
        const activeSitesPayload = Array.from(activeSitesMap.values());
        await redis.publish('dashboard:active-shifts', JSON.stringify(activeSitesPayload));
      }

      await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
    } catch (error) {
      console.error('Worker error:', error);
    }
  }, TICK_INTERVAL_MS);
}

runWorker();
