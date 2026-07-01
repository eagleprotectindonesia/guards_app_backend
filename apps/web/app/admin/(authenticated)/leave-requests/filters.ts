import type { LeaveRequestReason, LeaveRequestStatus } from '@repo/types';
import { getLeaveReasonsByCategory } from '@/lib/leave-requests';

export const ALLOWED_LEAVE_STATUSES: LeaveRequestStatus[] = [
  'pending',
  'pending_hr',
  'pending_manager',
  'approved',
  'rejected',
  'cancelled',
];

export const ALLOWED_LEAVE_REASONS: LeaveRequestReason[] = [
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
];

export const ALLOWED_LEAVE_CATEGORIES = ['sick', 'family', 'special', 'annual'] as const;
export type LeaveCategoryFilter = (typeof ALLOWED_LEAVE_CATEGORIES)[number];

export const ALLOWED_LEAVE_SORT_FIELDS = ['startDate', 'status', 'employee', 'reason'] as const;
export type LeaveRequestSortField = (typeof ALLOWED_LEAVE_SORT_FIELDS)[number];

export function parseStatusesParam(rawStatuses: string | string[] | undefined): LeaveRequestStatus[] {
  const raw = Array.isArray(rawStatuses) ? rawStatuses[0] : rawStatuses;
  if (!raw) return [];

  const parsed = raw
    .split(',')
    .map(value => value.trim())
    .filter((status): status is LeaveRequestStatus => ALLOWED_LEAVE_STATUSES.includes(status as LeaveRequestStatus));

  return parsed.length > 0 ? parsed : [];
}

export function parseReasonsParam(rawReasons: string | string[] | undefined): LeaveRequestReason[] {
  const raw = Array.isArray(rawReasons) ? rawReasons[0] : rawReasons;
  if (!raw) return [];

  return raw
    .split(',')
    .map(value => value.trim())
    .filter((reason): reason is LeaveRequestReason => ALLOWED_LEAVE_REASONS.includes(reason as LeaveRequestReason));
}

export function parseCategoriesParam(rawCategories: string | string[] | undefined): LeaveCategoryFilter[] {
  const raw = Array.isArray(rawCategories) ? rawCategories[0] : rawCategories;
  if (!raw) return [];

  return raw
    .split(',')
    .map(value => value.trim())
    .filter((category): category is LeaveCategoryFilter =>
      ALLOWED_LEAVE_CATEGORIES.includes(category as LeaveCategoryFilter)
    );
}

export function mergeReasonFilters(reasons: LeaveRequestReason[], categories: LeaveCategoryFilter[]): LeaveRequestReason[] {
  return Array.from(
    new Set<LeaveRequestReason>([...reasons, ...categories.flatMap(category => getLeaveReasonsByCategory(category))])
  );
}

export function parseSortByParam(rawSortBy: string | string[] | undefined): LeaveRequestSortField {
  const sortBy = Array.isArray(rawSortBy) ? rawSortBy[0] : rawSortBy;
  return ALLOWED_LEAVE_SORT_FIELDS.includes(sortBy as LeaveRequestSortField)
    ? (sortBy as LeaveRequestSortField)
    : 'startDate';
}

export function parseSortOrderParam(rawSortOrder: string | string[] | undefined): 'asc' | 'desc' {
  const sortOrder = Array.isArray(rawSortOrder) ? rawSortOrder[0] : rawSortOrder;
  return sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'desc';
}
