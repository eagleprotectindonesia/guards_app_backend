import { getSystemSetting } from './settings';
export {
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
  normalizeOfficeJobTitleList,
  parseOfficeJobTitleCategoryMap,
  serializeOfficeJobTitleCategoryMap,
  assertNoDuplicateOfficeJobTitles,
  resolveOfficeJobTitleCategory,
  resolveEmployeeFieldModeState,
} from '../../../shared/src/office-config';
export type {
  OfficeJobTitleCategory,
  OfficeJobTitleCategoryMap,
  EmployeeFieldModeReasonCode,
  EmployeeFieldModeState,
} from '../../../shared/src/office-config';
import { OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING, parseOfficeJobTitleCategoryMap } from '../../../shared/src/office-config';

export async function getOfficeJobTitleCategoryMapSetting() {
  const setting = await getSystemSetting(OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING);
  return parseOfficeJobTitleCategoryMap(setting?.value);
}
