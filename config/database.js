const mongoose = require("mongoose");

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI environment variable is not defined.");
  }

  const connection = await mongoose.connect(mongoUri, {
    autoIndex: true,
  });

  const { host, port, name } = connection.connection;
  console.info(`[database] Connected to MongoDB at ${host}:${port}/${name}`);
};

module.exports = {
  connectDatabase,
};


