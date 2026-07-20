'use server';

import {
  prisma,
  addGroupMembers,
  createGroupChat,
  findGroupChatByGroupShiftId,
  getSystemSetting,
  removeGroupMember,
  unarchiveGroupChat,
  upsertGroupShift,
  deleteGroupShiftIfOrphaned,
  createSiteWithPostsAndChangelog,
  updateSiteWithChangelog,
} from '@repo/database';
import {
  createShiftSchema,
  CreateShiftInput,
  UpdateShiftInput,
  replaceShiftSchema,
  swapShiftsSchema,
  bulkSwapShiftsSchema,
} from '@repo/validations';
import { revalidatePath } from 'next/cache';
import { format, isBefore, subMinutes } from 'date-fns';
import { ShiftStatus, Prisma } from '@prisma/client';
import { parseShiftTypeTimeOnDate, ESCORT_GROUP_CHAT_AUTO_INCLUDE_CHAT_ADMINS } from '@repo/shared';
import { getAdminAuthSession, getAdminIdFromToken } from '@/lib/admin-auth';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  checkOverlappingShift,
  createShiftWithChangelog,
  updateShiftWithChangelog,
  deleteShiftWithChangelog,
  processGuardShiftBulkImport,
  bulkCreateShiftsFromForm,
  replaceShiftGuard,
  swapShifts,
  bulkSwapReplaceBetweenEmployees,
  getShiftsByEmployeeWithinWindow,
  createShiftReassignmentHrNotification,
} from '@repo/database';
import {
  sendShiftReassignmentPushNotification,
  sendBulkShiftSwapAggregatePushNotification,
} from '@repo/notifications';
import { getShiftTypeDurationInMins } from '@repo/database';
import { ActionState } from '@/types/actions';
import type { SerializedShiftWithRelationsDto } from '@/types/shifts';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function createShift(
  prevState: ActionState<CreateShiftInput>,
  formData: FormData
): Promise<ActionState<CreateShiftInput>> {
  const adminId = await getAdminIdFromToken();

  let siteId = (formData.get('siteId') as string) || '';
  let escortEndSiteId = (formData.get('escortEndSiteId') as string) || undefined;
  const clientName = formData.get('clientName') as string | undefined;
  const formKind = (formData.get('kind') as string) || 'onsite';

  // Auto-create start site from address input when toggled
  if (!siteId && formData.get('startAddress')) {
    const address = formData.get('startAddress') as string;
    const lat = Number(formData.get('startLat'));
    const lng = Number(formData.get('startLng'));
    if (address && !isNaN(lat) && !isNaN(lng)) {
      const siteKind = formKind === 'escort' ? 'escort' : formKind === 'event_temporary' ? 'event' : 'fixed';
      siteId = await autoCreateSiteFromAddress(siteKind, clientName, address, lat, lng, adminId, formKind);
    }
  }

  // Auto-create escort end site from address input when toggled
  if (!escortEndSiteId && formData.get('escortEndAddress')) {
    const address = formData.get('escortEndAddress') as string;
    const lat = Number(formData.get('escortEndLat'));
    const lng = Number(formData.get('escortEndLng'));
    if (address && !isNaN(lat) && !isNaN(lng)) {
      escortEndSiteId = await autoCreateSiteFromAddress('escort', clientName, address, lat, lng, adminId, formKind);
    }
  }

  const validatedFields = createShiftSchema.safeParse({
    siteId,
    shiftTypeId: formData.get('shiftTypeId'),
    employeeId: formData.get('employeeId') || null, // Handle empty string as null
    kind: formData.get('kind') || 'onsite',
    escortEndSiteId,
    date: formData.get('date'),
    requiredCheckinIntervalMins: Number(formData.get('requiredCheckinIntervalMins')),
    graceMinutes: Number(formData.get('graceMinutes')),
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Guard Shift.',
      success: false,
    };
  }

  const { date, shiftTypeId, employeeId, kind, requiredCheckinIntervalMins, graceMinutes, note } = validatedFields.data;

  try {
    // Fetch ShiftType to calculate startsAt and endsAt
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });

    if (!shiftType) {
      return {
        message: 'Selected Guard Shift Type does not exist.',
        success: false,
      };
    }

    const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
    if (durationInMins % requiredCheckinIntervalMins !== 0) {
      return {
        message: `Guard shift duration (${durationInMins} mins) must be a multiple of the check-in interval (${requiredCheckinIntervalMins} mins).`,
        success: false,
      };
    }

    if (durationInMins < requiredCheckinIntervalMins) {
      return {
        message: `Guard shift duration (${durationInMins} mins) must allow for at least 1 check-in slots. Please reduce the check-in interval.`,
        success: false,
      };
    }

    if ((kind === 'office_control' || kind === 'event_temporary') && requiredCheckinIntervalMins !== durationInMins) {
      return {
        message: `${kind === 'office_control' ? 'Office control' : 'Event temporary'} shifts must have check-in interval equal to the full shift duration (${durationInMins} mins).`,
        success: false,
      };
    }

    // Parse times
    // date is YYYY-MM-DD
    // startTime/endTime is HH:mm
    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parseShiftTypeTimeOnDate(date, shiftType.startTime);
    let endDateTime = parseShiftTypeTimeOnDate(date, shiftType.endTime);

    // Handle overnight shift
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
    }

    if (isBefore(startDateTime, new Date())) {
      return {
        message: 'Cannot schedule a guard shift in the past.',
        success: false,
      };
    }

    // Check for overlapping shifts
    if (employeeId) {
      const conflictingShift = await checkOverlappingShift({
        employeeId,
        startsAt: startDateTime,
        endsAt: endDateTime,
      });

      if (conflictingShift) {
        return {
          message: 'Employee already has a conflicting guard shift during this time.',
          success: false,
        };
      }
    }

    // Validate site kind: start site must be fixed, escort end site must be escort
    const [startSite, endSite] = await Promise.all([
      prisma.site.findUnique({ where: { id: siteId }, select: { kind: true } }),
      escortEndSiteId ? prisma.site.findUnique({ where: { id: escortEndSiteId }, select: { kind: true } }) : null,
    ]);

    if (!startSite) {
      return { message: 'Start site not found.', success: false };
    }

    if (kind === 'event_temporary' && startSite.kind !== 'event') {
      return { message: 'Event temporary shifts must use an event site as the start location.', success: false };
    }

    if (kind === 'escort' && startSite.kind !== 'escort') {
      return { message: 'Escort shifts must use an escort site as the start location.', success: false };
    }

    if (kind !== 'escort' && kind !== 'event_temporary' && startSite.kind !== 'fixed') {
      return { message: 'On-site shifts must use a fixed site as the start location.', success: false };
    }

    if (escortEndSiteId) {
      if (!endSite) {
        return { message: 'Escort end site not found.', success: false };
      }
      if (endSite.kind !== 'escort') {
        return { message: 'Escort end site must be an escort site.', success: false };
      }
    }

    if (kind === 'escort') {
      const groupShift = await upsertGroupShift({
        siteId,
        endSiteId: escortEndSiteId || null,
        shiftTypeId,
        date: dateObj,
      });

      await createShiftWithChangelog(
        {
          site: { connect: { id: siteId } },
          shiftType: { connect: { id: shiftTypeId } },
          employee: employeeId ? { connect: { id: employeeId } } : undefined,
          kind,
          escortEndSite: escortEndSiteId ? { connect: { id: escortEndSiteId } } : undefined,
          date: dateObj,
          startsAt: startDateTime,
          endsAt: endDateTime,
          requiredCheckinIntervalMins,
          graceMinutes,
          note,
          status: 'scheduled',
          groupShift: { connect: { id: groupShift.id } },
        },
        adminId
      );

      if (employeeId) {
        const groupChat = await findGroupChatByGroupShiftId(groupShift.id);
        if (groupChat) {
          if (groupChat.archivedAt) {
            await unarchiveGroupChat(groupChat.id);
          }
          const existingMember = groupChat.participants.find(p => p.employeeId === employeeId && p.status === 'active');
          if (!existingMember) {
            const visibleFromAt = subMinutes(startDateTime, 30);
            await addGroupMembers({
              groupId: groupChat.id,
              actor: { participantType: 'admin', adminId },
              employeeIds: [employeeId],
              visibleFromAt,
            });
          }
        }
      }
    } else {
      await createShiftWithChangelog(
        {
          site: { connect: { id: siteId } },
          shiftType: { connect: { id: shiftTypeId } },
          employee: employeeId ? { connect: { id: employeeId } } : undefined,
          kind,
          escortEndSite: escortEndSiteId ? { connect: { id: escortEndSiteId } } : undefined,
          date: dateObj,
          startsAt: startDateTime,
          endsAt: endDateTime,
          requiredCheckinIntervalMins,
          graceMinutes,
          note,
          status: 'scheduled',
        },
        adminId
      );
    }
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Guard Shift.',
      success: false,
    };
  }

  revalidatePath('/admin/guard-shifts');
  return { success: true, message: 'Guard shift created successfully' };
}

