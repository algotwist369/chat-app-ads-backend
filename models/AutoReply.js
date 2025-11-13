const mongoose = require("mongoose");

const { Schema } = mongoose;

const AutoReplySchema = new Schema(
  {
    manager: {
      type: Schema.Types.ObjectId,
      ref: "Manager",
      required: true,
      unique: true, // unique: true automatically creates an index, so we don't need index: true
    },
    welcomeMessage: {
      content: {
        type: String,
        trim: true,
        default: "",
      },
      quickReplies: {
        type: [
          {
            text: String,
            action: String,
          },
        ],
        default: [],
      },
    },
    services: {
      type: [
        {
          name: { type: String, required: true },
          description: { type: String, default: "" },
          action: { type: String, required: true },
        },
      ],
      default: [],
    },
    timeSlots: {
      type: [
        {
          label: { type: String, required: true },
          action: { type: String, required: true },
        },
      ],
      default: [],
    },
    responses: {
      claimOffer: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      servicesPricing: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      bookNow: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      serviceSelected: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      bookingConfirmed: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      location: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      callSpa: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      talkWithManager: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      thankYou: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      greeting: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
      default: {
        content: { type: String, default: "" },
        quickReplies: {
          type: [
            {
              text: String,
              action: String,
            },
          ],
          default: [],
        },
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
// Note: manager field already has unique: true which creates an index
AutoReplySchema.index({ manager: 1, isActive: 1 }); // Compound index for getAutoReplyConfig queries

module.exports = mongoose.models.AutoReply || mongoose.model("AutoReply", AutoReplySchema);

