import { redis } from '@repo/database';
import { UnifiedServer, UnifiedSocket } from '../socket';
import { isEmployeeSessionActive } from '../auth/employee-sessions';

/**
 * Handlers for Employee users (Guards).
 */
export async function registerEmployeeHandlers(io: UnifiedServer, socket: UnifiedSocket) {
  const auth = socket.data.auth!;

  // Join employee room
  socket.join(`employee:${auth.id}`);

  // Listen to Redis Stream for session/shift updates
  const sub = redis.duplicate({
    enableOfflineQueue: true,
    commandTimeout: 15000, // Must be higher than the BLOCK timeout (10000ms)
  });
  let active = true;

  const poll = async () => {
    let lastId = '$';
    while (active) {
      try {
        const res = await sub.xread('BLOCK', 10000, 'STREAMS', `employee:stream:${auth.id}`, lastId);
        if (res?.[0]) {
          for (const [id, fields] of res[0][1]) {
            lastId = id;
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

            if (data.type === 'session_revoked') {
              if (!auth.sessionId) {
                socket.emit('auth:force_logout', { reason: data.reason || 'session_revoked' });
                socket.disconnect(true);
                active = false;
                continue;
              }

              const stillActive = await isEmployeeSessionActive(auth.sessionId);
              if (!stillActive) {
                socket.emit('auth:force_logout', { reason: data.reason || 'session_revoked' });
                socket.disconnect(true);
                active = false;
              }
            } else if (data.type === 'shift_updated') {
              socket.emit('shift:updated', { shiftId: data.shiftId });
            }
          }
        }
      } catch (err) {
        console.error(`Error polling employee stream (${auth.id}):`, err);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    sub.quit();
  };

  poll();
  socket.on('disconnect', () => {
    active = false;
  });
}
