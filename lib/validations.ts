import { z } from 'zod';

export const ShiftStatusEnum = z.enum(['scheduled', 'in_progress', 'completed', 'missed']);

// --- Site ---
export const createSiteSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().optional(),
  timeZone: z.string().optional(), // Validate IANA time zone if possible, string for now
});

// --- Admin ---
export const createAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

// --- Guard ---
export const createGuardSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1), // Simple validation, can be enhanced with regex
  guardCode: z.string().max(10).optional(),
  status: z.boolean().optional(),
  joinDate: z.string().datetime().optional(),
  leftDate: z.string().datetime().optional(),
  note: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long'), // Required for creation
});

export const updateGuardSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1), // Simple validation, can be enhanced with regex
  guardCode: z.string().max(10).optional(),
  status: z.boolean().optional(),
  joinDate: z.string().datetime().optional(),
  leftDate: z.string().datetime().optional(),
  note: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(), // Optional for updates
});

// --- Shift Type ---
const timeFormat = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format');

export const createShiftTypeSchema = z.object({
  name: z.string().min(1),
  startTime: timeFormat,
  endTime: timeFormat,
});

// --- Shift ---
export const createShiftSchema = z.object({
  siteId: z.string().uuid(),
  shiftTypeId: z.string().uuid(),
  guardId: z.string().uuid().nullable().optional(),
  date: z.string().date(), // Expects "YYYY-MM-DD"
  requiredCheckinIntervalMins: z.number().int().min(5).default(60),
  graceMinutes: z.number().int().min(1).default(15),
});

// --- Checkin ---
export const checkInSchema = z.object({
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(), // Example metadata
  source: z.string().optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type CreateGuardInput = z.infer<typeof createGuardSchema>;
export type CreateShiftTypeInput = z.infer<typeof createShiftTypeSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
