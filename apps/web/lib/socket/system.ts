import { redis } from '../redis';
import { UnifiedServer } from '../socket';

/**
 * Listens to Redis channels and broadcasts to Socket.io rooms.
 */
export async function registerSystemHandlers(io: UnifiedServer) {
  const sub = redis.duplicate({ enableOfflineQueue: true });

  sub.on('error', err => {
    console.error('[Socket Redis Sub] Error:', err);
  });

  const handleRedisMessage = (channel: string, message: string) => {
    try {
      const payload = JSON.parse(message);

      if (channel.startsWith('alerts:site:')) {
        const siteId = channel.split(':').pop();
        // Broadcast to global admin room
        io.to('admin').emit('alert', payload);
        // Broadcast to site-specific admin room
        if (siteId) {
          io.to(`admin:site:${siteId}`).emit('alert', payload);
        }
      } else if (channel === 'dashboard:active-shifts') {
        io.to('admin').emit('active_shifts', payload);
      } else if (channel === 'dashboard:upcoming-shifts') {
        io.to('admin').emit('upcoming_shifts', payload);
      }
    } catch (err) {
      console.error('[Socket Redis Sub] Parse Error:', err, 'Message:', message);
    }
  };

  sub.on('message', (channel, message) => {
    handleRedisMessage(channel, message);
  });

  sub.on('pmessage', (_pattern, channel, message) => {
    handleRedisMessage(channel, message);
  });

  try {
    await sub.psubscribe('alerts:site:*');
    await sub.subscribe('dashboard:active-shifts', 'dashboard:upcoming-shifts');
    console.log('[Socket Redis Sub] Subscribed to alerts and dashboard channels');
  } catch (err) {
    console.error('[Socket Redis Sub] Subscription Failed:', err);
  }

  // Cleanup on shutdown if needed (though Socket.io lifecycle might handle it)
  return () => {
    sub.quit();
  };
}
