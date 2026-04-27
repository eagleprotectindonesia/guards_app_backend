import type { Metadata } from 'next';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listOfficeMemos } from '@repo/database';
import OfficeMemoList from './components/office-memo-list';
import { SerializedOfficeMemoWithAdminInfoDto } from '@/types/office-memos';

export const metadata: Metadata = {
  title: 'Office Memos',
};

export const dynamic = 'force-dynamic';

type OfficeMemoRow = {
  id: string;
  title: string;
  message: string | null;
  startDate: Date;
  endDate: Date;
  scope: 'all' | 'department';
  departmentKeys: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string } | null;
  lastUpdatedBy: { name: string } | null;
};

export default async function OfficeMemosPage() {
  await requirePermission(PERMISSIONS.OFFICE_MEMOS.VIEW);
  const officeMemos = await listOfficeMemos();

  const serializedOfficeMemos: SerializedOfficeMemoWithAdminInfoDto[] = (officeMemos as OfficeMemoRow[]).map(item => ({
    id: item.id,
    title: item.title,
    message: item.message,
    startDate: item.startDate.toISOString().slice(0, 10),
    endDate: item.endDate.toISOString().slice(0, 10),
    scope: item.scope,
    departmentKeys: item.departmentKeys,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: item.createdBy ? { name: item.createdBy.name } : null,
    lastUpdatedBy: item.lastUpdatedBy ? { name: item.lastUpdatedBy.name } : null,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <OfficeMemoList officeMemos={serializedOfficeMemos} />
    </div>
  );
}
