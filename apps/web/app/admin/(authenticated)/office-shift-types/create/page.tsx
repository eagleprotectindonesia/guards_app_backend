import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OfficeShiftTypeForm from '../components/office-shift-type-form';

export default async function CreateOfficeShiftTypePage() {
  await requirePermission(PERMISSIONS.OFFICE_SHIFT_TYPES.CREATE);
  return <OfficeShiftTypeForm />;
}
