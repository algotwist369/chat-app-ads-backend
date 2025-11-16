const mongoose = require("mongoose");
require("dotenv").config();
const { Message } = require("../models");
const {
  incrementUnreadForParticipant,
  updateLastMessageSnapshot,
  getConversationById,
} = require("./conversationService");
const { deleteAttachmentFiles, mergeExistingAttachments, deriveStoragePathFromUrl } = require("../utils/fileStorage");
const { determineAttachmentType } = require("../config/storage");

const MAX_ATTACHMENTS = parseInt(process.env.MESSAGE_MAX_ATTACHMENTS ?? "5", 10);
const MAX_TEXT_LENGTH = parseInt(process.env.MESSAGE_MAX_LENGTH ?? "2000", 10);

const ensureMessageExists = async (messageId) => {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw Object.assign(new Error("Invalid message identifier."), { status: 400 });
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw Object.assign(new Error("Message not found."), { status: 404 });
  }
  return message;
};

const determineAttachmentSnippet = (attachments = []) => {
  if (!attachments.length) return "";
  if (attachments.length === 1) {
    const attachment = attachments[0];
    if (attachment.type === "image") return attachment.name ?? "Image";
    if (attachment.type === "audio") return attachment.name ?? "Audio";
    if (attachment.type === "video") return attachment.name ?? "Video";
    return attachment.name ? `File: ${attachment.name}` : "Attachment";
  }
  return `${attachments.length} attachments`;
};

const buildReplySnapshot = (replyPayload) => {
  if (!replyPayload) return null;
  const { id, messageId, authorId, authorName, content, hasMedia, authorType } = replyPayload;
  const targetId = id || messageId;
  if (!targetId) return null;
  return {
    message: mongoose.Types.ObjectId.isValid(targetId) ? targetId : undefined,
    authorType: authorType ?? null,
    authorName: authorName ?? null,
    content: content ?? "",
    hasMedia: Boolean(hasMedia),
  };
};

const normalizeAttachmentInput = (attachments = []) => {
  return attachments
    .map((attachment) => {
      if (!attachment) return null;
      const type = attachment.type ?? determineAttachmentType(attachment.mimeType ?? "");
      const url = attachment.url ?? attachment.data ?? null;
      if (!url) return null;
      return {
        type,
        name: attachment.name ?? null,
        size: attachment.size ?? null,
        mimeType: attachment.mimeType ?? null,
        url,
        preview: attachment.preview ?? null,
        metadata: attachment.metadata ?? {},
        storagePath: attachment.storagePath ?? deriveStoragePathFromUrl(url),
      };
    })
    .filter(Boolean);
};

