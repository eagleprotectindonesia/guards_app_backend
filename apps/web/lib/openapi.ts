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

const RelationSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// --- Enums ---
const EmployeeRoleSchema = registry.register('EmployeeRole', z.enum(['on_site', 'office']).openapi({ example: 'on_site' }));
const EmployeeTitleSchema = registry.register('EmployeeTitle', z.enum(['Mr', 'Miss', 'Mrs']).openapi({ example: 'Mr' }));
const ShiftStatusSchema = registry.register('ShiftStatus', z.enum(['scheduled', 'in_progress', 'completed', 'missed', 'cancelled']).openapi({ example: 'scheduled' }));
const CheckInStatusSchema = registry.register('CheckInStatus', z.enum(['on_time', 'late', 'invalid']).openapi({ example: 'on_time' }));
const AttendanceStatusSchema = registry.register('AttendanceStatus', z.enum(['present', 'absent', 'late', 'pending_verification', 'clocked_out']).openapi({ example: 'present' }));

// --- Department ---
const DepartmentSchema = registry.register('Department', z.object({
  id: z.string().openapi({ example: 'dept_123' }),
  name: z.string().openapi({ example: 'Operations' }),
  note: z.string().nullable().openapi({ example: 'Main operations department' }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  deletedAt: z.string().nullable().openapi({ example: null }),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/departments',
  summary: 'List departments',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1, example: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, example: 10 } },
    { name: 'search', in: 'query', schema: { type: 'string', example: 'Operations' } },
  ],
  responses: {
    200: {
      description: 'List of departments',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(DepartmentSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// --- Designation ---
const DesignationSchema = registry.register('Designation', z.object({
  id: z.string().openapi({ example: 'desig_456' }),
  name: z.string().openapi({ example: 'Security Guard' }),
  role: EmployeeRoleSchema.nullable(),
  departmentId: z.string().openapi({ example: 'dept_123' }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  deletedAt: z.string().nullable().openapi({ example: null }),
  department: DepartmentSchema.optional(),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/designations',
  summary: 'List designations',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1, example: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, example: 10 } },
    { name: 'departmentId', in: 'query', schema: { type: 'string', example: 'dept_123' } },
    { name: 'role', in: 'query', schema: { type: 'string', enum: ['on_site', 'office'], example: 'on_site' } },
    { name: 'search', in: 'query', schema: { type: 'string', example: 'Guard' } },
  ],
  responses: {
    200: {
      description: 'List of designations',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(DesignationSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// --- Employee ---
const EmployeeSchema = registry.register('Employee', z.object({
  id: z.string().openapi({ example: 'emp_123' }),
  title: EmployeeTitleSchema,
  firstName: z.string().openapi({ example: 'John' }),
  lastName: z.string().nullable().openapi({ example: 'Doe' }),
  phone: z.string().openapi({ example: '+628123456789' }),
  employeeCode: z.string().nullable().openapi({ example: 'EP001' }),
  role: EmployeeRoleSchema.nullable(),
  status: z.boolean().nullable().openapi({ example: true }),
  departmentId: z.string().nullable().openapi({ example: 'dept_123' }),
  designationId: z.string().nullable().openapi({ example: 'desig_456' }),
  officeId: z.string().nullable().openapi({ example: 'off_789' }),
  joinDate: z.string().nullable().openapi({ example: '2023-01-01' }),
  leftDate: z.string().nullable().openapi({ example: null }),
  note: z.string().nullable().openapi({ example: 'Experienced guard' }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  deletedAt: z.string().nullable().openapi({ example: null }),
  department: RelationSchema.nullable().openapi({ example: { id: 'dept_123', name: 'Operations' } }),
  designation: RelationSchema.nullable().openapi({ example: { id: 'desig_456', name: 'Security Guard' } }),
  office: RelationSchema.nullable().openapi({ example: { id: 'off_789', name: 'Main Office' } }),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/employees',
  summary: 'List employees',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1, example: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, example: 10 } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['true', 'false'], example: 'true' } },
    { name: 'departmentId', in: 'query', schema: { type: 'string', example: 'dept_123' } },
    { name: 'designationId', in: 'query', schema: { type: 'string', example: 'desig_456' } },
    { name: 'officeId', in: 'query', schema: { type: 'string', example: 'off_789' } },
    { name: 'role', in: 'query', schema: { type: 'string', enum: ['on_site', 'office'], example: 'on_site' } },
    { name: 'search', in: 'query', schema: { type: 'string', example: 'John' } },
  ],
  responses: {
    200: {
      description: 'List of employees',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(EmployeeSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// --- Site ---
const SiteSchema = registry.register('Site', z.object({
  id: z.string().openapi({ example: 'site_123' }),
  name: z.string().openapi({ example: 'Grand Bali Resort' }),
  clientName: z.string().nullable().openapi({ example: 'Resort Group Corp' }),
  address: z.string().nullable().openapi({ example: 'Jl. Raya Kuta No. 1' }),
  latitude: z.number().nullable().openapi({ example: -8.7209 }),
  longitude: z.number().nullable().openapi({ example: 115.1786 }),
  status: z.boolean().nullable().openapi({ example: true }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  deletedAt: z.string().nullable().openapi({ example: null }),
  note: z.string().nullable().openapi({ example: 'VIP Client' }),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/sites',
  summary: 'List sites',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1, example: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, example: 10 } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['true', 'false'], example: 'true' } },
    { name: 'search', in: 'query', schema: { type: 'string', example: 'Resort' } },
  ],
  responses: {
    200: {
      description: 'List of sites',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(SiteSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// --- Shift ---
const ShiftSchema = registry.register('Shift', z.object({
  id: z.string().openapi({ example: 'shift_123' }),
  siteId: z.string().openapi({ example: 'site_123' }),
  shiftTypeId: z.string().openapi({ example: 'st_123' }),
  employeeId: z.string().nullable().openapi({ example: 'emp_123' }),
  date: z.string().openapi({ example: '2024-01-20' }),
  startsAt: z.string().openapi({ example: '2024-01-20T08:00:00Z' }),
  endsAt: z.string().openapi({ example: '2024-01-20T16:00:00Z' }),
  status: ShiftStatusSchema,
  checkInStatus: CheckInStatusSchema.nullable(),
  requiredCheckinIntervalMins: z.number().openapi({ example: 20 }),
  graceMinutes: z.number().openapi({ example: 5 }),
  lastHeartbeatAt: z.string().nullable().openapi({ example: '2024-01-20T08:15:00Z' }),
  missedCount: z.number().openapi({ example: 0 }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  deletedAt: z.string().nullable().openapi({ example: null }),
  note: z.string().nullable().openapi({ example: 'Standard morning shift' }),
  site: z.object({ id: z.string(), name: z.string() }).optional().openapi({ example: { id: 'site_123', name: 'Grand Bali Resort' } }),
  employee: z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable() }).nullable().optional().openapi({ example: { id: 'emp_123', firstName: 'John', lastName: 'Doe' } }),
  shiftType: z.object({ id: z.string(), name: z.string(), startTime: z.string(), endTime: z.string() }).optional().openapi({ example: { id: 'st_123', name: 'Morning', startTime: '08:00', endTime: '16:00' } }),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/shifts',
  summary: 'List shifts',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1, example: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, example: 10 } },
    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date', example: '2024-01-20' } },
    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date', example: '2024-01-21' } },
    { name: 'siteId', in: 'query', schema: { type: 'string', example: 'site_123' } },
    { name: 'employeeId', in: 'query', schema: { type: 'string', example: 'emp_123' } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['scheduled', 'in_progress', 'completed', 'missed', 'cancelled'], example: 'scheduled' } },
  ],
  responses: {
    200: {
      description: 'List of shifts',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(ShiftSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// --- Attendance ---
const AttendanceSchema = registry.register('Attendance', z.object({
  id: z.string().openapi({ example: 'att_123' }),
  shiftId: z.string().openapi({ example: 'shift_123' }),
  employeeId: z.string().nullable().openapi({ example: 'emp_123' }),
  recordedAt: z.string().openapi({ example: '2024-01-20T08:05:00Z' }),
  picture: z.string().nullable().openapi({ example: 'https://example.com/attendance.jpg' }),
  status: AttendanceStatusSchema,
  metadata: z.any().nullable().openapi({ example: { lat: -8.7209, lng: 115.1786 } }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  updatedAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  employee: EmployeeSchema.nullable().optional(),
  shift: ShiftSchema.nullable().optional(),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/attendance',
  summary: 'List attendance records',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1, example: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, example: 10 } },
    { name: 'employeeId', in: 'query', schema: { type: 'string', example: 'emp_123' } },
    { name: 'shiftId', in: 'query', schema: { type: 'string', example: 'shift_123' } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['present', 'absent', 'late', 'pending_verification', 'clocked_out'], example: 'present' } },
    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date', example: '2024-01-20' } },
    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date', example: '2024-01-21' } },
  ],
  responses: {
    200: {
      description: 'List of attendance records',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(AttendanceSchema),
            pagination: PaginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// --- Checkin ---
const CheckinSchema = registry.register('Checkin', z.object({
  id: z.string().openapi({ example: 'ci_123' }),
  shiftId: z.string().openapi({ example: 'shift_123' }),
  employeeId: z.string().openapi({ example: 'emp_123' }),
  at: z.string().openapi({ example: '2024-01-20T08:20:00Z' }),
  source: z.string().nullable().openapi({ example: 'mobile_app' }),
  status: CheckInStatusSchema,
  metadata: z.any().nullable().openapi({ example: { device: 'Android' } }),
  createdAt: z.string().openapi({ example: '2024-01-20T10:00:00Z' }),
  employee: EmployeeSchema.nullable().optional(),
  shift: ShiftSchema.nullable().optional(),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/check-ins',
  summary: 'List check-in records',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
    { name: 'employeeId', in: 'query', schema: { type: 'string' } },
    { name: 'shiftId', in: 'query', schema: { type: 'string' } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['on_time', 'late', 'invalid'] } },
    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
  ],
  responses: {
    200: {
      description: 'List of check-in records',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(CheckinSchema),
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
      title: 'Eagle Protect Public API',
      description: 'API for external access to Eagle Protect guard scheduling data.',
    },
    servers: [{ url: '/api/external/v1' }],
  });
}
