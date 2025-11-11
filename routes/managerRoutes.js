const express = require("express");
const { body, param } = require("express-validator");
const {
  registerManager,
  loginManager,
  getManagerProfile,
  updateManagerProfile,
} = require("../controller/managerController");

const router = express.Router();

router.post(
  "/signup",
  [
    body("managerName").isString().trim().notEmpty(),
    body("businessName").isString().trim().notEmpty(),
    body("businessSlug").optional().isString(),
    body("email").isString().isEmail(),
    body("password").isString().isLength({ min: 8 }),
    body("mobileNumber").optional().isString(),
    body("logo").optional().isString(),
  ],
  registerManager,
);

router.post(
  "/login",
  [body("email").isString().isEmail(), body("password").isString().isLength({ min: 8 })],
  loginManager,
);

router.get("/:id", [param("id").isMongoId()], getManagerProfile);

router.put(
  "/:id",
  [
    param("id").isMongoId(),
    body("managerName").optional().isString(),
    body("businessName").optional().isString(),
    body("businessSlug").optional().isString(),
    body("email").optional().isEmail(),
    body("mobileNumber").optional().isString(),
    body("logo").optional().isString(),
    body("password").optional().isString().isLength({ min: 8 }),
  ],
  updateManagerProfile,
);

module.exports = router;


