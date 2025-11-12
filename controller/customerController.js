const { validationResult } = require("express-validator");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Customer, Manager, Conversation } = require("../models");
const { serializeCustomer, serializeManager } = require("../utils/serializers");
const asyncHandler = require("../utils/asyncHandler");
const { signToken } = require("../utils/tokens");
const {
  findManagerByBusinessSlug,
  ensureConversation,
  ensureManagerExists,
  ensureCustomerExists,
  getCustomerConversation,
} = require("../services/conversationService");

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.status = 422;
    error.details = errors.array();
    throw error;
  }
};

// Normalize Indian phone number to standard 10-digit format
const normalizeIndianPhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    return phone;
  }
  
  // Remove spaces and common separators
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, "");
  
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
  
  // Return cleaned 10-digit number
  return cleaned;
};

const customerJoin = asyncHandler(async (req, res) => {
  handleValidation(req);

  const { businessSlug, name, phone, email } = req.body;

  const manager = await findManagerByBusinessSlug(businessSlug);
  if (!manager) {
    const error = new Error("We couldn't find a workspace for this business link. Please check the URL.");
    error.status = 404;
    throw error;
  }

  // Normalize phone to standard 10-digit Indian format
  const normalizedPhone = normalizeIndianPhone(phone);
  const normalizedEmail = email?.trim()?.toLowerCase() ?? null;

  let customer = await Customer.findOne({
    manager: manager._id,
    phone: normalizedPhone,
  });

  if (customer) {
    customer.name = name.trim();
    if (normalizedEmail) customer.email = normalizedEmail;
    customer.status = "active";
    await customer.save();
  } else {
    customer = await Customer.create({
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      manager: manager._id,
      businessSlug: manager.businessSlug,
      status: "active",
    });
  }

  // Check if conversation already existed before ensuring it
  const existingConversation = await Conversation.findOne({
    manager: manager._id,
    customer: customer._id,
  });
  const wasNewConversation = !existingConversation;

  const conversation = await ensureConversation(manager._id, customer._id, {
    managerName: manager.managerName ?? manager.businessName ?? "Manager",
    customerName: customer.name ?? "Customer",
    customerPhone: customer.phone ?? null,
  });

  // Emit socket event to notify manager about new customer/conversation
  const io = req.app.get("io");
  if (io) {
    const { getConversationById } = require("../services/conversationService");
    const { serializeConversation } = require("../utils/serializers");
    try {
      const fullConversation = await getConversationById(conversation._id);
      const serialized = serializeConversation(fullConversation, []);
      
      if (wasNewConversation) {
        // Only emit "new" event for newly created conversations
        io.to(`manager:${manager._id.toString()}`).emit("conversation:new", serialized);
      }
      // Always emit updated event for compatibility
      io.to(`manager:${manager._id.toString()}`).emit("conversation:updated", serialized);
    } catch (error) {
      console.error("Failed to emit new customer notification:", error);
    }
  }

  const token = signToken({
    sub: customer._id.toString(),
    role: "customer",
  });

  res.status(201).json({
    customer: serializeCustomer(customer),
    manager: serializeManager(manager),
    token,
  });
});

const getCustomerProfile = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { id } = req.params;
  const customer = await Customer.findById(id);
  if (!customer) {
    const error = new Error("Customer record not found.");
    error.status = 404;
    throw error;
  }

  res.json({
    customer: serializeCustomer(customer),
  });
});

const getCustomerConversationHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { customerId } = req.params;
  const conversation = await getCustomerConversation(customerId);
  if (!conversation) {
    res.json({ conversation: null });
    return;
  }
  res.json({ conversation });
});

const getWorkspaceBySlug = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { businessSlug } = req.params;
  const manager = await findManagerByBusinessSlug(businessSlug);
  if (!manager) {
    const error = new Error("Workspace not found for this invite link.");
    error.status = 404;
    throw error;
  }
  res.json({
    manager: serializeManager(manager),
  });
});

module.exports = {
  customerJoin,
  getCustomerProfile,
  getCustomerConversation: getCustomerConversationHandler,
  getWorkspaceBySlug,
};


