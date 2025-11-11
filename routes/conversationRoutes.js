const express = require("express");
const { body, param } = require("express-validator");
const conversationController = require("../controller/conversationController");

const router = express.Router();

router.get(
  "/manager/:managerId",
  [param("managerId").isMongoId()],
  conversationController.getManagerConversations,
);

router.get(
  "/customer/:customerId",
  [param("customerId").isMongoId()],
  conversationController.getCustomerConversation,
);

router.get("/:id", [param("id").isMongoId()], conversationController.getConversation);

router.post(
  "/ensure",
  [
    body("managerId").isMongoId(),
    body("customerId").isMongoId(),
    body("metadata").optional().isObject(),
  ],
  conversationController.ensureConversationHandler,
);

router.post(
  "/:conversationId/delivered",
  [param("conversationId").isMongoId(), body("viewerType").isIn(["manager", "customer"])],
  conversationController.markDeliveredHandler,
);

router.post(
  "/:conversationId/read",
  [param("conversationId").isMongoId(), body("viewerType").isIn(["manager", "customer"])],
  conversationController.markReadHandler,
);

router.post(
  "/:conversationId/mute",
  [
    param("conversationId").isMongoId(),
    body("actorType").isIn(["manager", "customer"]),
    body("muted").isBoolean(),
  ],
  conversationController.setConversationMuteHandler,
);

module.exports = router;


