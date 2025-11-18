const { verifyAccessToken } = require("../utils/tokens");
const { Manager, Customer } = require("../models");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Middleware to authenticate requests using JWT access token
 * Sets req.user and req.userType if authentication succeeds
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const decoded = verifyAccessToken(token);

  if (!decoded || !decoded.sub || !decoded.role) {
    const error = new Error("Invalid or expired token");
    error.status = 401;
    throw error;
  }

  const { sub: userId, role } = decoded;

  // Verify user exists and is active
  if (role === "manager") {
    const manager = await Manager.findById(userId);
    if (!manager || !manager.isActive) {
      const error = new Error("Manager account not found or inactive");
      error.status = 401;
      throw error;
    }
    req.user = manager;
    req.userType = "manager";
  } else if (role === "customer") {
    const customer = await Customer.findById(userId);
    if (!customer || customer.status !== "active") {
      const error = new Error("Customer account not found or inactive");
      error.status = 401;
      throw error;
    }
    req.user = customer;
    req.userType = "customer";
  } else {
    const error = new Error("Invalid user role");
    error.status = 401;
    throw error;
  }

  req.userId = userId;
  next();
});

/**
 * Optional authentication - doesn't fail if no token is provided
 */
const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  try {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    if (decoded && decoded.sub && decoded.role) {
      const { sub: userId, role } = decoded;

      if (role === "manager") {
        const manager = await Manager.findById(userId);
        if (manager && manager.isActive) {
          req.user = manager;
          req.userType = "manager";
          req.userId = userId;
        }
      } else if (role === "customer") {
        const customer = await Customer.findById(userId);
        if (customer && customer.status === "active") {
          req.user = customer;
          req.userType = "customer";
          req.userId = userId;
        }
      }
    }
  } catch (error) {
    // Silently fail for optional auth
  }

  next();
});

module.exports = {
  authenticate,
  optionalAuthenticate,
};

