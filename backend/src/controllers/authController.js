import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { generateToken } from "../middleware/authMiddleware.js";
import { isDBConnected, isDemoMode, sendDatabaseUnavailable } from "../config/db.js";

// In-memory user fallback when MongoDB is not connected
export const fallbackUsers = [];

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates registration password against security policy.
 */
export function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      message: `Password cannot exceed ${MAX_PASSWORD_LENGTH} characters.`
    };
  }
  return { isValid: true };
}

/**
 * Validates email format and length.
 */
export function validateEmail(email) {
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim()) || email.trim().length > 255) {
    return {
      isValid: false,
      message: "Please provide a valid email address."
    };
  }
  return { isValid: true };
}

/**
 * Validates user name.
 */
export function validateName(name) {
  if (typeof name !== "string" || !name.trim() || name.trim().length < 2 || name.trim().length > 100) {
    return {
      isValid: false,
      message: "Name must be between 2 and 100 characters."
    };
  }
  return { isValid: true };
}

/**
 * POST /api/auth/register
 * Public registration is strictly restricted to customer accounts.
 */
export async function register(req, res) {
  const { name, email, password } = req.body || {};
  // Role is ALWAYS forced to "customer" for public registration.
  // Admins and providers must be created via privileged internal routes.
  const role = "customer";

  const nameCheck = validateName(name);
  if (!nameCheck.isValid) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: nameCheck.message
    });
  }

  const emailCheck = validateEmail(email);
  if (!emailCheck.isValid) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: emailCheck.message
    });
  }

  const passCheck = validatePassword(password);
  if (!passCheck.isValid) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: passCheck.message
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

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role
    });

    const token = generateToken(user);
    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  }

  // Fallback memory store logic (Demo mode)
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

  const token = generateToken(fallbackUser);
  return res.status(201).json({
    success: true,
    message: "User registered successfully (Demo mode)",
    token,
    user: { id: fallbackUser.id, name: fallbackUser.name, email: fallbackUser.email, role: fallbackUser.role }
  });
}

/**
 * POST /api/auth/login
 */
export async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Email and password are required."
    });
  }

  const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";

  const dbConnected = isDBConnected();
  if (!dbConnected && !isDemoMode()) return sendDatabaseUnavailable(res);

  let user = null;
  if (dbConnected) {
    user = await User.findOne({ email: normalizedEmail });
  } else {
    user = fallbackUsers.find(u => u.email === normalizedEmail);
  }

  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid credentials."
    });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid credentials."
    });
  }

  const token = generateToken(user);
  return res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: { id: user._id || user.id, name: user.name, email: user.email, role: user.role }
  });
}
