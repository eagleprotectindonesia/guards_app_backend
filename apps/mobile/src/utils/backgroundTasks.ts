import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import axios from 'axios';
import { storage, STORAGE_KEYS } from './storage';
import { BASE_URL, queryClient } from '../api/client';
import { SystemSettings } from '../hooks/useSettings';
import { calculateDistance } from '@repo/shared';
import { sendDebugChat } from './debug';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';
export const LOCATION_MONITOR_TASK = 'LOCATION_MONITOR_TASK';

const BREACH_START_TIME_KEY = '@geofence_breach_start_time';
const BREACH_REPORTED_KEY = '@geofence_breach_reported';
const LOCATION_DISABLED_START_TIME_KEY = '@location_disabled_start_time';
const LOCATION_DISABLED_REPORTED_KEY = '@location_disabled_reported';
const ACTIVE_SHIFT_ID_KEY = 'active_shift_id';
const GEOFENCE_CONFIG_KEY = 'geofence_config';

// Default values as fallbacks
const DEFAULT_SETTINGS: SystemSettings = {
  GEOFENCE_GRACE_MINUTES: 5,
  LOCATION_DISABLED_GRACE_MINUTES: 2,
};

function getSettings(): SystemSettings {
  const cached = queryClient.getQueryData<SystemSettings>(['settings']);
  return cached || DEFAULT_SETTINGS;
}
export async function checkAndReportLocationServices(
  shiftId: string,
  source: string,
  options?: { immediate?: boolean }
) {
  try {
    // 1. Check Location Services & Permissions (Both Foreground & Background)
    const [{ status: fgStatus }, { status: bgStatus }, isLocationEnabled] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(),
    ]);

    const hasPermissions = fgStatus === 'granted' && bgStatus === 'granted';
    const settings = getSettings();

    if (!isLocationEnabled || !hasPermissions) {
      if (options?.immediate) {
        await sendDebugChat(`[${source}] Immediate location breach reported (No grace period).`);
        await reportBreach(shiftId, 'location_services_disabled');
        return;
      }

      const startTime = await storage.getItem(LOCATION_DISABLED_START_TIME_KEY);
      if (!startTime) {
        await sendDebugChat(`[${source}] Location services or permissions DISABLED. Starting grace period.`);
        await storage.setItem(LOCATION_DISABLED_START_TIME_KEY, Date.now().toString());
      } else {
        const elapsedMinutes = (Date.now() - parseInt(startTime, 10)) / 1000 / 60;
        if (elapsedMinutes >= settings.LOCATION_DISABLED_GRACE_MINUTES) {
          await reportBreach(shiftId, 'location_services_disabled');
        }
      }
    } else {
      const startTime = await storage.getItem(LOCATION_DISABLED_START_TIME_KEY);
      if (startTime) {
        await sendDebugChat(`[${source}] Location services or permissions RESTORED.`);
        await resolveBreach(shiftId, 'location_services_disabled');
        await storage.removeItem(LOCATION_DISABLED_START_TIME_KEY);
      }
    }
  } catch (error) {
     console.error(`[${source}] Error checking location services:`, error);
  }
}

