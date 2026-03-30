import { db as prisma } from "../prisma/client";
import { redis } from "../redis/client";

const SETTINGS_CACHE_PREFIX = 'system_setting:';
const CACHE_TTL = 3600; // 1 hour

export async function getSystemSetting(name: string) {
  const cacheKey = `${SETTINGS_CACHE_PREFIX}${name}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error(`[Redis] Error getting setting ${name}:`, err);
  }

  const setting = await prisma.systemSetting.findUnique({
    where: { name },
  });

  if (setting) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(setting));
    } catch (err) {
      console.error(`[Redis] Error caching setting ${name}:`, err);
    }
  }

  return setting;
}

export async function getAllSystemSettings() {
  return prisma.systemSetting.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Gets system settings by name.
 * Useful for fetching a subset of settings.
 */
export async function getSystemSettingsByName(names: string[]) {
  return prisma.systemSetting.findMany({
    where: { name: { in: names } },
    orderBy: { name: 'asc' },
  });
}

export async function updateSystemSettingWithChangelog(
  name: string,
  value: string,
  actor: string | { type: 'admin' | 'system' | 'unknown'; id?: string },
  note?: string
) {
  const changelogActor =
    typeof actor === 'string'
      ? { actor: 'admin' as const, actorId: actor }
      : {
          actor: actor.type,
          actorId: actor.type === 'admin' ? actor.id ?? null : null,
        };

  return prisma.$transaction(async tx => {
    const oldSetting = await tx.systemSetting.findUnique({
      where: { name },
    });

    const setting = await tx.systemSetting.upsert({
      where: { name },
      update: { 
        value,
        ...(note !== undefined && { note })
      },
      create: { name, value, note },
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'SystemSetting',
        entityId: name,
        actor: changelogActor.actor,
        actorId: changelogActor.actorId,
        details: {
          name,
          oldValue: oldSetting?.value,
          newValue: value,
          oldNote: oldSetting?.note,
          newNote: note,
        },
      },
    });

    // Invalidate cache
    try {
      await redis.del(`${SETTINGS_CACHE_PREFIX}${name}`);
    } catch (err) {
      console.error(`[Redis] Error invalidating cache for ${name}:`, err);
    }

    return setting;
  }, { timeout: 5000 });
}