export async function updateShift(
  id: string,
  prevState: ActionState<UpdateShiftInput>,
  formData: FormData
): Promise<ActionState<UpdateShiftInput>> {
  const adminId = await getAdminIdFromToken();

  // Extract address data for potential site update (event_temporary)
  const startAddress = formData.get('startAddress') as string | undefined;
  const startLatRaw = formData.get('startLat') as string;
  const startLngRaw = formData.get('startLng') as string;
  const formClientName = formData.get('clientName') as string | undefined;

  const validatedFields = createShiftSchema.safeParse({
    siteId: formData.get('siteId'),
    shiftTypeId: formData.get('shiftTypeId'),
    employeeId: formData.get('employeeId') || null,
    kind: formData.get('kind') || 'onsite',
    escortEndSiteId: formData.get('escortEndSiteId') || undefined,
    date: formData.get('date'),
    requiredCheckinIntervalMins: Number(formData.get('requiredCheckinIntervalMins')),
    graceMinutes: Number(formData.get('graceMinutes')),
    note: formData.get('note') as string | null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Guard Shift.',
      success: false,
    };
  }

  const {
    date,
    shiftTypeId,
    siteId,
    employeeId,
    kind,
    escortEndSiteId,
    requiredCheckinIntervalMins,
    graceMinutes,
    note,
  } = validatedFields.data;

  try {
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });

    if (!shiftType) {
      return { message: 'Selected Guard Shift Type does not exist.', success: false };
    }

    const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
    if (durationInMins % requiredCheckinIntervalMins !== 0) {
      return {
        message: `Guard shift duration (${durationInMins} mins) must be a multiple of the check-in interval (${requiredCheckinIntervalMins} mins).`,
        success: false,
      };
    }

    if (durationInMins < requiredCheckinIntervalMins) {
      return {
        message: `Guard shift duration (${durationInMins} mins) must allow for at least 1 check-in slots. Please reduce the check-in interval.`,
        success: false,
      };
    }

    if ((kind === 'office_control' || kind === 'event_temporary') && requiredCheckinIntervalMins !== durationInMins) {
      return {
        message: `${kind === 'office_control' ? 'Office control' : 'Event temporary'} shifts must have check-in interval equal to the full shift duration (${durationInMins} mins).`,
        success: false,
      };
    }

    const dateObj = new Date(`${date}T00:00:00Z`);
    const startDateTime = parseShiftTypeTimeOnDate(date, shiftType.startTime);
    let endDateTime = parseShiftTypeTimeOnDate(date, shiftType.endTime);

    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
    }

    // Check for overlapping shifts
    if (employeeId) {
      const conflictingShift = await checkOverlappingShift({
        employeeId,
        startsAt: startDateTime,
        endsAt: endDateTime,
        excludeShiftId: id,
      });

      if (conflictingShift) {
        return {
          message: 'Employee already has a conflicting guard shift during this time.',
          success: false,
        };
      }
    }

    // Validate site kind
    const [startSite, endSite] = await Promise.all([
      prisma.site.findUnique({ where: { id: siteId }, select: { kind: true } }),
      escortEndSiteId ? prisma.site.findUnique({ where: { id: escortEndSiteId }, select: { kind: true } }) : null,
    ]);

    if (!startSite) {
      return { message: 'Start site not found.', success: false };
    }

    if (kind === 'event_temporary' && startSite.kind !== 'event') {
      return { message: 'Event temporary shifts must use an event site as the start location.', success: false };
    }

    if (kind === 'escort' && startSite.kind !== 'escort') {
      return { message: 'Escort shifts must use an escort site as the start location.', success: false };
    }

    if (kind !== 'escort' && kind !== 'event_temporary' && startSite.kind !== 'fixed') {
      return { message: 'On-site shifts must use a fixed site as the start location.', success: false };
    }

    if (escortEndSiteId) {
      if (!endSite) {
        return { message: 'Escort end site not found.', success: false };
      }
      if (endSite.kind !== 'escort') {
        return { message: 'Escort end site must be an escort site.', success: false };
      }
    }

    // Capture current shift state for group chat sync on reassignment
    const existingShift = await prisma.shift.findUnique({
      where: { id },
      select: { employeeId: true, groupShiftId: true, kind: true, startsAt: true },
    });
    const oldEmployeeId = existingShift?.employeeId ?? null;
    const oldGroupShiftId = existingShift?.groupShiftId ?? null;
    const oldKind = existingShift?.kind;

    // Update existing site address when provided (event_temporary edit)
    if (siteId && startAddress && startLatRaw && startLngRaw) {
      const lat = Number(startLatRaw);
      const lng = Number(startLngRaw);
      if (!isNaN(lat) && !isNaN(lng)) {
        const prefix = kind === 'event_temporary' ? 'Event' : 'Site';
        const baseName = formClientName?.trim()
          ? `${prefix}: ${formClientName.trim()}`
          : `${prefix}: ${startAddress.substring(0, 30)}`;
        let siteName = baseName;
        let counter = 1;
        while (await prisma.site.findFirst({ where: { name: siteName, id: { not: siteId } } })) {
          siteName = `${baseName} (${counter})`;
          counter++;
        }
        await updateSiteWithChangelog(
          siteId,
          {
            address: startAddress,
            latitude: lat,
            longitude: lng,
            name: siteName,
            clientName: formClientName || '',
          },
          adminId
        );
      }
    }

    await updateShiftWithChangelog(
      id,
      {
        site: { connect: { id: siteId } },
        shiftType: { connect: { id: shiftTypeId } },
        employee: employeeId ? { connect: { id: employeeId } } : { disconnect: true },
        kind,
        escortEndSite: escortEndSiteId ? { connect: { id: escortEndSiteId } } : { disconnect: true },
        date: dateObj,
        startsAt: startDateTime,
        endsAt: endDateTime,
        requiredCheckinIntervalMins,
        graceMinutes,
        note,
      },
      adminId
    );

    // Sync group chat membership on employee reassignment for group escort shifts
    if (oldKind === 'escort' && oldGroupShiftId && (employeeId ?? null) !== oldEmployeeId) {
      const groupChat = await findGroupChatByGroupShiftId(oldGroupShiftId);
      if (groupChat) {
        if (groupChat.archivedAt) {
          await unarchiveGroupChat(groupChat.id);
        }
        if (oldEmployeeId) {
          const oldPart = groupChat.participants.find(p => p.employeeId === oldEmployeeId && p.status === 'active');
          if (oldPart) {
            await removeGroupMember({
              groupId: groupChat.id,
              actor: { participantType: 'admin', adminId },
              participantId: oldPart.id,
            });
          }
        }
        if (employeeId) {
          const newPart = groupChat.participants.find(p => p.employeeId === employeeId && p.status === 'active');
          if (!newPart) {
            await addGroupMembers({
              groupId: groupChat.id,
              actor: { participantType: 'admin', adminId },
              employeeIds: [employeeId],
              visibleFromAt: subMinutes(startDateTime, 30),
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Guard Shift.',
      success: false,
    };
  }

  revalidatePath('/admin/guard-shifts');
  return { success: true, message: 'Guard shift updated successfully' };
}

export async function deleteShift(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    const shift = await prisma.shift.findUnique({
      where: { id, deletedAt: null },
      select: { kind: true, employeeId: true, groupShiftId: true },
    });

    const groupShiftId = shift?.groupShiftId;

    // Remove from group chat before mutating the shift
    if (shift?.kind === 'escort' && shift.employeeId && groupShiftId) {
      const group = await findGroupChatByGroupShiftId(groupShiftId);
      if (group) {
        const participant = group.participants.find(p => p.employeeId === shift.employeeId && p.status === 'active');
        if (participant) {
          await removeGroupMember({
            groupId: group.id,
            actor: { participantType: 'admin', adminId },
            participantId: participant.id,
          });
        }
      }
    }

    await deleteShiftWithChangelog(id, adminId);

    if (groupShiftId) {
      await deleteGroupShiftIfOrphaned(groupShiftId);
    }

    revalidatePath('/admin/guard-shifts');

    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete guard shift' };
  }
}

export async function cancelShift(id: string, cancelNote?: string) {
  try {
    const adminId = await getAdminIdFromToken();

    const shift = await prisma.shift.findUnique({
      where: { id, deletedAt: null },
      select: { status: true, note: true, kind: true, employeeId: true, groupShiftId: true },
    });

    if (!shift) {
      return { success: false, message: 'Guard shift not found' };
    }

    if (shift.status !== 'in_progress') {
      return { success: false, message: 'Only in-progress guard shifts can be cancelled' };
    }

    let updatedNote = shift.note;
    if (cancelNote?.trim()) {
      const timestamp = new Date().toLocaleString();
      const formattedCancelNote = `[Cancelled on ${timestamp}]: ${cancelNote.trim()}`;
      updatedNote = updatedNote ? `${formattedCancelNote}\n\n${updatedNote}` : formattedCancelNote;
    }

    // Remove from group chat before mutating the shift
    if (shift.kind === 'escort' && shift.employeeId && shift.groupShiftId) {
      const group = await findGroupChatByGroupShiftId(shift.groupShiftId);
      if (group) {
        const participant = group.participants.find(p => p.employeeId === shift.employeeId && p.status === 'active');
        if (participant) {
          await removeGroupMember({
            groupId: group.id,
            actor: { participantType: 'admin', adminId },
            participantId: participant.id,
          });
        }
      }
    }

    await updateShiftWithChangelog(id, { status: ShiftStatus.cancelled, note: updatedNote }, adminId);
    revalidatePath('/admin/guard-shifts');

    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to cancel guard shift' };
  }
}

export async function bulkCreateShifts(
  formData: FormData
): Promise<{ success: boolean; message?: string; errors?: string[] }> {
  const adminId = await getAdminIdFromToken();
  const file = formData.get('file');
  const REQUIRED_HEADER_ALIASES: Record<string, string[]> = {
    site: ['site'],
    shift_type_name: ['shift_type_name'],
    date: ['date'],
    employee_code: ['employee_code'],
    interval: ['interval', 'required_check-in_interval_(minutes)', 'required_checkin_interval_(minutes)'],
    grace: ['grace', 'grace_minutes', 'grace_period_(minutes)'],
    note: ['note'],
  };

  const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');

  if (!(file instanceof File)) {
    return { success: false, message: 'No file provided.' };
  }

  const text = await file.text();
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
  } catch {
    return { success: false, message: 'Invalid CSV format.' };
  }

  if (records.length < 2) {
    return { success: false, message: 'CSV file is empty or missing data.' };
  }

  const header = records[0].map(value => String(value ?? '')).map(normalizeHeader);
  const headerIndexByCanonical = new Map<string, number>();
  for (const [canonical, aliases] of Object.entries(REQUIRED_HEADER_ALIASES)) {
    const idx = header.findIndex(value => aliases.includes(value));
    if (idx >= 0) headerIndexByCanonical.set(canonical, idx);
  }

  const missingRequiredHeaders = ['site', 'shift_type_name', 'date', 'employee_code', 'interval', 'grace'].filter(
    key => !headerIndexByCanonical.has(key)
  );
  if (missingRequiredHeaders.length > 0) {
    return {
      success: false,
      message: `Invalid CSV header. Missing required column(s): ${missingRequiredHeaders.join(', ')}.`,
    };
  }

  const parsedRows: Array<{
    rowNumber: number;
    site: string;
    shiftTypeName: string;
    date: string;
    employeeCode: string;
    interval: string;
    grace: string;
    note?: string | null;
  }> = [];
  const parseErrors: string[] = [];

  for (let i = 1; i < records.length; i++) {
    const cols = records[i].map(value => String(value ?? '').trim());
    const requiredIndexes = ['site', 'shift_type_name', 'date', 'employee_code', 'interval', 'grace'].map(
      key => headerIndexByCanonical.get(key) ?? -1
    );
    if (requiredIndexes.some(index => index < 0 || index >= cols.length)) {
      parseErrors.push(`Row ${i + 1}: missing required columns.`);
      continue;
    }

    const site = cols[headerIndexByCanonical.get('site')!];
    const shiftTypeName = cols[headerIndexByCanonical.get('shift_type_name')!];
    const date = cols[headerIndexByCanonical.get('date')!];
    const employeeCode = cols[headerIndexByCanonical.get('employee_code')!];
    const interval = cols[headerIndexByCanonical.get('interval')!];
    const grace = cols[headerIndexByCanonical.get('grace')!];
    const noteIndex = headerIndexByCanonical.get('note');
    const note = noteIndex != null && noteIndex < cols.length ? cols[noteIndex] : '';

    // Skip placeholder/empty employee rows from spreadsheet exports.
    if (!employeeCode || employeeCode.trim() === '' || employeeCode.trim().toUpperCase() === '#N/A') {
      continue;
    }

    if (!site || !shiftTypeName || !date || !employeeCode || !interval || !grace) {
      parseErrors.push(`Row ${i + 1}: site, shift_type_name, date, employee_code, interval, and grace are required.`);
      continue;
    }

    parsedRows.push({
      rowNumber: i + 1,
      site,
      shiftTypeName,
      date,
      employeeCode,
      interval,
      grace,
      note: note || null,
    });
  }

  if (parseErrors.length > 0) {
    return { success: false, message: 'Validation failed.', errors: parseErrors };
  }

  const result = await processGuardShiftBulkImport(parsedRows, { adminId });
  if (!result.success) {
    return { success: false, message: 'Validation failed.', errors: result.errors };
  }

  if (result.summary.rows_processed === 0 && result.summary.past_dates_skipped > 0) {
    return {
      success: true,
      message: `${result.summary.past_dates_skipped} past date(s) skipped; no shifts created, updated, or deleted.`,
    };
  }

  const messages = [];
  if (result.summary.deleted_off > 0) messages.push(`Deleted ${result.summary.deleted_off} OFF-day shift(s)`);
  if (result.summary.created > 0) messages.push(`Created ${result.summary.created} shift(s)`);
  if (result.summary.updated > 0) messages.push(`Updated ${result.summary.updated} shift(s)`);
  if (result.summary.past_dates_skipped > 0) messages.push(`${result.summary.past_dates_skipped} past date(s) skipped`);

  revalidatePath('/admin/guard-shifts');
  return {
    success: true,
    message: messages.join('; ') || 'No changes made.',
  };
}

type BulkCreateFromFormInput = {
  kind: 'onsite' | 'escort' | 'office_control' | 'event_temporary';
  siteId: string;
  startAddress?: string;
  startLat?: number;
  startLng?: number;
  escortEndSiteId?: string;
  escortEndAddress?: string;
  escortEndLat?: number;
  escortEndLng?: number;
  shiftTypeId: string;
  employeeIds: string[];
  dates: string[];
  requiredCheckinIntervalMins: number;
  graceMinutes: number;
  note?: string | null;
  autoCreateChatRoom?: boolean;
  overwrite?: boolean;
  clientName?: string;
  leadGuardId?: string;
  flexibleEndTime?: boolean;
};

async function autoCreateSiteFromAddress(
  kind: 'fixed' | 'escort' | 'event',
  clientName: string | undefined,
  address: string,
  lat: number,
  lng: number,
  adminId: string,
  shiftKind?: string
): Promise<string> {
  const prefix = kind === 'event' ? 'Event' : kind === 'escort' ? 'Escort' : 'Site';
  const baseName = clientName?.trim() ? `${prefix}: ${clientName.trim()}` : `${prefix}: ${address.substring(0, 30)}`;
  let name = baseName;
  let counter = 1;
  while (await prisma.site.findUnique({ where: { name } })) {
    name = `${baseName} (${counter})`;
    counter++;
  }
  const postName = kind === 'fixed' ? 'Main Post' : kind === 'escort' ? 'Escort End' : 'Event Post';
  const site = await createSiteWithPostsAndChangelog(
    {
      name,
      clientName: clientName || '',
      kind,
      status: true,
      address,
      latitude: lat,
      longitude: lng,
      geofenceRadius: 100,
    } as Prisma.SiteCreateInput,
    [{ name: postName, address, latitude: lat, longitude: lng, sortOrder: 0 }],
    adminId
  );
  return site.id;
}

export async function bulkCreateShiftsFromFormAction(
  input: BulkCreateFromFormInput
): Promise<{ success: boolean; message: string; created?: number; ids?: string[]; groupIds?: string[] }> {
  const adminId = await getAdminIdFromToken();

  if (input.employeeIds.length === 0) {
    return { success: false, message: 'At least one employee is required.' };
  }
  if (input.dates.length === 0) {
    return { success: false, message: 'At least one date is required.' };
  }

  let finalSiteId = input.siteId;
  let finalEscortEndSiteId = input.escortEndSiteId;

  if (
    (input.kind === 'escort' || input.kind === 'event_temporary') &&
    input.startAddress &&
    input.startLat != null &&
    input.startLng != null
  ) {
    const startSiteKind = input.kind === 'escort' ? 'escort' : 'event';
    finalSiteId = await autoCreateSiteFromAddress(
      startSiteKind,
      input.clientName,
      input.startAddress,
      input.startLat,
      input.startLng,
      adminId,
      input.kind
    );
  }

  if (
    (input.kind === 'escort' || input.kind === 'event_temporary') &&
    !finalEscortEndSiteId &&
    input.escortEndAddress &&
    input.escortEndLat != null &&
    input.escortEndLng != null
  ) {
    finalEscortEndSiteId = await autoCreateSiteFromAddress(
      'escort',
      input.clientName,
      input.escortEndAddress,
      input.escortEndLat,
      input.escortEndLng,
      adminId,
      input.kind
    );
  }

  const [startSite, endSite, shiftType] = await Promise.all([
    prisma.site.findUnique({ where: { id: finalSiteId }, select: { kind: true, name: true } }),
    finalEscortEndSiteId
      ? prisma.site.findUnique({ where: { id: finalEscortEndSiteId }, select: { kind: true, name: true } })
      : null,
    prisma.shiftType.findUnique({ where: { id: input.shiftTypeId }, select: { startTime: true } }),
  ]);

  if (!startSite) return { success: false, message: 'Start site not found.' };

  if (input.kind === 'event_temporary' && startSite.kind !== 'event') {
    return { success: false, message: 'Event temporary shifts must use an event site as the start location.' };
  }

  if (input.kind === 'escort' && startSite.kind !== 'escort') {
    return { success: false, message: 'Escort shifts must use an escort site as the start location.' };
  }

  if (input.kind !== 'escort' && input.kind !== 'event_temporary' && startSite.kind !== 'fixed') {
    return { success: false, message: 'On-site shifts must use a fixed site as the start location.' };
  }

  if (finalEscortEndSiteId) {
    if (!endSite) return { success: false, message: 'Escort end site not found.' };
    if (endSite.kind !== 'escort') return { success: false, message: 'Escort end site must be an escort site.' };
  }

  try {
    const uniqueDates = [...new Set(input.dates)].sort();
    let groupShiftIds: Record<string, string> | undefined;

    if (input.kind === 'escort') {
      groupShiftIds = {};
      for (const dateStr of uniqueDates) {
        const groupShift = await upsertGroupShift({
          siteId: finalSiteId,
          endSiteId: finalEscortEndSiteId || null,
          shiftTypeId: input.shiftTypeId,
          date: new Date(dateStr + 'T00:00:00Z'),
          clientName: input.clientName,
          flexibleEndTime: input.flexibleEndTime,
        });
        groupShiftIds[dateStr] = groupShift.id;
      }
    }

    if (input.overwrite && input.employeeIds.length > 0 && input.dates.length > 0) {
      const dateObjs = uniqueDates.map(d => new Date(d + 'T00:00:00'));
      const existingShifts = await prisma.shift.findMany({
        where: { employeeId: { in: input.employeeIds }, date: { in: dateObjs }, deletedAt: null },
        select: { id: true, kind: true, groupShiftId: true, employeeId: true },
      });
      const orphanedGroupShiftIds = new Set<string>();
      for (const shift of existingShifts) {
        await deleteShiftWithChangelog(shift.id, adminId);
        if (shift.kind === 'escort' && shift.groupShiftId && shift.employeeId) {
          const group = await findGroupChatByGroupShiftId(shift.groupShiftId);
          if (group) {
            const participant = group.participants.find(
              p => p.employeeId === shift.employeeId && p.status === 'active'
            );
            if (participant) {
              await removeGroupMember({
                groupId: group.id,
                actor: { participantType: 'admin', adminId },
                participantId: participant.id,
              });
            }
          }
          orphanedGroupShiftIds.add(shift.groupShiftId);
        }
      }
      for (const gsId of orphanedGroupShiftIds) {
        await deleteGroupShiftIfOrphaned(gsId);
      }
    }

    const result = await bulkCreateShiftsFromForm(
      {
        siteId: finalSiteId,
        shiftTypeId: input.shiftTypeId,
        kind: input.kind,
        escortEndSiteId: finalEscortEndSiteId || undefined,
        employeeIds: input.employeeIds,
        dates: input.dates,
        requiredCheckinIntervalMins: input.requiredCheckinIntervalMins,
        graceMinutes: input.graceMinutes,
        note: input.note,
        groupShiftIds,
      },
      adminId
    );
    revalidatePath('/admin/guard-shifts');

    const groupIds: string[] = [];
    if (input.autoCreateChatRoom && input.kind === 'escort' && groupShiftIds) {
      const [session, broadcastSetting] = await Promise.all([
        getAdminAuthSession(),
        getSystemSetting(ESCORT_GROUP_CHAT_AUTO_INCLUDE_CHAT_ADMINS),
      ]);
      const broadcastEnabled = broadcastSetting?.value === '1';
      const creatorHasChat = !!session && (session.isSuperAdmin || session.permissions.includes(PERMISSIONS.CHAT.VIEW));
      const shouldBroadcast = broadcastEnabled || !creatorHasChat;

      let adminIds: string[] = [];
      if (shouldBroadcast) {
        const broadcastAdmins = await prisma.admin.findMany({
          where: {
            deletedAt: null,
            roleRef: {
              is: {
                permissions: { some: { code: PERMISSIONS.CHAT.VIEW } },
              },
            },
          },
          select: { id: true },
        });
        adminIds = broadcastAdmins.map(a => a.id);
      }

      const startSiteName = startSite.name;
      const endSiteName = endSite?.name ?? 'Destination';
      const clientLabel = input.clientName?.trim() || `${startSiteName} → ${endSiteName}`;

      for (const dateStr of uniqueDates) {
        const title = `Escort: ${clientLabel} - ${format(new Date(dateStr + 'T00:00:00'), 'dd MMM yyyy')}`;
        const guardCount = input.employeeIds.length;
        const description = `Escort duty: ${startSiteName} → ${endSiteName}. ${guardCount} guard(s) assigned.`;

        const startsAt = parseShiftTypeTimeOnDate(dateStr, shiftType!.startTime);
        const visibleFromAt = subMinutes(startsAt, 30);

        const group = await createGroupChat({
          title,
          description,
          groupShiftId: groupShiftIds[dateStr],
          creator: { participantType: 'admin', adminId },
          employeeIds: input.employeeIds,
          leadEmployeeId: input.leadGuardId,
          adminIds,
          adminRole: 'admin',
          visibleFromAt,
        });
        groupIds.push(group.id);
      }
    }

    return {
      success: true,
      message: `Created ${result.created} schedule(s) successfully.${groupIds.length > 0 ? ` Created ${groupIds.length} group chat(s).` : ''}`,
      created: result.created,
      ids: result.ids,
      groupIds: groupIds.length > 0 ? groupIds : undefined,
    };
  } catch (error) {
    console.error('[bulkCreateShiftsFromFormAction] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create schedules. Please try again.',
    };
  }
}

export async function replaceShift(input: {
  shiftId: string;
  replacementEmployeeId: string;
  reason: string;
  notes?: string | null;
  evidenceS3Key?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const adminId = await getAdminIdFromToken();

    const parsed = replaceShiftSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return {
        success: false,
        message: firstError?.message ?? 'Invalid input.',
      };
    }

    const originalShift = await prisma.shift.findUnique({
      where: { id: parsed.data.shiftId, deletedAt: null },
      select: { employeeId: true, employee: { select: { fullName: true } } },
    });
    const originalEmployeeId = originalShift?.employeeId ?? null;
    const originalEmployeeName = originalShift?.employee?.fullName ?? null;

    const result = await replaceShiftGuard(
      {
        shiftId: parsed.data.shiftId,
        replacementEmployeeId: parsed.data.replacementEmployeeId,
        reason: parsed.data.reason,
        notes: parsed.data.notes ?? null,
        evidenceS3Key: parsed.data.evidenceS3Key ?? null,
      },
      adminId
    );

    // Notify both the original guard (now removed) and the new replacement guard.
    const notifyTargets: { employeeId: string; wasOriginalAssignee: boolean }[] = [];
    if (originalEmployeeId) {
      notifyTargets.push({ employeeId: originalEmployeeId, wasOriginalAssignee: true });
    }
    if (result.employeeId) {
      notifyTargets.push({ employeeId: result.employeeId, wasOriginalAssignee: false });
    }
    await Promise.all(
      notifyTargets.map(t =>
        sendShiftReassignmentPushNotification({
          employeeId: t.employeeId,
          shiftId: result.id,
          siteName: result.site.name,
          shiftTypeName: result.shiftType.name,
          date: result.date,
          startsAt: result.startsAt,
          endsAt: result.endsAt,
          reason: parsed.data.reason,
          kind: 'replace',
          wasOriginalAssignee: t.wasOriginalAssignee,
        }).catch(() => {})
      )
    );

    await createShiftReassignmentHrNotification({
      type: 'replace',
      shiftIds: [result.id],
      employeeNames: [originalEmployeeName, result.employee?.fullName ?? 'Replacement'].filter((n): n is string => !!n),
      adminId,
      reason: parsed.data.reason,
    }).catch(() => {});

    revalidatePath('/admin/guard-shifts');
    return { success: true };
  } catch (error) {
    console.error('[replaceShift] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to replace guard.',
    };
  }
}

