import { z } from 'zod';
import { isValidPhoneNumber, parsePhoneNumberWithError } from 'libphonenumber-js';
import { isValidShiftTypeTime } from '@repo/shared';

export const ShiftStatusEnum = z.enum(['scheduled', 'in_progress', 'completed', 'missed', 'cancelled']);

export const EmployeeTitleEnum = z.enum(['Mr', 'Miss', 'Mrs']);

export const EmployeeRoleEnum = z.enum(['on_site', 'office']);

const optionalNumber = z.preprocess(val => (!val ? undefined : Number(val)), z.number().optional());

// --- Site ---
export const createSiteSchema = z.object({
  name: z.string().min(1),
  clientName: z.string(),
  address: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  geofenceRadius: optionalNumber,
  status: z.boolean().optional(),
  note: z.string().optional(),
});

// --- Admin ---
export const createAdminSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  roleId: z.string().min(1, 'Role is required'),
  note: z.string().optional(),
});

export const updateAdminSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
  roleId: z.string().min(1, 'Role is required'),
  note: z.string().optional(),
});

export const AdminOwnershipScopeTypeEnum = z.enum(['department', 'office']);

export const adminOwnershipAssignmentSchema = z.object({
  adminId: z.string().min(1, 'Admin ID is required'),
  scopeType: AdminOwnershipScopeTypeEnum,
  scopeValue: z.string().min(1, 'Scope value is required'),
  priority: z.number().int().min(0).default(100),
  isActive: z.boolean().default(true),
});

export const adminOwnershipSelectionSchema = z.object({
  departmentKeys: z.array(z.string().trim().min(1)).default([]),
  officeIds: z.array(z.string().trim().min(1)).default([]),
});

export const adminOwnershipFormSchema = z.object({
  leave: adminOwnershipSelectionSchema,
  employees: adminOwnershipSelectionSchema,
  includeFallbackLeaveQueue: z.boolean().default(false),
});

// --- Employee ---
const emptyStringToNull = z.literal('').transform(() => null);

export const updateEmployeeSchema = z.object({
  id: z.string().optional(), // Allow id in the schema for form compatibility
  fullName: z.string().min(1, 'Full name is required'),
  nickname: z.string().optional(),
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
  employeeNumber: z.string().optional(),
  personnelId: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  role: EmployeeRoleEnum.optional(),
  fieldModeEnabled: z.boolean().optional(),
  status: z.boolean().optional(),
  note: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(), // Optional for updates
});

// Deprecated: Use updateEmployeeSchema
export const updateGuardSchema = updateEmployeeSchema;

export const updateEmployeePasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    confirmPassword: z.string().min(8, 'Password must be at least 8 characters long'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const updateEmployeeFieldModeSchema = z.object({
  fieldModeEnabled: z.boolean(),
});

// Deprecated: Use updateEmployeePasswordSchema
export const updateGuardPasswordSchema = updateEmployeePasswordSchema;

// --- Shift Type ---
const timeFormat = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format');
const guardShiftTypeTimeFormat = z
  .string()
  .refine(value => isValidShiftTypeTime(value), 'Time must be in HH:mm format or 24:00');

export const createShiftTypeSchema = z.object({
  name: z.string().min(1),
  startTime: guardShiftTypeTimeFormat,
  endTime: guardShiftTypeTimeFormat,
});

export const createOfficeShiftTypeSchema = z.object({
  name: z.string().min(1),
  startTime: timeFormat,
  endTime: timeFormat,
});

// --- Shift ---
export const createShiftSchema = z
  .object({
    siteId: z.uuid(),
    shiftTypeId: z.uuid(),
    employeeId: z.string().min(1).optional(),
    // For backward compatibility
    guardId: z.string().min(1).optional(),
    date: z.string().min(1), // Expects "YYYY-MM-DD"
    requiredCheckinIntervalMins: z.number().int().min(5).default(60),
    graceMinutes: z.number().int().min(1).default(15),
    note: z.string().optional(),
  })
  .refine(data => data.employeeId || data.guardId, {
    message: 'Employee ID or Guard ID is required',
    path: ['employeeId'],
  });

export const createOfficeShiftSchema = z.object({
  officeShiftTypeId: z.uuid(),
  employeeId: z.string().min(1),
  date: z.string().min(1),
  note: z.string().optional(),
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
export const EmployeeAccessScopeEnum = z.enum(['all', 'on_site_only']);
export const AttendanceAccessScopeEnum = z.enum(['all', 'shift_only']);

export const rolePolicySchema = z.object({
  employees: z.object({
    scope: EmployeeAccessScopeEnum,
  }),
  attendance: z.object({
    scope: AttendanceAccessScopeEnum,
  }),
});

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  policy: rolePolicySchema,
  permissionIds: z.array(z.string()).min(1, 'At least one permission is required'),
});

export const updateRoleSchema = createRoleSchema;

// --- Department ---
export const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  note: z.string().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema;

// --- Designation ---
export const createDesignationSchema = z.object({
  name: z.string().min(1, 'Designation name is required'),
  role: EmployeeRoleEnum,
  departmentId: z.uuid('Invalid department ID'),
  note: z.string().optional(),
});

export const updateDesignationSchema = createDesignationSchema;

// --- System Settings ---
export const updateSettingsSchema = z.record(z.string(), z.string());

const officeWorkScheduleDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    isWorkingDay: z.boolean(),
    startTime: timeFormat.nullable().optional(),
    endTime: timeFormat.nullable().optional(),
  })
  .superRefine((day, ctx) => {
    if (!day.isWorkingDay) return;

    if (!day.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startTime'],
        message: 'Start time is required for working days',
      });
    }

    if (!day.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time is required for working days',
      });
    }

    if (day.startTime && day.endTime && day.startTime === day.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time must be different from start time',
      });
    }
  });

