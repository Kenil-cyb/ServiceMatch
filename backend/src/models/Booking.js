import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", default: null },
    providerName: { type: String, required: true },
    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
    service: { type: String, required: true },
    price: { type: Number, required: true },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    status: {
      type: String,
      enum: ["requested", "accepted", "rejected", "completed", "cancelled"],
      default: "requested"
    }
  },
  { timestamps: true }
);

BookingSchema.index({ customerId: 1 });
BookingSchema.index({ providerId: 1 });
BookingSchema.index({ status: 1 });

export default mongoose.model("Booking", BookingSchema);
