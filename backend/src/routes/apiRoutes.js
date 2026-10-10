import { Router } from "express";
import {
  getHealth,
  getReadiness,
  getProviders,
  matchProviders,
  createBooking,
  getBookings,
  updateBookingStatus,
  parseAIRequest
} from "../controllers/apiController.js";
import { register, login } from "../controllers/authController.js";
import {
  getAdminStats,
  listUsersAdmin,
  listAbuseReportsAdmin,
  provisionUser
} from "../controllers/adminController.js";
import { authenticateToken, authorizeRoles } from "../middleware/authMiddleware.js";
import { authLimiter, registerLimiter, adminProvisionLimiter } from "../middleware/rateLimitMiddleware.js";
import { submitReview } from "../services/reviewService.js";
import { getUserNotifications, markNotificationsAsRead } from "../services/notificationService.js";

const router = Router();

// ── Public Endpoints ─────────────────────────────────────────────────────────
router.get("/health", getHealth);
router.get("/ready", getReadiness);
router.get("/providers", getProviders);
router.post("/match", matchProviders);
router.post("/ai/parse-request", parseAIRequest);

// ── Auth Endpoints (Protected by rate limiting; registration forces customer role) ──
router.post("/auth/register", registerLimiter, register);
router.post("/auth/login", authLimiter, login);

// ── Booking Routes — all require a valid token ───────────────────────────────
// Creation is restricted to customers only.
router.post("/bookings", authenticateToken, authorizeRoles("customer"), createBooking);
// Retrieval: authenticated users see only their own bookings (enforced in controller).
router.get("/bookings", authenticateToken, getBookings);
// Status update: customers and providers can transition; admin may also.
router.patch("/bookings/:id/status", authenticateToken, authorizeRoles("customer", "provider", "admin"), updateBookingStatus);

// ── Review Endpoint ──────────────────────────────────────────────────────────
router.post("/reviews", authenticateToken, async (req, res) => {
  try {
    const { bookingId, providerId, rating, comment } = req.body || {};

    if (!bookingId || !providerId || rating === undefined || rating === null) {
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "bookingId, providerId, and numeric rating are required."
      });
    }

    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "Rating must be a number between 1 and 5."
      });
    }

    if (typeof comment === "string" && comment.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "Comment cannot exceed 1000 characters."
      });
    }

    const review = await submitReview(req.user.id, {
      bookingId,
      providerId,
      rating: numericRating,
      comment: typeof comment === "string" ? comment : ""
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review
    });
  } catch (err) {
    const isConflict = err.message.includes("Duplicate");
    const isForbidden = err.message.includes("Unauthorized");
    const status = err.statusCode || (isConflict ? 409 : isForbidden ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: err.code || (isConflict ? "Conflict" : isForbidden ? "Forbidden" : "ReviewError"),
      message: status === 503 ? "Database is unavailable." : err.message
    });
  }
});

// ── Notifications Endpoints ─────────────────────────────────────────────────
router.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const notifs = await getUserNotifications(req.user.id);
    return res.status(200).json({ success: true, count: notifs.length, data: notifs });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: err.code || "NotificationError",
      message: status === 503 ? "Database is unavailable." : "Unable to retrieve notifications."
    });
  }
});

router.post("/notifications/read", authenticateToken, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length > 100) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Cannot mark more than 100 notifications as read at once."
    });
  }
  try {
    await markNotificationsAsRead(req.user.id, ids);
    return res.status(200).json({ success: true, message: "Notifications marked as read" });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: err.code || "NotificationError",
      message: status === 503 ? "Database is unavailable." : "Unable to update notifications."
    });
  }
});

// ── Admin Routes (Protected by Token & Role) ─────────────────────────────────
router.get("/admin/stats", authenticateToken, authorizeRoles("admin"), getAdminStats);
router.get("/admin/users", authenticateToken, authorizeRoles("admin"), listUsersAdmin);
router.get("/admin/reports", authenticateToken, authorizeRoles("admin"), listAbuseReportsAdmin);
// Privileged user provisioning (provider/admin/customer)
router.post("/admin/users", authenticateToken, authorizeRoles("admin"), adminProvisionLimiter, provisionUser);
router.post("/admin/provision-user", authenticateToken, authorizeRoles("admin"), adminProvisionLimiter, provisionUser);

export default router;
