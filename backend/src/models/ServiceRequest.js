import mongoose from "mongoose";

const ServiceRequestSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    service: { type: String, required: true },
    problem: { type: String, required: true },
    location: { type: String, default: "" },
    preferredDate: { type: String, default: "" },
    preferredTime: { type: String, default: "anytime" },
    urgency: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    status: { type: String, enum: ["open", "matched", "fulfilled", "cancelled"], default: "open" }
  },
  { timestamps: true }
);

export default mongoose.model("ServiceRequest", ServiceRequestSchema);
