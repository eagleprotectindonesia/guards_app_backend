import type { LeaveRequestReason } from '@repo/types';

export type LeaveMainCategory = 'sick' | 'family' | 'special' | 'annual';

export type LeaveReasonOption = {
  reason: LeaveRequestReason;
  label: string;
  category: LeaveMainCategory;
};

export const LEAVE_REASON_OPTIONS: LeaveReasonOption[] = [
  { reason: 'sick', label: 'Sick Leave', category: 'sick' },
  { reason: 'family_marriage', label: 'Marriage Leave', category: 'family' },
  { reason: 'family_child_marriage', label: 'Child Marriage', category: 'family' },
  {
    reason: 'family_child_circumcision_baptism',
    label: 'Child Circumcision/Baptism',
    category: 'family',
  },
  { reason: 'family_death', label: 'Death of Family Member', category: 'family' },
  { reason: 'family_spouse_death', label: 'Spouse Death', category: 'family' },
  { reason: 'special_maternity', label: 'Maternity Leave', category: 'special' },
  { reason: 'special_miscarriage', label: 'Miscarriage Leave', category: 'special' },
  { reason: 'special_paternity', label: 'Paternity Leave', category: 'special' },
  { reason: 'special_emergency', label: 'Emergency Leave', category: 'special' },
  { reason: 'annual', label: 'Annual Leave', category: 'annual' },
];

const LEAVE_REASON_META = new Map(LEAVE_REASON_OPTIONS.map(option => [option.reason, option]));

export function getLeaveReasonMeta(reason: LeaveRequestReason) {
  return LEAVE_REASON_META.get(reason) ?? { reason, label: reason, category: 'special' as LeaveMainCategory };
}

export function getLeaveReasonsByCategory(category: LeaveMainCategory) {
  return LEAVE_REASON_OPTIONS.filter(option => option.category === category).map(option => option.reason);
}