export const updateOfficeWorkScheduleSchema = z.object({
  name: z.string().min(1, 'Schedule name is required'),
  days: z.array(officeWorkScheduleDaySchema).length(7, 'Exactly 7 weekday rules are required'),
});

export const updateDefaultOfficeWorkScheduleSchema = z.object({
  days: z.array(officeWorkScheduleDaySchema).length(7, 'Exactly 7 weekday rules are required'),
});

export const createEmployeeOfficeWorkScheduleAssignmentSchema = z.object({
  officeWorkScheduleId: z.uuid('Schedule template is required'),
  effectiveFrom: z.string().min(1, 'Effective date is required'),
});

// --- Office ---
// Note: Offices are managed by the external employee sync. Admins may only edit
// location/supplementary details not provided by the external system.
export const updateOfficeSchema = z.object({
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  note: z.string().optional(),
});

// --- Office Attendance ---
export const createOfficeAttendanceSchema = z.object({
  employeeId: z.string().min(1).optional(),
  status: z.enum(['present', 'clocked_out']).default('present'),
  picture: z.string().min(1).optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// --- Leave Requests ---
const isoDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const createEmployeeLeaveRequestSchema = z
  .object({
    startDate: isoDateKeySchema,
    endDate: isoDateKeySchema,
    reason: z.enum([
      'sick',
      'family_marriage',
      'family_child_marriage',
      'family_child_circumcision_baptism',
      'family_death',
      'family_spouse_death',
      'special_maternity',
      'special_miscarriage',
      'special_paternity',
      'special_emergency',
      'annual',
    ]),
    employeeNote: z.string().max(2000).optional(),
    attachments: z.array(z.string().min(1)).max(4).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'startDate must be before or equal to endDate',
      });
    }

    const attachments = data.attachments ?? [];
    if (data.reason === 'special_miscarriage' && attachments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attachments'],
        message: 'Attachment is required for miscarriage leave',
      });
    }
  });

export const reviewEmployeeLeaveRequestSchema = z.object({
  adminNote: z.string().max(2000).optional(),
});

// --- Holiday Calendars ---
export const holidayCalendarTypeSchema = z.enum(['holiday', 'week_off', 'emergency', 'special_working_day']);
export const holidayCalendarScopeSchema = z.enum(['all', 'department']);
export const officeMemoScopeSchema = z.enum(['all', 'department']);

