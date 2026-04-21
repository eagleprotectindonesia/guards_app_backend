export type AdminWithRoleDto = {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
  includeFallbackLeaveQueue: boolean;
  note: string | null;
  roleRef: {
    id: string;
    name: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedAdminWithRoleDto = Omit<AdminWithRoleDto, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export type RoleDto = {
  id: string;
  name: string;
};

export type SerializedRoleDto = RoleDto;

export type AdminOwnershipAssignmentDto = {
  id: string;
  domain: 'leave' | 'employees';
  departmentKey: string | null;
  officeId: string | null;
  officeName: string | null;
  priority: number;
  isActive: boolean;
};

export type SerializedAdminOwnershipAssignmentDto = AdminOwnershipAssignmentDto;

export type AdminOwnershipOptionDto = {
  id: string;
  label: string;
};

export type SerializedAdminOwnershipOptionDto = AdminOwnershipOptionDto;
