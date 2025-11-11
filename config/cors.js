const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://73.d0s369.co.in",
  "https://www.73.d0s369.co.in",
  "https://adminspaadvisor.in",
  "https://www.adminspaadvisor.in",
  "https://28c.d0s369.co.in",
];

const parseOrigins = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const resolveAllowedOrigins = () => {
  const raw =
    process.env.CLIENT_ORIGINS ??
    process.env.CLIENT_ORIGIN ??
    process.env.ALLOWED_ORIGINS ??
    process.env.FRONTEND_ORIGINS ??
    process.env.FRONTEND_ORIGIN ??
    "";
  const parsed = parseOrigins(raw);
  if (parsed.length > 0) {
    return parsed;
  }
  return DEFAULT_ALLOWED_ORIGINS;
};

const buildCorsOriginHandler = (allowedOrigins) => {
  const allowAll = allowedOrigins.length === 0;
  return (origin, callback) => {
    if (!origin) {
      // Non-browser client or same-origin request
      return callback(null, true);
    }
    if (allowAll) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  };
};

const buildCorsOptions = () => {
  const allowedOrigins = resolveAllowedOrigins();
  return {
    origin: buildCorsOriginHandler(allowedOrigins),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    exposedHeaders: ["Content-Disposition"],
  };
};

module.exports = {
  buildCorsOptions,
  resolveAllowedOrigins,
};