export async function swapShiftsAction(input: {
  shiftAId: string;
  shiftBId: string;
  reason?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const adminId = await getAdminIdFromToken();

    const parsed = swapShiftsSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return {
        success: false,
        message: firstError?.message ?? 'Invalid input.',
      };
    }

    const result = await swapShifts(
      {
        shiftAId: parsed.data.shiftAId,
        shiftBId: parsed.data.shiftBId,
        reason: parsed.data.reason ?? 'Personal Reason',
        notes: parsed.data.notes ?? null,
      },
      adminId
    );

    // Notify both guards involved in the swap.
    const notified = new Set<string>();
    await Promise.all(
      [result.shiftA, result.shiftB].map(shift => {
        if (!shift.employeeId || notified.has(shift.employeeId)) return Promise.resolve();
        notified.add(shift.employeeId);
        return sendShiftReassignmentPushNotification({
          employeeId: shift.employeeId,
          shiftId: shift.id,
          siteName: shift.site.name,
          shiftTypeName: shift.shiftType.name,
          date: shift.date,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          reason: parsed.data.reason ?? 'Personal Reason',
          kind: 'swap',
          wasOriginalAssignee: false,
        }).catch(() => {});
      })
    );

    await createShiftReassignmentHrNotification({
      type: 'swap',
      shiftIds: [result.shiftA.id, result.shiftB.id],
      employeeNames: [result.shiftA.employee?.fullName ?? 'Guard A', result.shiftB.employee?.fullName ?? 'Guard B'],
      adminId,
      reason: parsed.data.reason ?? null,
    }).catch(() => {});

    revalidatePath('/admin/guard-shifts');
    return { success: true };
  } catch (error) {
    console.error('[swapShiftsAction] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to swap shifts.',
    };
  }
}

