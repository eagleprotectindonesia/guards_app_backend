import { test, expect } from '../helpers/api-client';
import { setupTestDatabase, cleanDatabase, getTestPrisma } from '../fixtures/database';
import { createCompleteTestSetup, createShift } from '../fixtures/factories';
import { makeEmployeeRequest } from '../helpers/api-client';
import type { Employee, Site, Shift } from '@repo/database';

test.describe('Initial Attendance Recording', () => {
  let employee: Employee;
  let site: Site;
  let shift: Shift;

  test.beforeAll(async () => {
    await setupTestDatabase();
  });

  test.beforeEach(async () => {
    await cleanDatabase();
    
    // Create test setup
    const setup = await createCompleteTestSetup();
    employee = setup.employee;
    site = setup.site;
    
    // Create a shift starting now
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setMinutes(now.getMinutes() - 2); // Started 2 minutes ago
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8); // 8-hour shift
    
    shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      requiredCheckinIntervalMins: 60,
      graceMinutes: 5,
      status: 'scheduled',
    });
  });

  test('should successfully record attendance within grace period', async ({ request }) => {
    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/attendance`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.attendance).toBeDefined();
    expect(data.attendance.status).toBe('present');
    expect(data.shift.status).toBe('in_progress');

    // Verify in database
    const prisma = getTestPrisma();
    const attendance = await prisma.attendance.findUnique({
      where: { shiftId: shift.id },
    });
    
    expect(attendance).not.toBeNull();
    expect(attendance?.status).toBe('present');
    
    const updatedShift = await prisma.shift.findUnique({
      where: { id: shift.id },
    });
    
    expect(updatedShift?.status).toBe('in_progress');
  });

  test('should reject attendance with invalid location (too far from site)', async ({ request }) => {
    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/attendance`,
      {
        data: {
          location: {
            lat: site.latitude! + 1, // ~111km away
            lng: site.longitude! + 1,
          },
        },
      }
    );

    expect(response.status()).toBe(400);
    
    const data = await response.json();
    expect(data.error).toContain('location');

    // Verify no attendance created
    const prisma = getTestPrisma();
    const attendance = await prisma.attendance.findUnique({
      where: { shiftId: shift.id },
    });
    
    expect(attendance).toBeNull();
  });

  test('should prevent duplicate attendance recording', async ({ request }) => {
    // Record first attendance
    const firstResponse = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/attendance`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
        },
      }
    );

    expect(firstResponse.status()).toBe(200);

    // Attempt second attendance
    const secondResponse = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/attendance`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
        },
      }
    );

    expect(secondResponse.status()).toBe(400);
    
    const data = await secondResponse.json();
    expect(data.error).toContain('already');
  });

  test('should auto-resolve missed attendance alert when attendance is recorded', async ({ request }) => {
    const prisma = getTestPrisma();
    
    // Create a missed attendance alert
    const alert = await prisma.alert.create({
      data: {
        shiftId: shift.id,
        siteId: site.id,
        reason: 'missed_attendance',
        severity: 'critical',
        windowStart: shift.startsAt,
      },
    });

    // Record attendance
    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${shift.id}/attendance`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
        },
      }
    );

    expect(response.status()).toBe(200);

    // Verify alert is auto-resolved
    const updatedAlert = await prisma.alert.findUnique({
      where: { id: alert.id },
    });
    
    expect(updatedAlert?.resolvedAt).not.toBeNull();
    expect(updatedAlert?.resolutionType).toBe('auto');
  });

  test('should mark attendance as late if recorded after grace period', async ({ request }) => {
    // Create a shift that started 10 minutes ago (past 5-minute grace period)
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setMinutes(now.getMinutes() - 10);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const lateShift = await createShift({
      siteId: site.id,
      shiftTypeId: (await getTestPrisma().shiftType.findFirst())!.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      graceMinutes: 5,
      status: 'scheduled',
    });

    const response = await makeEmployeeRequest(
      request,
      employee,
      'POST',
      `/api/employee/shifts/${lateShift.id}/attendance`,
      {
        data: {
          location: {
            lat: site.latitude,
            lng: site.longitude,
          },
        },
      }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.attendance.status).toBe('late');
  });
});
