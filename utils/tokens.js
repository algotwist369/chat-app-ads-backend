const jwt = require("jsonwebtoken");
require("dotenv").config();

const signToken = (payload, options = {}) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined.");
  }
  const expiresIn = options.expiresIn ?? "7d";
  return jwt.sign(payload, secret, { expiresIn });
};

module.exports = {
  signToken,
};


