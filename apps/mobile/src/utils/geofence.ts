import * as Location from 'expo-location';
import { GEOFENCE_TASK, LOCATION_MONITOR_TASK } from './backgroundTasks';
import { storage } from './storage';

const GEOFENCE_KEYS = [
  'active_shift_id',
  'geofence_config',
  '@geofence_breach_start_time',
  '@geofence_breach_reported',
  '@location_disabled_start_time',
  '@location_disabled_reported',
];

export async function clearGeofenceState() {
  try {
    await Promise.all(GEOFENCE_KEYS.map(key => storage.removeItem(key)));
    console.log('[Geofence] State cleared');
  } catch (err) {
    console.error('[Geofence] Failed to clear state:', err);
  }
}

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
  // Ensure a clean slate before starting
  await clearGeofenceState();

  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return;

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') return;

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    console.warn('[Geofence] Location services are disabled');
    return;
  }

  const lat = shift.site.latitude;
  const lng = shift.site.longitude;
  const radius = shift.site.geofenceRadius || 100;

  if (lat == null || lng == null) return;

  // Store active shift ID and geofence config for the background task
  await storage.setItem('active_shift_id', shift.id);
  await storage.setItem('geofence_config', {
    latitude: lat,
    longitude: lng,
    radius: radius,
  });

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

    // 2. Start Recurring Location Monitor
    await Location.startLocationUpdatesAsync(LOCATION_MONITOR_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 1000 * 60 * 1, // Every 1 minute
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
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
  console.log('[Geofence] Stopping monitoring...');
  try {
    // Attempt to stop tasks regardless of servicesEnabled flag
    // Guard each with try-catch to ensure one failure doesn't block cleanup

    try {
      const isGeofencing = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
      if (isGeofencing) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
      }
    } catch (e) {
      console.log('[Geofence] Could not stop geofencing task (might already be stopped):', e);
    }

    try {
      const isLocationUpdates = await Location.hasStartedLocationUpdatesAsync(LOCATION_MONITOR_TASK);
      if (isLocationUpdates) {
        await Location.stopLocationUpdatesAsync(LOCATION_MONITOR_TASK);
      }
    } catch (e) {
      console.log('[Geofence] Could not stop location monitor task (might already be stopped):', e);
    }

    // Always clear state at the end
    await clearGeofenceState();
    console.log('[Geofence] Monitoring stopped and state cleared');
  } catch (err) {
    console.error('[Geofence] Failed during stopGeofencing:', err);
    // Fallback: at least try to clear state
    await clearGeofenceState();
  }
}

export async function isGeofencingActive(): Promise<boolean> {
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) return false;
    // Check both independently to avoid one rejection blocking the other
    const [geo, loc] = await Promise.all([
      (async () => {
        try {
          const { status } = await Location.getBackgroundPermissionsAsync();
          if (status === 'granted') {
            return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
          }
        } catch (e) {
          console.warn('[Geofence] Geofence check rejected:', e);
        }
        return false;
      })(),
      (async () => {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();

          if (status === 'granted') {
            return await Location.hasStartedLocationUpdatesAsync(LOCATION_MONITOR_TASK);
          }
        } catch (e) {
          console.warn('[Geofence] Location monitor check rejected:', e);
        }
        return false;
      })(),
    ]);
    return geo && loc;
  } catch (err) {
    console.error('[Geofence] Error checking if active:', err);
    return false;
  }
}
