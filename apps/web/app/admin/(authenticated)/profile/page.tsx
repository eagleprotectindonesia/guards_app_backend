import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import jwt from 'jsonwebtoken';
import { getAdminById } from '@/lib/data-access/admins';
import ProfileClient from './profile-client';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export default async function ProfilePage() {
  // Parent layout already validates the token
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')!;
  
  const { adminId } = jwt.verify(token.value, JWT_SECRET) as { adminId: string };

  const admin = await getAdminById(adminId);

  if (!admin) redirect('/admin/login');

  return (
    <ProfileClient
      admin={{
        name: admin.name,
        email: admin.email,
        profileImage: admin.profileImage,
        twoFactorEnabled: admin.twoFactorEnabled,
      }}
    />
  );
}
