import { test, expect } from '../helpers/api-client';
import { setupTestDatabase, cleanDatabase, getTestPrisma } from '../fixtures/database';
import { createCompleteTestSetup, createShift } from '../fixtures/factories';
import { makeEmployeeRequest } from '../helpers/api-client';
import type { Employee, Site } from '@repo/database';

test.describe('Shift Completion', () => {
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

  test('should mark shift as completed on last check-in', async ({ request }) => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    // Create a 2-hour shift that started 1 hour 55 minutes ago
    // With 60-min intervals, we need check-ins at 0hr and 1hr
    // We're now at the 2hr mark (last check-in window)
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setMinutes(now.getMinutes() - 115); // 1hr 55min ago
    startsAt.setSeconds(0, 0);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 2); // 2-hour shift
    
    const lastHeartbeat = new Date(startsAt);
    lastHeartbeat.setHours(lastHeartbeat.getHours() + 1); // Last check-in at 1hr mark
    
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

    // Record last check-in
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
    expect(data.isLastSlot).toBe(true);
    
    // Verify shift status is completed
    const updatedShift = await prisma.shift.findUnique({
      where: { id: shift.id },
    });
    
    expect(updatedShift?.status).toBe('completed');
  });

  test('should complete shift on early last check-in (within early window)', async ({ request }) => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    // Create a 2-hour shift ending in 10 minutes
    // Guard checks in early for the last slot
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMinutes(now.getMinutes() + 10);
    
    const startsAt = new Date(endsAt);
    startsAt.setHours(endsAt.getHours() - 2);
    
    const lastHeartbeat = new Date(startsAt);
    lastHeartbeat.setHours(lastHeartbeat.getHours() + 1);
    
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

    // Record early last check-in
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
    expect(data.isLastSlot).toBe(true);
    
    // Verify shift completed
    const updatedShift = await prisma.shift.findUnique({
      where: { id: shift.id },
    });
    
    expect(updatedShift?.status).toBe('completed');
  });

  test('should not allow check-in after shift is completed', async ({ request }) => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(now.getHours() - 2);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 2);
    
    const shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      status: 'completed', // Already completed
      lastHeartbeatAt: endsAt,
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

    expect(response.status()).toBe(400);
    
    const data = await response.json();
    expect(data.error).toMatch(/completed|ended/i);
  });
});
