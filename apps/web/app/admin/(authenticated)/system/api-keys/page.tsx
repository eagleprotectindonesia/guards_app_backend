import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ApiKeyList from './components/api-key-list';
import { serialize } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requirePermission(PERMISSIONS.SYSTEM.VIEW_SETTINGS);

  const apiKeys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys for external data access. Keys are restricted to read-only access.
          </p>
        </div>
      </div>

      <ApiKeyList initialData={serialize(apiKeys)} />
    </div>
  );
}
