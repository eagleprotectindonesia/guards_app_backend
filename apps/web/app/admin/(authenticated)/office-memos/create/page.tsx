import { getDistinctDepartments } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OfficeMemoForm from '../components/office-memo-form';

export default async function CreateOfficeMemoPage() {
  await requirePermission(PERMISSIONS.OFFICE_MEMOS.CREATE);
  const departmentOptions = await getDistinctDepartments();

  return <OfficeMemoForm departmentOptions={departmentOptions} />;
}
