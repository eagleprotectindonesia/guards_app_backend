import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import jwt from 'jsonwebtoken';
import { ReactNode } from 'react';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export default async function GuardAuthenticatedLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('guard_token');

  if (!token) {
    redirect('/guard/login');
  }

  try {
    jwt.verify(token.value, JWT_SECRET);
  } catch (error) {
    console.error('Guard token verification failed:', error);
    redirect('/guard/login');
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* No explicit header/sidebar for now, just the children */}
      <main className="grow">{children}</main>
    </div>
  );
}
