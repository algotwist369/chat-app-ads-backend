require("dotenv").config();
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const { Manager } = require("../models");
const { toBusinessSlug } = require("../utils/slug");
const { signToken } = require("../utils/tokens");
const { serializeManager } = require("../utils/serializers");
const asyncHandler = require("../utils/asyncHandler");
const { ensureConversation } = require("../services/conversationService");

const MIN_PASSWORD_LENGTH = 8;

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.status = 422;
    error.details = errors.array();
    throw error;
  }
};

const registerManager = asyncHandler(async (req, res) => {
  handleValidation(req);

  const {
    managerName,
    businessName,
    businessSlug: incomingSlug,
    email,
    password,
    mobileNumber,
    logo,
  } = req.body;

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    const error = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    error.status = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedSlug = toBusinessSlug(incomingSlug || businessName);

  const existingEmail = await Manager.findOne({ contactEmail: normalizedEmail });
  if (existingEmail) {
    const error = new Error("An account with this email already exists.");
    error.status = 409;
    throw error;
  }

  const existingSlug = await Manager.findOne({ businessSlug: normalizedSlug });
  if (existingSlug) {
    const error = new Error("This business URL is already in use. Try a different business name.");
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const manager = await Manager.create({
    managerName: managerName.trim(),
    businessName: businessName.trim(),
    businessSlug: normalizedSlug,
    contactEmail: normalizedEmail,
    passwordHash,
    mobileNumber: mobileNumber?.trim() ?? null,
    logo: logo ?? null,
  });

  const token = signToken({
    sub: manager._id.toString(),
    role: "manager",
  });

  res.status(201).json({
    manager: serializeManager(manager),
    token,
  });
});

const loginManager = asyncHandler(async (req, res) => {
  handleValidation(req);

  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  const manager = await Manager.findOne({ contactEmail: normalizedEmail });
  if (!manager) {
    const error = new Error("Invalid email or password. Please try again.");
    error.status = 401;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(password, manager.passwordHash);
  if (!passwordMatch) {
    const error = new Error("Invalid email or password. Please try again.");
    error.status = 401;
    throw error;
  }

  manager.lastLoginAt = new Date();
  await manager.save();

  const token = signToken({
    sub: manager._id.toString(),
    role: "manager",
  });

  res.json({
    manager: serializeManager(manager),
    token,
  });
});

const getManagerProfile = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { id } = req.params;
  const manager = await Manager.findById(id);
  if (!manager) {
    const error = new Error("Manager account not found.");
    error.status = 404;
    throw error;
  }
  res.json({
    manager: serializeManager(manager),
  });
});

const updateManagerProfile = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { id } = req.params;

  const manager = await Manager.findById(id);
  if (!manager) {
    const error = new Error("Manager account not found.");
    error.status = 404;
    throw error;
  }

  const updates = {};
  if (req.body.managerName !== undefined) {
    updates.managerName = req.body.managerName.trim();
  }
  if (req.body.businessName !== undefined) {
    updates.businessName = req.body.businessName.trim();
  }
  if (req.body.mobileNumber !== undefined) {
    updates.mobileNumber = req.body.mobileNumber.trim();
  }
  if (req.body.logo !== undefined) {
    updates.logo = req.body.logo;
  }

  if (req.body.email) {
    const normalizedEmail = req.body.email.trim().toLowerCase();
    if (normalizedEmail !== manager.contactEmail) {
      const existing = await Manager.findOne({
        contactEmail: normalizedEmail,
        _id: { $ne: manager._id },
      });
      if (existing) {
        const error = new Error("Another account already uses this email address.");
        error.status = 409;
        throw error;
      }
      updates.contactEmail = normalizedEmail;
    }
  }

  if (req.body.businessSlug || req.body.businessName) {
    const desiredSlug = toBusinessSlug(req.body.businessSlug || req.body.businessName || manager.businessName);
    if (desiredSlug !== manager.businessSlug) {
      const existingSlug = await Manager.findOne({
        businessSlug: desiredSlug,
        _id: { $ne: manager._id },
      });
      if (existingSlug) {
        const error = new Error("This business URL is already in use. Try a different business name.");
        error.status = 409;
        throw error;
      }
      updates.businessSlug = desiredSlug;
    }
  }

  if (req.body.password) {
    if (req.body.password.length < MIN_PASSWORD_LENGTH) {
      const error = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      error.status = 400;
      throw error;
    }
    updates.passwordHash = await bcrypt.hash(req.body.password, 10);
  }

  Object.assign(manager, updates);
  await manager.save();

  res.json({
    manager: serializeManager(manager),
  });
});

module.exports = {
  registerManager,
  loginManager,
  getManagerProfile,
  updateManagerProfile,
};