export async function getSwapCandidateShiftsAction(params: {
  employeeId: string;
  referenceDate: string;
}): Promise<{ success: boolean; shifts?: SerializedShiftWithRelationsDto[]; message?: string }> {
  try {
    const { employeeId, referenceDate } = params;
    if (!employeeId || !referenceDate) {
      return { success: false, message: 'employeeId and referenceDate are required.' };
    }
    const refDate = new Date(referenceDate);
    if (Number.isNaN(refDate.getTime())) {
      return { success: false, message: 'Invalid referenceDate.' };
    }

    const rows = await getShiftsByEmployeeWithinWindow(employeeId, refDate);
    const shifts = rows.map(row => ({
      id: row.id,
      siteId: row.siteId,
      shiftTypeId: row.shiftTypeId,
      employeeId: row.employeeId,
      kind: row.kind,
      escortEndSiteId: row.escortEndSiteId,
      date: row.date.toISOString(),
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      checkInStatus: row.checkInStatus,
      requiredCheckinIntervalMins: row.requiredCheckinIntervalMins,
      graceMinutes: row.graceMinutes,
      lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.toISOString() : null,
      missedCount: row.missedCount,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      site: {
        id: row.site.id,
        name: row.site.name,
        clientName: row.site.clientName ?? null,
        address: row.site.address ?? null,
        latitude: row.site.latitude ?? null,
        longitude: row.site.longitude ?? null,
        kind: row.site.kind ?? null,
        status: row.site.status ?? null,
        note: row.site.note ?? null,
      },
      escortEndSite: row.escortEndSite
        ? {
            id: row.escortEndSite.id,
            name: row.escortEndSite.name,
            address: row.escortEndSite.address ?? null,
            latitude: row.escortEndSite.latitude ?? null,
            longitude: row.escortEndSite.longitude ?? null,
            kind: 'escort' as const,
            status: null,
            note: null,
          }
        : null,
      shiftType: {
        id: row.shiftType.id,
        name: row.shiftType.name,
        startTime: row.shiftType.startTime,
        endTime: row.shiftType.endTime,
      },
      employee: row.employee
        ? {
            id: row.employee.id,
            fullName: row.employee.fullName,
            employeeNumber: row.employee.employeeNumber,
          }
        : null,
      attendance: null,
      createdBy: null,
      lastUpdatedBy: null,
    }));

    return { success: true, shifts };
  } catch (error) {
    console.error('[getSwapCandidateShiftsAction] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to load candidate shifts.',
    };
  }
}

