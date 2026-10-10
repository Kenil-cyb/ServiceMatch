import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Provider from "../models/Provider.js";
import Booking from "../models/Booking.js";
import Report from "../models/Report.js";
import { isDBConnected, isDemoMode, sendDatabaseUnavailable } from "../config/db.js";
import { fallbackUsers, validateName, validateEmail, validatePassword } from "./authController.js";

const ALLOWED_PROVISION_ROLES = ["provider", "admin", "customer"];

/**
 * GET /api/admin/stats
 */
export async function getAdminStats(req, res) {
  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) return sendDatabaseUnavailable(res);

  if (dbConnected) {
    const totalUsers = await User.countDocuments({});
    const totalProviders = await Provider.countDocuments({});
    const totalBookings = await Booking.countDocuments({});
    const pendingReports = await Report.countDocuments({ status: "pending" });

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalProviders,
        totalBookings,
        pendingReports,
        timestamp: new Date().toISOString()
      }
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      totalUsers: 12,
      totalProviders: 4,
      totalBookings: 8,
      pendingReports: 0,
      isDemoMode: true
    }
  });
}

/**
 * GET /api/admin/users (With Pagination and sanitized inputs)
 */
export async function listUsersAdmin(req, res) {
  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) return sendDatabaseUnavailable(res);

  let page = parseInt(req.query.page, 10);
  let limit = parseInt(req.query.limit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 100) limit = 100; // Upper limit enforcement

  if (dbConnected) {
    const skip = (page - 1) * limit;
    const users = await User.find({}).select("-passwordHash").skip(skip).limit(limit).lean();
    const total = await User.countDocuments({});

    return res.status(200).json({
      success: true,
      page,
      pages: Math.ceil(total / limit) || 1,
      total,
      data: users
    });
  }

  return res.status(200).json({
    success: true,
    page: 1,
    pages: 1,
    total: 0,
    data: []
  });
}

/**
 * GET /api/admin/reports
 */
export async function listAbuseReportsAdmin(req, res) {
  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) return sendDatabaseUnavailable(res);

  if (dbConnected) {
    const reports = await Report.find({}).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: reports.length, data: reports });
  }
  return res.status(200).json({ success: true, count: 0, data: [] });
}

/**
 * POST /api/admin/users
 * Secure admin-only provisioning route for privileged accounts (provider/admin/customer).
 */
export async function provisionUser(req, res) {
  const { name, email, password, role, service, price, skills } = req.body || {};

  // 1. Role validation
  if (!role || !ALLOWED_PROVISION_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: `Invalid role '${role}'. Allowed roles are: ${ALLOWED_PROVISION_ROLES.join(", ")}.`
    });
  }

  // 2. Name validation
  const nameCheck = validateName(name);
  if (!nameCheck.isValid) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: nameCheck.message
    });
  }

  // 3. Email validation
  const emailCheck = validateEmail(email);
  if (!emailCheck.isValid) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: emailCheck.message
    });
  }

  // 4. Password validation
  const passCheck = validatePassword(password);
  if (!passCheck.isValid) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: passCheck.message
    });
  }

  // 5. Provider-specific requirements
  if (role === "provider" && (!service || typeof service !== "string" || !service.trim())) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Service specialty is required when provisioning a provider."
    });
  }

  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) return sendDatabaseUnavailable(res);

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  if (dbConnected) {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Conflict",
        message: "An account with this email address already exists."
      });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role
    });

    let createdProvider = null;
    if (role === "provider") {
      createdProvider = await Provider.create({
        userId: newUser._id,
        name: name.trim(),
        service: service.trim(),
        skills: Array.isArray(skills) ? skills : [service.trim()],
        price: typeof price === "number" && price > 0 ? price : 499,
        available: true
      });
    }

    return res.status(201).json({
      success: true,
      message: `Privileged account '${role}' provisioned successfully`,
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        providerId: createdProvider?._id
      }
    });
  }

  // Fallback demo mode
  if (fallbackUsers.some(u => u.email === normalizedEmail)) {
    return res.status(400).json({
      success: false,
      error: "Conflict",
      message: "An account with this email address already exists."
    });
  }

  const fallbackUser = {
    id: `usr_${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role
  };
  fallbackUsers.push(fallbackUser);

  return res.status(201).json({
    success: true,
    message: `Privileged account '${role}' provisioned successfully (Demo mode)`,
    isDemoMode: true,
    data: {
      id: fallbackUser.id,
      name: fallbackUser.name,
      email: fallbackUser.email,
      role: fallbackUser.role
    }
  });
}
