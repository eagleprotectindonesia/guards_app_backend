import { Prisma } from '@prisma/client';

export type ChangelogWithAdminDto = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Prisma.JsonValue;
  actor: 'admin' | 'system' | 'unknown';
  actorId: string | null;
  createdAt: Date;
  admin: {
    name: string;
  } | null;
};

export type SerializedChangelogWithAdminDto = Omit<ChangelogWithAdminDto, 'createdAt'> & {
  createdAt: string;
};

export type EntitySummary = {
  id: string;
  name?: string;
  fullName?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
};
