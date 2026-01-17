import { prisma } from '@/lib/prisma';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { forbidden } from 'next/navigation';
import ApiKeyList from './components/api-key-list';
import { serialize } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const session = await checkSuperAdmin();
  if (!session) {
    forbidden();
  }

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
