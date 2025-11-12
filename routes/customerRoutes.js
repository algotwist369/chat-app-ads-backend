const express = require("express");
const { body, param } = require("express-validator");
const {
  customerJoin,
  getCustomerProfile,
  getCustomerConversation,
  getWorkspaceBySlug,
} = require("../controller/customerController");

const router = express.Router();

// Indian phone number validation
const validateIndianPhone = (value) => {
  if (!value || typeof value !== "string") {
    throw new Error("Phone number is required");
  }
  
  // Remove spaces and common separators
  let cleaned = value.trim().replace(/[\s\-\(\)]/g, "");
  
  // Remove +91 prefix if present
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.substring(3);
  }
  // Remove 91 prefix if present (without +)
  else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  // Remove leading 0 if present
  else if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  
  // Must be exactly 10 digits and all numeric
  if (!/^\d{10}$/.test(cleaned)) {
    throw new Error("Please enter a valid 10-digit Indian mobile number");
  }
  
  // First digit should be 6-9 (valid Indian mobile number range)
  const firstDigit = cleaned[0];
  if (!["6", "7", "8", "9"].includes(firstDigit)) {
    throw new Error("Indian mobile numbers must start with 6, 7, 8, or 9");
  }
  
  return true;
};

// Name validation to prevent dummy entries
const validateName = (value) => {
  if (!value || typeof value !== "string") {
    throw new Error("Name is required");
  }
  
  const trimmed = value.trim();
  
  // Minimum length check
  if (trimmed.length < 2) {
    throw new Error("Name must be at least 2 characters long");
  }
  
  if (trimmed.length > 50) {
    throw new Error("Name must not exceed 50 characters");
  }
  
  // Should contain at least one letter (not just numbers or special chars)
  if (!/[a-zA-Z]/.test(trimmed)) {
    throw new Error("Name must contain at least one letter");
  }
  
  // Common dummy/test names to reject (case insensitive)
  const dummyNames = [
    "test",
    "dummy",
    "abc",
    "xyz",
    "123",
    "qwerty",
    "asdf",
    "user",
    "admin",
    "customer",
    "name",
    "temp",
    "temporary",
    "demo",
    "sample",
    "fake",
    "spam",
    "bot",
    "guest",
    "anonymous",
  ];
  
  const lowerName = trimmed.toLowerCase();
  for (const dummy of dummyNames) {
    if (lowerName === dummy || lowerName.startsWith(dummy + " ") || lowerName.endsWith(" " + dummy)) {
      throw new Error("Please enter a valid name");
    }
  }
  
  // Should not be just numbers
  if (/^\d+$/.test(trimmed.replace(/\s/g, ""))) {
    throw new Error("Name cannot be just numbers");
  }
  
  // Should not contain only special characters
  if (!/[a-zA-Z0-9]/.test(trimmed)) {
    throw new Error("Name must contain letters or numbers");
  }
  
  return true;
};

router.post(
  "/join",
  [
    body("businessSlug").isString().trim().notEmpty().withMessage("Business slug is required"),
    body("name")
      .custom(validateName)
      .withMessage("Please enter a valid name"),
    body("phone")
      .custom(validateIndianPhone)
      .withMessage("Please enter a valid 10-digit Indian mobile number"),
    body("email").optional().isEmail().withMessage("Please enter a valid email address"),
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


