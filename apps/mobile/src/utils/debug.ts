import axios from 'axios';
import { storage, STORAGE_KEYS } from './storage';
import { BASE_URL } from '../api/client';

/**
 * TOGGLE THIS FOR DEBUG LOGS TO CHAT
 */
export const DEBUG_CHAT_LOGGING = false;
let cachedDebugEmployeeId: string | null = null;

export const clearDebugChatCache = () => {
  cachedDebugEmployeeId = null;
};

/**
 * Sends a debug message to the admin chat if DEBUG_CHAT_LOGGING is true.
 * This is useful for tracking background events like geofence transitions.
 */
export async function sendDebugChat(message: string) {
  if (!DEBUG_CHAT_LOGGING) return;

  try {
    const token = await storage.getItem(STORAGE_KEYS.USER_TOKEN);

    if (!token) return;

    if (!cachedDebugEmployeeId) {
      let user = await storage.getItem(STORAGE_KEYS.USER_INFO);

      if (!user) {
        const profileRes = await axios.get(`${BASE_URL}/api/employee/my/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        user = profileRes.data?.employee;
      }

      cachedDebugEmployeeId = user?.id ?? null;
    }

    if (!cachedDebugEmployeeId) return;

    await axios.post(
      `${BASE_URL}/api/shared/chat/${cachedDebugEmployeeId}`,
      {
        content: `[DEBUG] ${message}`,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  } catch (error) {
    cachedDebugEmployeeId = null;
    // Silently fail debug logs
    console.warn('[DebugChat] Failed to send:', error);
    console.log('Original message', message);
  }
}
