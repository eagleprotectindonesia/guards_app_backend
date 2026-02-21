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

const AttendanceStatusSchema = registry.register(
  'AttendanceStatus',
  z.enum(['present', 'absent', 'late']).openapi({ example: 'present' })
);
const CheckInStatusSchema = registry.register(
  'CheckInStatus',
  z.enum(['on_time', 'late']).openapi({ example: 'on_time' })
);

const ErrorSchema = registry.register(
  'Error',
  z.object({
    error: z.string().openapi({ example: 'Invalid request' }),
  })
);

// --- Grouped Attendance Schemas ---

const AttendanceItemSchema = z.object({
  recordedAt: z.string().openapi({ example: '2026-02-16T05:20:21.265Z' }),
  status: AttendanceStatusSchema,
  latenessMins: z.number().optional().openapi({ example: 15 }),
});

const CheckInItemSchema = z.object({
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
      employee_id: z.string().optional().openapi({ description: 'Filter by employee ID' }),
      start_date: z.string().datetime().optional().openapi({
        description: 'Start date (ISO 8601). If not provided, defaults to 7 days before end_date.',
      }),
      end_date: z.string().datetime().optional().openapi({
        description:
          'End date (ISO 8601). If not provided, defaults to current time. If `employee_id` is not provided, the range between start_date and end_date cannot exceed 1 week.',
      }),
    }),
  },
  responses: {
    200: {
      description:
        'Streamed response grouped by employee ID. Each key is an employee ID and its value is an array of attendance+checkin records for that employee within the requested date range.',
      content: {
        'application/json': {
          schema: z.object({
            data: z.record(z.string(), z.array(GroupedAttendanceResponseSchema)).openapi({
              example: {
                EMP001: [
                  {
                    attendance: { recordedAt: '2026-02-16T05:20:21.265Z', status: 'present' },
                    checkins: [{ at: '2026-02-16T06:20:00.000Z', status: 'on_time' }],
                  },
                ],
              },
            }),
          }),
        },
      },
    },
    400: {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: ErrorSchema,
          examples: {
            dateRangeError: {
              summary: 'Date range limit exceeded',
              value: { error: 'Date range cannot exceed 1 week when not querying a specific employee.' },
            },
            invalidFormat: {
              summary: 'Invalid date format',
              value: { error: 'Invalid start_date format. Use ISO 8601 format.' },
            },
          },
        },
      },
    },
    401: {
      description: 'Unauthorized - Invalid or missing API Key',
      content: {
        'application/json': {
          schema: ErrorSchema,
          example: { error: 'Unauthorized' },
        },
      },
    },
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
