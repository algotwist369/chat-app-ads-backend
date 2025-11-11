const express = require("express");
const { body, param } = require("express-validator");
const {
  customerJoin,
  getCustomerProfile,
  getCustomerConversation,
  getWorkspaceBySlug,
} = require("../controller/customerController");

const router = express.Router();

router.post(
  "/join",
  [
    body("businessSlug").isString().trim().notEmpty(),
    body("name").isString().trim().notEmpty(),
    body("phone").isString().trim().notEmpty(),
    body("email").optional().isEmail(),
  ],
  customerJoin,
);

router.get("/:id", [param("id").isMongoId()], getCustomerProfile);

router.get("/:customerId/conversation", [param("customerId").isMongoId()], getCustomerConversation);

router.get(
  "/workspace/:businessSlug",
  [param("businessSlug").isString().trim().notEmpty()],
  getWorkspaceBySlug,
);

module.exports = router;


