const Redis = require("ioredis");
require("dotenv").config();

let redisClient = null;
let redisDisabled = false;

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST;

const disableRedis = (reason) => {
  if (redisDisabled) return;
  redisDisabled = true;
  if (redisClient) {
    try {
      redisClient.removeAllListeners();
      redisClient.disconnect();
    } catch (disconnectError) {
      console.error("[redis] disconnect error", disconnectError);
    }
  }
  redisClient = null;
  if (reason) {
    console.warn("[redis] falling back to in-memory cache:", reason);
  }
};

if (redisUrl || redisHost) {
  try {
    const baseOptions = redisUrl
      ? { url: redisUrl }
      : {
          host: redisHost || "127.0.0.1",
          port: Number(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          tls: process.env.REDIS_TLS === "true" ? {} : undefined,
        };

    const connectionOptions = {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    };

    if (baseOptions.url) {
      redisClient = new Redis(baseOptions.url, connectionOptions);
    } else {
      redisClient = new Redis({ ...baseOptions, ...connectionOptions });
    }

    redisClient.on("ready", () => {
      console.info("[redis] connected");
    });

    redisClient.on("error", (error) => {
      const message = error?.message || error?.code || "unknown error";
      console.warn("[redis] connection error:", message);
      if (error?.code === "ECONNREFUSED" || error?.errno === -4078) {
        disableRedis(error.message || error.code || "connection refused");
      }
    });

    redisClient.connect().catch((error) => {
      const message = error?.message || error?.code || "unable to establish connection";
      console.warn("[redis] initial connection failed:", message);
      disableRedis(message);
    });
  } catch (error) {
    console.error("[redis] failed to initialize, falling back to in-memory cache", error);
    redisClient = null;
    redisDisabled = true;
  }
}

const isRedisReady = () => Boolean(redisClient && redisClient.status === "ready");

module.exports = {
  redisClient,
  isRedisReady,
};
