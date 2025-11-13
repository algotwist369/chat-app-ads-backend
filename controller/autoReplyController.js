const { validationResult } = require("express-validator");
const { AutoReply } = require("../models");
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

// Get auto-reply configuration for a manager
const getAutoReply = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { managerId } = req.params;

  let autoReply = await AutoReply.findOne({ manager: managerId });

  // If no config exists, return default structure
  if (!autoReply) {
    return res.json({
      autoReply: null,
    });
  }

  res.json({
    autoReply,
  });
});

// Create or update auto-reply configuration
const upsertAutoReply = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { managerId } = req.params;
  const {
    welcomeMessage,
    services,
    timeSlots,
    responses,
    isActive,
  } = req.body;

  // Find existing or create new
  let autoReply = await AutoReply.findOne({ manager: managerId });

  if (autoReply) {
    // Update existing
    if (welcomeMessage !== undefined) autoReply.welcomeMessage = welcomeMessage;
    if (services !== undefined) autoReply.services = services;
    if (timeSlots !== undefined) autoReply.timeSlots = timeSlots;
    if (responses !== undefined) autoReply.responses = responses;
    if (isActive !== undefined) autoReply.isActive = isActive;
    await autoReply.save();
  } else {
    // Create new
    autoReply = await AutoReply.create({
      manager: managerId,
      welcomeMessage: welcomeMessage || { content: "", quickReplies: [] },
      services: services || [],
      timeSlots: timeSlots || [],
      responses: responses || {},
      isActive: isActive !== undefined ? isActive : true,
    });
  }

  // Invalidate cache after update
  const { invalidateAutoReplyConfigCache } = require("../services/autoChatService");
  invalidateAutoReplyConfigCache(managerId);

  res.json({
    autoReply,
  });
});

module.exports = {
  getAutoReply,
  upsertAutoReply,
};

