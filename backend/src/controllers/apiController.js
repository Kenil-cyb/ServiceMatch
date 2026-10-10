import mongoose from "mongoose";
import Provider from "../models/Provider.js";
import Booking from "../models/Booking.js";
import ServiceRequest from "../models/ServiceRequest.js";
import { demoProviders, demoBookings } from "../data/providers.js";
import { rankProviders } from "../services/matchingService.js";
import { parseServiceRequestAI } from "../services/aiService.js";
import {
  createDatabaseUnavailableError,
  isDBConnected,
  isDemoMode,
  sendDatabaseUnavailable
} from "../config/db.js";

/**
 * Valid booking status transitions.
 * Customers may cancel their own bookings.
 * Providers may accept, reject, or mark completed.
 */
const VALID_TRANSITIONS = {
  requested: ["accepted", "rejected", "cancelled"],
  accepted: ["completed", "cancelled"],
  rejected: [],
  completed: [],
  cancelled: []
};

/**
 * Allowed statuses for the status field validation.
 */
const ALLOWED_STATUSES = new Set(Object.keys(VALID_TRANSITIONS));

/**
 * Controller for GET /api/health
 */
export function getHealth(req, res) {
  const connected = isDBConnected();
  const demoMode = isDemoMode();
  const database = connected ? "connected" : demoMode ? "demo_fallback" : "disconnected";
  const healthy = database !== "disconnected";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    application: "operational",
    message: "ServiceMatch AI Backend API is operational",
    database,
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
}

/**
 * Controller for GET /api/ready
 */
export function getReadiness(req, res) {
  const connected = isDBConnected();
  const demoMode = isDemoMode();
  const database = connected ? "connected" : demoMode ? "demo_fallback" : "disconnected";
  const ready = database !== "disconnected";
  return res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    application: "operational",
    database,
    timestamp: new Date().toISOString()
  });
}

/**
 * Controller for GET /api/providers
 */
export async function getProviders(req, res) {
  try {
    if (isDBConnected()) {
      const providers = await Provider.find({}).lean();
      const formatted = providers.map(p => ({
        ...p,
        id: p._id.toString()
      }));
      return res.status(200).json({ success: true, count: formatted.length, data: formatted });
    }

    if (!isDemoMode()) return sendDatabaseUnavailable(res);
    return res.status(200).json({ success: true, count: demoProviders.length, data: demoProviders });
  } catch (err) {
    return res.status(500).json({ success: false, error: "DatabaseError", message: err.message });
  }
}

/**
 * Controller for POST /api/ai/parse-request
 */
export async function parseAIRequest(req, res) {
  const { query = "" } = req.body || {};

  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Query text cannot be empty."
    });
  }

  if (query.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Query text cannot exceed 1000 characters."
    });
  }

  const structured = await parseServiceRequestAI(query);
  res.status(200).json({
    success: true,
    data: structured
  });
}

/**
 * Controller for POST /api/match
 */
export async function matchProviders(req, res) {
  const { query = "", selectedService = "", strictAvailability = false, useAI = true } = req.body || {};

  if (typeof query === "string" && query.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Query text cannot exceed 1000 characters."
    });
  }

  let targetService = selectedService;
  let targetQuery = query;
  let aiStructuredData = null;

  if (query.trim() && useAI) {
    aiStructuredData = await parseServiceRequestAI(query);
    if (!targetService) {
      targetService = aiStructuredData.service;
    }
  }

  let catalog = [];
  if (isDBConnected()) {
    const dbProviders = await Provider.find({}).lean();
    catalog = dbProviders.map(p => ({ ...p, id: p._id.toString() }));
  } else {
    if (!isDemoMode()) return sendDatabaseUnavailable(res);
    catalog = [...demoProviders];
  }

  const rankedResults = rankProviders(
    catalog,
    { query: targetQuery, selectedService: targetService },
    { strictAvailability: Boolean(strictAvailability) }
  );

  res.status(200).json({
    success: true,
    count: rankedResults.length,
    query: { query: targetQuery, selectedService: targetService },
    aiInterpretation: aiStructuredData,
    data: rankedResults
  });
}

