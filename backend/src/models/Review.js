import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "" },
    aiAnalysis: {
      sentiment: { type: String, enum: ["positive", "neutral", "negative"], default: "positive" },
      summary: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

export default mongoose.model("Review", ReviewSchema);
