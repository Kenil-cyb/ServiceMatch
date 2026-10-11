import mongoose from "mongoose";

const ProviderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    seedKey: { type: String, trim: true },
    isDemoData: { type: Boolean, default: false },
    name: { type: String, required: true, trim: true },
    service: { type: String, required: true },
    skills: [{ type: String }],
    services: [{ type: String }],
    experience: { type: Number, default: 0 },
    location: { type: String, default: "Local Area" },
    coordinates: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 }
    },
    distance: { type: Number, default: 2.0 },
    available: { type: Boolean, default: true },
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    price: { type: Number, required: true },
    qualityScore: { type: Number, default: 85 },
    initials: { type: String },
    color: { type: String, default: "#dbeafe" }
  },
  { timestamps: true }
);

ProviderSchema.index({ service: 1 });
ProviderSchema.index({ available: 1 });
ProviderSchema.index({ seedKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("Provider", ProviderSchema);