/**
 * Controller for POST /api/bookings (Create Booking)
 * 
 * Security guarantees enforced here:
 *  - customerId is always derived from the authenticated JWT (req.user.id).
 *  - The price is looked up from the authoritative provider record; the
 *    client-supplied price is ignored unless running in explicit demo mode
 *    where no DB provider record exists.
 *  - providerName is sourced from the authoritative provider record.
 *  - If DB is connected and the write fails, we return a 500 — no silent
 *    fallback to in-memory storage.
 *  - In explicit demo mode (DB not connected) the response is labelled
 *    isDemoMode: true so the caller is aware.
 */
export async function createBooking(req, res) {
  // customerId comes from the verified token, never from the request body.
  const customerId = req.user.id;

  const { providerId, service, date = "", time = "" } = req.body || {};

  if (!providerId || !service) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "providerId and service fields are required."
    });
  }

  if (typeof service !== "string" || !service.trim() || service.trim().length > 100) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "service must be a non-empty string under 100 characters."
    });
  }

  if (typeof date === "string" && date.length > 50) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "date cannot exceed 50 characters."
    });
  }

  if (typeof time === "string" && time.length > 50) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "time cannot exceed 50 characters."
    });
  }

  const generatedId = `SM${Date.now().toString().slice(-6)}`;

  // ── DB-connected path ────────────────────────────────────────────────────
  if (isDBConnected()) {
    // Validate that the provider actually exists in the database.
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "providerId must be a valid ObjectId when connected to a database."
      });
    }

    const providerRecord = await Provider.findById(providerId).lean();
    if (!providerRecord) {
      return res.status(404).json({
        success: false,
        error: "NotFound",
        message: `Provider with ID '${providerId}' not found.`
      });
    }

    // Price is sourced from the database; client-supplied price is ignored.
    const serverPrice = providerRecord.price ?? 0;
    const providerName = providerRecord.name;

    try {
      const dbBooking = await Booking.create({
        bookingId: generatedId,
        customerId,
        providerId: providerRecord._id,
        providerName,
        service: service.trim(),
        price: serverPrice,
        date,
        time,
        status: "requested"
      });

      return res.status(201).json({
        success: true,
        message: "Booking request submitted successfully",
        data: {
          ...dbBooking.toObject(),
          id: dbBooking.bookingId,
          provider: dbBooking.providerName
        }
      });
    } catch (err) {
      // Do NOT fall back to in-memory storage. Surface the error so the
      // caller knows the booking was NOT persisted.
      console.error("DB booking create error:", err.message);
      return res.status(500).json({
        success: false,
        error: "DatabaseError",
        message: "Booking could not be saved. Please try again."
      });
    }
  }

  if (!isDemoMode()) return sendDatabaseUnavailable(res);

  // ── Demo-mode path (DB not connected) ───────────────────────────────────
  // Look up the provider in the in-memory demo catalogue to derive the
  // authoritative price. Accept a numeric id or a string.
  const demoProvider = demoProviders.find(
    p => String(p.id) === String(providerId) || p.name === providerId
  );

  if (!demoProvider) {
    return res.status(404).json({
      success: false,
      error: "NotFound",
      message: `Demo provider '${providerId}' not found.`
    });
  }

  const bookingData = {
    bookingId: generatedId,
    id: generatedId,
    customerId,
    providerId: String(demoProvider.id),
    provider: demoProvider.name,
    providerName: demoProvider.name,
    service: service.trim(),
    // Price is sourced from the demo catalogue record.
    price: demoProvider.price ?? 0,
    date,
    time,
    status: "requested",
    isDemoMode: true,
    createdAt: new Date().toISOString()
  };

  demoBookings.unshift(bookingData);
  return res.status(201).json({
    success: true,
    message: "Booking request submitted (demo mode — not persisted to database)",
    isDemoMode: true,
    data: bookingData
  });
}

/**
 * Controller for GET /api/bookings (Get User / All Bookings)
 * 
 * Authorization rules:
 *  - Customers see only their own bookings.
 *  - Providers see only bookings assigned to them.
 *  - Admins see all bookings.
 */
