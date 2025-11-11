const { redisClient, isRedisReady } = require("./redisClient");
require("dotenv").config();

const DEFAULT_TTL = 60 * 1000; // 60 seconds

const memoryStore = new Map();

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

const invalidateConversationCaches = async (conversationId) => {
  if (conversationId) {
    await deleteCache(buildConversationKey(conversationId));
  }
  await flushMatching("manager:");
  await flushMatching("customer:");
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
