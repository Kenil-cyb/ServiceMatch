import rateLimit from "express-rate-limit";

const isTestEnv = () => process.env.NODE_ENV === "test";

/**
 * Rate limiter for authentication login endpoints.
 * Protects against brute-force credential stuffing.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per 15-minute window
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    error: "TooManyRequests",
    message: "Too many login attempts from this IP. Please try again after 15 minutes."
  }
});

/**
 * Rate limiter for registration endpoints.
 * Protects against account creation spam and resource exhaustion.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 minutes
  max: 10, // 10 registrations per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    error: "TooManyRequests",
    message: "Too many accounts created from this IP. Please try again later."
  }
});

/**
 * General API limiter for sensitive administrative provisioning endpoints.
 */
export const adminProvisionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    error: "TooManyRequests",
    message: "Too many administrative provisioning requests. Please try again later."
  }
});
