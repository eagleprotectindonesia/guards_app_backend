import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let sharedConnection: Redis | null = null;
let sharedSubscriber: Redis | null = null;

/**
 * Returns a shared ioredis connection.
 * Useful for general Redis operations and BullMQ.
 * Note: BullMQ requires 'maxRetriesPerRequest: null' for its connections.
 */
export function getRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    sharedConnection.on('error', err => {
      console.error('[Redis] Shared connection error:', err);
    });
  }
  return sharedConnection;
}

/**
 * Returns a shared ioredis subscriber connection.
 * ioredis handles subscription mode by blocking the connection,
 * so a dedicated connection is needed.
 */
export function getRedisSubscriber(): Redis {
  if (!sharedSubscriber) {
    sharedSubscriber = new Redis(REDIS_URL);

    sharedSubscriber.on('error', err => {
      console.error('[Redis] Subscriber connection error:', err);
    });
  }
  return sharedSubscriber;
}

/**
 * Gracefully closes all shared Redis connections.
 */
export async function closeRedisConnections(): Promise<void> {
  const connections = [sharedConnection, sharedSubscriber];
  await Promise.all(
    connections.map(async conn => {
      if (conn) {
        try {
          await conn.quit();
        } catch (err) {
          console.error('[Redis] Error closing connection:', err);
        }
      }
    })
  );
  sharedConnection = null;
  sharedSubscriber = null;
}