export async function bulkSwapShiftsAction(input: {
  employeeAId: string;
  employeeBId: string;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const adminId = await getAdminIdFromToken();

    const parsed = bulkSwapShiftsSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return {
        success: false,
        message: firstError?.message ?? 'Invalid input.',
      };
    }

    // Resolve names for notification
    const [empA, empB] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: parsed.data.employeeAId, deletedAt: null },
        select: { fullName: true },
      }),
      prisma.employee.findUnique({
        where: { id: parsed.data.employeeBId, deletedAt: null },
        select: { fullName: true },
      }),
    ]);

    const result = await bulkSwapReplaceBetweenEmployees(
      {
        employeeAId: parsed.data.employeeAId,
        employeeBId: parsed.data.employeeBId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
        reason: parsed.data.reason ?? null,
        notes: parsed.data.notes ?? null,
      },
      adminId
    );

    // Group affected shifts by post-update employeeId; one aggregate push per guard.
    const shiftsByEmployee = new Map<string, typeof result.affectedShifts>();
    for (const s of result.affectedShifts) {
      if (!s.employeeId) continue;
      const arr = shiftsByEmployee.get(s.employeeId) ?? [];
      arr.push(s);
      shiftsByEmployee.set(s.employeeId, arr);
    }

    await Promise.all(
      Array.from(shiftsByEmployee.entries()).map(([employeeId, shifts]) =>
        sendBulkShiftSwapAggregatePushNotification({
          employeeId,
          shifts,
          rangeFrom: result.rangeFrom,
          rangeTo: result.rangeTo,
          partnerFullName:
            employeeId === parsed.data.employeeAId
              ? (empB?.fullName ?? 'Guard B')
              : (empA?.fullName ?? 'Guard A'),
          reason: parsed.data.reason ?? 'Bulk swap',
        }).catch(() => {})
      )
    );

    await createShiftReassignmentHrNotification({
      type: 'swap',
      shiftIds: result.affectedShifts.map(s => s.id),
      employeeNames: [empA?.fullName ?? 'Guard A', empB?.fullName ?? 'Guard B'],
      adminId,
      reason: parsed.data.reason ?? null,
    }).catch(() => {});

    revalidatePath('/admin/guard-shifts');
    return { success: true };
  } catch (error) {
    console.error('[bulkSwapShiftsAction] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to bulk swap shifts.',
    };
  }
}
