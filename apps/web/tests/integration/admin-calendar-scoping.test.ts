import { GET as masterGet } from '../../app/api/admin/calendar/route';
import { GET as eventListGet } from '../../app/api/admin/calendar/events/route';
import { GET as eventDetailGet } from '../../app/api/admin/calendar/events/[id]/route';
import { GET as itemDetailGet } from '../../app/api/admin/calendar/items/[type]/[id]/route';

const mockRequirePermission = jest.fn();
const mockHolidayFindMany = jest.fn();
const mockMemoFindMany = jest.fn();
const mockEventFindMany = jest.fn();
const mockEventFindFirst = jest.fn();
const mockGetTagsForEvents = jest.fn();
const mockGetCalendarEventTags = jest.fn();
const mockGetAdminName = jest.fn();

jest.mock('@/lib/admin-auth', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  prisma: {
    holidayCalendarEntry: { findMany: jest.fn() },
    officeMemo: { findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn(), findFirst: jest.fn() },
  },
  getTagsForEvents: jest.fn(),
  getCalendarEventTags: jest.fn(),
}));

jest.mock('@/lib/calendar-notifications', () => ({
  getAdminName: jest.fn(),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
      })),
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();

  mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: false });
  mockHolidayFindMany.mockResolvedValue([]);
  mockMemoFindMany.mockResolvedValue([]);
  mockEventFindMany.mockResolvedValue([]);
  mockEventFindFirst.mockResolvedValue(null);
  mockGetTagsForEvents.mockResolvedValue({});
  mockGetCalendarEventTags.mockResolvedValue([]);
  mockGetAdminName.mockResolvedValue('Test Admin');

  const db = jest.requireMock('@repo/database');
  db.prisma.holidayCalendarEntry.findMany = mockHolidayFindMany;
  db.prisma.officeMemo.findMany = mockMemoFindMany;
  db.prisma.calendarEvent.findMany = mockEventFindMany;
  db.prisma.calendarEvent.findFirst = mockEventFindFirst;
  db.getTagsForEvents = mockGetTagsForEvents;
  db.getCalendarEventTags = mockGetCalendarEventTags;

  const auth = jest.requireMock('@/lib/admin-auth');
  auth.requirePermission = mockRequirePermission;

  const notif = jest.requireMock('@/lib/calendar-notifications');
  notif.getAdminName = mockGetAdminName;
});

function makeAdminEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'admin-event-1',
    employeeId: null,
    adminId: 'admin-1',
    kind: 'personal_event',
    title: 'Admin Event',
    description: null,
    startDate: new Date('2025-01-15'),
    endDate: new Date('2025-01-15'),
    startTime: null,
    endTime: null,
    allDay: true,
    location: null,
    latitude: null,
    longitude: null,
    clientName: null,
    trainerName: null,
    priority: 'normal',
    reminderMinutesBefore: null,
    reminderScheduledAt: null,
    reminderSentAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    admin: { id: 'admin-1', name: 'Test Admin' },
    employee: null,
    tags: [],
    ...overrides,
  };
}

function makeEmployeeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'emp-event-1',
    employeeId: 'emp-1',
    adminId: null,
    kind: 'personal_event',
    title: 'Employee Event',
    description: null,
    startDate: new Date('2025-01-15'),
    endDate: new Date('2025-01-15'),
    startTime: null,
    endTime: null,
    allDay: true,
    location: null,
    latitude: null,
    longitude: null,
    clientName: null,
    trainerName: null,
    priority: 'normal',
    reminderMinutesBefore: null,
    reminderScheduledAt: null,
    reminderSentAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    admin: null,
    employee: { id: 'emp-1', fullName: 'Employee One', employeeNumber: 'EMP001' },
    tags: [],
    ...overrides,
  };
}

function buildRequest(path: string, params?: Record<string, string>): Request {
  const url = new URL(path, 'http://localhost');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url);
}

// ──────────────────────────────────────
// Master view (GET /admin/calendar)
// ──────────────────────────────────────
describe('GET /api/admin/calendar (master view)', () => {
  test('super admin sees employee events and all admin events', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: true });

    const adminEvent = makeAdminEvent({ id: 'a1', title: 'Admin Task' });
    const empEvent = makeEmployeeEvent({ id: 'e1', title: 'Emp Task' });

    mockEventFindMany
      .mockResolvedValueOnce([empEvent])
      .mockResolvedValueOnce([adminEvent]);
    mockHolidayFindMany.mockResolvedValue([]);
    mockMemoFindMany.mockResolvedValue([]);
    mockGetTagsForEvents.mockResolvedValue({});

    const req = buildRequest('/api/admin/calendar', { from: '2025-01-01', to: '2025-01-31' });
    const res = await masterGet(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items).toHaveLength(2);
    expect(data.items.map((i: Record<string, unknown>) => i.title)).toEqual(
      expect.arrayContaining(['Admin Task', 'Emp Task'])
    );
  });

  test('non-super admin sees own admin events but NOT employee events', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: false });

    const adminEvent = makeAdminEvent({ id: 'a1', title: 'Admin Task' });
    const otherAdminEvent = makeAdminEvent({ id: 'a2', title: 'Other Admin', adminId: 'admin-2' });

    mockEventFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([adminEvent, otherAdminEvent]);

    mockHolidayFindMany.mockResolvedValue([]);
    mockMemoFindMany.mockResolvedValue([]);
    mockGetTagsForEvents.mockResolvedValue({});

    const req = buildRequest('/api/admin/calendar', { from: '2025-01-01', to: '2025-01-31' });
    const res = await masterGet(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    const titles = data.items.map((i: Record<string, unknown>) => i.title);
    expect(titles).toContain('Admin Task');
    expect(titles).toContain('Other Admin');
    expect(titles).not.toContain('Emp Task');
    expect(data.items.length).toBeLessThanOrEqual(2);
  });
});

