'use server';

import { prisma, addGroupMembers, createGroupChat, findGroupChatByGroupShiftId, removeGroupMember, unarchiveGroupChat, upsertGroupShift } from '@repo/database';
import { createShiftSchema, CreateShiftInput, UpdateShiftInput } from '@repo/validations';
import { revalidatePath } from 'next/cache';
import { format, isBefore, subMinutes } from 'date-fns';
import { ShiftStatus } from '@prisma/client';
import { parseShiftTypeTimeOnDate } from '@repo/shared';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  checkOverlappingShift,
  createShiftWithChangelog,
  updateShiftWithChangelog,
  deleteShiftWithChangelog,
  processGuardShiftBulkImport,
  bulkCreateShiftsFromForm,
} from '@repo/database';
import { getShiftTypeDurationInMins } from '@repo/database';
import { ActionState } from '@/types/actions';

export async function createShift(
  prevState: ActionState<CreateShiftInput>,
  formData: FormData
): Promise<ActionState<CreateShiftInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createShiftSchema.safeParse({
    siteId: formData.get('siteId'),
    shiftTypeId: formData.get('shiftTypeId'),
    employeeId: formData.get('employeeId') || null, // Handle empty string as null
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
      message: 'Missing Fields. Failed to Create Guard Shift.',
      success: false,
    };
  }

  const { date, shiftTypeId, siteId, employeeId, kind, escortEndSiteId, requiredCheckinIntervalMins, graceMinutes, note } =
    validatedFields.data;

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

    if (kind === 'onsite' && startSite.kind !== 'fixed') {
      return { message: 'On-site shifts must use a fixed site as the start location.', success: false };
    }

    if (kind === 'escort' && startSite.kind !== 'fixed') {
      return { message: 'Escort shifts must use a fixed site as the start location.', success: false };
    }

    if (escortEndSiteId) {
      if (!endSite) {
        return { message: 'Escort end site not found.', success: false };
      }
      if (endSite.kind !== 'escort') {
        return { message: 'Escort end site must be an escort site.', success: false };
      }
    }

    if (kind === 'escort' && escortEndSiteId) {
      const groupShift = await upsertGroupShift({
        siteId,
        endSiteId: escortEndSiteId,
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
          const existingMember = groupChat.participants.find(
            p => p.employeeId === employeeId && p.status === 'active'
          );
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

  const { date, shiftTypeId, siteId, employeeId, kind, escortEndSiteId, requiredCheckinIntervalMins, graceMinutes, note } =
    validatedFields.data;

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

    if (kind === 'onsite' && startSite.kind !== 'fixed') {
      return { message: 'On-site shifts must use a fixed site as the start location.', success: false };
    }

    if (kind === 'escort' && startSite.kind !== 'fixed') {
      return { message: 'Escort shifts must use a fixed site as the start location.', success: false };
    }

    if (escortEndSiteId) {
      if (!endSite) {
        return { message: 'Escort end site not found.', success: false };
      }
      if (endSite.kind !== 'escort') {
        return { message: 'Escort end site must be an escort site.', success: false };
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

    await deleteShiftWithChangelog(id, adminId);
    revalidatePath('/admin/guard-shifts');

    if (shift?.kind === 'escort' && shift.employeeId && shift.groupShiftId) {
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
    }

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

    await updateShiftWithChangelog(id, { status: ShiftStatus.cancelled, note: updatedNote }, adminId);
    revalidatePath('/admin/guard-shifts');

    if (shift.kind === 'escort' && shift.employeeId && shift.groupShiftId) {
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
    }

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
  kind: 'onsite' | 'escort';
  siteId: string;
  escortEndSiteId?: string;
  shiftTypeId: string;
  employeeIds: string[];
  dates: string[];
  requiredCheckinIntervalMins: number;
  graceMinutes: number;
  note?: string | null;
  autoCreateChatRoom?: boolean;
  clientName?: string;
  leadGuardId?: string;
};

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

  const [startSite, endSite, shiftType] = await Promise.all([
    prisma.site.findUnique({ where: { id: input.siteId }, select: { kind: true, name: true } }),
    input.escortEndSiteId ? prisma.site.findUnique({ where: { id: input.escortEndSiteId }, select: { kind: true, name: true } }) : null,
    prisma.shiftType.findUnique({ where: { id: input.shiftTypeId }, select: { startTime: true } }),
  ]);

  if (!startSite) return { success: false, message: 'Start site not found.' };
  if (startSite.kind !== 'fixed') return { success: false, message: 'Start site must be a fixed site.' };

  if (input.escortEndSiteId) {
    if (!endSite) return { success: false, message: 'Escort end site not found.' };
    if (endSite.kind !== 'escort') return { success: false, message: 'Escort end site must be an escort site.' };
  }

  try {
    const uniqueDates = [...new Set(input.dates)].sort();
    let groupShiftIds: Record<string, string> | undefined;

    if (input.kind === 'escort' && input.escortEndSiteId) {
      groupShiftIds = {};
      for (const dateStr of uniqueDates) {
        const groupShift = await upsertGroupShift({
          siteId: input.siteId,
          endSiteId: input.escortEndSiteId,
          shiftTypeId: input.shiftTypeId,
          date: new Date(dateStr + 'T00:00:00'),
          clientName: input.clientName,
        });
        groupShiftIds[dateStr] = groupShift.id;
      }
    }

    const result = await bulkCreateShiftsFromForm({ ...input, groupShiftIds }, adminId);
    revalidatePath('/admin/guard-shifts');

    const groupIds: string[] = [];
    if (input.autoCreateChatRoom && input.kind === 'escort' && input.escortEndSiteId && groupShiftIds) {
      const allAdmins = await prisma.admin.findMany({ where: { deletedAt: null }, select: { id: true } });
      const adminIds = allAdmins.map(a => a.id);
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
