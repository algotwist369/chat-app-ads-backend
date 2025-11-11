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
  ensureCustomerExists,
  setConversationMuteState,
} = require("../services/conversationService");
const { serializeConversation } = require("../utils/serializers");
const { Message } = require("../models");
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
  const messageGroups = await Message.aggregate([
    { $match: { conversation: { $in: conversationIds } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: "$conversation",
        messages: { $push: "$$ROOT" },
      },
    },
  ]);

  const messageMap = new Map(messageGroups.map((group) => [group._id.toString(), group.messages]));

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
  const cacheKey = buildConversationKey(id);

  const cached = await getCache(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    res.set("Cache-Control", "private, max-age=20");
    res.json({
      conversation: cached,
    });
    return;
  }

  const conversation = await getConversationById(id);
  const messages = await Message.find({ conversation: id }).sort({ createdAt: 1 });
  const payload = serializeConversation(conversation, messages);

  await setCache(cacheKey, payload, 20 * 1000);
  res.set("X-Cache", "MISS");
  res.set("Cache-Control", "private, max-age=20");
  res.json({
    conversation: payload,
  });
});

const ensureConversationHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { managerId, customerId } = req.body;
  const conversationRecord = await ensureConversation(managerId, customerId, req.body.metadata ?? {});
  const conversation = await getConversationById(conversationRecord._id);
  const messages = await Message.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  await invalidateConversationCaches(conversation._id.toString());
  res.status(201).json({
    conversation: serializeConversation(conversation, messages),
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
  const cacheKey = buildCustomerKey(customerId);
  const cached = await getCache(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    res.set("Cache-Control", "private, max-age=30");
    res.json({ conversation: cached });
    return;
  }

  const messages = await Message.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  const payload = serializeConversation(conversation, messages);
  await setCache(cacheKey, payload, 30 * 1000);
  res.set("X-Cache", "MISS");
  res.set("Cache-Control", "private, max-age=30");
  res.json({ conversation: payload });
});

const markDeliveredHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const { viewerType } = req.body;
  const conversation = await markConversationDelivered(conversationId, viewerType);
  await invalidateConversationCaches(conversationId);
  res.json({ conversationId: conversation._id.toString(), viewerType });
});

const markReadHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const { viewerType } = req.body;
  const conversation = await markConversationRead(conversationId, viewerType);
  await invalidateConversationCaches(conversationId);
  res.json({ conversationId: conversation._id.toString(), viewerType });
});

const setConversationMuteHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { conversationId } = req.params;
  const { actorType, muted } = req.body;
  const conversation = await setConversationMuteState(conversationId, actorType, muted);
  const messages = await Message.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  await invalidateConversationCaches(conversationId);
  res.json({
    conversation: serializeConversation(conversation, messages),
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
};