// ──────────────────────────────────────
// Event list (GET /admin/calendar/events)
// ──────────────────────────────────────
describe('GET /api/admin/calendar/events', () => {
  test('super admin sees all admin events', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: true });
    mockGetAdminName.mockResolvedValue('Super Admin');

    const events = [
      makeAdminEvent({ id: 'a1', title: 'My Event', adminId: 'admin-1' }),
      makeAdminEvent({ id: 'a2', title: 'Other Event', adminId: 'admin-2', admin: { id: 'admin-2', name: 'Other Admin' } }),
    ];
    mockEventFindMany.mockResolvedValue(events);

    const req = buildRequest('/api/admin/calendar/events', { from: '2025-01-01', to: '2025-01-31' });
    const res = await eventListGet(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items).toHaveLength(2);
  });
});

// ──────────────────────────────────────
// Event detail (GET /admin/calendar/events/[id])
// ──────────────────────────────────────
describe('GET /api/admin/calendar/events/[id]', () => {
  test('non-super admin gets 404 for another admin\'s event', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: false });

    mockEventFindFirst.mockResolvedValue(null);

    const req = buildRequest('/api/admin/calendar/events/other-event');
    const res = await eventDetailGet(req, { params: Promise.resolve({ id: 'other-event' }) });

    expect(res.status).toBe(404);
  });

  test('super admin can view another admin\'s event', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: true });
    mockGetAdminName.mockResolvedValue('Super Admin');

    const event = makeAdminEvent({ id: 'other-event', title: 'Other Admin Event', adminId: 'admin-2', admin: { id: 'admin-2', name: 'Other Admin' } });
    mockEventFindFirst.mockResolvedValue(event);

    const req = buildRequest('/api/admin/calendar/events/other-event');
    const res = await eventDetailGet(req, { params: Promise.resolve({ id: 'other-event' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.item.title).toBe('Other Admin Event');
    expect(data.item.isOwner).toBe(false);
  });
});

// ──────────────────────────────────────
// Item detail (GET /admin/calendar/items/[type]/[id])
// ──────────────────────────────────────
describe('GET /api/admin/calendar/items/[type]/[id]', () => {
  test('non-super admin can view own event', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: false });

    const event = makeAdminEvent({ id: 'own-event', adminId: 'admin-1' });
    mockEventFindFirst.mockResolvedValue(event);

    const req = buildRequest('/api/admin/calendar/items/personal_event/own-event');
    const res = await itemDetailGet(req, { params: Promise.resolve({ type: 'personal_event', id: 'own-event' }) });

    expect(res.status).toBe(200);
  });

  test('non-super admin can view tagged event', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: false });

    const event = makeAdminEvent({
      id: 'tagged-event',
      adminId: 'admin-2',
      admin: { id: 'admin-2', name: 'Other Admin' },
      tags: [
        { id: 'tag-1', participantType: 'admin', adminId: 'admin-1', employeeId: null },
      ],
    });
    mockEventFindFirst.mockResolvedValue(event);

    const req = buildRequest('/api/admin/calendar/items/personal_event/tagged-event');
    const res = await itemDetailGet(req, { params: Promise.resolve({ type: 'personal_event', id: 'tagged-event' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.item.isOwner).toBe(false);
  });

  test('non-super admin gets 403 for untagged other admin event', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: false });

    const event = makeAdminEvent({
      id: 'other-event',
      adminId: 'admin-2',
      admin: { id: 'admin-2', name: 'Other Admin' },
      tags: [],
    });
    mockEventFindFirst.mockResolvedValue(event);

    const req = buildRequest('/api/admin/calendar/items/personal_event/other-event');
    const res = await itemDetailGet(req, { params: Promise.resolve({ type: 'personal_event', id: 'other-event' }) });

    expect(res.status).toBe(403);
  });

  test('super admin can view any admin event', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'admin-1', isSuperAdmin: true });

    const event = makeAdminEvent({
      id: 'any-event',
      adminId: 'admin-2',
      admin: { id: 'admin-2', name: 'Other Admin' },
      tags: [],
    });
    mockEventFindFirst.mockResolvedValue(event);

    const req = buildRequest('/api/admin/calendar/items/personal_event/any-event');
    const res = await itemDetailGet(req, { params: Promise.resolve({ type: 'personal_event', id: 'any-event' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.item.isOwner).toBe(false);
  });
});
