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
        in: ['GEOFENCE_GRACE_MINUTES', 'LOCATION_DISABLED_GRACE_MINUTES', 'ENABLE_LOCATION_MONITORING']
      }
    }
  });

  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.name] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  const parseSetting = (name: string, defaultValue: number) => {
    const value = parseInt(settingsMap[name] || '', 10);
    return isNaN(value) || value <= 0 ? defaultValue : value;
  };

  return NextResponse.json({
    GEOFENCE_GRACE_MINUTES: parseSetting('GEOFENCE_GRACE_MINUTES', 5),
    LOCATION_DISABLED_GRACE_MINUTES: parseSetting('LOCATION_DISABLED_GRACE_MINUTES', 2),
    ENABLE_LOCATION_MONITORING: settingsMap['ENABLE_LOCATION_MONITORING'] === '1',
  });
}
