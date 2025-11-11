const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://73.d0s369.co.in",
  "https://www.73.d0s369.co.in",
  "https://adminspaadvisor.in",
  "https://www.adminspaadvisor.in",
  "https://28c.d0s369.co.in",
  "https://www.28c.d0s369.co.in",
];

const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_ALLOWED_HEADERS = ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"];
const DEFAULT_EXPOSED_HEADERS = ["Content-Disposition"];

const normalizeOriginValue = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const parseOrigins = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeOriginValue).filter(Boolean);
  return raw
    .split(",")
    .map(normalizeOriginValue)
    .filter(Boolean);
};

const hasAllowAllFlag = (origins) =>
  origins.some((origin) => {
    if (!origin) return false;
    const normalized = origin.toLowerCase();
    return normalized === "*" || normalized === "true" || normalized === "1";
  });

const buildWildcardRegex = (pattern) =>
  new RegExp(
    "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\+/g, "\\+") +
      "$",
  );

const createOriginMatcher = (pattern) => {
  if (!pattern) {
    return () => false;
  }
  const normalized = normalizeOriginValue(pattern);
  if (!normalized) {
    return () => false;
  }

  if (hasAllowAllFlag([normalized])) {
    return () => true;
  }

  try {
    const url = new URL(normalized);
    const protocol = url.protocol;
    const hostPattern = url.host;
    const hostRegex = hostPattern.includes("*") ? buildWildcardRegex(hostPattern) : null;

    return (origin) => {
      if (!origin) return false;
      try {
        const incoming = new URL(origin);
        if (protocol && incoming.protocol !== protocol) return false;
        if (hostRegex) {
          return hostRegex.test(incoming.host);
        }
        return incoming.host === hostPattern;
      } catch (error) {
        return false;
      }
    };
  } catch (error) {
    const hostnameRegex = buildWildcardRegex(normalized);
    return (origin) => {
      if (!origin) return false;
      try {
        const incoming = new URL(origin);
        return hostnameRegex.test(incoming.hostname);
      } catch (parseError) {
        return false;
      }
    };
  }
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
  if (!allowedOrigins || allowedOrigins.length === 0 || hasAllowAllFlag(allowedOrigins)) {
    return (origin, callback) => callback(null, true);
  }

  const matchers = allowedOrigins.map(createOriginMatcher);

  return (origin, callback) => {
    if (!origin) {
      // Non-browser client or same-origin request
      return callback(null, true);
    }

    const isAllowed = matchers.some((matcher) => {
      try {
        return matcher(origin);
      } catch (error) {
        return false;
      }
    });

    if (isAllowed) {
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
    methods: DEFAULT_ALLOWED_METHODS,
    allowedHeaders: DEFAULT_ALLOWED_HEADERS,
    exposedHeaders: DEFAULT_EXPOSED_HEADERS,
  };
};

const buildSocketCorsOptions = () => {
  const allowedOrigins = resolveAllowedOrigins();
  return {
    origin: buildCorsOriginHandler(allowedOrigins),
    credentials: true,
    methods: DEFAULT_ALLOWED_METHODS,
    allowedHeaders: DEFAULT_ALLOWED_HEADERS,
  };
};

module.exports = {
  buildCorsOptions,
  buildSocketCorsOptions,
  resolveAllowedOrigins,
  DEFAULT_ALLOWED_METHODS,
  DEFAULT_ALLOWED_HEADERS,
  DEFAULT_EXPOSED_HEADERS,
};
