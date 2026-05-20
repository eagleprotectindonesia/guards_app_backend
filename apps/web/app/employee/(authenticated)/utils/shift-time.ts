import type { ShiftWithCheckInWindow } from '../hooks/use-employee-queries';

export const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

export function toValidMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function shouldRefetchForActiveShift(activeShift: ShiftWithCheckInWindow | null, now: Date): boolean {
  if (!activeShift) return false;
  const endMs = toValidMs(activeShift.endsAt);
  if (endMs == null) return false;
  return now.getTime() > endMs + FIVE_MINUTES_IN_MS;
}

export function shouldRefetchForNextShift(nextShift: ShiftWithCheckInWindow | null, now: Date): boolean {
  if (!nextShift) return false;
  const startMs = toValidMs(nextShift.startsAt);
  if (startMs == null) return false;
  return now.getTime() >= startMs - FIVE_MINUTES_IN_MS;
}

