import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// --- Auth ---
const ApiKeyAuth = registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-KEY',
});

// --- Common Schemas ---
const PaginationSchema = registry.register('Pagination', z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
}));

// --- Enums ---
const ShiftStatusSchema = registry.register('ShiftStatus', z.enum(['scheduled', 'in_progress', 'completed', 'missed', 'cancelled']).openapi({ example: 'completed' }));
const AttendanceStatusSchema = registry.register('AttendanceStatus', z.enum(['present', 'absent', 'late']).openapi({ example: 'present' }));
const CheckInStatusSchema = registry.register('CheckInStatus', z.enum(['on_time', 'late']).openapi({ example: 'on_time' }));

// --- Grouped Attendance Schemas ---
const SiteMiniSchema = z.object({
  name: z.string().openapi({ example: 'Headquarters' }),
  clientName: z.string().nullable().openapi({ example: 'Headquarters Owner' }),
  address: z.string().nullable().openapi({ example: 'Jl. Umalas 1 Gg. XXII...' }),
  latitude: z.number().nullable().openapi({ example: -8.6695866 }),
  longitude: z.number().nullable().openapi({ example: 115.1538065 }),
});

const ShiftTypeMiniSchema = z.object({
  name: z.string().openapi({ example: 'Morning Shift' }),
});

const GroupedShiftSchema = z.object({
  date: z.string().openapi({ example: '2026-02-15T00:00:00.000Z' }),
  startsAt: z.string().openapi({ example: '2026-02-16T00:00:00.000Z' }),
  endsAt: z.string().openapi({ example: '2026-02-16T08:00:00.000Z' }),
  status: ShiftStatusSchema,
  missedCount: z.number().openapi({ example: 1 }),
  site: SiteMiniSchema,
  shiftType: ShiftTypeMiniSchema,
});

const AttendanceItemSchema = z.object({
  id: z.string().uuid().openapi({ example: '8c44a2f3-4ed6-4f89-a653-ae31e1844d43' }),
  employeeId: z.string().openapi({ example: 'EMP001' }),
  recordedAt: z.string().openapi({ example: '2026-02-16T05:20:21.265Z' }),
  status: AttendanceStatusSchema,
  metadata: z.any().nullable(),
  shift: GroupedShiftSchema,
});

const CheckInItemSchema = z.object({
  id: z.string().uuid().openapi({ example: '9f5720de-d10c-4517-9e45-ddc980a952fa' }),
  employeeId: z.string().openapi({ example: 'EMP001' }),
  at: z.string().openapi({ example: '2026-02-16T05:20:25.268Z' }),
  source: z.string().nullable().openapi({ example: 'web-ui' }),
  status: CheckInStatusSchema,
  metadata: z.any().nullable(),
  createdAt: z.string().openapi({ example: '2026-02-16T05:20:25.278Z' }),
});

const GroupedAttendanceResponseSchema = registry.register('GroupedAttendance', z.object({
  attendance: AttendanceItemSchema,
  checkins: z.array(CheckInItemSchema),
}));

// --- Paths ---

// Get Attendances with Check-ins for all employees (Grouped)
registry.registerPath({
  method: 'get',
  path: '/api/external/v1/attendance/grouped',
  summary: 'Get all attendances with check-ins grouped by shift',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
    { name: 'employeeId', in: 'query', schema: { type: 'string' } },
    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
  ],
  responses: {
    200: {
      description: 'List of attendances with check-ins',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(GroupedAttendanceResponseSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

export function getOpenApiSpec() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Eagle Protect Grouped Attendance API',
      description: 'API for external access to grouped attendance and check-in data.',
    },
    servers: [{ url: '/api/external/v1' }],
  });
}
