const path = require("path");
require("dotenv").config();
const { buildPublicAssetUrl, UPLOAD_PUBLIC_PATH } = require("../config/storage");

const toObjectId = (value) => (value && value.toString ? value.toString() : String(value));

const serializeManager = (managerDoc) => {
  if (!managerDoc) return null;
  const manager = managerDoc.toObject ? managerDoc.toObject() : managerDoc;
  const {
    _id,
    passwordHash,
    contactEmail,
    managerName,
    businessName,
    businessSlug,
    mobileNumber,
    logo,
    inviteToken,
    metadata,
    isActive,
    createdAt,
    updatedAt,
    lastLoginAt,
  } = manager;

  return {
    id: toObjectId(_id),
    managerName,
    businessName,
    businessSlug,
    email: contactEmail,
    mobileNumber: mobileNumber ?? null,
    logo: logo ?? null,
    inviteToken: inviteToken ?? null,
    isActive: isActive ?? true,
    metadata: metadata ?? {},
    createdAt,
    updatedAt,
    lastLoginAt,
  };
};

const serializeCustomer = (customerDoc) => {
  if (!customerDoc) return null;
  const customer = customerDoc.toObject ? customerDoc.toObject() : customerDoc;
  const {
    _id,
    name,
    phone,
    email,
    manager,
    businessSlug,
    inviteSource,
    status,
    lastSeenAt,
    metadata,
    createdAt,
    updatedAt,
  } = customer;

  return {
    id: toObjectId(_id),
    name,
    phone,
    email: email ?? null,
    managerId: manager ? toObjectId(manager) : null,
    businessSlug,
    inviteSource: inviteSource ?? null,
    status: status ?? "active",
    lastSeenAt,
    metadata: metadata ?? {},
    createdAt,
    updatedAt,
  };
};

const serializeReaction = (reactionDoc) => {
  if (!reactionDoc) return null;
  return {
    emoji: reactionDoc.emoji,
    reactors: {
      manager: Boolean(reactionDoc.managerReacted),
      customer: Boolean(reactionDoc.customerReacted),
    },
  };
};

const serializeAttachment = (attachmentDoc) => {
  if (!attachmentDoc) return null;
  const storagePath = attachmentDoc.storagePath ?? null;
  const relativeFromStorage = storagePath
    ? `${UPLOAD_PUBLIC_PATH}/${path.basename(storagePath)}`.replace(/\\/g, "/")
    : null;
  const candidateUrl = attachmentDoc.url ?? attachmentDoc.data ?? relativeFromStorage;
  const normalizedUrl = buildPublicAssetUrl(candidateUrl);

  return {
    type: attachmentDoc.type ?? "other",
    name: attachmentDoc.name ?? null,
    size: attachmentDoc.size ?? null,
    mimeType: attachmentDoc.mimeType ?? null,
    url: normalizedUrl,
    data: normalizedUrl,
    preview: attachmentDoc.preview ? buildPublicAssetUrl(attachmentDoc.preview) : null,
    metadata: attachmentDoc.metadata ?? {},
  };
};

const serializeReply = (replyDoc) => {
  if (!replyDoc) return null;
  return {
    messageId: replyDoc.message ? toObjectId(replyDoc.message) : null,
    authorType: replyDoc.authorType ?? null,
    authorName: replyDoc.authorName ?? null,
    content: replyDoc.content ?? "",
    hasMedia: Boolean(replyDoc.hasMedia),
  };
};

const serializeMessage = (messageDoc) => {
  if (!messageDoc) return null;
  const message = messageDoc.toObject ? messageDoc.toObject() : messageDoc;
  const {
    _id,
    conversation,
    authorType,
    author,
    content,
    attachments,
    status,
    deliveryState,
    reactions,
    replyTo,
    editedAt,
    archivedAt,
    createdAt,
    updatedAt,
  } = message;

  const baseStatus = status ?? "sent";
  const managerStatus = deliveryState?.manager?.status ?? baseStatus;
  const customerStatus = deliveryState?.customer?.status ?? baseStatus;

  return {
    id: toObjectId(_id),
    conversationId: conversation ? toObjectId(conversation) : null,
    authorType,
    authorId: author ? toObjectId(author) : null,
    content,
    attachments: Array.isArray(attachments) ? attachments.map(serializeAttachment) : [],
    status: baseStatus,
    statusByParticipant: {
      manager: managerStatus,
      customer: customerStatus,
    },
    reactions: Array.isArray(reactions) ? reactions.map(serializeReaction).filter(Boolean) : [],
    replyTo: serializeReply(replyTo),
    editedAt,
    archivedAt,
    createdAt,
    updatedAt,
  };
};

const serializeConversation = (conversationDoc, messages = []) => {
  if (!conversationDoc) return null;
  const conversation = conversationDoc.toObject ? conversationDoc.toObject() : conversationDoc;
  const {
    _id,
    manager,
    customer,
    metadata,
    status,
    unreadByManager,
    unreadByCustomer,
    lastMessageAt,
    lastMessageSnippet,
    tags,
    isPinned,
    isMuted,
    mutedForManager,
    mutedForCustomer,
    createdAt,
    updatedAt,
  } = conversation;

  return {
    id: toObjectId(_id),
    manager: serializeManager(manager),
    customer: serializeCustomer(customer),
    managerId: manager ? toObjectId(manager?._id ?? manager) : null,
    customerId: customer ? toObjectId(customer?._id ?? customer) : null,
    metadata: {
      managerName: metadata?.managerName ?? "Manager",
      customerName: metadata?.customerName ?? "Customer",
      customerPhone: metadata?.customerPhone ?? null,
      notes: metadata?.notes ?? null,
    },
    status: status ?? "open",
    unreadByManager: unreadByManager ?? 0,
    unreadByCustomer: unreadByCustomer ?? 0,
    lastMessageAt,
    lastMessageSnippet: lastMessageSnippet ?? "",
    tags: tags ?? [],
    pinned: Boolean(isPinned),
    muted: Boolean(isMuted),
    mutedBy: {
      manager: Boolean(mutedForManager ?? false) || Boolean(isMuted),
      customer: Boolean(mutedForCustomer ?? false) || Boolean(isMuted),
    },
    createdAt,
    updatedAt,
    messages: Array.isArray(messages) ? messages.map(serializeMessage) : [],
  };
};

module.exports = {
  serializeManager,
  serializeCustomer,
  serializeConversation,
  serializeMessage,
};


