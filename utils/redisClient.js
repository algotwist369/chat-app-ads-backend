const Redis = require("ioredis");
require("dotenv").config();

let redisClient = null;

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST;

if (redisUrl || redisHost) {
  try {
    const options = redisUrl
      ? redisUrl
      : {
          host: redisHost || "127.0.0.1",
          port: Number(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          tls: process.env.REDIS_TLS === "true" ? {} : undefined,
        };

    redisClient = new Redis(options);

    redisClient.on("ready", () => {
      console.info("[redis] connected");
    });

    redisClient.on("error", (error) => {
      console.error("[redis] connection error", error);
    });
  } catch (error) {
    console.error("[redis] failed to initialize, falling back to in-memory cache", error);
    redisClient = null;
  }
}

const isRedisReady = () => Boolean(redisClient && redisClient.status === "ready");

module.exports = {
  redisClient,
  isRedisReady,
};
