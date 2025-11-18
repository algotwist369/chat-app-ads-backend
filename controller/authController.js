const { validationResult } = require("express-validator");
const { RefreshToken, Manager, Customer } = require("../models");
const {
  signAccessToken,
  verifyRefreshToken,
  generateRefreshTokenString,
} = require("../utils/tokens");
const { serializeManager, serializeCustomer } = require("../utils/serializers");
const asyncHandler = require("../utils/asyncHandler");

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.status = 422;
    error.details = errors.array();
    throw error;
  }
};

// Refresh access token using refresh token
const refreshAccessToken = asyncHandler(async (req, res) => {
  handleValidation(req);

  const { refreshToken: refreshTokenJWT } = req.body;

  if (!refreshTokenJWT) {
    const error = new Error("Refresh token is required");
    error.status = 400;
    throw error;
  }

  // Verify refresh token JWT
  const decoded = verifyRefreshToken(refreshTokenJWT);
  if (!decoded || !decoded.sub || !decoded.role) {
    const error = new Error("Invalid or expired refresh token");
    error.status = 401;
    throw error;
  }

  const { sub: userId, role } = decoded;

  // Verify user still exists and is active
  let user = null;
  if (role === "manager") {
    user = await Manager.findById(userId);
    if (!user || !user.isActive) {
      const error = new Error("Manager account not found or inactive");
      error.status = 401;
      throw error;
    }
  } else if (role === "customer") {
    user = await Customer.findById(userId);
    if (!user || user.status !== "active") {
      const error = new Error("Customer account not found or inactive");
      error.status = 401;
      throw error;
    }
  } else {
    const error = new Error("Invalid user role");
    error.status = 401;
    throw error;
  }

  // Check if refresh token exists in database (optional additional security)
  // Note: We're using JWT-based refresh tokens, so we don't strictly need DB lookup
  // But we can add it for token revocation if needed

  // Generate new access token
  const accessToken = signAccessToken({
    sub: userId.toString(),
    role,
  });

  // Optionally rotate refresh token (for better security)
  // For now, we'll keep the same refresh token until it expires

  res.json({
    token: accessToken,
    user: role === "manager" ? serializeManager(user) : serializeCustomer(user),
    userType: role,
  });
});

// Logout - revoke refresh token (optional, since JWT tokens can't be revoked)
// But we can track logout events if needed
const logout = asyncHandler(async (req, res) => {
  // If we stored refresh tokens in DB, we could delete them here
  // For JWT-based approach, we just return success
  // The client should delete the refresh token from storage

  res.json({
    message: "Logged out successfully",
  });
});

module.exports = {
  refreshAccessToken,
  logout,
};

