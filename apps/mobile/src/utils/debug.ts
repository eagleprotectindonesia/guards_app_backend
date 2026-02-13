import axios from 'axios';
import { storage, STORAGE_KEYS } from './storage';
import { BASE_URL } from '../api/client';

/**
 * TOGGLE THIS FOR DEBUG LOGS TO CHAT
 */
export const DEBUG_CHAT_LOGGING = true;

/**
 * Sends a debug message to the admin chat if DEBUG_CHAT_LOGGING is true.
 * This is useful for tracking background events like geofence transitions.
 */
export async function sendDebugChat(message: string) {
  if (!DEBUG_CHAT_LOGGING) return;

  try {
    const token = await storage.getItem(STORAGE_KEYS.TOKEN);
    const user = await storage.getItem(STORAGE_KEYS.EMPLOYEE_INFO);

    if (!token || !user) return;

    const employeeId = user.id;

    if (!employeeId) return;

    await axios.post(
      `${BASE_URL}/api/shared/chat/${employeeId}`,
      {
        content: `[DEBUG] ${message}`,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  } catch (error) {
    // Silently fail debug logs
    console.warn('[DebugChat] Failed to send:', error);
    console.log('Original message', message);
  }
}
