import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getJwtSecret } from "../config/env.js";

/**
 * Generate JWT token for user
 */
export function generateToken(user, expiresIn = process.env.JWT_EXPIRES_IN || "7d") {
  const secret = getJwtSecret();
  return jwt.sign(
    { id: user._id || user.id, role: user.role, email: user.email },
    secret,
    { expiresIn }
  );
}

/**
 * Authentication Middleware: Verifies JWT token in Bearer authorization header
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Access token required. Please log in."
    });
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "Invalid or expired authorization token."
    });
  }
}

/**
 * Authorization Middleware: Enforces user role permissions
 */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: `Role '${req.user?.role || "guest"}' is not authorized to perform this action.`
      });
    }
    next();
  };
}
