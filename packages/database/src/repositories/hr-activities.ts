import { redis } from '../redis';

export interface HrActivity {
  id: string;
  type: 'office_shift_created' | 'leave_request_created';
  occurredAt: string;
  employeeName: string;
  details: string;
}

const HR_LIVE_ACTIVITIES_KEY = 'hr:live-activities';
const HR_LIVE_ACTIVITIES_CHANNEL = 'events:hr-activities';

export async function logHrActivity(activity: Omit<HrActivity, 'occurredAt'>) {
  try {
    const fullActivity: HrActivity = {
      ...activity,
      occurredAt: new Date().toISOString(),
    };

    const payload = JSON.stringify(fullActivity);

    // Use a pipeline to push, trim, and publish
    const pipeline = redis.pipeline();
    pipeline.lpush(HR_LIVE_ACTIVITIES_KEY, payload);
    pipeline.ltrim(HR_LIVE_ACTIVITIES_KEY, 0, 4); // Keep only the 5 latest events
    pipeline.publish(HR_LIVE_ACTIVITIES_CHANNEL, payload);
    await pipeline.exec();
  } catch (error) {
    console.error('Failed to log HR activity to Redis:', error);
  }
}

export async function getHrLiveActivities(): Promise<HrActivity[]> {
  try {
    const items = await redis.lrange(HR_LIVE_ACTIVITIES_KEY, 0, -1);
    return items.map(item => JSON.parse(item) as HrActivity);
  } catch (error) {
    console.error('Failed to fetch HR live activities from Redis:', error);
    return [];
  }
}
