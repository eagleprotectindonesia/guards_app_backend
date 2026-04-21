function parseBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (value == null) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export function isOfficeWorkSchedulesEnabled() {
  return parseBooleanFlag(process.env.ENABLE_OFFICE_WORK_SCHEDULES, false);
}

export function isAdminLeaveOwnershipEnabled() {
  return parseBooleanFlag(process.env.ENABLE_ADMIN_LEAVE_OWNERSHIP, false);
}
