import Redis from 'ioredis';

const globalForRedis = global as unknown as { redis: Redis };

const redisOptions = {
  connectTimeout: 5000,
  commandTimeout: 2000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
};

export const redis = globalForRedis.redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

// Atomically increments a counter (with first-write TTL) and, if the post-increment
// value meets or exceeds a threshold, sets a lock key with NX so only the first
// crossing request claims it. Returns [count, locked] (locked is "1" or nil).
redis.defineCommand('rlIncrWithLock', {
  numberOfKeys: 2,
  lua: `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
    end
    local locked = 0
    if count >= tonumber(ARGV[2]) then
      local set = redis.call('SET', KEYS[2], '1', 'NX', 'EX', tonumber(ARGV[3]))
      if set then locked = 1 end
    end
    return { count, locked }
  `,
});
