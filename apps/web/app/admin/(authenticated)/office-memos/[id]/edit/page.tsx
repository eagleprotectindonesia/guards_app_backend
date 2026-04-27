import { notFound } from 'next/navigation';
import { getDistinctDepartments, getOfficeMemoById } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OfficeMemoForm from '../../components/office-memo-form';

export default async function EditOfficeMemoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.OFFICE_MEMOS.EDIT);
  const { id } = await params;

  const [officeMemo, departmentOptions] = await Promise.all([getOfficeMemoById(id), getDistinctDepartments()]);

  if (!officeMemo) {
    notFound();
  }

  return (
    <OfficeMemoForm
      officeMemo={{
        id: officeMemo.id,
        title: officeMemo.title,
        message: officeMemo.message,
        startDate: officeMemo.startDate.toISOString().slice(0, 10),
        endDate: officeMemo.endDate.toISOString().slice(0, 10),
        scope: officeMemo.scope,
        departmentKeys: officeMemo.departmentKeys,
        isActive: officeMemo.isActive,
        createdAt: officeMemo.createdAt.toISOString(),
        updatedAt: officeMemo.updatedAt.toISOString(),
        createdBy: officeMemo.createdBy ? { name: officeMemo.createdBy.name } : null,
        lastUpdatedBy: officeMemo.lastUpdatedBy ? { name: officeMemo.lastUpdatedBy.name } : null,
      }}
      departmentOptions={departmentOptions}
    />
  );
}
