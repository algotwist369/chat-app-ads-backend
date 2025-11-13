const mongoose = require("mongoose");

const { Schema } = mongoose;

const AttachmentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["image", "file", "audio", "video", "link", "other"],
      default: "other",
    },
    name: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
      min: 0,
      default: null,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    preview: {
      type: String,
      default: null,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => ({}),
    },
    storagePath: {
      type: String,
      trim: true,
      select: true,
    },
  },
  { _id: false },
);

const ReactionSchema = new Schema(
  {
    emoji: {
      type: String,
      required: true,
      trim: true,
    },
    managerReacted: {
      type: Boolean,
      default: false,
    },
    customerReacted: {
      type: Boolean,
      default: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const ReplySnapshotSchema = new Schema(
  {
    message: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    authorType: {
      type: String,
      enum: ["manager", "customer", "system"],
    },
    authorName: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      trim: true,
    },
    hasMedia: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const DeliveryStateSchema = new Schema(
  {
    manager: {
      status: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent",
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    customer: {
      status: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent",
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { _id: false },
);

const buildDefaultDeliveryState = () => ({
  manager: {
    status: "sent",
    updatedAt: null,
  },
  customer: {
    status: "sent",
    updatedAt: null,
  },
});

const MessageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    authorType: {
      type: String,
      enum: ["manager", "customer", "system"],
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      refPath: "authorModel",
    },
    authorModel: {
      type: String,
      enum: ["Manager", "Customer"],
      required: function isRequired() {
        return this.authorType !== "system";
      },
    },
    content: {
      type: String,
      trim: true,
      default: "",
      maxlength: parseInt(process.env.MESSAGE_MAX_LENGTH ?? "2000", 10),
    },
    attachments: {
      type: [AttachmentSchema],
      default: () => [],
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    deliveryState: {
      type: DeliveryStateSchema,
      default: buildDefaultDeliveryState,
    },
    reactions: {
      type: [ReactionSchema],
      default: () => [],
    },
    replyTo: {
      type: ReplySnapshotSchema,
      default: null,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for common query patterns
MessageSchema.index({ conversation: 1, createdAt: 1 }); // For chronological message retrieval
MessageSchema.index({ conversation: 1, createdAt: -1 }); // For reverse chronological (newest first)
MessageSchema.index({ conversation: 1, authorType: 1, createdAt: -1 }); // For auto-chat queries
MessageSchema.index({ author: 1 });
MessageSchema.index({ conversation: 1, authorType: 1 }); // For filtering by author type

module.exports = mongoose.models.Message || mongoose.model("Message", MessageSchema);


