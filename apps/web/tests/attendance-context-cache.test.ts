import { buildCachedAttendanceContextResolvers } from '@/lib/attendance-context-cache';

describe('buildCachedAttendanceContextResolvers', () => {
  test('caches context resolutions for the same (employeeId, businessDate) key', async () => {
    const resolveContext = jest.fn().mockResolvedValue({ windowEnd: new Date('2026-04-01T09:00:00.000Z') });
    const getScheduledPaidMinutes = jest.fn().mockResolvedValue(480);

    const { resolveContext: resolveCached, getScheduledPaidMinutes: getCached } = buildCachedAttendanceContextResolvers({
      resolveContext: resolveContext as never,
      getScheduledPaidMinutes: getScheduledPaidMinutes as never,
    });

    const at = new Date('2026-04-01T01:00:00.000Z');
    await resolveCached('emp-1', at);
    await resolveCached('emp-1', at);
    await resolveCached('emp-1', at);

    expect(resolveContext).toHaveBeenCalledTimes(1);

    await getCached('emp-1', at);
    await getCached('emp-1', at);
    expect(getScheduledPaidMinutes).toHaveBeenCalledTimes(1);
  });

  test('caches context per business date in the same timezone', async () => {
    const resolveContext = jest.fn().mockResolvedValue({ windowEnd: null });
    const getScheduledPaidMinutes = jest.fn().mockResolvedValue(0);

    const { resolveContext: resolveCached, getScheduledPaidMinutes: getCached } = buildCachedAttendanceContextResolvers({
      resolveContext: resolveContext as never,
      getScheduledPaidMinutes: getScheduledPaidMinutes as never,
    });

    const day1 = new Date('2026-04-01T01:00:00.000Z');
    const day1Later = new Date('2026-04-01T08:00:00.000Z');
    const day2 = new Date('2026-04-02T01:00:00.000Z');

    await resolveCached('emp-1', day1);
    await resolveCached('emp-1', day1Later);
    await resolveCached('emp-1', day2);
    expect(resolveContext).toHaveBeenCalledTimes(2);

    await getCached('emp-1', day1);
    await getCached('emp-1', day1Later);
    await getCached('emp-1', day2);
    expect(getScheduledPaidMinutes).toHaveBeenCalledTimes(2);
  });

  test('isolates caches per employeeId', async () => {
    const resolveContext = jest.fn().mockResolvedValue({ windowEnd: null });
    const getScheduledPaidMinutes = jest.fn().mockResolvedValue(0);

    const { resolveContext: resolveCached, getScheduledPaidMinutes: getCached } = buildCachedAttendanceContextResolvers({
      resolveContext: resolveContext as never,
      getScheduledPaidMinutes: getScheduledPaidMinutes as never,
    });

    const at = new Date('2026-04-01T01:00:00.000Z');
    await resolveCached('emp-1', at);
    await resolveCached('emp-2', at);
    expect(resolveContext).toHaveBeenCalledTimes(2);

    await getCached('emp-1', at);
    await getCached('emp-2', at);
    expect(getScheduledPaidMinutes).toHaveBeenCalledTimes(2);
  });

  test('coalesces concurrent requests for the same key', async () => {
    let release!: () => void;
    const block = new Promise<void>(resolve => {
      release = resolve;
    });
    const resolveContext = jest
      .fn()
      .mockImplementation(async () => {
        await block;
        return { windowEnd: null };
      });
    const getScheduledPaidMinutes = jest.fn().mockResolvedValue(0);

    const { resolveContext: resolveCached } = buildCachedAttendanceContextResolvers({
      resolveContext: resolveContext as never,
      getScheduledPaidMinutes: getScheduledPaidMinutes as never,
    });

    const at = new Date('2026-04-01T01:00:00.000Z');
    const p1 = resolveCached('emp-1', at);
    const p2 = resolveCached('emp-1', at);
    const p3 = resolveCached('emp-1', at);

    expect(resolveContext).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([p1, p2, p3]);

    expect(resolveContext).toHaveBeenCalledTimes(1);
  });
});
