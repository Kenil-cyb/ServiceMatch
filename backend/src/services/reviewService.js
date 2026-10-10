import mongoose from "mongoose";
import Review from "../models/Review.js";
import Booking from "../models/Booking.js";
import Provider from "../models/Provider.js";
import Report from "../models/Report.js";
import { createDatabaseUnavailableError, isDBConnected, isDemoMode } from "../config/db.js";

const fallbackReviews = [];

/**
 * Submits a customer review for a completed booking with eligibility and fraud controls
 */
export async function submitReview(customerId, { bookingId, providerId, rating, comment = "" }) {
  if (!customerId || !bookingId || !providerId || typeof rating !== "number") {
    throw new Error("Missing required review fields: customerId, bookingId, providerId, and numeric rating.");
  }

  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }

  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) throw createDatabaseUnavailableError();

  if (dbConnected) {
    // 1. Verified booking eligibility check
    const booking = await Booking.findOne({
      $or: [
        { bookingId },
        { _id: mongoose.Types.ObjectId.isValid(bookingId) ? bookingId : null }
      ]
    });
    if (!booking) {
      throw new Error("Booking record not found.");
    }

    if (booking.customerId?.toString() !== customerId.toString()) {
      throw new Error("Unauthorized: Only the customer who placed this booking can review it.");
    }

    if (booking.status !== "completed") {
      throw new Error("Review Fraud Control: Reviews can only be submitted for completed bookings.");
    }

    // 2. Duplicate review prevention
    const existingReview = await Review.findOne({ bookingId: booking._id });
    if (existingReview) {
      throw new Error("Duplicate Review Prevention: A review has already been submitted for this booking.");
    }

    // 3. Create review
    const newReview = await Review.create({
      customerId,
      providerId: booking.providerId || providerId,
      bookingId: booking._id,
      rating,
      comment,
      aiAnalysis: {
        sentiment: rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative",
        summary: comment ? comment.slice(0, 50) : "Customer rating"
      }
    });

    // 4. Recalculate provider aggregate rating and quality metrics
    await recalculateProviderMetrics(providerId);

    return newReview;
  }

  // Fallback in-memory logic
  const existingReview = fallbackReviews.find(r => r.bookingId.toString() === bookingId.toString());
  if (existingReview) {
    throw new Error("Duplicate Review Prevention: A review has already been submitted for this booking.");
  }

  const newReview = {
    _id: `rev_${Date.now()}`,
    customerId,
    providerId,
    bookingId,
    rating,
    comment,
    createdAt: new Date().toISOString()
  };
  fallbackReviews.push(newReview);
  return newReview;
}

/**
 * Recalculates provider aggregate rating and quality metrics from stored reviews
 */
export async function recalculateProviderMetrics(providerId) {
  if (!isDBConnected() || !providerId) return;

  try {
    const reviews = await Review.find({ providerId });
    if (reviews.length === 0) return;

    const totalStars = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = Math.round((totalStars / reviews.length) * 10) / 10;

    // Quality score recalculation: 60% rating score + 40% completion volume bonus
    const ratingScoreComponent = (avgRating / 5.0) * 100;
    const completionBonus = Math.min(20, reviews.length * 2);
    const newQualityScore = Math.min(100, Math.round(ratingScoreComponent * 0.8 + completionBonus));

    await Provider.findByIdAndUpdate(providerId, {
      rating: avgRating,
      reviewsCount: reviews.length,
      qualityScore: newQualityScore
    });
  } catch (err) {
    console.warn("Failed to recalculate provider metrics:", err.message);
  }
}

/**
 * Creates an abuse report for suspicious reviews or accounts
 */
export async function submitAbuseReport(reporterId, { targetType, targetId, reason, details }) {
  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) throw createDatabaseUnavailableError();

  if (dbConnected) {
    return await Report.create({
      reporterId,
      targetType,
      targetId,
      reason,
      details
    });
  }
  return { id: `rep_${Date.now()}`, reporterId, targetType, targetId, reason, status: "pending" };
}