export const holidayCalendarEntrySchema = z
  .object({
    startDate: isoDateKeySchema,
    endDate: isoDateKeySchema,
    title: z.string().min(1, 'Title is required').max(120, 'Title is too long'),
    type: holidayCalendarTypeSchema,
    scope: holidayCalendarScopeSchema,
    departmentKeys: z.array(z.string().trim().min(1)).default([]),
    isPaid: z.boolean(),
    affectsAttendance: z.boolean(),
    notificationRequired: z.boolean(),
    note: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }

    if (data.scope === 'all' && data.departmentKeys.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentKeys'],
        message: 'Department keys must be empty for all scope',
      });
    }

    if (data.scope === 'department' && data.departmentKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentKeys'],
        message: 'At least one department must be selected for department scope',
      });
    }
  });

export const officeMemoSchema = z
  .object({
    startDate: isoDateKeySchema,
    endDate: isoDateKeySchema,
    title: z.string().min(1, 'Title is required').max(120, 'Title is too long'),
    message: z.string().max(2000).optional(),
    scope: officeMemoScopeSchema,
    departmentKeys: z.array(z.string().trim().min(1)).default([]),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }

    if (data.scope === 'all' && data.departmentKeys.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentKeys'],
        message: 'Department keys must be empty for all scope',
      });
    }

    if (data.scope === 'department' && data.departmentKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentKeys'],
        message: 'At least one department must be selected for department scope',
      });
    }
  });

// --- Alert Reporting ---
export const reportAlertSchema = z.object({
  shiftId: z.uuid(),
  reason: z.enum(['geofence_breach', 'location_services_disabled']),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const resolveAlertSchema = z.object({
  shiftId: z.uuid(),
  reason: z.enum(['geofence_breach', 'location_services_disabled']),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = CreateSiteInput; // Same for now
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type AdminOwnershipAssignmentInput = z.infer<typeof adminOwnershipAssignmentSchema>;
export type AdminOwnershipSelectionInput = z.infer<typeof adminOwnershipSelectionSchema>;
export type AdminOwnershipFormInput = z.infer<typeof adminOwnershipFormSchema>;
export type AdminOwnershipScopeType = z.infer<typeof AdminOwnershipScopeTypeEnum>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type UpdateEmployeePasswordInput = z.infer<typeof updateEmployeePasswordSchema>;
export type UpdateEmployeeFieldModeInput = z.infer<typeof updateEmployeeFieldModeSchema>;

// Deprecated

export type CreateShiftTypeInput = z.infer<typeof createShiftTypeSchema>;
export type UpdateShiftTypeInput = CreateShiftTypeInput; // Same for now
export type CreateOfficeShiftTypeInput = z.infer<typeof createOfficeShiftTypeSchema>;
export type UpdateOfficeShiftTypeInput = CreateOfficeShiftTypeInput;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = CreateShiftInput; // Same for now
export type CreateOfficeShiftInput = z.infer<typeof createOfficeShiftSchema>;
export type UpdateOfficeShiftInput = CreateOfficeShiftInput;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type RolePolicy = z.infer<typeof rolePolicySchema>;
export type EmployeeAccessScope = z.infer<typeof EmployeeAccessScopeEnum>;
export type AttendanceAccessScope = z.infer<typeof AttendanceAccessScopeEnum>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = CreateDepartmentInput;
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = CreateDesignationInput;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateOfficeInput = z.infer<typeof updateOfficeSchema>;
export type UpdateOfficeWorkScheduleInput = z.infer<typeof updateOfficeWorkScheduleSchema>;
export type UpdateDefaultOfficeWorkScheduleInput = z.infer<typeof updateDefaultOfficeWorkScheduleSchema>;
export type CreateEmployeeOfficeWorkScheduleAssignmentInput = z.infer<
  typeof createEmployeeOfficeWorkScheduleAssignmentSchema
>;

export type ReportAlertInput = z.infer<typeof reportAlertSchema>;
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
export type HolidayCalendarTypeInput = z.infer<typeof holidayCalendarTypeSchema>;
export type HolidayCalendarScopeInput = z.infer<typeof holidayCalendarScopeSchema>;
export type HolidayCalendarEntryInput = z.infer<typeof holidayCalendarEntrySchema>;
export type OfficeMemoScopeInput = z.infer<typeof officeMemoScopeSchema>;
export type OfficeMemoInput = z.infer<typeof officeMemoSchema>;
