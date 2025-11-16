const { validationResult } = require("express-validator");
require("dotenv").config();
const asyncHandler = require("../utils/asyncHandler");
const {
  ensureConversation,
  listManagerConversations,
  getConversationById,
  getCustomerConversation,
  markConversationDelivered,
  markConversationRead,
  ensureManagerExists,
  setConversationMuteState,
} = require("../services/conversationService");
const { serializeConversation } = require("../utils/serializers");
const { Message } = require("../models");
const { Conversation } = require("../models");
const {
  getCache,
  setCache,
  buildConversationKey,
  buildManagerListKey,
  buildCustomerKey,
  invalidateConversationCaches,
} = require("../utils/cache");

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.status = 422;
    error.details = errors.array();
    throw error;
  }
};

const getManagerConversations = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { managerId } = req.params;
  const cacheKey = buildManagerListKey(managerId);

  const cached = await getCache(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    res.set("Cache-Control", "private, max-age=30");
    res.json({ conversations: cached });
    return;
  }

  await ensureManagerExists(managerId);

  const conversations = await listManagerConversations(managerId);
  const conversationIds = conversations.map((conversation) => conversation._id);

  // Optimized: Get only last 50 messages per conversation, sorted by createdAt descending
  const MESSAGES_PER_CONVERSATION = 50;
  const messageGroups = await Message.aggregate([
    { $match: { conversation: { $in: conversationIds } } },
    { $sort: { conversation: 1, createdAt: -1 } }, // Sort by conversation first, then newest first
    {
      $group: {
        _id: "$conversation",
        messages: { $push: "$$ROOT" },
      },
    },
    {
      $project: {
        _id: 1,
        messages: { $slice: ["$messages", MESSAGES_PER_CONVERSATION] }, // Limit to last 50
      },
    },
  ]);

  // Convert to Map and reverse messages for chronological order
  const messageMap = new Map();
  messageGroups.forEach((group) => {
    const messages = group.messages.reverse(); // Reverse to get chronological order
    messageMap.set(group._id.toString(), messages);
  });

  const payload = conversations.map((conversation) =>
    serializeConversation(conversation, messageMap.get(conversation._id.toString()) ?? []),
  );

  await setCache(cacheKey, payload, 30 * 1000);
  res.set("X-Cache", "MISS");
  res.set("Cache-Control", "private, max-age=30");
  res.json({ conversations: payload });
});

const getConversation = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 200); // Max 200 messages per request
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);
  const cacheKey = `${buildConversationKey(id)}:${limit}:${skip}`;

  const cached = await getCache(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    res.set("Cache-Control", "private, max-age=20");
    res.json(cached);
    return;
  }

  const conversation = await getConversationById(id);
  // Paginate messages - get most recent messages first, then reverse for chronological order
  const messages = await Message.find({ conversation: id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();

  // Reverse to get chronological order (oldest first)
  const sortedMessages = messages.reverse();
  const payload = serializeConversation(conversation, sortedMessages);

  const responsePayload = {
    conversation: payload,
    pagination: {
      limit,
      skip,
      hasMore: messages.length === limit,
    },
  };

  await setCache(cacheKey, responsePayload, 20 * 1000);
  res.set("X-Cache", "MISS");
  res.set("Cache-Control", "private, max-age=20");
  res.json(responsePayload);
});

const ensureConversationHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { managerId, customerId } = req.body;
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);

  // Detect if conversation exists prior to ensuring (to decide welcome flow)
  const existing = await Conversation.findOne({ manager: managerId, customer: customerId }).select("_id").lean();
  const conversationRecord = await ensureConversation(managerId, customerId, req.body.metadata ?? {});
  const conversation = await getConversationById(conversationRecord._id);
  const messages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  const sortedMessages = messages.reverse();
  await invalidateConversationCaches(conversation._id.toString(), managerId, customerId);

  const serializedConv = serializeConversation(conversation, sortedMessages);

  // Emit socket updates so both participants receive fresh state
  const io = req.app.get("io");
  if (io) {
    io.to(`conversation:${conversation._id.toString()}`).emit("conversation:updated", serializedConv);
    io.to(`manager:${conversation.manager?._id?.toString?.() ?? conversation.manager?.toString?.()}`).emit(
      "conversation:updated",
      serializedConv,
    );
    io.to(`customer:${conversation.customer?._id?.toString?.() ?? conversation.customer?.toString?.()}`).emit(
      "conversation:updated",
      serializedConv,
    );
  }

  // Trigger welcome message for truly new conversations (mirrors customerJoin)
  if (!existing && io) {
    try {
      const { sendWelcomeMessage } = require("../services/autoChatService");
      const managerName =
        conversation?.manager?.managerName ?? conversation?.manager?.businessName ?? "Manager";
      const customerName = conversation?.customer?.name ?? "Customer";
      const managerBusinessName = conversation?.manager?.businessName ?? "Our Spa";

      setImmediate(async () => {
        try {
          const welcomeMessage = await sendWelcomeMessage(
            conversation._id,
            conversation.manager?._id ?? conversation.manager,
            managerName,
            customerName,
            managerBusinessName,
          );
          if (welcomeMessage && io) {
            const { serializeMessage, serializeConversation } = require("../utils/serializers");
            const serializedMessage = serializeMessage(welcomeMessage);
            io.to(`conversation:${conversation._id.toString()}`).emit("message:new", serializedMessage);

            const updatedConv = await getConversationById(conversation._id);
            const convSerialized = serializeConversation(updatedConv, []);
            io.to(`manager:${updatedConv.manager}`).emit("conversation:updated", convSerialized);
            io.to(`customer:${updatedConv.customer}`).emit("conversation:updated", convSerialized);
          }
        } catch (e) {
          console.error("Failed to send welcome message (ensure):", e);
        }
      });
    } catch (e) {
      console.error("Failed to schedule welcome message (ensure):", e);
    }
  }

  res.status(201).json({
    conversation: serializedConv,
  });
});

const getCustomerConversationHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { customerId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);
  const conversation = await getCustomerConversation(customerId);
  if (!conversation) {
    res.json({ conversation: null });
    return;
  }
  const cacheKey = `${buildCustomerKey(customerId)}:${limit}:${skip}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    res.set("Cache-Control", "private, max-age=30");
    res.json(cached);
    return;
  }

  const messages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
  const sortedMessages = messages.reverse();
  const payload = serializeConversation(conversation, sortedMessages);
  const responsePayload = {
    conversation: payload,
    pagination: {
      limit,
      skip,
      hasMore: messages.length === limit,
    },
  };
  await setCache(cacheKey, responsePayload, 30 * 1000);
  res.set("X-Cache", "MISS");
  res.set("Cache-Control", "private, max-age=30");
  res.json(responsePayload);
});

const markDeliveredHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const { viewerType } = req.body;
  const conversation = await markConversationDelivered(conversationId, viewerType);
  await invalidateConversationCaches(conversationId, conversation.manager?.toString(), conversation.customer?.toString());

  // Emit delivery status event for HTTP parity with socket handler
  const io = req.app.get("io");
  if (io) {
    const payload = { conversationId: conversation._id.toString(), viewerType };
    io.to(`conversation:${payload.conversationId}`).emit("conversation:delivered", payload);
    io.to(`manager:${conversation.manager}`).emit("conversation:delivered", payload);
    io.to(`customer:${conversation.customer}`).emit("conversation:delivered", payload);
  }

  res.json({ conversationId: conversation._id.toString(), viewerType });
});

const markReadHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const { viewerType } = req.body;
  const conversation = await markConversationRead(conversationId, viewerType);
  await invalidateConversationCaches(conversationId, conversation.manager?.toString(), conversation.customer?.toString());

  // Emit read status event for HTTP parity with socket handler
  const io = req.app.get("io");
  if (io) {
    const payload = { conversationId: conversation._id.toString(), viewerType };
    io.to(`conversation:${payload.conversationId}`).emit("conversation:read", payload);
    io.to(`manager:${conversation.manager}`).emit("conversation:read", payload);
    io.to(`customer:${conversation.customer}`).emit("conversation:read", payload);
  }

  res.json({ conversationId: conversation._id.toString(), viewerType });
});

const setConversationMuteHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const { actorType, muted } = req.body;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const conversation = await setConversationMuteState(conversationId, actorType, muted);
  const messages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  const sortedMessages = messages.reverse();
  await invalidateConversationCaches(conversationId, conversation.manager?.toString(), conversation.customer?.toString());

  const serialized = serializeConversation(conversation, sortedMessages);

  // Emit mute updates to all relevant rooms
  const io = req.app.get("io");
  if (io) {
    const payload = {
      conversation: serialized,
      actorType,
      muted: serialized.mutedBy?.[actorType] ?? Boolean(muted),
    };
    io.to(`conversation:${serialized.id}`).emit("conversation:muted", payload);
    io.to(`manager:${serialized.managerId}`).emit("conversation:muted", {
      conversation: serialized,
      actorType,
      muted: serialized.mutedBy?.manager ?? false,
    });
    io.to(`customer:${serialized.customerId}`).emit("conversation:muted", {
      conversation: serialized,
      actorType,
      muted: serialized.mutedBy?.customer ?? false,
    });
  }

  res.json({
    conversation: serialized,
  });
});

const disableAutoChatHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const { disableAutoChat } = require("../services/autoChatService");
  const conversation = await disableAutoChat(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found.");
    error.status = 404;
    throw error;
  }
  const messages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  const sortedMessages = messages.reverse();
  await invalidateConversationCaches(conversationId, conversation.manager?.toString(), conversation.customer?.toString());
  const io = req.app.get("io");
  if (io) {
    const { serializeConversation } = require("../utils/serializers");
    const serialized = serializeConversation(conversation, sortedMessages);
    io.to(`conversation:${conversationId}`).emit("conversation:updated", serialized);
    io.to(`manager:${conversation.manager?.toString()}`).emit("conversation:updated", serialized);
    io.to(`customer:${conversation.customer?.toString()}`).emit("conversation:updated", serialized);
  }
  res.json({
    conversation: serializeConversation(conversation, sortedMessages),
  });
});

module.exports = {
  getManagerConversations,
  getConversation,
  ensureConversationHandler,
  getCustomerConversation: getCustomerConversationHandler,
  markDeliveredHandler,
  markReadHandler,
  setConversationMuteHandler,
  disableAutoChatHandler,
};


