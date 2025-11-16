require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
let compression = null;
try {
  // Optional: compression, if installed
  // Avoid crashing in environments where it's not installed yet
  // Install with: npm install compression
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  compression = require("compression");
} catch (err) {
  console.warn("[server] compression module not found; gzip disabled. Install with `npm i compression`");
}
const { connectDatabase } = require("./config/database");
const managerRoutes = require("./routes/managerRoutes");
const customerRoutes = require("./routes/customerRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const messageRoutes = require("./routes/messageRoutes");
const autoReplyRoutes = require("./routes/autoReplyRoutes");
const errorHandler = require("./middleware/errorHandler");
const { initializeSocket } = require("./utils/socket");
const { UPLOAD_DIR, UPLOAD_PUBLIC_PATH } = require("./config/storage");
const { buildCorsOptions, resolveAllowedOrigins } = require("./config/cors");
const { apiLimiter, messageLimiter, uploadLimiter } = require("./middleware/rateLimiter");

const PORT = process.env.PORT || 4000;

const app = express();

// Behind reverse proxies/load balancers (e.g., Nginx, Cloudflare), enable trust proxy
// This allows express-rate-limit to read X-Forwarded-For safely
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

const corsOptions = buildCorsOptions();
const allowedOrigins = resolveAllowedOrigins();
const socketOrigin = allowedOrigins.length > 0 ? allowedOrigins : "*";

const helmetConfig = {
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
};

app.use(helmet(helmetConfig));
// Gzip compression for responses (if available)
if (compression) {
  app.use(compression());
}
app.use(cors(corsOptions));

// Apply general rate limiting to all routes
app.use(apiLimiter);

// Reduced payload limit for better performance and security
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(UPLOAD_PUBLIC_PATH, cors(corsOptions), express.static(UPLOAD_DIR, { maxAge: "7d", index: false }));

if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan(":method :url :status :res[content-length] - :response-time ms", {
      skip: (req) => req.path === "/health",
    }),
  );
}

// Health check endpoint with database status
app.get("/health", async (req, res) => {
  const mongoose = require("mongoose");
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({ 
    status: "ok",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Request timeout middleware (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: "Request timeout" });
    }
  });
  next();
});

app.use("/api/managers", managerRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageLimiter, messageRoutes); // Apply message rate limiting
app.use("/api/auto-replies", autoReplyRoutes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  error.status = 404;
  next(error);
});

app.use(errorHandler);

const server = http.createServer(app);

const io = initializeSocket(server, {
  origin: socketOrigin,
});
app.set("io", io);

connectDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.info(`[server] Listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("[server] Failed to initialize application:", error);
    process.exit(1);
  });

module.exports = app;


