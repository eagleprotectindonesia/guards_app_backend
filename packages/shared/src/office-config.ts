export const OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING = 'OFFICE_JOB_TITLE_CATEGORY_MAP';
export const OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING = 'OFFICE_ATTENDANCE_MAX_DISTANCE_METERS';
export const OFFICE_ATTENDANCE_REQUIRE_PHOTO_SETTING = 'OFFICE_ATTENDANCE_REQUIRE_PHOTO';

export type OfficeJobTitleCategory = 'staff' | 'management';

export type OfficeJobTitleCategoryMap = Record<OfficeJobTitleCategory, string[]>;

export type EmployeeFieldModeReasonCode =
  | 'non_office'
  | 'missing_office'
  | 'staff_with_office'
  | 'management_with_office'
  | 'uncategorized_with_office';

export type EmployeeFieldModeState = {
  jobTitleCategory: OfficeJobTitleCategory | null;
  fieldModeEnabled: boolean;
  isFieldModeEditable: boolean;
  fieldModeReasonCode: EmployeeFieldModeReasonCode;
};

const EMPTY_CATEGORY_MAP: OfficeJobTitleCategoryMap = {
  staff: [],
  management: [],
};

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeOfficeJobTitleValue(value?: string | null) {
  if (!value?.trim()) return '';
  return normalizeTitle(value);
}

export function normalizeOfficeJobTitleList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;

    const key = normalizeTitle(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function parseOfficeJobTitleCategoryMap(rawValue?: string | null): OfficeJobTitleCategoryMap {
  if (!rawValue) return EMPTY_CATEGORY_MAP;

  try {
    const parsed = JSON.parse(rawValue) as Partial<Record<OfficeJobTitleCategory, unknown>>;

    return {
      staff: normalizeOfficeJobTitleList(
        Array.isArray(parsed.staff) ? parsed.staff.filter(v => typeof v === 'string') : []
      ),
      management: normalizeOfficeJobTitleList(
        Array.isArray(parsed.management) ? parsed.management.filter(v => typeof v === 'string') : []
      ),
    };
  } catch {
    return EMPTY_CATEGORY_MAP;
  }
}

export function serializeOfficeJobTitleCategoryMap(map: OfficeJobTitleCategoryMap) {
  return JSON.stringify({
    staff: normalizeOfficeJobTitleList(map.staff),
    management: normalizeOfficeJobTitleList(map.management),
  });
}

export function assertNoDuplicateOfficeJobTitles(map: OfficeJobTitleCategoryMap) {
  const seen = new Map<string, OfficeJobTitleCategory>();

  for (const category of Object.keys(map) as OfficeJobTitleCategory[]) {
    for (const title of map[category]) {
      const key = normalizeTitle(title);
      const existing = seen.get(key);
      if (existing) {
        throw new Error(`Job title "${title}" is assigned to both ${existing} and ${category}.`);
      }
      seen.set(key, category);
    }
  }
}

export function resolveOfficeJobTitleCategory(params: {
  role?: string | null;
  jobTitle?: string | null;
  categoryMap: OfficeJobTitleCategoryMap;
}): OfficeJobTitleCategory | null {
  const { role, jobTitle, categoryMap } = params;
  if (role !== 'office' || !jobTitle?.trim()) return null;

  const normalized = normalizeTitle(jobTitle);

  for (const category of Object.keys(categoryMap) as OfficeJobTitleCategory[]) {
    if (categoryMap[category].some(title => normalizeTitle(title) === normalized)) {
      return category;
    }
  }

  return null;
}

export function resolveEmployeeFieldModeState(params: {
  role?: string | null;
  officeId?: string | null;
  jobTitle?: string | null;
  fieldModeEnabled?: boolean | null;
  categoryMap: OfficeJobTitleCategoryMap;
}): EmployeeFieldModeState {
  const { role, officeId, jobTitle, fieldModeEnabled, categoryMap } = params;
  const jobTitleCategory = resolveOfficeJobTitleCategory({ role, jobTitle, categoryMap });

  if (role !== 'office') {
    return {
      jobTitleCategory,
      fieldModeEnabled: false,
      isFieldModeEditable: false,
      fieldModeReasonCode: 'non_office',
    };
  }

  if (!officeId) {
    return {
      jobTitleCategory,
      fieldModeEnabled: true,
      isFieldModeEditable: false,
      fieldModeReasonCode: 'missing_office',
    };
  }

  if (jobTitleCategory === 'staff') {
    return {
      jobTitleCategory,
      fieldModeEnabled: false,
      isFieldModeEditable: false,
      fieldModeReasonCode: 'staff_with_office',
    };
  }

  if (jobTitleCategory === 'management') {
    return {
      jobTitleCategory,
      fieldModeEnabled: Boolean(fieldModeEnabled),
      isFieldModeEditable: true,
      fieldModeReasonCode: 'management_with_office',
    };
  }

  return {
    jobTitleCategory,
    fieldModeEnabled: false,
    isFieldModeEditable: false,
    fieldModeReasonCode: 'uncategorized_with_office',
  };
}
