const { redisClient, isRedisReady } = require("./redisClient");
require("dotenv").config();

const DEFAULT_TTL = 60 * 1000; // 60 seconds

// LRU-style in-memory cache with automatic cleanup
const memoryStore = new Map();
const MAX_MEMORY_CACHE_SIZE = 1000; // Maximum number of entries in memory cache

// Cleanup expired entries and enforce size limit
const cleanupMemoryCache = () => {
  const now = Date.now();
  const entriesToDelete = [];
  
  // Find expired entries
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt < now) {
      entriesToDelete.push(key);
    }
  }
  
  // Delete expired entries
  entriesToDelete.forEach((key) => memoryStore.delete(key));
  
  // If still over limit, delete oldest entries (FIFO)
  if (memoryStore.size > MAX_MEMORY_CACHE_SIZE) {
    const entries = Array.from(memoryStore.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt); // Sort by expiration time
    const toDelete = entries.slice(0, memoryStore.size - MAX_MEMORY_CACHE_SIZE);
    toDelete.forEach(([key]) => memoryStore.delete(key));
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupMemoryCache, 5 * 60 * 1000);

const useRedis = () => Boolean(redisClient) && isRedisReady();

const getCache = async (key) => {
  if (useRedis()) {
    try {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("[cache] redis get failed", error);
    }
  }

  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = async (key, value, ttl = DEFAULT_TTL) => {
  if (useRedis()) {
    try {
      await redisClient.set(key, JSON.stringify(value), "PX", ttl);
      return;
    } catch (error) {
      console.error("[cache] redis set failed", error);
    }
  }

  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
};

const deleteCache = async (key) => {
  if (useRedis()) {
    try {
      await redisClient.del(key);
      return;
    } catch (error) {
      console.error("[cache] redis del failed", error);
    }
  }

  memoryStore.delete(key);
};

const flushMatching = async (prefix) => {
  if (useRedis()) {
    try {
      if (!prefix) {
        await redisClient.flushdb();
        return;
      }

      await new Promise((resolve, reject) => {
        const stream = redisClient.scanStream({ match: `${prefix}*` });
        const keys = [];

        stream.on("data", (resultKeys) => {
          if (Array.isArray(resultKeys)) {
            for (const key of resultKeys) {
              keys.push(key);
            }
          }
        });

        stream.on("end", async () => {
          if (keys.length > 0) {
            try {
              await redisClient.del(...keys);
            } catch (error) {
              console.error("[cache] redis bulk del failed", error);
            }
          }
          resolve();
        });

        stream.on("error", (error) => {
          reject(error);
        });
      });
      return;
    } catch (error) {
      console.error("[cache] redis flush failed", error);
    }
  }

  if (!prefix) {
    memoryStore.clear();
    return;
  }
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
    }
  }
};

const buildConversationKey = (conversationId) => `conversation:${conversationId}`;
const buildManagerListKey = (managerId) => `manager:${managerId}:conversations`;
const buildCustomerKey = (customerId) => `customer:${customerId}:conversation`;

const invalidateConversationCaches = async (conversationId, managerId = null, customerId = null) => {
  // Delete specific conversation cache
  if (conversationId) {
    // Delete all pagination variants
    await flushMatching(`${buildConversationKey(conversationId)}:`);
    await deleteCache(buildConversationKey(conversationId));
  }
  
  // Only invalidate specific manager/customer caches instead of all
  if (managerId) {
    await flushMatching(`${buildManagerListKey(managerId)}:`);
    await deleteCache(buildManagerListKey(managerId));
  }
  
  if (customerId) {
    await flushMatching(`${buildCustomerKey(customerId)}:`);
    await deleteCache(buildCustomerKey(customerId));
  }
  
  // If no specific IDs provided, fallback to flushing all (for safety)
  if (!managerId && !customerId) {
    await flushMatching("manager:");
    await flushMatching("customer:");
  }
};

module.exports = {
  DEFAULT_TTL,
  getCache,
  setCache,
  deleteCache,
  flushMatching,
  buildConversationKey,
  buildManagerListKey,
  buildCustomerKey,
  invalidateConversationCaches,
};
