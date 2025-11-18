const rateLimit = require("express-rate-limit");

// Allow turning rate limits back on by setting ENABLE_RATE_LIMIT=true
const rateLimitsEnabled = process.env.ENABLE_RATE_LIMIT === "true" || 'true';
const disabledLimiter = (req, res, next) => next();
const buildLimiter = (options) => (rateLimitsEnabled ? rateLimit(options) : disabledLimiter);

// General API rate limiter - relaxed to 1000 requests per 15 minutes per IP to avoid throttling chat UX
const apiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Allow up to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
});

// Strict rate limiter for authentication endpoints - 5 requests per 15 minutes
const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Message sending rate limiter - per user with reasonable limits for chat conversations
const messageLimiter = buildLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes (more reasonable window for chat)
  max: Number(process.env.MESSAGE_RATE_PER_WINDOW || 1000), // Allow up to 1000 messages per 5 minutes per user
  message: "Too many messages sent, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Priority: authenticated userId > authorId from body > IP
    // This ensures each user has their own rate limit, not shared by IP
    if (req.userId) {
      return `user:${req.userId}`;
    }
    if (req.body?.authorId) {
      return `author:${req.body.authorId}`;
    }
    return `ip:${req.ip}`;
  },
  skip: (req) => {
    // Skip rate limiting for system messages
    return req.body?.authorType === "system";
  },
});

// File upload rate limiter - 10 uploads per 15 minutes
const uploadLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit to 10 uploads per 15 minutes
  message: "Too many file uploads, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  messageLimiter,
  uploadLimiter,
};

