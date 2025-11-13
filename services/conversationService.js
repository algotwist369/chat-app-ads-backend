const mongoose = require("mongoose");
require("dotenv").config();
const { Manager, Customer, Conversation, Message } = require("../models");
const { toBusinessSlug } = require("../utils/slug");

const ensureManagerExists = async (managerId) => {
  if (!mongoose.Types.ObjectId.isValid(managerId)) {
    throw Object.assign(new Error("Invalid manager identifier."), { status: 400 });
  }
  const manager = await Manager.findById(managerId).lean();
  if (!manager) {
    throw Object.assign(new Error("Manager record not found."), { status: 404 });
  }
  return manager;
};

const ensureCustomerExists = async (customerId) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw Object.assign(new Error("Invalid customer identifier."), { status: 400 });
  }
  const customer = await Customer.findById(customerId).lean();
  if (!customer) {
    throw Object.assign(new Error("Customer record not found."), { status: 404 });
  }
  return customer;
};

const ensureConversation = async (managerId, customerId, metadata = {}) => {
  const manager = await ensureManagerExists(managerId);
  const customer = await ensureCustomerExists(customerId);

  const derivedMetadata = {
    managerName: metadata.managerName ?? manager.managerName ?? manager.businessName ?? "Manager",
    customerName: metadata.customerName ?? customer.name ?? "Customer",
    customerPhone: metadata.customerPhone ?? customer.phone ?? null,
    notes: metadata.notes ?? null,
  };

  const existing = await Conversation.findOne({
    manager: manager._id,
    customer: customer._id,
  });

  if (existing) {
    const needsMetadataUpdate =
      existing.metadata.managerName !== derivedMetadata.managerName ||
      existing.metadata.customerName !== derivedMetadata.customerName ||
      existing.metadata.customerPhone !== derivedMetadata.customerPhone;

    if (needsMetadataUpdate) {
      existing.metadata = { ...existing.metadata.toObject?.(), ...derivedMetadata };
      await existing.save();
    }

    return existing;
  }

  const conversation = await Conversation.create({
    manager: manager._id,
    customer: customer._id,
    metadata: derivedMetadata,
    lastMessageSnippet: `Conversation created between ${derivedMetadata.customerName} and ${derivedMetadata.managerName}.`,
    lastMessageAt: new Date(),
    autoChatEnabled: true, // Enable auto-chat for new conversations
    autoChatMessageCount: 0,
  });

  await Message.create({
    conversation: conversation._id,
    authorType: "system",
    content: `Conversation created between ${derivedMetadata.customerName} and ${derivedMetadata.managerName}.`,
    status: "read",
  });

  return conversation;
};

const listManagerConversations = async (managerId) =>
  Conversation.find({ manager: managerId })
    .populate("manager")
    .populate("customer")
    .sort({ updatedAt: -1 })
    .lean();

const getConversationById = async (conversationId) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw Object.assign(new Error("Invalid conversation identifier."), { status: 400 });
  }
  const conversation = await Conversation.findById(conversationId)
    .populate("manager")
    .populate("customer")
    .lean();
  if (!conversation) {
    throw Object.assign(new Error("Conversation not found."), { status: 404 });
  }
  return conversation;
};

const getCustomerConversation = async (customerId) =>
  Conversation.findOne({ customer: customerId })
    .populate("manager")
    .populate("customer")
    .lean();

const markConversationDelivered = async (conversationId, viewerType) => {
  if (!["manager", "customer"].includes(viewerType)) {
    throw Object.assign(new Error("viewerType must be manager or customer."), { status: 400 });
  }

  const conversation = await getConversationById(conversationId);
  const participantKey = viewerType === "manager" ? "manager" : "customer";

  await Message.updateMany(
    {
      conversation: conversation._id,
      authorType: { $ne: viewerType },
      [`deliveryState.${participantKey}.status`]: { $in: ["sent"] },
    },
    {
      $set: {
        [`deliveryState.${participantKey}.status`]: "delivered",
        [`deliveryState.${participantKey}.updatedAt`]: new Date(),
      },
    },
  );
  return conversation;
};

const markConversationRead = async (conversationId, viewerType) => {
  if (!["manager", "customer"].includes(viewerType)) {
    throw Object.assign(new Error("viewerType must be manager or customer."), { status: 400 });
  }

  const conversation = await getConversationById(conversationId);
  const participantKey = viewerType === "manager" ? "manager" : "customer";
  const unreadField = viewerType === "manager" ? "unreadByManager" : "unreadByCustomer";

  const result = await Message.updateMany(
    {
      conversation: conversation._id,
      authorType: { $ne: viewerType },
      [`deliveryState.${participantKey}.status`]: { $in: ["sent", "delivered"] },
    },
    {
      $set: {
        [`deliveryState.${participantKey}.status`]: "read",
        [`deliveryState.${participantKey}.updatedAt`]: new Date(),
      },
    },
  );

  if (result.modifiedCount > 0) {
    await Conversation.findByIdAndUpdate(conversation._id, {
      [unreadField]: 0,
    });
  }

  return conversation;
};

const incrementUnreadForParticipant = async (conversationId, viewerType) => {
  const field = viewerType === "manager" ? "unreadByManager" : "unreadByCustomer";
  await Conversation.findByIdAndUpdate(conversationId, {
    $inc: { [field]: 1 },
  });
};

const updateLastMessageSnapshot = async (conversationId, snapshot) => {
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessageSnippet: snapshot.snippet,
    lastMessageAt: snapshot.timestamp,
    updatedAt: snapshot.timestamp,
  });
};

const updateConversationMetadata = async (conversationId, metadata) =>
  Conversation.findByIdAndUpdate(
    conversationId,
    {
      $set: {
        metadata: metadata
          ? {
              managerName: metadata.managerName ?? null,
              customerName: metadata.customerName ?? null,
              customerPhone: metadata.customerPhone ?? null,
              notes: metadata.notes ?? null,
            }
          : {},
      },
    },
    { new: true },
  );

const findManagerByBusinessSlug = async (slug) =>
  Manager.findOne({ businessSlug: toBusinessSlug(slug ?? "") }).lean();

const setConversationMuteState = async (conversationId, actorType, muted) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw Object.assign(new Error("Invalid conversation identifier."), { status: 400 });
  }
  if (!["manager", "customer"].includes(actorType)) {
    throw Object.assign(new Error("actorType must be manager or customer."), { status: 400 });
  }

  const updateKey = actorType === "manager" ? "mutedForManager" : "mutedForCustomer";

  const conversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { $set: { [updateKey]: Boolean(muted) } },
    { new: true },
  )
    .populate("manager")
    .populate("customer");

  if (!conversation) {
    throw Object.assign(new Error("Conversation not found."), { status: 404 });
  }

  return conversation;
};

module.exports = {
  ensureConversation,
  listManagerConversations,
  getConversationById,
  getCustomerConversation,
  markConversationDelivered,
  markConversationRead,
  incrementUnreadForParticipant,
  updateLastMessageSnapshot,
  updateConversationMetadata,
  findManagerByBusinessSlug,
  ensureManagerExists,
  ensureCustomerExists,
  setConversationMuteState,
};


