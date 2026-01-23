export type CheckInWindowStatus = 'open' | 'early' | 'late' | 'completed';

export interface CheckInWindowResult {
  status: CheckInWindowStatus;
  currentSlotStart: Date;
  currentSlotEnd: Date;
  nextSlotStart: Date;
  remainingTimeMs: number;
  isLastSlot?: boolean;
}

export function calculateCheckInWindow(
  shiftStart: Date,
  shiftEnd: Date,
  intervalMins: number,
  graceMins: number,
  now: Date,
  lastHeartbeat?: Date | null
): CheckInWindowResult {
  const startMs = shiftStart.getTime();
  const endMs = shiftEnd.getTime();
  const intervalMs = intervalMins * 60000;
  const graceMs = graceMins * 60000;
  const nowMs = now.getTime();

  const firstScheduledCheckInMs = startMs + intervalMs;

  let lastScheduledSlotStartMs = firstScheduledCheckInMs;
  if (endMs >= firstScheduledCheckInMs) {
    lastScheduledSlotStartMs =
      firstScheduledCheckInMs + Math.floor((endMs - firstScheduledCheckInMs) / intervalMs) * intervalMs;
  }

  if (nowMs < firstScheduledCheckInMs) {
    return {
      status: 'early',
      currentSlotStart: new Date(firstScheduledCheckInMs),
      currentSlotEnd: new Date(firstScheduledCheckInMs + graceMs),
      nextSlotStart: new Date(firstScheduledCheckInMs),
      remainingTimeMs: firstScheduledCheckInMs - nowMs,
    };
  }

  let slotIndex = Math.floor((nowMs - firstScheduledCheckInMs) / intervalMs);
  const maxSlotIndex = Math.floor((lastScheduledSlotStartMs - firstScheduledCheckInMs) / intervalMs);
  
  if (slotIndex > maxSlotIndex) {
    slotIndex = maxSlotIndex;
  }

  const potentialNextSlotStart = firstScheduledCheckInMs + (slotIndex + 1) * intervalMs;
  if (potentialNextSlotStart === lastScheduledSlotStartMs && graceMins > 0) {
    const adjustedNextSlotStart = Math.max(potentialNextSlotStart - graceMs, startMs);
    if (nowMs >= adjustedNextSlotStart) {
      slotIndex += 1;
    }
  }

  const currentSlotStartMs = firstScheduledCheckInMs + slotIndex * intervalMs;
  const currentSlotEndMs = currentSlotStartMs + graceMs;
  let nextSlotStartMs = currentSlotStartMs + intervalMs;

  const isLastSlot = currentSlotStartMs === lastScheduledSlotStartMs;
  const isLastSlotStart = nowMs >= lastScheduledSlotStartMs - graceMs;
  const nextSlotStartCalculated = currentSlotStartMs + intervalMs;
  const isNextSlotLast = nextSlotStartCalculated === lastScheduledSlotStartMs;

  let effectiveCheckinWindowStartMs = currentSlotStartMs;
  if (isLastSlot && graceMins > 0) {
    effectiveCheckinWindowStartMs = currentSlotStartMs - graceMs;
    effectiveCheckinWindowStartMs = Math.max(effectiveCheckinWindowStartMs, startMs);
  }

  if (isLastSlot) {
    // nextSlotStartMs = endMs;
  } else if (isNextSlotLast && graceMins > 0) {
    nextSlotStartMs = nextSlotStartCalculated - graceMs;
    nextSlotStartMs = Math.max(nextSlotStartMs, startMs);
  } else {
    nextSlotStartMs = nextSlotStartCalculated;
  }

  const effectiveCheckinWindowEndMs = currentSlotStartMs + graceMs;
  const isCompleted = lastHeartbeat && lastHeartbeat.getTime() >= effectiveCheckinWindowStartMs;

  if (isCompleted) {
    return {
      status: 'completed',
      currentSlotStart: new Date(currentSlotStartMs),
      currentSlotEnd: new Date(currentSlotEndMs),
      nextSlotStart: new Date(nextSlotStartMs),
      remainingTimeMs: nextSlotStartMs - nowMs,
      isLastSlot: isLastSlotStart,
    };
  }

  if (nowMs >= effectiveCheckinWindowStartMs && nowMs <= effectiveCheckinWindowEndMs) {
    return {
      status: 'open',
      currentSlotStart: new Date(currentSlotStartMs),
      currentSlotEnd: new Date(currentSlotEndMs),
      nextSlotStart: new Date(nextSlotStartMs),
      remainingTimeMs: effectiveCheckinWindowEndMs - nowMs,
      isLastSlot: isLastSlotStart,
    };
  } else {
    return {
      status: 'late',
      currentSlotStart: new Date(currentSlotStartMs),
      currentSlotEnd: new Date(currentSlotEndMs),
      nextSlotStart: new Date(nextSlotStartMs),
      remainingTimeMs: nextSlotStartMs - nowMs,
      isLastSlot: isLastSlotStart,
    };
  }
}
