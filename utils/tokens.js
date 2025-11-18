const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not defined.");
}

// Generate access token (short-lived, 15 minutes)
const signAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
};

// Generate refresh token (long-lived, 30 days)
const signRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "30d" });
};

// Generate a secure random token for database storage
const generateRefreshTokenString = () => {
  return crypto.randomBytes(64).toString("hex");
};

// Verify access token
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Verify refresh token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
};

// Legacy function for backward compatibility
const signToken = (payload, options = {}) => {
  const expiresIn = options.expiresIn ?? "7d";
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

module.exports = {
  signToken, // Legacy
  signAccessToken,
  signRefreshToken,
  generateRefreshTokenString,
  verifyAccessToken,
  verifyRefreshToken,
};


