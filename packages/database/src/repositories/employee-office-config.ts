import { getSystemSetting } from './settings';
export {
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
  normalizeOfficeJobTitleList,
  normalizeOfficeJobTitleValue,
  parseOfficeJobTitleCategoryMap,
  serializeOfficeJobTitleCategoryMap,
  assertNoDuplicateOfficeJobTitles,
  resolveOfficeJobTitleCategory,
  resolveEmployeeFieldModeState,
} from '@repo/shared';
export type {
  OfficeJobTitleCategory,
  OfficeJobTitleCategoryMap,
  EmployeeFieldModeReasonCode,
  EmployeeFieldModeState,
} from '@repo/shared';
import { OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING, parseOfficeJobTitleCategoryMap } from '@repo/shared';

export async function getOfficeJobTitleCategoryMapSetting() {
  const setting = await getSystemSetting(OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING);
  return parseOfficeJobTitleCategoryMap(setting?.value);
}
