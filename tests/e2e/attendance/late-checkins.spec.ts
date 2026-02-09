import { test, expect } from '../helpers/api-client';
import { setupTestDatabase, cleanDatabase, getTestPrisma } from '../fixtures/database';
import { createCompleteTestSetup, createShift } from '../fixtures/factories';
import { makeEmployeeRequest } from '../helpers/api-client';
import type { Employee, Site, Shift } from '@repo/database';

test.describe('Late Check-ins and Bulk Recording', () => {
  let employee: Employee;
  let site: Site;

  test.beforeAll(async () => {
    await setupTestDatabase();
  });

  test.beforeEach(async () => {
    await cleanDatabase();
    
    const setup = await createCompleteTestSetup();
    employee = setup.employee;
    site = setup.site;
  });

  test('should record single late check-in', async ({ request }) => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    // Create shift that started 2 hours ago, last check-in 1 hour 10 min ago
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(now.getHours() - 2);
    startsAt.setMinutes(0, 0, 0);
    
    const lastHeartbeat = new Date(now);
    lastHeartbeat.setMinutes(now.getMinutes() - 70); // 1 hour 10 min ago (past grace period)
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      requiredCheckinIntervalMins: 60,
      graceMinutes: 5,
      status: 'in_progress',
      lastHeartbeatAt: lastHeartbeat,
    });
    
    await prisma.attendance.create({
      data: {
        shiftId: shift.id,
        employeeId: employee.id,
        status: 'present',
        recordedAt: startsAt,
      },
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/checkin`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
          source: 'mobile',
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.checkin.status).toBe('late');
    
    // Verify check-in recorded
    const checkin = await prisma.checkin.findFirst({
      where: { shiftId: shift.id },
    });
    
    expect(checkin).not.toBeNull();
    expect(checkin?.status).toBe('late');
  });

  test('should record bulk late check-ins for multiple missed intervals', async ({ request }) => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    // Create shift that started 4 hours ago
    // Last check-in was at start (4 hours ago)
    // Should have missed 3 intervals (1hr, 2hr, 3hr marks)
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(now.getHours() - 4);
    startsAt.setMinutes(0, 0, 0);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      requiredCheckinIntervalMins: 60,
      graceMinutes: 5,
      status: 'in_progress',
      lastHeartbeatAt: startsAt, // Last check-in at start
    });
    
    await prisma.attendance.create({
      data: {
        shiftId: shift.id,
        employeeId: employee.id,
        status: 'present',
        recordedAt: startsAt,
      },
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/checkin`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
          source: 'mobile',
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.bulkCheckins).toBeDefined();
    
    // Should have created multiple check-ins (3 missed + 1 current)
    const checkins = await prisma.checkin.findMany({
      where: { shiftId: shift.id },
      orderBy: { at: 'asc' },
    });
    
    expect(checkins.length).toBeGreaterThanOrEqual(3);
    
    // All should be marked as late
    checkins.forEach(checkin => {
      expect(checkin.status).toBe('late');
    });
    
    // Verify lastHeartbeatAt updated to latest check-in
    const updatedShift = await prisma.shift.findUnique({
      where: { id: shift.id },
    });
    
    expect(updatedShift?.lastHeartbeatAt).not.toEqual(startsAt);
  });

  test('should auto-resolve all missed check-in alerts when late check-in recorded', async ({ request }) => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(now.getHours() - 2);
    startsAt.setMinutes(0, 0, 0);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      requiredCheckinIntervalMins: 60,
      graceMinutes: 5,
      status: 'in_progress',
      lastHeartbeatAt: startsAt,
    });
    
    await prisma.attendance.create({
      data: {
        shiftId: shift.id,
        employeeId: employee.id,
        status: 'present',
        recordedAt: startsAt,
      },
    });
    
    // Create multiple missed check-in alerts
    const alert1 = await prisma.alert.create({
      data: {
        shiftId: shift.id,
        siteId: site.id,
        reason: 'missed_checkin',
        severity: 'warning',
        windowStart: new Date(startsAt.getTime() + 60 * 60 * 1000), // 1 hour after start
      },
    });
    
    const alert2 = await prisma.alert.create({
      data: {
        shiftId: shift.id,
        siteId: site.id,
        reason: 'missed_checkin',
        severity: 'critical',
        windowStart: new Date(startsAt.getTime() + 120 * 60 * 1000), // 2 hours after start
      },
    });

    // Record late check-in
    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/checkin`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
          source: 'mobile',
        },
      }
    );

    expect(response.status()).toBe(200);

    // Verify both alerts are auto-resolved
    const resolvedAlert1 = await prisma.alert.findUnique({
      where: { id: alert1.id },
    });
    
    const resolvedAlert2 = await prisma.alert.findUnique({
      where: { id: alert2.id },
    });
    
    expect(resolvedAlert1?.resolvedAt).not.toBeNull();
    expect(resolvedAlert1?.resolutionType).toBe('auto');
    
    expect(resolvedAlert2?.resolvedAt).not.toBeNull();
    expect(resolvedAlert2?.resolutionType).toBe('auto');
  });
});
