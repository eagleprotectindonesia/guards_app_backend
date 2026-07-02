import { isEndOfShiftWindow } from '../lib/site-post-location';

describe('isEndOfShiftWindow', () => {
  const intervalMins = 60;
  const graceMins = 5;
  const endsAt = new Date('2026-05-20T16:00:00.000Z');

  it('returns false when now is well before the window', () => {
    const now = new Date('2026-05-20T10:00:00.000Z');
    expect(isEndOfShiftWindow(now, endsAt, intervalMins, graceMins)).toBe(false);
  });

  it('returns false when now is 1ms before the window', () => {
    const now = new Date('2026-05-20T14:54:59.999Z');
    expect(isEndOfShiftWindow(now, endsAt, intervalMins, graceMins)).toBe(false);
  });

  it('returns true at the start of the late window (inclusive)', () => {
    const now = new Date('2026-05-20T14:55:00.000Z');
    expect(isEndOfShiftWindow(now, endsAt, intervalMins, graceMins)).toBe(true);
  });

  it('returns true after endsAt (within grace)', () => {
    const now = new Date('2026-05-20T16:02:00.000Z');
    expect(isEndOfShiftWindow(now, endsAt, intervalMins, graceMins)).toBe(true);
  });

  it('returns true well after endsAt', () => {
    const now = new Date('2026-05-20T17:00:00.000Z');
    expect(isEndOfShiftWindow(now, endsAt, intervalMins, graceMins)).toBe(true);
  });

  it('handles different interval values', () => {
    const shortInterval = 30;
    const shortGrace = 2;

    // late window = 32 min before endsAt => 15:28:00.000Z
    const justBefore = new Date('2026-05-20T15:27:59.999Z');
    expect(isEndOfShiftWindow(justBefore, endsAt, shortInterval, shortGrace)).toBe(false);

    const atWindow = new Date('2026-05-20T15:28:00.000Z');
    expect(isEndOfShiftWindow(atWindow, endsAt, shortInterval, shortGrace)).toBe(true);
  });
});
