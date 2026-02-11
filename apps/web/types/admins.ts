export type AdminWithRoleDto = {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
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
