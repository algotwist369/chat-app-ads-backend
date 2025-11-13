const mongoose = require("mongoose");

const { Schema } = mongoose;

const ConversationMetadataSchema = new Schema(
  {
    managerName: {
      type: String,
      trim: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    customerPhone: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
    bookingData: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
    strict: false, // Allow additional fields for flexibility
  },
);

const ConversationSchema = new Schema(
  {
    manager: {
      type: Schema.Types.ObjectId,
      ref: "Manager",
      required: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    metadata: {
      type: ConversationMetadataSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: ["open", "pending", "resolved", "archived"],
      default: "open",
    },
    unreadByManager: {
      type: Number,
      min: 0,
      default: 0,
    },
    unreadByCustomer: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessageSnippet: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: () => [],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    mutedForManager: {
      type: Boolean,
      default: false,
    },
    mutedForCustomer: {
      type: Boolean,
      default: false,
    },
    autoChatEnabled: {
      type: Boolean,
      default: true,
    },
    autoChatMessageCount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Unique compound index for manager-customer pairs
ConversationSchema.index({ manager: 1, customer: 1 }, { unique: true });
// Indexes for common query patterns
ConversationSchema.index({ manager: 1, updatedAt: -1 }); // For manager's conversation list
ConversationSchema.index({ customer: 1, updatedAt: -1 }); // For customer's conversation lookup
ConversationSchema.index({ status: 1 });
ConversationSchema.index({ mutedForManager: 1 });
ConversationSchema.index({ mutedForCustomer: 1 });
ConversationSchema.index({ autoChatEnabled: 1, updatedAt: -1 }); // For auto-chat enabled conversations
ConversationSchema.index({ createdAt: -1 }); // For new conversation queries

module.exports =
  mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);


