require("dotenv").config();
const { validationResult } = require("express-validator");
const asyncHandler = require("../utils/asyncHandler");
const {
  createMessage,
  updateMessageContent,
  replaceMessageAttachments,
  toggleReaction,
  deleteMessage,
  ensureMessageExists,
} = require("../services/messageService");
const { serializeMessage } = require("../utils/serializers");
const { invalidateConversationCaches } = require("../utils/cache");
const { buildAttachmentRecordFromFile, deleteAttachmentFiles } = require("../utils/fileStorage");

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.status = 422;
    error.details = errors.array();
    throw error;
  }
};

const sendMessage = asyncHandler(async (req, res) => {
  handleValidation(req);
  const parseField = (value, fallback = null) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value ?? fallback;
  };

  const parseArrayField = (value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  };

  const uploads = Array.isArray(req.files)
    ? req.files.map(buildAttachmentRecordFromFile).filter(Boolean)
    : [];
  const referencedAttachments = parseArrayField(req.body.attachments);

  const payload = {
    conversationId: req.body.conversationId,
    authorType: req.body.authorType,
    authorId: req.body.authorId,
    content: typeof req.body.content === "string" ? req.body.content : "",
    attachments: [...uploads, ...referencedAttachments],
    replyTo: (() => {
      const parsed = parseField(req.body.replyTo, null);
      return parsed && typeof parsed === "object" ? parsed : null;
    })(),
    status: req.body.status,
    action: req.body.action || null, // Extract action for auto-chat
  };

  try {
    const message = await createMessage(payload);
    // Get conversation to extract manager and customer IDs for selective cache invalidation
    const { Conversation } = require("../models");
    const conversation = await Conversation.findById(message.conversation).select("manager customer").lean();
    await invalidateConversationCaches(
      message.conversation.toString(),
      conversation?.manager?.toString(),
      conversation?.customer?.toString()
    );

    const serialized = serializeMessage(message);
    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${serialized.conversationId}`).emit("message:new", serialized);
    }

    // If customer sent a message and auto-chat is enabled, process auto-response
    if (payload.authorType === "customer" && serialized.conversationId) {
      const { processCustomerMessage } = require("../services/autoChatService");
      const { Conversation } = require("../models");
      const conversation = await Conversation.findById(serialized.conversationId);
      
      if (conversation && conversation.autoChatEnabled) {
        // Process auto-response asynchronously (don't block the response)
        processCustomerMessage(serialized.conversationId, payload.content, payload.action)
          .then((autoResponse) => {
            if (autoResponse && io) {
              const autoSerialized = serializeMessage(autoResponse);
              io.to(`conversation:${serialized.conversationId}`).emit("message:new", autoSerialized);
              
              // Update conversation
              const { getConversationById } = require("../services/conversationService");
              const { serializeConversation } = require("../utils/serializers");
              getConversationById(serialized.conversationId)
                .then((updatedConv) => {
                  const convSerialized = serializeConversation(updatedConv, []);
                  io.to(`manager:${updatedConv.manager}`).emit("conversation:updated", convSerialized);
                  io.to(`customer:${updatedConv.customer}`).emit("conversation:updated", convSerialized);
                })
                .catch((err) => console.error("Failed to update conversation:", err));
            }
          })
          .catch((error) => {
            console.error("Failed to process auto-response:", error);
          });
      }
    }

    res.status(201).json({
      message: serialized,
    });
  } catch (error) {
    await deleteAttachmentFiles(uploads);
    throw error;
  }
});

const editMessage = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { messageId } = req.params;
  const updates = {};

  if (req.body.content !== undefined) {
    updates.content = req.body.content;
  }
  const uploads = Array.isArray(req.files)
    ? req.files.map(buildAttachmentRecordFromFile).filter(Boolean)
    : [];

  const parseArrayField = (value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  };

  const keepAttachments = parseArrayField(req.body.keepAttachments ?? req.body.attachments);

  let message;
  if (updates.content !== undefined) {
    message = await updateMessageContent({ messageId, content: updates.content });
  }
  if (uploads.length || keepAttachments.length) {
    try {
      message = await replaceMessageAttachments({
        messageId,
        attachments: {
          uploads,
          keep: keepAttachments,
        },
      });
    } catch (error) {
      await deleteAttachmentFiles(uploads);
      throw error;
    }
  }

  if (!message) {
    message = await ensureMessageExists(messageId);
  }

  // Get conversation to extract manager and customer IDs for selective cache invalidation
  const { Conversation } = require("../models");
  const conversation = await Conversation.findById(message.conversation).select("manager customer").lean();
  await invalidateConversationCaches(
    message.conversation.toString(),
    conversation?.manager?.toString(),
    conversation?.customer?.toString()
  );
  const serialized = serializeMessage(message);
  const io = req.app.get("io");
  if (io) {
    io.to(`conversation:${serialized.conversationId}`).emit("message:updated", serialized);
  }
  res.json({
    message: serialized,
  });
});

const deleteMessageHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { messageId } = req.params;
  const message = await deleteMessage({ messageId });
  // Get conversation to extract manager and customer IDs for selective cache invalidation
  const { Conversation } = require("../models");
  const conversation = await Conversation.findById(message.conversation).select("manager customer").lean();
  await invalidateConversationCaches(
    message.conversation.toString(),
    conversation?.manager?.toString(),
    conversation?.customer?.toString()
  );
  const payload = {
    messageId: messageId,
    conversationId: message.conversation.toString(),
  };
  const io = req.app.get("io");
  if (io) {
    io.to(`conversation:${payload.conversationId}`).emit("message:deleted", payload);
  }
  res.json(payload);
});

const toggleReactionHandler = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { messageId } = req.params;
  const { emoji, actorType } = req.body;
  const message = await toggleReaction({ messageId, emoji, actorType });
  // Get conversation to extract manager and customer IDs for selective cache invalidation
  const { Conversation } = require("../models");
  const conversation = await Conversation.findById(message.conversation).select("manager customer").lean();
  await invalidateConversationCaches(
    message.conversation.toString(),
    conversation?.manager?.toString(),
    conversation?.customer?.toString()
  );
  const serialized = serializeMessage(message);
  const io = req.app.get("io");
  if (io) {
    io.to(`conversation:${serialized.conversationId}`).emit("message:reaction", serialized);
  }
  res.json({
    message: serialized,
  });
});

module.exports = {
  sendMessage,
  editMessage,
  deleteMessage: deleteMessageHandler,
  toggleReaction: toggleReactionHandler,
};


