import { z } from 'zod';
import { isValidPhoneNumber, parsePhoneNumberWithError } from 'libphonenumber-js';

export const ShiftStatusEnum = z.enum(['scheduled', 'in_progress', 'completed', 'missed', 'cancelled']);

// --- Site ---
export const createSiteSchema = z.object({
  name: z.string().min(1),
  clientName: z.string(),
  address: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  status: z.boolean().optional(),
  note: z.string().optional(),
});

// --- Admin ---
export const createAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  roleId: z.string().min(1, 'Role is required'),
  note: z.string().optional(),
});

export const updateAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
  roleId: z.string().min(1, 'Role is required'),
  note: z.string().optional(),
});

// --- Employee ---
export const createEmployeeSchema = z.object({
  name: z.string().min(1),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .max(17, 'Phone number is too long')
    .refine(
      value => {
        return isValidPhoneNumber(value);
      },
      {
        message: 'Invalid phone number format',
      }
    )
    .refine(
      value => {
        try {
          const phoneNumber = parsePhoneNumberWithError(value);
          return phoneNumber && phoneNumber.nationalNumber.length >= 6 && phoneNumber.nationalNumber.length <= 17;
        } catch {
          return false; // Parsing failed, so it's not a valid phone number for our length check
        }
      },
      {
        message: 'Phone number must be between 6 and 17 characters',
      }
    ),
  id: z
    .string()
    .length(6, 'Employee ID (System ID) must be exactly 6 characters')
    .regex(/^[a-zA-Z0-9]*$/, 'Employee ID must be alphanumeric only'),
  employeeCode: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]*$/, 'Employee code must be alphanumeric only')
    .optional(),
  // For backward compatibility
  guardCode: z.string().max(12).optional(),
  status: z.boolean().optional(),
  joinDate: z.coerce.date(),
  leftDate: z.coerce.date().optional(),
  note: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long'), // Required for creation
});

// Deprecated: Use createEmployeeSchema
export const createGuardSchema = createEmployeeSchema;

export const updateEmployeeSchema = z.object({
  id: z.string().optional(), // Allow id in the schema for form compatibility
  name: z.string().min(1),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .max(17, 'Phone number is too long')
    .refine(
      value => {
        return isValidPhoneNumber(value);
      },
      {
        message: 'Invalid phone number format',
      }
    )
    .refine(
      value => {
        try {
          const phoneNumber = parsePhoneNumberWithError(value);
          return phoneNumber && phoneNumber.nationalNumber.length >= 6 && phoneNumber.nationalNumber.length <= 17;
        } catch {
          return false; // Parsing failed, so it's not a valid phone number for our length check
        }
      },
      {
        message: 'Phone number must be between 6 and 17 characters',
      }
    ),
  employeeCode: z
    .string()
    .max(12)
    .regex(/^[a-zA-Z0-9]*$/, 'Employee code must be alphanumeric only')
    .optional(),
  // For backward compatibility
  guardCode: z.string().max(12).optional(),
  status: z.boolean().optional(),
  joinDate: z.coerce.date(),
  leftDate: z.coerce.date().nullable().optional(),
  note: z.string().nullable().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(), // Optional for updates
});

// Deprecated: Use updateEmployeeSchema
export const updateGuardSchema = updateEmployeeSchema;

export const updateEmployeePasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    confirmPassword: z.string().min(6, 'Password must be at least 6 characters long'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Deprecated: Use updateEmployeePasswordSchema
export const updateGuardPasswordSchema = updateEmployeePasswordSchema;

// --- Shift Type ---
const timeFormat = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format');

export const createShiftTypeSchema = z.object({
  name: z.string().min(1),
  startTime: timeFormat,
  endTime: timeFormat,
});

// --- Shift ---
export const createShiftSchema = z.object({
  siteId: z.uuid(),
  shiftTypeId: z.uuid(),
  employeeId: z.string().min(1).optional(),
  // For backward compatibility
  guardId: z.string().min(1).optional(),
  date: z.string().min(1), // Expects "YYYY-MM-DD"
  requiredCheckinIntervalMins: z.number().int().min(5).default(60),
  graceMinutes: z.number().int().min(1).default(15),
  note: z.string().optional(),
}).refine(data => data.employeeId || data.guardId, {
  message: "Employee ID or Guard ID is required",
  path: ["employeeId"]
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

// --- Role ---
export const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).min(1, 'At least one permission is required'),
});

export const updateRoleSchema = createRoleSchema;

// --- System Settings ---
export const updateSettingsSchema = z.record(z.string(), z.string());

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = CreateSiteInput; // Same for now
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type CreateGuardInput = z.infer<typeof createGuardSchema>;
export type UpdateGuardInput = z.infer<typeof updateGuardSchema>;
export type UpdateGuardPasswordInput = z.infer<typeof updateGuardPasswordSchema>;
export type CreateShiftTypeInput = z.infer<typeof createShiftTypeSchema>;
export type UpdateShiftTypeInput = CreateShiftTypeInput; // Same for now
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = CreateShiftInput; // Same for now
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
