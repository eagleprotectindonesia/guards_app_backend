import { getAllSites, getActiveSites } from '@repo/database';
import { redis } from '@repo/database/redis';
import { serialize } from '@/lib/server-utils';
import { requirePermission } from '@/lib/admin-auth';
import { PanicAlert } from '@repo/types';
import SitesMapFullscreen from './sites-map-fullscreen';

export const dynamic = 'force-dynamic';

export default async function SitesMapPage() {
  await requirePermission('dashboard-guard:view');

  const [sites, unresolvedPanicsStr] = await Promise.all([
    getAllSites(),
    redis.get('webhooks:unresolved_panics'),
  ]);

  let initialPanicAlerts: PanicAlert[] = [];
  if (unresolvedPanicsStr) {
    try {
      const unresolvedPanics = JSON.parse(unresolvedPanicsStr);
      if (Array.isArray(unresolvedPanics)) {
        initialPanicAlerts = unresolvedPanics.filter((p: PanicAlert) => p.status === 'unresolved');
      }
    } catch (e) {
      console.error('Failed to parse unresolved panics from redis:', e);
    }
  }

  return (
    <SitesMapFullscreen
      sites={serialize(sites)}
      initialPanicAlerts={initialPanicAlerts}
    />
  );
}
