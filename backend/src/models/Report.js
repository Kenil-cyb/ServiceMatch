import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["review", "user", "provider"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
    details: { type: String, default: "" },
    status: { type: String, enum: ["pending", "reviewed", "dismissed", "actioned"], default: "pending" }
  },
  { timestamps: true }
);

export default mongoose.model("Report", ReportSchema);
