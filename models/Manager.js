const mongoose = require("mongoose");

const { Schema } = mongoose;

const ManagerSchema = new Schema(
  {
    managerName: {
      type: String,
      required: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessSlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    contactEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    mobileNumber: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      default: null,
    },
    inviteToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    metadata: {
      timezone: {
        type: String,
        default: null,
      },
      locale: {
        type: String,
        default: "en-US",
      },
    },
  },
  {
    timestamps: true,
  },
);

ManagerSchema.index({ businessSlug: 1 });
ManagerSchema.index({ contactEmail: 1 });
ManagerSchema.index({ inviteToken: 1 }, { sparse: true });

module.exports = mongoose.models.Manager || mongoose.model("Manager", ManagerSchema);


