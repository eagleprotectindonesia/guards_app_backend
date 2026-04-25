import { createOfficeMemoAction, deleteOfficeMemoAction } from '../app/admin/(authenticated)/office-memos/actions';
import { createOfficeMemo, deleteOfficeMemo } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';

jest.mock('@repo/database', () => ({
  createOfficeMemo: jest.fn(),
  deleteOfficeMemo: jest.fn(),
}));

jest.mock('@/lib/admin-auth', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('office memo actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requirePermission as jest.Mock).mockResolvedValue({ id: 'admin-1' });
  });

  test('returns validation errors for invalid date range', async () => {
    const formData = new FormData();
    formData.set('startDate', '2026-05-10');
    formData.set('endDate', '2026-05-01');
    formData.set('title', 'Memo');
    formData.set('scope', 'all');
    formData.set('isActive', 'true');

    const result = await createOfficeMemoAction({ success: false }, formData);

    expect(result.success).toBe(false);
    expect(result.errors?.endDate?.[0]).toContain('endDate');
    expect(createOfficeMemo).not.toHaveBeenCalled();
  });

  test('deletes memo with permission context', async () => {
    (deleteOfficeMemo as jest.Mock).mockResolvedValue({ id: 'memo-1' });

    const result = await deleteOfficeMemoAction('memo-1');

    expect(result.success).toBe(true);
    expect(requirePermission).toHaveBeenCalled();
    expect(deleteOfficeMemo).toHaveBeenCalledWith('memo-1', 'admin-1');
  });
});
