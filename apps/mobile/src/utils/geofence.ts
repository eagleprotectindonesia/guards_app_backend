import * as Location from 'expo-location';
import { GEOFENCE_TASK, LOCATION_MONITOR_TASK } from './backgroundTasks';
import { storage } from './storage';

export async function startGeofencing(shift: {
  id: string;
  site: {
    id: string;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    geofenceRadius?: number | null;
  };
}) {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return;

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') return;

  const lat = shift.site.latitude;
  const lng = shift.site.longitude;
  const radius = shift.site.geofenceRadius || 100;

  if (lat == null || lng == null) return;

  // Store active shift ID for the background task
  await storage.setItem('active_shift_id', shift.id);

  try {
    // 1. Start Geofencing
    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: `site-${shift.site.id}`,
        latitude: lat,
        longitude: lng,
        radius: radius,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);

    // 2. Start Recurring Location Monitor (as a fallback/disabled check)
    // expo-location doesn't have a built-in "startBackgroundLocationMonitor" but we can use
    // startLocationUpdatesAsync which triggers LOCATION_MONITOR_TASK.
    await Location.startLocationUpdatesAsync(LOCATION_MONITOR_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 1000 * 60 * 1, // Every 1 minute
      distanceInterval: 50,
      foregroundService: {
        notificationTitle: 'Monitoring Shift',
        notificationBody: 'Geofencing and location monitoring active.',
      },
    });

    console.log('[Geofence] Monitoring started');
  } catch (err) {
    console.error('[Geofence] Failed to start monitoring:', err);
  }
}

export async function stopGeofencing() {
  try {
    const isGeofencing = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (isGeofencing) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }

    const isLocationUpdates = await Location.hasStartedLocationUpdatesAsync(LOCATION_MONITOR_TASK);
    if (isLocationUpdates) {
      await Location.stopLocationUpdatesAsync(LOCATION_MONITOR_TASK);
    }

    await storage.removeItem('active_shift_id');
    console.log('[Geofence] Monitoring stopped');
  } catch (err) {
    console.error('[Geofence] Failed to stop monitoring:', err);
  }
}
