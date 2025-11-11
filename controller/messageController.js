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
  };

  try {
    const message = await createMessage(payload);
    await invalidateConversationCaches(message.conversation.toString());

    const serialized = serializeMessage(message);
    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${serialized.conversationId}`).emit("message:new", serialized);
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

  await invalidateConversationCaches(message.conversation.toString());
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
  await invalidateConversationCaches(message.conversation.toString());
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
  await invalidateConversationCaches(message.conversation.toString());
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


