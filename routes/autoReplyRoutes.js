const express = require("express");
const { param, body } = require("express-validator");
const { getAutoReply, upsertAutoReply } = require("../controller/autoReplyController");

const router = express.Router();

// Get auto-reply configuration
router.get(
  "/:managerId",
  [param("managerId").isMongoId().withMessage("Invalid manager ID")],
  getAutoReply,
);

// Create or update auto-reply configuration
router.put(
  "/:managerId",
  [
    param("managerId").isMongoId().withMessage("Invalid manager ID"),
    body("welcomeMessage").optional().isObject(),
    body("welcomeMessage.content").optional().isString(),
    body("welcomeMessage.quickReplies").optional().isArray(),
    body("services").optional().isArray(),
    body("timeSlots").optional().isArray(),
    body("responses").optional().isObject(),
    body("isActive").optional().isBoolean(),
  ],
  upsertAutoReply,
);

module.exports = router;

