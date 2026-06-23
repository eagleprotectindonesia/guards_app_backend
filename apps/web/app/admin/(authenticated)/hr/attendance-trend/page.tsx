import { getOfficeWeeklyAttendanceTrend } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import AttendanceTrendFullscreen from './attendance-trend-fullscreen';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AttendanceTrendFullscreenPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission('dashboard-hr:view');

  const query = await searchParams;
  const daysParam = query.days ? parseInt(Array.isArray(query.days) ? query.days[0] : query.days, 10) : 7;
  const days = daysParam === 30 ? 30 : daysParam === 15 ? 15 : 7;

  const trend = await getOfficeWeeklyAttendanceTrend(new Date(), days);

  return <AttendanceTrendFullscreen data={trend} currentDays={days} />;
}
