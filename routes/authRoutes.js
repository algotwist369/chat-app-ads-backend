const express = require("express");
const { body } = require("express-validator");
const { refreshAccessToken, logout } = require("../controller/authController");
const { authLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post(
  "/refresh",
  authLimiter,
  [body("refreshToken").isString().notEmpty().withMessage("Refresh token is required")],
  refreshAccessToken,
);

router.post("/logout", logout);

module.exports = router;