export async function reportBreach(shiftId: string, reason: 'geofence_breach' | 'location_services_disabled') {
  try {
    const token = await storage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return;

    // Avoid double reporting
    const reportedKey = reason === 'geofence_breach' ? BREACH_REPORTED_KEY : LOCATION_DISABLED_REPORTED_KEY;
    const isReported = await storage.getItem(reportedKey);
    if (isReported === shiftId) return;

    await axios.post(
      `${BASE_URL}/api/employee/alerts/report`,
      {
        shiftId,
        reason,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    await storage.setItem(reportedKey, shiftId);
    console.log(`[Background] Reported ${reason} for shift ${shiftId}`);
    await sendDebugChat(`Reported ${reason} for shift ${shiftId}`);
  } catch (error) {
    console.error(`[Background] Failed to report ${reason}:`, error);
    await sendDebugChat(`FAILED to report ${reason} for shift ${shiftId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function resolveBreach(shiftId: string, reason: 'geofence_breach' | 'location_services_disabled') {
  try {
    const token = await storage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return;

    // Unconditionally attempt to resolve on server (Server is idempotent)
    await axios.post(
      `${BASE_URL}/api/employee/alerts/resolve`,
      {
        shiftId,
        reason,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // Clear local reported state regardless
    const reportedKey = reason === 'geofence_breach' ? BREACH_REPORTED_KEY : LOCATION_DISABLED_REPORTED_KEY;
    await storage.removeItem(reportedKey);
    console.log(`[Background] Resolved ${reason} for shift ${shiftId}`);
    await sendDebugChat(`Resolved ${reason} for shift ${shiftId}`);
  } catch (error) {
    console.error(`[Background] Failed to resolve ${reason}:`, error);
    await sendDebugChat(`FAILED to resolve ${reason} for shift ${shiftId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function sendHeartbeat(shiftId: string) {
  try {
    const token = await storage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return;

    await axios.post(
      `${BASE_URL}/api/employee/shifts/${shiftId}/heartbeat`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log(`[Background] Heartbeat sent for shift ${shiftId}`);
  } catch (error) {
    console.error(`[Background] Failed to send heartbeat:`, error);
  }
}

// Handler for Geofencing transitions (OS triggered)
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error(`[Background] Geofence task error: ${error.message}`);
    await sendDebugChat(`Geofence Task ERROR: ${error.message}`);
    return;
  }

  const eventType = data?.eventType;
  if (!eventType) return;

  const shiftId = await storage.getItem(ACTIVE_SHIFT_ID_KEY);
  if (!shiftId) return;

  if (eventType === Location.GeofencingEventType.Exit) {
    console.log(`[Background] Exited geofence`);
    await sendDebugChat(`Geofence EXIT detected by OS for shift ${shiftId}`);
    await storage.setItem(BREACH_START_TIME_KEY, Date.now().toString());
  } else if (eventType === Location.GeofencingEventType.Enter) {
    console.log(`[Background] Entered geofence`);
    await sendDebugChat(`Geofence ENTER detected by OS for shift ${shiftId}`);
    await resolveBreach(shiftId, 'geofence_breach');
    await storage.removeItem(BREACH_START_TIME_KEY);
  }
});

// Handler for periodic location updates (Timer triggered)
TaskManager.defineTask(LOCATION_MONITOR_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error(`[Background] Location monitor task error: ${error.message}`);
    await sendDebugChat(`Location Monitor Task ERROR: ${error.message}`);
    return;
  }

  try {
    const shiftId = await storage.getItem(ACTIVE_SHIFT_ID_KEY);
    if (!shiftId) return;

    const locations = data?.locations || [];
    const lastLocation = locations[locations.length - 1];
    
    // Log task trigger
    if (lastLocation) {
      await sendDebugChat(`LOCATION_MONITOR_TASK triggered. Accuracy: ${lastLocation.coords.accuracy?.toFixed(1)}m`);
    } else {
      await sendDebugChat(`LOCATION_MONITOR_TASK triggered with no location data`);
    }

    // 1. Send Heartbeat (Aggressive monitoring - 1 minute)
    await sendHeartbeat(shiftId);

    // 2. Check Location Services & Permissions (Shared Logic)
    await checkAndReportLocationServices(shiftId, 'LOCATION_MONITOR_TASK');

    const settings = getSettings();

    // 2. Manual Geofence Breach Check (Fallback for "always outside")
    if (lastLocation) {
      const geofenceConfig = await storage.getItem(GEOFENCE_CONFIG_KEY);
      if (geofenceConfig) {
        const distance = calculateDistance(
          lastLocation.coords.latitude,
          lastLocation.coords.longitude,
          geofenceConfig.latitude,
          geofenceConfig.longitude
        );

        const isCurrentlyOutside = distance > geofenceConfig.radius;
        const breachStartTime = await storage.getItem(BREACH_START_TIME_KEY);

        if (isCurrentlyOutside) {
          if (!breachStartTime) {
            console.log(`[Background] Manual breach detection. Distance: ${distance.toFixed(2)}m`);
            await sendDebugChat(`Manual BREACH detection. Distance: ${distance.toFixed(2)}m (Radius: ${geofenceConfig.radius}m)`);
            await storage.setItem(BREACH_START_TIME_KEY, Date.now().toString());
          }
        } else {
          if (breachStartTime) {
            console.log(`[Background] Manual enter detection. Distance: ${distance.toFixed(2)}m`);
            await sendDebugChat(`Manual ENTER detection. Distance: ${distance.toFixed(2)}m (Radius: ${geofenceConfig.radius}m)`);
            await resolveBreach(shiftId, 'geofence_breach');
            await storage.removeItem(BREACH_START_TIME_KEY);
          }
        }
      }
    }

    // 3. Check Geofence Breach Duration (if not reported yet)
    const currentBreachStart = await storage.getItem(BREACH_START_TIME_KEY);
    if (currentBreachStart) {
      const elapsedMinutes = (Date.now() - parseInt(currentBreachStart, 10)) / 1000 / 60;

      if (elapsedMinutes >= settings.GEOFENCE_GRACE_MINUTES) {
        await reportBreach(shiftId, 'geofence_breach');
      }
    }
  } catch (err) {
    console.error('[Background] monitor task error:', err);
    await sendDebugChat(`LOCATION_MONITOR_TASK UNCAUGHT ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
});
