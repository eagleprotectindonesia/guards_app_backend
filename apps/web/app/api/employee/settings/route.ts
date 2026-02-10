import { NextResponse } from 'next/server';
import { verifyEmployeeSession } from '@/lib/employee-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const isValid = await verifyEmployeeSession();

  if (!isValid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const settings = await prisma.systemSetting.findMany({
    where: {
      name: {
        in: ['GEOFENCE_GRACE_MINUTES', 'LOCATION_DISABLED_GRACE_MINUTES']
      }
    }
  });

  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.name] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  return NextResponse.json({
    GEOFENCE_GRACE_MINUTES: parseInt(settingsMap['GEOFENCE_GRACE_MINUTES'] || '5', 10),
    LOCATION_DISABLED_GRACE_MINUTES: parseInt(settingsMap['LOCATION_DISABLED_GRACE_MINUTES'] || '2', 10),
  });
}
