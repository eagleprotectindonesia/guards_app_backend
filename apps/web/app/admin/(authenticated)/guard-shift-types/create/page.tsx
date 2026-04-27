import ShiftTypeForm from '../components/shift-type-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateShiftTypePage() {
  await requirePermission(PERMISSIONS.SHIFT_TYPES.CREATE);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftTypeForm />
    </div>
  );
}
