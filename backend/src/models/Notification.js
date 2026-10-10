import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["booking_requested", "booking_accepted", "booking_rejected", "booking_cancelled", "booking_completed", "system"],
      default: "system"
    },
    read: { type: Boolean, default: false },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1 });

export default mongoose.model("Notification", NotificationSchema);
