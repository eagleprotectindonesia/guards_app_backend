import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

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

// --- Employee ---
const EmployeeSchema = registry.register('Employee', z.object({
  id: z.string(),
  title: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  phone: z.string(),
  employeeCode: z.string().nullable(),
  role: z.string().nullable(),
  status: z.boolean().nullable(),
  departmentId: z.string().nullable(),
  designationId: z.string().nullable(),
  officeId: z.string().nullable(),
  joinDate: z.string().nullable(),
  leftDate: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/employees',
  summary: 'List employees',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
    { name: 'departmentId', in: 'query', schema: { type: 'string' } },
    { name: 'designationId', in: 'query', schema: { type: 'string' } },
    { name: 'officeId', in: 'query', schema: { type: 'string' } },
    { name: 'role', in: 'query', schema: { type: 'string' } },
    { name: 'search', in: 'query', schema: { type: 'string' } },
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
  id: z.string(),
  name: z.string(),
  clientName: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  note: z.string().nullable(),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/sites',
  summary: 'List sites',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
    { name: 'search', in: 'query', schema: { type: 'string' } },
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
  id: z.string(),
  siteId: z.string(),
  shiftTypeId: z.string(),
  employeeId: z.string().nullable(),
  date: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.string(),
  checkInStatus: z.string().nullable(),
  requiredCheckinIntervalMins: z.number(),
  graceMinutes: z.number(),
  lastHeartbeatAt: z.string().nullable(),
  missedCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  note: z.string().nullable(),
  site: z.object({ id: z.string(), name: z.string() }),
  employee: z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable() }).nullable(),
  shiftType: z.object({ id: z.string(), name: z.string(), startTime: z.string(), endTime: z.string() }),
}));

registry.registerPath({
  method: 'get',
  path: '/api/external/v1/shifts',
  summary: 'List shifts',
  security: [{ [ApiKeyAuth.name]: [] }],
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
    { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'siteId', in: 'query', schema: { type: 'string' } },
    { name: 'employeeId', in: 'query', schema: { type: 'string' } },
    { name: 'status', in: 'query', schema: { type: 'string' } },
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
