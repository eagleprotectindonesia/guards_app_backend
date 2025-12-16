export type CheckInWindowStatus = 'open' | 'early' | 'late' | 'completed';

export interface CheckInWindowResult {
  status: CheckInWindowStatus;
  currentSlotStart: Date;
  currentSlotEnd: Date;
  nextSlotStart: Date;
  remainingTimeMs: number; // Time until open (if early/completed/late) or close (if open)
}

/**
 * Calculates the current check-in window status for a shift.
 * Unified logic used by API, Worker, and Frontend.
 *
 * Concepts:
 * - Slots start at: ShiftStart + (N * Interval)
 * - Window is: [SlotStart, SlotStart + Grace]
 *
 * Special condition for the last check-in within a shift:
 * Allows graceMinutes early check-in for the last scheduled slot.
 */
export function calculateCheckInWindow(
  shiftStart: Date,
  shiftEnd: Date,
  intervalMins: number,
  graceMins: number,
  now: Date,
  lastHeartbeat?: Date | null
): CheckInWindowResult {
  const startMs = shiftStart.getTime();
  const endMs = shiftEnd.getTime(); // Get shift end time in milliseconds
  const intervalMs = intervalMins * 60000;
  const graceMs = graceMins * 60000;
  const nowMs = now.getTime();

  // The first actual scheduled check-in slot for an interval (e.g., if shift starts 8am, interval 1hr, first checkin is 9am)
  const firstScheduledCheckInMs = startMs + intervalMs;

  // Determine the last possible *scheduled* check-in slot start time that is on or before shiftEnd.
  let lastScheduledSlotStartMs = firstScheduledCheckInMs; // Default to first if no other slots
  if (endMs >= firstScheduledCheckInMs) {
    lastScheduledSlotStartMs =
      firstScheduledCheckInMs + Math.floor((endMs - firstScheduledCheckInMs) / intervalMs) * intervalMs;
  } else {
    // If shiftEnd is before the first scheduled check-in, there are effectively no interval check-ins.
    // For simplicity, we'll let the initial 'early' block handle it if nowMs < firstScheduledCheckInMs.
    // If nowMs >= firstScheduledCheckInMs, and endMs < firstScheduledCheckInMs, then `lastScheduledSlotStartMs` will be `firstScheduledCheckInMs`,
    // and `isLastSlot` will be true, but this scenario implies an invalid shift configuration for interval checkins.
    // For robust error handling, a separate check for `endMs < firstScheduledCheckInMs` might be needed
    // but current problem description doesn't require it.
  }

  // Handle the period BEFORE the first scheduled check-in slot.
  if (nowMs < firstScheduledCheckInMs) {
    return {
      status: 'early',
      currentSlotStart: new Date(firstScheduledCheckInMs),
      currentSlotEnd: new Date(firstScheduledCheckInMs + graceMs),
      nextSlotStart: new Date(firstScheduledCheckInMs),
      remainingTimeMs: firstScheduledCheckInMs - nowMs,
    };
  }

  // Now we know nowMs is on or after the first scheduled check-in slot.
  // Calculate the base slot index relative to `firstScheduledCheckInMs`.
  let slotIndex = Math.floor((nowMs - firstScheduledCheckInMs) / intervalMs);

  // Adjust slotIndex if the next slot would be the last one and the current time allows early check-in for it
  const potentialNextSlotStart = firstScheduledCheckInMs + (slotIndex + 1) * intervalMs;
  if (potentialNextSlotStart === lastScheduledSlotStartMs && graceMins > 0) {
    // If the next slot would be the last slot, check if we're in the early window for it
    const adjustedNextSlotStart = potentialNextSlotStart - graceMs;
    if (nowMs >= adjustedNextSlotStart) {
      // Move to the last slot early
      slotIndex += 1;
    }
  }

  const currentSlotStartMs = firstScheduledCheckInMs + slotIndex * intervalMs;
  const currentSlotEndMs = currentSlotStartMs + graceMs;
  let nextSlotStartMs = currentSlotStartMs + intervalMs; // Default next slot start

  // Determine if the current slot is the very last *scheduled* interval check-in slot for the shift.
  const isLastSlot = currentSlotStartMs === lastScheduledSlotStartMs;

  // Determine if the next slot would be the last scheduled check-in slot for the shift.
  const nextSlotStartCalculated = currentSlotStartMs + intervalMs;
  const isNextSlotLast = nextSlotStartCalculated === lastScheduledSlotStartMs;

  // Define effective window boundaries for determining 'open'/'early'/'late' status.
  // For the last slot, allow graceMins early check-in.
  // The effective start time of the check-in window. It can be earlier than `currentSlotStartMs` for the last slot.
  let effectiveCheckinWindowStartMs = currentSlotStartMs;
  if (isLastSlot && graceMins > 0) {
    effectiveCheckinWindowStartMs = currentSlotStartMs - graceMs;
    // Ensure effective start does not go before the actual shift start if grace pushes it too far back
    effectiveCheckinWindowStartMs = Math.max(effectiveCheckinWindowStartMs, startMs);
  }

  // Now determine nextSlotStart based on isLastSlot and isNextSlotLast
  if (isLastSlot) {
    // If current slot is the last scheduled one, "next slot" is the shift end
    // nextSlotStartMs = endMs+1;
  } else if (isNextSlotLast && graceMins > 0) {
    // If the next slot is the last one and early check-ins are allowed,
    // adjust nextSlotStart to reflect when check-ins actually become available
    nextSlotStartMs = nextSlotStartCalculated - graceMs;
    // Ensure it doesn't go before the shift start
    nextSlotStartMs = Math.max(nextSlotStartMs, startMs);
  } else {
    // Otherwise, next slot is the calculated one (actual scheduled time)
    nextSlotStartMs = nextSlotStartCalculated;
  }

  // The effective end time of the check-in window is always `currentSlotStartMs + graceMs`.
  const effectiveCheckinWindowEndMs = currentSlotStartMs + graceMs;
  // const effectiveCheckinWindowEndMs = currentSlotStartMs;

  // Check if this specific slot is already completed
  const isCompleted = lastHeartbeat && lastHeartbeat.getTime() >= currentSlotStartMs;

  if (isCompleted) {
    return {
      status: 'completed',
      currentSlotStart: new Date(currentSlotStartMs),
      currentSlotEnd: new Date(currentSlotEndMs),
      nextSlotStart: new Date(nextSlotStartMs),
      remainingTimeMs: nextSlotStartMs - nowMs,
    };
  }

  // Check if current time falls within the *effective* check-in window.
  if (nowMs >= effectiveCheckinWindowStartMs && nowMs <= effectiveCheckinWindowEndMs) {
    return {
      status: 'open',
      currentSlotStart: new Date(currentSlotStartMs), // Always report actual slot start, not effective
      currentSlotEnd: new Date(currentSlotEndMs),
      nextSlotStart: new Date(nextSlotStartMs),
      remainingTimeMs: effectiveCheckinWindowEndMs - nowMs,
    };
    // } else if (nowMs < effectiveCheckinWindowStartMs) {
    //   console.log('early ges');

    //   return {
    //     status: 'early',
    //     currentSlotStart: new Date(currentSlotStartMs),
    //     currentSlotEnd: new Date(currentSlotEndMs),
    //     nextSlotStart: new Date(nextSlotStartMs),
    //     remainingTimeMs: effectiveCheckinWindowStartMs - nowMs,
    //   };
  } else {
    // nowMs > effectiveCheckinWindowEndMs
    return {
      status: 'late',
      currentSlotStart: new Date(currentSlotStartMs),
      currentSlotEnd: new Date(currentSlotEndMs),
      nextSlotStart: new Date(nextSlotStartMs),
      remainingTimeMs: nextSlotStartMs - nowMs,
    };
  }
}
