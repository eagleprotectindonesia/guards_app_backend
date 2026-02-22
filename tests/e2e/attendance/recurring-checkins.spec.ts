import { test, expect } from '../helpers/api-client';
import { setupTestDatabase, cleanDatabase, getTestPrisma } from '../fixtures/database';
import { createCompleteTestSetup, createShift } from '../fixtures/factories';
import { makeEmployeeRequest } from '../helpers/api-client';
import type { Employee, Site, Shift } from '@repo/database';

test.describe('Recurring Check-ins', () => {
  let employee: Employee;
  let site: Site;
  let shift: Shift;

  test.beforeAll(async () => {
    await setupTestDatabase();
  });

  test.beforeEach(async () => {
    await cleanDatabase();
    
    const setup = await createCompleteTestSetup();
    employee = setup.employee;
    site = setup.site;
    
    // Create shift that started 1 hour ago with attendance already recorded
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(now.getHours() - 1);
    startsAt.setMinutes(0, 0, 0);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      requiredCheckinIntervalMins: 60,
      graceMinutes: 5,
      status: 'in_progress',
      lastHeartbeatAt: startsAt, // Last check-in was at start
    });
    
    // Create attendance record
    const prisma = getTestPrisma();
    await prisma.attendance.create({
      data: {
        shiftId: shift.id,
        employeeId: employee.id,
        status: 'present',
        recordedAt: startsAt,
      },
    });
  });

  test('should successfully record on-time check-in', async ({ request }) => {
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
    expect(data.checkin).toBeDefined();
    expect(data.checkin.status).toBe('on_time');

    // Verify in database
    const prisma = getTestPrisma();
    const checkin = await prisma.checkin.findFirst({
      where: { shiftId: shift.id },
    });
    
    expect(checkin).not.toBeNull();
    expect(checkin?.status).toBe('on_time');
    
    // Verify lastHeartbeatAt updated
    const updatedShift = await prisma.shift.findUnique({
      where: { id: shift.id },
    });
    
    expect(updatedShift?.lastHeartbeatAt).not.toEqual(shift.lastHeartbeatAt);
  });

  test('should reject early check-in (before window opens)', async ({ request }) => {
    // Create a shift where next check-in is 30 minutes away
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setMinutes(now.getMinutes() - 30); // Started 30 min ago
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const earlyShift = await createShift({
      siteId: site.id,
      shiftTypeId: (await getTestPrisma().shiftType.findFirst())!.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      requiredCheckinIntervalMins: 60,
      graceMinutes: 5,
      status: 'in_progress',
      lastHeartbeatAt: startsAt,
    });
    
    const prisma = getTestPrisma();
    await prisma.attendance.create({
      data: {
        shiftId: earlyShift.id,
        employeeId: employee.id,
        status: 'present',
        recordedAt: startsAt,
      },
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${earlyShift.id}/checkin`,
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
    expect(data.error).toMatch(/early|not yet/i);
  });

  test('should prevent duplicate check-in for same interval', async ({ request }) => {
    // Record first check-in
    const firstResponse = await makeEmployeeRequest(
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

    expect(firstResponse.status()).toBe(200);

    // Attempt second check-in immediately
    const secondResponse = await makeEmployeeRequest(
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

    expect(secondResponse.status()).toBe(400);
    
    const data = await secondResponse.json();
    expect(data.error).toMatch(/already checked in/i);
  });

  test('should reject check-in with invalid location', async ({ request }) => {
    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/checkin`,
      {
        data: {
          location: {
            lat: site.latitude! + 1, // Far from site
            lng: site.longitude! + 1,
          },
          source: 'mobile',
        },
      }
    );

    expect(response.status()).toBe(400);
    
    const data = await response.json();
    expect(data.error).toContain('location');
  });

  test('should require attendance before allowing check-ins', async ({ request }) => {
    // Create a new shift without attendance
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(now.getHours() - 1);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const noAttendanceShift = await createShift({
      siteId: site.id,
      shiftTypeId: (await getTestPrisma().shiftType.findFirst())!.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      status: 'scheduled', // No attendance yet
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${noAttendanceShift.id}/checkin`,
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
    expect(data.error).toMatch(/attendance/i);
  });
});
