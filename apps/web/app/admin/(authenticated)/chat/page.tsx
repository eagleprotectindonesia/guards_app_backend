import React, { Suspense } from 'react';
import { AdminChatClient } from './client';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export default async function AdminChatPage() {
  await requirePermission(PERMISSIONS.CHAT.VIEW);

  return (
    <div className="max-w-[1600px] mx-auto">
      <Suspense
        fallback={
          <div className="flex h-[calc(100vh-180px)] bg-card rounded-xl shadow-sm border border-border animate-pulse">
            <div className="w-1/3 border-r border-border bg-muted/10" />
            <div className="flex-1 bg-muted/5" />
          </div>
        }
      >
        <AdminChatClient />
      </Suspense>
    </div>
  );
}
