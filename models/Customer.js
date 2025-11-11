const mongoose = require("mongoose");

const { Schema } = mongoose;

const CustomerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    manager: {
      type: Schema.Types.ObjectId,
      ref: "Manager",
      required: true,
      index: true,
    },
    businessSlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    inviteSource: {
      /**
       * Stores the invite token or campaign that produced this customer.
       */
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "blocked", "archived"],
      default: "active",
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Map,
      of: String,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

CustomerSchema.index({ manager: 1, phone: 1 }, { unique: false });
CustomerSchema.index({ manager: 1, email: 1 }, { sparse: true });

module.exports = mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);


