const { Server } = require("socket.io");
require("dotenv").config();
const {
  createMessage,
  updateMessageContent,
  replaceMessageAttachments,
  toggleReaction,
  deleteMessage,
  ensureMessageExists,
} = require("../services/messageService");
const {
  markConversationDelivered,
  markConversationRead,
  ensureConversation,
  getConversationById,
  setConversationMuteState,
} = require("../services/conversationService");
const { serializeMessage, serializeConversation } = require("./serializers");

const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    socket.on("session:init", ({ managerId, customerId }) => {
      if (managerId) {
        socket.join(`manager:${managerId}`);
        socket.data.managerId = managerId;
      }
      if (customerId) {
        socket.join(`customer:${customerId}`);
        socket.data.customerId = customerId;
      }
    });

    socket.on("conversation:join", async ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:ensure", async ({ managerId, customerId, metadata }) => {
      if (!managerId || !customerId) return;
      try {
        const conversation = await ensureConversation(managerId, customerId, metadata);
        const serialized = serializeConversation(await getConversationById(conversation._id), []);
        io.to(`manager:${serialized.managerId}`).emit("conversation:updated", serialized);
        io.to(`customer:${serialized.customerId}`).emit("conversation:updated", serialized);
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:typing", ({ conversationId, actorType, isTyping = true }, callback) => {
      if (!conversationId || !["manager", "customer"].includes(actorType)) {
        if (callback) callback({ ok: false, message: "Invalid typing payload." });
        return;
      }

      const payload = {
        conversationId,
        actorType,
        actorId: actorType === "manager" ? socket.data.managerId ?? null : socket.data.customerId ?? null,
        isTyping: Boolean(isTyping),
        timestamp: new Date().toISOString(),
      };

      socket.to(`conversation:${conversationId}`).emit("conversation:typing", payload);
      if (callback) callback({ ok: true });
    });

    socket.on("message:send", async (payload, callback) => {
      try {
        const message = await createMessage(payload);
        const serialized = serializeMessage(message);
        const room = `conversation:${serialized.conversationId}`;
        io.to(room).emit("message:new", serialized);
        if (callback) callback({ ok: true, message: serialized });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });

    socket.on("message:edit", async ({ messageId, content, attachments }, callback) => {
      try {
        let message = null;
        if (content !== undefined) {
          message = await updateMessageContent({ messageId, content });
        }
        if (attachments !== undefined) {
          message = await replaceMessageAttachments({ messageId, attachments });
        }
        if (!message) {
          message = await ensureMessageExists(messageId);
        }
        const serialized = serializeMessage(message);
        io.to(`conversation:${serialized.conversationId}`).emit("message:updated", serialized);
        if (callback) callback({ ok: true, message: serialized });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });

    socket.on("message:delete", async ({ messageId }, callback) => {
      try {
        const message = await deleteMessage({ messageId });
        const payload = {
          messageId,
          conversationId: message.conversation.toString(),
        };
        io.to(`conversation:${payload.conversationId}`).emit("message:deleted", payload);
        if (callback) callback({ ok: true, ...payload });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });

    socket.on("reaction:toggle", async ({ messageId, emoji, actorType }, callback) => {
      try {
        const message = await toggleReaction({ messageId, emoji, actorType });
        const serialized = serializeMessage(message);
        io.to(`conversation:${serialized.conversationId}`).emit("message:reaction", serialized);
        if (callback) callback({ ok: true, message: serialized });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:mute", async ({ conversationId, actorType, muted }, callback) => {
      try {
        const conversation = await setConversationMuteState(conversationId, actorType, muted);
        const serialized = serializeConversation(conversation, []);
        const room = `conversation:${serialized.id}`;
        io.to(room).emit("conversation:muted", {
          conversation: serialized,
          actorType,
          muted: serialized.mutedBy?.[actorType] ?? Boolean(muted),
        });
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
        if (callback) callback({ ok: true, conversation: serialized });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:delivered", async ({ conversationId, viewerType }, callback) => {
      try {
        const conversation = await markConversationDelivered(conversationId, viewerType);
        const payload = {
          conversationId: conversation._id.toString(),
          viewerType,
        };
        io.to(`conversation:${payload.conversationId}`).emit("conversation:delivered", payload);
        if (callback) callback({ ok: true, ...payload });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:read", async ({ conversationId, viewerType }, callback) => {
      try {
        const conversation = await markConversationRead(conversationId, viewerType);
        const payload = {
          conversationId: conversation._id.toString(),
          viewerType,
        };
        io.to(`conversation:${payload.conversationId}`).emit("conversation:read", payload);
        if (callback) callback({ ok: true, ...payload });
      } catch (error) {
        if (callback) callback({ ok: false, message: error.message });
        else socket.emit("error", { message: error.message });
      }
    });
  });
};

const DEFAULT_SOCKET_TRANSPORTS = ["websocket", "polling"];

const initializeSocket = (server, corsOptions = {}) => {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials = true,
    allowedHeaders = ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
    transports = DEFAULT_SOCKET_TRANSPORTS,
    maxHttpBufferSize,
    pingTimeout,
    pingInterval,
  } = corsOptions;

  const io = new Server(server, {
    cors: {
      origin,
      methods,
      credentials,
      allowedHeaders,
    },
    transports,
    ...(maxHttpBufferSize ? { maxHttpBufferSize } : {}),
    ...(pingTimeout ? { pingTimeout } : {}),
    ...(pingInterval ? { pingInterval } : {}),
  });

  registerSocketHandlers(io);
  return io;
};

module.exports = {
  initializeSocket,
};