export async function getBookings(req, res) {
  if (isDBConnected()) {
    let queryFilter = {};
    if (req.user.role === "customer") {
      queryFilter = { customerId: req.user.id };
    } else if (req.user.role === "provider") {
      queryFilter = { providerId: req.user.id };
    }
    // role === "admin" → no filter (sees everything)

    const bookings = await Booking.find(queryFilter).sort({ createdAt: -1 }).lean();
    const formatted = bookings.map(b => ({
      ...b,
      id: b.bookingId,
      provider: b.providerName
    }));
    return res.status(200).json({ success: true, count: formatted.length, data: formatted });
  }

  if (!isDemoMode()) return sendDatabaseUnavailable(res);

  // Demo mode: filter by customerId string from token
  const filtered = demoBookings.filter(b => String(b.customerId) === String(req.user.id));
  return res.status(200).json({ success: true, count: filtered.length, data: filtered, isDemoMode: true });
}

/**
 * Controller for PATCH /api/bookings/:id/status (Workflow Status Transition)
 * 
 * Authorization rules:
 *  - Customers may only cancel bookings they created.
 *  - Providers may accept, reject, or complete bookings assigned to them.
 *  - Admins may perform any valid transition.
 */
export async function updateBookingStatus(req, res) {
  const { id } = req.params;
  const { status: newStatus } = req.body || {};

  if (!newStatus) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Target status is required."
    });
  }

  // Validate the requested status value before hitting the DB.
  if (!ALLOWED_STATUSES.has(newStatus.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: `'${newStatus}' is not a recognised booking status. Allowed: [${[...ALLOWED_STATUSES].join(", ")}]`
    });
  }

  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) return sendDatabaseUnavailable(res);

  let targetBooking = null;
  if (dbConnected) {
    targetBooking = await Booking.findOne({
      $or: [
        { bookingId: id },
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null }
      ]
    });
  } else {
    targetBooking = demoBookings.find(b => b.id === id || b.bookingId === id);
  }

  if (!targetBooking) {
    return res.status(404).json({
      success: false,
      error: "NotFound",
      message: `Booking with ID '${id}' not found.`
    });
  }

  // ── Authorization check ──────────────────────────────────────────────────
  if (req.user.role !== "admin") {
    const isOwnerCustomer =
      req.user.role === "customer" &&
      targetBooking.customerId?.toString() === req.user.id;

    const isAssignedProvider =
      req.user.role === "provider" &&
      targetBooking.providerId?.toString() === req.user.id;

    if (!isOwnerCustomer && !isAssignedProvider) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You are not authorized to update this booking record."
      });
    }

    // Additional role-level transition restrictions:
    // Customers can only cancel.
    if (req.user.role === "customer" && newStatus.toLowerCase() !== "cancelled") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Customers may only cancel their own bookings."
      });
    }
    // Providers cannot cancel (only accept, reject, or complete).
    if (req.user.role === "provider" && newStatus.toLowerCase() === "cancelled") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Providers cannot cancel bookings. Only customers or admins may do that."
      });
    }
  }

  // ── State machine validation ─────────────────────────────────────────────
  const currentStatus = targetBooking.status.toLowerCase();
  const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowedNextStatuses.includes(newStatus.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: "InvalidStateTransition",
      message: `Cannot transition booking status from '${currentStatus}' to '${newStatus}'. Allowed transitions: [${allowedNextStatuses.join(", ")}]`
    });
  }

  if (dbConnected) {
    targetBooking.status = newStatus.toLowerCase();
    await targetBooking.save();
    return res.status(200).json({
      success: true,
      message: `Booking status updated to ${newStatus}`,
      data: { ...targetBooking.toObject(), id: targetBooking.bookingId, provider: targetBooking.providerName }
    });
  }

  // Demo mode
  targetBooking.status = newStatus.toLowerCase();
  return res.status(200).json({
    success: true,
    message: `Booking status updated to ${newStatus}`,
    isDemoMode: true,
    data: targetBooking
  });
}
