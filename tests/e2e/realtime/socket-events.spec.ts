import { test, expect } from '../helpers/api-client';
import { setupTestDatabase, cleanDatabase, getTestPrisma } from '../fixtures/database';
import { createCompleteTestSetup, createShift } from '../fixtures/factories';
import { 
  createAdminSocket, 
  connectSocket, 
  waitForSocketEvent, 
  disconnectSocket 
} from '../helpers/socket-client';
import type { Admin, Employee, Site } from '@repo/database';

test.describe('Real-time Socket.io Events', () => {
  let admin: Admin;
  let employee: Employee;
  let site: Site;

  test.beforeAll(async () => {
    await setupTestDatabase();
  });

  test.beforeEach(async () => {
    await cleanDatabase();
    
    const setup = await createCompleteTestSetup();
    admin = setup.admin;
    employee = setup.employee;
    site = setup.site;
  });

  test('admin should receive alert event when missed attendance alert is created', async () => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    // Create admin socket connection
    const socket = createAdminSocket(admin);
    await connectSocket(socket);
    
    // Join admin room
    socket.emit('join_admin_room');
    
    // Wait a bit for room join
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create shift
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setMinutes(now.getMinutes() - 10);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      status: 'scheduled',
    });
    
    // Set up event listener
    const alertPromise = waitForSocketEvent(socket, 'alert', 3000);
    
    // Create missed attendance alert
    await prisma.alert.create({
      data: {
        shiftId: shift.id,
        siteId: site.id,
        reason: 'missed_attendance',
        severity: 'critical',
        windowStart: startsAt,
      },
    });
    
    // Publish alert event (simulating worker behavior)
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    
    const alert = await prisma.alert.findFirst({
      where: { shiftId: shift.id },
      include: {
        shift: {
          include: {
            employee: true,
            site: true,
          },
        },
      },
    });
    
    await redis.publish('admin', JSON.stringify({
      type: 'alert',
      data: alert,
    }));
    
    // Wait for event
    const receivedAlert = await alertPromise;
    
    expect(receivedAlert).toBeDefined();
    expect(receivedAlert.reason).toBe('missed_attendance');
    expect(receivedAlert.shiftId).toBe(shift.id);
    
    // Cleanup
    await redis.quit();
    disconnectSocket(socket);
  });

  test('admin should receive active shifts stream', async () => {
    const prisma = getTestPrisma();
    const setup = await createCompleteTestSetup();
    
    // Create socket connection
    const socket = createAdminSocket(admin);
    await connectSocket(socket);
    
    socket.emit('join_admin_room');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create an active shift
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setMinutes(now.getMinutes() - 30);
    
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 8);
    
    const shift = await createShift({
      siteId: site.id,
      shiftTypeId: setup.shiftType.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      status: 'in_progress',
    });
    
    await prisma.attendance.create({
      data: {
        shiftId: shift.id,
        employeeId: employee.id,
        status: 'present',
        recordedAt: startsAt,
      },
    });
    
    // Set up event listener
    const shiftsPromise = waitForSocketEvent(socket, 'active_shifts', 3000);
    
    // Publish active shifts (simulating worker behavior)
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    
    const activeShifts = await prisma.shift.findMany({
      where: {
        status: { in: ['scheduled', 'in_progress'] },
      },
      include: {
        employee: true,
        site: true,
        shiftType: true,
        attendance: true,
      },
    });
    
    await redis.publish('admin', JSON.stringify({
      type: 'active_shifts',
      data: activeShifts,
    }));
    
    // Wait for event
    const receivedShifts = await shiftsPromise;
    
    expect(receivedShifts).toBeDefined();
    expect(Array.isArray(receivedShifts)).toBe(true);
    expect(receivedShifts.length).toBeGreaterThan(0);
    
    const receivedShift = receivedShifts.find((s: any) => s.id === shift.id);
    expect(receivedShift).toBeDefined();
    expect(receivedShift.status).toBe('in_progress');
    
    // Cleanup
    await redis.quit();
    disconnectSocket(socket);
  });

  test('admin should receive dashboard backfill on connection', async () => {
    const socket = createAdminSocket(admin);
    await connectSocket(socket);
    
    socket.emit('join_admin_room');
    
    // Request dashboard backfill
    const backfillPromise = waitForSocketEvent(socket, 'dashboard:backfill', 3000);
    socket.emit('request_dashboard_backfill');
    
    // Wait for backfill data
    const backfillData = await backfillPromise;
    
    expect(backfillData).toBeDefined();
    expect(backfillData.activeShifts).toBeDefined();
    expect(backfillData.upcomingShifts).toBeDefined();
    expect(backfillData.recentAlerts).toBeDefined();
    
    disconnectSocket(socket);
  });

  test('should handle socket authentication failure', async () => {
    // Create socket with invalid token
    const { io } = require('socket.io-client');
    const socket = io(process.env.API_BASE_URL || 'http://localhost:3000', {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      reconnection: false,
    });
    
    // Wait for connection error
    const errorPromise = new Promise((resolve) => {
      socket.on('connect_error', (error: any) => {
        resolve(error);
      });
    });
    
    const error = await errorPromise;
    expect(error).toBeDefined();
    
    socket.disconnect();
  });
});
