import React, { Suspense } from 'react';
import { AdminChatClient } from './client';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AdminChatSkeleton } from '../components/loading/admin-chat-skeleton';

export default async function AdminChatPage() {
  await requirePermission(PERMISSIONS.CHAT.VIEW);

  return (
    <div className="max-w-[1600px] mx-auto">
      <Suspense fallback={<AdminChatSkeleton />}>
        <AdminChatClient />
      </Suspense>
    </div>
  );
}
