const { validationResult } = require("express-validator");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Customer, Manager } = require("../models");
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

const customerJoin = asyncHandler(async (req, res) => {
  handleValidation(req);

  const { businessSlug, name, phone, email } = req.body;

  const manager = await findManagerByBusinessSlug(businessSlug);
  if (!manager) {
    const error = new Error("We couldn't find a workspace for this business link. Please check the URL.");
    error.status = 404;
    throw error;
  }

  const normalizedPhone = phone.trim();
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

  await ensureConversation(manager._id, customer._id, {
    managerName: manager.managerName ?? manager.businessName ?? "Manager",
    customerName: customer.name ?? "Customer",
    customerPhone: customer.phone ?? null,
  });

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