const createMessage = async (payload) => {
  const {
    conversationId,
    authorType,
    authorId,
    content = "",
    attachments = [],
    replyTo = null,
    status = "sent",
  } = payload;

  if (content && content.length > MAX_TEXT_LENGTH) {
    throw Object.assign(
      new Error(`Message exceeds maximum length of ${MAX_TEXT_LENGTH} characters.`),
      { status: 400 },
    );
  }

  const authorModel = authorType === "manager" ? "Manager" : authorType === "customer" ? "Customer" : undefined;

  const normalizedAttachments = normalizeAttachmentInput(attachments);
  if (normalizedAttachments.length > MAX_ATTACHMENTS) {
    throw Object.assign(
      new Error(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed per message.`),
      { status: 400 },
    );
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw Object.assign(new Error("Invalid conversation identifier."), { status: 400 });
  }

  // Initialize delivery state at creation to avoid extra save
  const initialDeliveryState =
    authorType === "manager"
      ? {
          manager: { status: "read", updatedAt: new Date() },
          customer: { status: "sent", updatedAt: null },
        }
      : authorType === "customer"
        ? {
            manager: { status: "sent", updatedAt: null },
            customer: { status: "read", updatedAt: new Date() },
          }
        : undefined;

  const message = await Message.create({
    conversation: conversationId,
    authorType,
    author: authorId ?? undefined,
    authorModel,
    content,
    attachments: normalizedAttachments,
    status,
    replyTo: buildReplySnapshot(replyTo),
    ...(initialDeliveryState ? { deliveryState: initialDeliveryState } : {}),
  });

  const firstViewer = authorType === "manager" ? "customer" : "manager";
  await incrementUnreadForParticipant(conversationId, firstViewer);

  const snippet = content?.trim()
    ? content.trim().slice(0, 160)
    : determineAttachmentSnippet(normalizedAttachments);

  await updateLastMessageSnapshot(conversationId, {
    snippet,
    timestamp: message.createdAt,
  });

  return message;
};

const updateMessageContent = async ({ messageId, content }) => {
  if (content && content.length > MAX_TEXT_LENGTH) {
    throw Object.assign(
      new Error(`Message exceeds maximum length of ${MAX_TEXT_LENGTH} characters.`),
      { status: 400 },
    );
  }
  const message = await ensureMessageExists(messageId);
  message.content = content;
  message.editedAt = new Date();
  await message.save();
  return message;
};

const replaceMessageAttachments = async ({ messageId, attachments = [] }) => {
  const message = await ensureMessageExists(messageId);
  const existing = message.attachments ?? [];
  const keepList = Array.isArray(attachments.keep) ? attachments.keep : [];
  const uploads = Array.isArray(attachments.uploads) ? attachments.uploads : Array.isArray(attachments) ? attachments : [];

  const retained = mergeExistingAttachments(existing, keepList);
  const newUploads = normalizeAttachmentInput(uploads);

  const combined = [...retained, ...newUploads];
  if (combined.length > MAX_ATTACHMENTS) {
    throw Object.assign(
      new Error(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed per message.`),
      { status: 400 },
    );
  }

  const combinedUrls = new Set(combined.map((attachment) => attachment.url));
  const removed = existing.filter((attachment) => {
    const key = attachment.url ?? attachment.data ?? null;
    return key && !combinedUrls.has(key);
  });

  if (removed.length) {
    await deleteAttachmentFiles(removed);
  }

  message.attachments = combined;
  message.editedAt = new Date();
  await message.save();
  return message;
};

const toggleReaction = async ({ messageId, emoji, actorType }) => {
  if (!["manager", "customer"].includes(actorType)) {
    throw Object.assign(new Error("actorType must be manager or customer"), { status: 400 });
  }
  const message = await ensureMessageExists(messageId);
  const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
  const flagKey = actorType === "manager" ? "managerReacted" : "customerReacted";
  if (existing) {
    existing[flagKey] = !existing[flagKey];
    existing.updatedAt = new Date();
    if (!existing.managerReacted && !existing.customerReacted) {
      message.reactions = message.reactions.filter((reaction) => reaction.emoji !== emoji);
    }
  } else {
    message.reactions.push({
      emoji,
      managerReacted: actorType === "manager",
      customerReacted: actorType === "customer",
      updatedAt: new Date(),
    });
  }
  await message.save();
  return message;
};

const deleteMessage = async ({ messageId }) => {
  const message = await ensureMessageExists(messageId);
  if (Array.isArray(message.attachments) && message.attachments.length) {
    await deleteAttachmentFiles(message.attachments);
  }
  await message.deleteOne();
  return message;
};

const setMessageStatus = async ({ messageId, status }) => {
  if (!["sent", "delivered", "read"].includes(status)) {
    throw Object.assign(new Error("Invalid message status"), { status: 400 });
  }
  const message = await ensureMessageExists(messageId);
  message.status = status;
  await message.save();
  return message;
};

module.exports = {
  createMessage,
  updateMessageContent,
  replaceMessageAttachments,
  toggleReaction,
  deleteMessage,
  setMessageStatus,
  ensureMessageExists,
};


