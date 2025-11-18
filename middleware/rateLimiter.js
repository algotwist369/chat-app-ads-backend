const rateLimit = require("express-rate-limit");

// Allow turning rate limits back on by setting ENABLE_RATE_LIMIT=true
// Default to true (enabled) if not specified, but allow disabling with ENABLE_RATE_LIMIT=false
const rateLimitsEnabled = process.env.ENABLE_RATE_LIMIT !== "false";
const disabledLimiter = (req, res, next) => next();
const buildLimiter = (options) => (rateLimitsEnabled ? rateLimit(options) : disabledLimiter);

// General API rate limiter - relaxed to 2000 requests per 15 minutes per IP to avoid throttling chat UX
// Routes with specific rate limiters (like /api/messages) will be excluded to avoid double limiting
const apiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Allow up to 2000 requests per windowMs (increased from 1000)
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    if (req.path === "/health") return true;
    // Skip routes that have their own specific rate limiters to avoid double limiting
    // Message routes have messageLimiter, so skip them here
    if (req.path && req.path.startsWith("/api/messages")) return true;
    return false;
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

// Message sending rate limiter - COMPLETELY DISABLED
// Message rate limiting is disabled to avoid throttling chat conversations
// To enable, set ENABLE_MESSAGE_RATE_LIMIT=true in environment
const messageRateEnabled = process.env.ENABLE_MESSAGE_RATE_LIMIT === "true";
const messageLimiter = messageRateEnabled
  ? buildLimiter({
      windowMs: 1 * 60 * 1000, // 1 minute window
      max: Number(process.env.MESSAGE_RATE_PER_WINDOW || 10000), // Allow up to 10000 messages per minute per user
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
        if (req.body?.authorType === "system") return true;
        return false;
      },
    })
  : disabledLimiter; // Completely disabled - no rate limiting at all

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

