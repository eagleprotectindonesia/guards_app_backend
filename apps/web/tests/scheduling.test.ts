import { calculateCheckInWindow } from '../lib/scheduling';

describe('calculateCheckInWindow - Last Slot Handling (2+ slots)', () => {
  const shiftStart = new Date('2025-12-20T08:00:00Z');
  const shiftEnd = new Date('2025-12-20T10:00:00Z');
  const intervalMins = 60;
  const graceMins = 15;

  // First scheduled check-in: 09:00
  // Second (Last) scheduled check-in: 10:00

  test('Last slot: on-time (exactly at slot start)', () => {
    const now = new Date('2025-12-20T10:00:00Z');
    const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now);

    expect(result.status).toBe('open');
    expect(result.isLastSlot).toBe(true);
    expect(result.currentSlotStart).toEqual(new Date('2025-12-20T10:00:00Z'));
  });

  test('Last slot: early check-in (allowed within grace period before start)', () => {
    // 10:00 - 15m = 09:45
    const now = new Date('2025-12-20T09:45:00Z');
    const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now);

    expect(result.status).toBe('open');
    expect(result.isLastSlot).toBe(true);
    expect(result.currentSlotStart).toEqual(new Date('2025-12-20T10:00:00Z'));
  });

  test('Last slot: too early for early check-in', () => {
    // 10:00 - 16m = 09:44
    // Previous slot (09:00) window ends at 09:15.
    // 09:44 is late for 09:00 slot, and not yet in early window for 10:00.
    const now = new Date('2025-12-20T09:44:00Z');
    const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now);

    expect(result.status).toBe('late');
    expect(result.isLastSlot).toBe(false); 
    expect(result.currentSlotStart).toEqual(new Date('2025-12-20T09:00:00Z'));
  });

  test('Last slot: late check-in (after grace period)', () => {
    // 10:00 + 16m = 10:16
    const now = new Date('2025-12-20T10:16:00Z');
    const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now);

    expect(result.status).toBe('late');
    expect(result.isLastSlot).toBe(true);
    expect(result.currentSlotStart).toEqual(new Date('2025-12-20T10:00:00Z'));
  });

  test('Last slot: already completed', () => {
    const now = new Date('2025-12-20T10:00:00Z');
    const lastHeartbeat = new Date('2025-12-20T10:00:05Z');
    const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now, lastHeartbeat);

    expect(result.status).toBe('completed');
    expect(result.isLastSlot).toBe(true);
  });

  test('Last slot: duplicate check-in prevention (early check-in)', () => {
    // Last slot at 10:00, grace 15m. Early window starts at 09:45.
    // Guard checks in at 09:50.
    const firstCheckinTime = new Date('2025-12-20T09:50:00Z');
    
    // Guard tries to check in again at 09:55.
    const now = new Date('2025-12-20T09:55:00Z');
    const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now, firstCheckinTime);

    // This SHOULD be 'completed', but might be 'open' due to the bug.
    expect(result.status).toBe('completed');
  });

  describe('Standard slot (non-last) completed status', () => {
    test('Standard slot: already completed', () => {
      // First slot at 09:00. window [09:00, 09:15]
      const now = new Date('2025-12-20T09:10:00Z');
      const lastHeartbeat = new Date('2025-12-20T09:05:00Z');
      const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now, lastHeartbeat);

      expect(result.status).toBe('completed');
      expect(result.isLastSlot).toBe(false);
    });

    test('Standard slot: not completed (heartbeat was from previous block)', () => {
      // First slot at 09:00. window [09:00, 09:15]
      // heartbeat was at 08:30 (before first scheduled slot)
      const now = new Date('2025-12-20T09:10:00Z');
      const lastHeartbeat = new Date('2025-12-20T08:30:00Z');
      const result = calculateCheckInWindow(shiftStart, shiftEnd, intervalMins, graceMins, now, lastHeartbeat);

      expect(result.status).toBe('open');
      expect(result.isLastSlot).toBe(false);
    });
  });
});