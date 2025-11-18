const mongoose = require("mongoose");

const { Schema } = mongoose;

const RefreshTokenSchema = new Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userType: {
      type: String,
      enum: ["manager", "customer"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired tokens
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient lookups
RefreshTokenSchema.index({ userId: 1, userType: 1 });

module.exports = mongoose.models.RefreshToken || mongoose.model("RefreshToken", RefreshTokenSchema);

