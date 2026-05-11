import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import jwt from 'jsonwebtoken';
import { getAdminById } from '@repo/database';
import ProfileClient from './profile-client';
import { getJwtSecret } from '@/lib/auth/constants';

export default async function ProfilePage() {
  // Parent layout already validates the token
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')!;
  
  const { adminId } = jwt.verify(token.value, getJwtSecret()) as { adminId: string };

  const admin = await getAdminById(adminId);

  if (!admin) redirect('/admin/login');

  return (
    <ProfileClient
      admin={{
        name: admin.name,
        email: admin.email,
        leaveApprovalEmail: admin.leaveApprovalEmail,
        profileImage: admin.profileImage,
        twoFactorEnabled: admin.twoFactorEnabled,
      }}
    />
  );
}
