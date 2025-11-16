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

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map();

const notifyPresenceChange = (io, userId, userType, isOnline) => {
  const presenceEvent = {
    userId,
    userType,
    isOnline,
    timestamp: new Date().toISOString(),
  };

  // Notify manager's room if it's a customer going online/offline
  if (userType === "customer") {
    // Broadcast presence update so both participants listening can update UI
    io.emit("presence:update", presenceEvent);
  } else if (userType === "manager") {
    // Broadcast presence update so both participants listening can update UI
    io.emit("presence:update", presenceEvent);
  }
};

const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    socket.on("session:init", ({ managerId, customerId }) => {
      if (managerId) {
        socket.join(`manager:${managerId}`);
        socket.data.managerId = managerId;
        
        // Track manager as online
        const managerKey = `manager:${managerId}`;
        const wasAlreadyOnline = onlineUsers.has(managerKey) && onlineUsers.get(managerKey).size > 0;
        
        if (!onlineUsers.has(managerKey)) {
          onlineUsers.set(managerKey, new Set());
        }
        onlineUsers.get(managerKey).add(socket.id);
        
        // Only notify if manager just came online (wasn't online before)
        if (!wasAlreadyOnline) {
          notifyPresenceChange(io, managerId, "manager", true);
        }
      }
      if (customerId) {
        socket.join(`customer:${customerId}`);
        socket.data.customerId = customerId;
        
        // Track customer as online
        const customerKey = `customer:${customerId}`;
        const wasAlreadyOnline = onlineUsers.has(customerKey) && onlineUsers.get(customerKey).size > 0;
        
        if (!onlineUsers.has(customerKey)) {
          onlineUsers.set(customerKey, new Set());
        }
        onlineUsers.get(customerKey).add(socket.id);
        
        // Only notify if customer just came online (wasn't online before)
        if (!wasAlreadyOnline) {
          notifyPresenceChange(io, customerId, "customer", true);
        }
      }
    });

    // Allow clients to query current presence synchronously
    socket.on("presence:query", ({ managerId, customerId }, callback) => {
      const result = {};
      try {
        if (managerId) {
          const key = `manager:${managerId}`;
          result.manager = Boolean(onlineUsers.has(key) && onlineUsers.get(key).size > 0);
        }
        if (customerId) {
          const key = `customer:${customerId}`;
          result.customer = Boolean(onlineUsers.has(key) && onlineUsers.get(key).size > 0);
        }
        if (callback) callback({ ok: true, ...result });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
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
        
        // If customer sent a message and auto-chat is enabled, process auto-response
        if (payload.authorType === "customer" && serialized.conversationId) {
          const { processCustomerMessage } = require("../services/autoChatService");
          const { Conversation } = require("../models");
          const conversation = await Conversation.findById(serialized.conversationId).select("autoChatEnabled manager customer");
          
          if (conversation && conversation.autoChatEnabled) {
            // Process auto-response asynchronously
            processCustomerMessage(serialized.conversationId, payload.content, payload.action)
              .then((autoResponse) => {
                if (autoResponse) {
                  const autoSerialized = serializeMessage(autoResponse);
                  io.to(room).emit("message:new", autoSerialized);
                  
                  // Update conversation
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

    // Handle disconnect
    socket.on("disconnect", () => {
      const managerId = socket.data.managerId;
      const customerId = socket.data.customerId;

      if (managerId) {
        const managerKey = `manager:${managerId}`;
        const sockets = onlineUsers.get(managerKey);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineUsers.delete(managerKey);
            // Manager went offline
            notifyPresenceChange(io, managerId, "manager", false);
          }
        }
      }

      if (customerId) {
        const customerKey = `customer:${customerId}`;
        const sockets = onlineUsers.get(customerKey);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineUsers.delete(customerKey);
            // Customer went offline
            notifyPresenceChange(io, customerId, "customer", false);
          }
        }
      }
    });
  });
};

const initializeSocket = (server, corsOptions = {}) => {
  const io = new Server(server, {
    cors: {
      origin: corsOptions.origin ?? "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  registerSocketHandlers(io);
  return io;
};

module.exports = {
  initializeSocket,
};


