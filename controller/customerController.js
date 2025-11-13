const { validationResult } = require("express-validator");
require("dotenv").config();
const { Customer, Conversation } = require("../models");
const { serializeCustomer, serializeManager } = require("../utils/serializers");
const asyncHandler = require("../utils/asyncHandler");
const { signToken } = require("../utils/tokens");
const {
  findManagerByBusinessSlug,
  ensureConversation,
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
        
        // Send welcome message for new conversations automatically
        const { sendWelcomeMessage } = require("../services/autoChatService");
        const managerName = manager.managerName ?? manager.businessName ?? "Manager";
        const customerName = customer.name ?? "Customer";
        const managerBusinessName = manager.businessName ?? "Our Spa";
        
        // Send welcome message immediately for newly joined users
        // Use setImmediate to ensure it runs after the response is sent but still quickly
        setImmediate(async () => {
          try {
            const welcomeMessage = await sendWelcomeMessage(
              conversation._id,
              manager._id,
              managerName,
              customerName,
              managerBusinessName
            );
            
            if (welcomeMessage && io) {
              const { serializeMessage } = require("../utils/serializers");
              const serialized = serializeMessage(welcomeMessage);
              io.to(`conversation:${conversation._id.toString()}`).emit("message:new", serialized);
              io.to(`manager:${manager._id.toString()}`).emit("conversation:updated", serialized);
              io.to(`customer:${customer._id.toString()}`).emit("conversation:updated", serialized);
            }
          } catch (error) {
            console.error("Failed to send welcome message:", error);
          }
        });
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

// Get all customers for a manager (manager-only)
const getManagerCustomers = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { managerId } = req.params;
  
  if (!managerId) {
    const error = new Error("Manager ID is required.");
    error.status = 400;
    throw error;
  }

  const customers = await Customer.find({ manager: managerId })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    customers: customers.map((customer) => serializeCustomer(customer)),
  });
});

// Update customer (manager-only)
const updateCustomer = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { id } = req.params;
  const { managerId } = req.body;

  if (!managerId) {
    const error = new Error("Manager ID is required.");
    error.status = 400;
    throw error;
  }

  const customer = await Customer.findById(id);
  if (!customer) {
    const error = new Error("Customer record not found.");
    error.status = 404;
    throw error;
  }

  // Verify customer belongs to this manager
  if (customer.manager.toString() !== managerId) {
    const error = new Error("You don't have permission to update this customer.");
    error.status = 403;
    throw error;
  }

  const { name, email, phone, status } = req.body;

  if (name !== undefined) {
    customer.name = name.trim();
  }
  if (email !== undefined) {
    customer.email = email?.trim()?.toLowerCase() ?? null;
  }
  if (phone !== undefined) {
    customer.phone = normalizeIndianPhone(phone);
  }
  if (status !== undefined) {
    customer.status = status;
  }

  await customer.save();

  res.json({
    customer: serializeCustomer(customer),
  });
});

// Delete customer (manager-only)
const deleteCustomer = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { id } = req.params;
  const { managerId } = req.body;

  if (!managerId) {
    const error = new Error("Manager ID is required.");
    error.status = 400;
    throw error;
  }

  const customer = await Customer.findById(id);
  if (!customer) {
    const error = new Error("Customer record not found.");
    error.status = 404;
    throw error;
  }

  // Verify customer belongs to this manager
  if (customer.manager.toString() !== managerId) {
    const error = new Error("You don't have permission to delete this customer.");
    error.status = 403;
    throw error;
  }

  // Delete associated conversations
  await Conversation.deleteMany({ customer: customer._id });

  // Delete customer
  await Customer.findByIdAndDelete(id);

  res.json({
    message: "Customer deleted successfully.",
  });
});

module.exports = {
  customerJoin,
  getCustomerProfile,
  getCustomerConversation: getCustomerConversationHandler,
  getWorkspaceBySlug,
  getManagerCustomers,
  updateCustomer,
  deleteCustomer,
};


