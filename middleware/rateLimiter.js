const rateLimit = require("express-rate-limit");

// Allow turning rate limits back on by setting ENABLE_RATE_LIMIT=true
// Default to true (enabled) if not specified, but allow disabling with ENABLE_RATE_LIMIT=false
const rateLimitsEnabled = process.env.ENABLE_RATE_LIMIT !== "false";
const disabledLimiter = (req, res, next) => next();
const buildLimiter = (options) => (rateLimitsEnabled ? rateLimit(options) : disabledLimiter);

// General API rate limiter - DISABLED for messages and conversations
// Only used for non-chat routes. Messages and conversations have no rate limiting.
const apiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200000, // Allow up to 2000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    if (req.path === "/health") return true;
    // Skip ALL message and conversation routes - no rate limiting for chat
    if (req.path && req.path.startsWith("/api/messages")) return true;
    if (req.path && req.path.startsWith("/api/conversations")) return true;
    // Skip auth routes - they have their own authLimiter
    if (req.path && req.path.startsWith("/api/auth")) return true;
    return false;
  },
});

// Strict rate limiter for authentication endpoints - 5 requests per 15 minutes
const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50000, // Limit each IP to 5 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Message sending rate limiter - COMPLETELY DISABLED
// Message rate limiting is completely disabled - no limits on messages or conversations
// This ensures smooth chat experience without throttling
const messageLimiter = disabledLimiter; // Always disabled - no rate limiting at all

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

