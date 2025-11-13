const mongoose = require("mongoose");

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI environment variable is not defined.");
  }

  // Optimized connection options for production
  const connectionOptions = {
    autoIndex: process.env.NODE_ENV !== "production", // Disable auto-index in production for performance
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || "50", 10), // Connection pool size
    minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || "5", 10), // Minimum connections
    serverSelectionTimeoutMS: 5000, // How long to try selecting a server
    socketTimeoutMS: 45000, // How long to wait for socket connection
    connectTimeoutMS: 10000, // How long to wait for initial connection
    heartbeatFrequencyMS: 10000, // How often to check server status
    retryWrites: true, // Retry write operations
    retryReads: true, // Retry read operations
  };
  
  // Note: bufferCommands and bufferMaxEntries are deprecated in newer Mongoose versions
  // Mongoose 8+ handles buffering automatically, so these options are not needed

  const connection = await mongoose.connect(mongoUri, connectionOptions);

  const { host, port, name } = connection.connection;
  console.info(`[database] Connected to MongoDB at ${host}:${port}/${name}`);
  console.info(`[database] Pool size: ${connectionOptions.maxPoolSize}, Min: ${connectionOptions.minPoolSize}`);
  
  // Handle connection events
  mongoose.connection.on("error", (error) => {
    console.error("[database] MongoDB connection error:", error);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[database] MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    console.info("[database] MongoDB reconnected");
  });
};

module.exports = {
  connectDatabase,
};


