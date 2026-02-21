import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// --- Auth ---
const ApiKeyAuth = registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-KEY',
});

// --- Enums ---
const ShiftStatusSchema = registry.register(
  'ShiftStatus',
  z.enum(['scheduled', 'in_progress', 'completed', 'missed', 'cancelled']).openapi({ example: 'completed' })
);
const AttendanceStatusSchema = registry.register(
  'AttendanceStatus',
  z.enum(['present', 'absent', 'late']).openapi({ example: 'present' })
);
const CheckInStatusSchema = registry.register(
  'CheckInStatus',
  z.enum(['on_time', 'late']).openapi({ example: 'on_time' })
);

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
  id: z.uuid().openapi({ example: '8c44a2f3-4ed6-4f89-a653-ae31e1844d43' }),
  employeeId: z.string().openapi({ example: 'EMP001' }),
  recordedAt: z.string().openapi({ example: '2026-02-16T05:20:21.265Z' }),
  status: AttendanceStatusSchema,
  latenessMins: z.number().optional().openapi({ example: 15 }),
  shift: GroupedShiftSchema,
});

const CheckInItemSchema = z.object({
  id: z.uuid().openapi({ example: '9f5720de-d10c-4517-9e45-ddc980a952fa' }),
  employeeId: z.string().openapi({ example: 'EMP001' }),
  at: z.string().openapi({ example: '2026-02-16T05:20:25.268Z' }),
  status: CheckInStatusSchema,
  latenessMins: z.number().optional().openapi({ example: 5 }),
});

const GroupedAttendanceResponseSchema = registry.register(
  'GroupedAttendance',
  z.object({
    attendance: AttendanceItemSchema,
    checkins: z.array(CheckInItemSchema),
  })
);

// --- Paths ---

// Get Attendances with Check-ins for all employees (Grouped)
registry.registerPath({
  method: 'get',
  path: '/api/external/v1/attendance/grouped',
  summary: 'Get all attendances with check-ins grouped by shift',
  security: [{ [ApiKeyAuth.name]: [] }],
  request: {
    query: z.object({
      employeeId: z.string().optional().openapi({ description: 'Filter by employee ID' }),
      startDate: z.iso.datetime().optional().openapi({
        description: 'Start date (ISO 8601). If not provided, defaults to 7 days before endDate.',
      }),
      endDate: z.iso.datetime().optional().openapi({
        description:
          'End date (ISO 8601). If not provided, defaults to current time. If `employeeId` is not provided, the range between startDate and endDate cannot exceed 1 week.',
      }),
    }),
  },
  responses: {
    200: {
      description:
        'Streamed list of attendances with check-ins. Returns a JSON object with a `data` array containing the records. This response is chunk-encoded and streamed to conserve memory.',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(GroupedAttendanceResponseSchema),
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
