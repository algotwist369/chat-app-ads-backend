const express = require("express");
const { body, param } = require("express-validator");
const { upload, MAX_FILES } = require("../middleware/upload");
const { sendMessage, editMessage, deleteMessage, toggleReaction } = require("../controller/messageController");

const MAX_TEXT_LENGTH = parseInt(process.env.MESSAGE_MAX_LENGTH ?? "2000", 10);

const router = express.Router();

router.post(
  "/",
  upload.array("attachments", MAX_FILES),
  [
    body("conversationId").isMongoId(),
    body("authorType").isIn(["manager", "customer", "system"]),
    body("authorId").optional().isString(),
    body("content").optional().isString().isLength({ max: MAX_TEXT_LENGTH }),
    body("replyTo")
      .optional()
      .custom((value) => {
        if (typeof value === "string") {
          JSON.parse(value);
        }
        return true;
      }),
  ],
  sendMessage,
);

router.patch(
  "/:messageId",
  upload.array("attachments", MAX_FILES),
  [
    param("messageId").isMongoId(),
    body("content").optional().isString().isLength({ max: MAX_TEXT_LENGTH }),
    body("replyTo")
      .optional()
      .custom((value) => {
        if (typeof value === "string") {
          JSON.parse(value);
        }
        return true;
      }),
    body("keepAttachments")
      .optional()
      .custom((value) => {
        if (typeof value === "string") {
          JSON.parse(value);
        }
        return true;
      }),
  ],
  editMessage,
);

router.delete("/:messageId", [param("messageId").isMongoId()], deleteMessage);

router.post(
  "/:messageId/reactions",
  [param("messageId").isMongoId(), body("emoji").isString(), body("actorType").isIn(["manager", "customer"])],
  toggleReaction,
);

module.exports = router;


