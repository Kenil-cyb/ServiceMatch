import dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

/**
 * Common insecure placeholder values that must never be used in production.
 */
const INSECURE_PATTERNS = [
  "change_me",
  "your_secure_jwt_secret",
  "your_secret",
  "default_secret",
  "secret",
  "jwtsecret",
  "supersecret",
  "password",
  "123456",
  "admin"
];

const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Returns true if the environment is production.
 */
export function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * Validates the JWT_SECRET configuration.
 * Returns { valid: boolean, error?: string, warning?: string }
 */
export function checkJwtSecretHealth() {
  const secret = process.env.JWT_SECRET;

  if (!secret || !secret.trim()) {
    return {
      valid: false,
      error: "JWT_SECRET environment variable is missing or empty."
    };
  }

  const isTooShort = secret.length < MIN_JWT_SECRET_LENGTH;
  const matchesInsecurePattern = INSECURE_PATTERNS.some(p =>
    secret.toLowerCase().includes(p)
  );

  if (isProduction()) {
    if (isTooShort || matchesInsecurePattern) {
      return {
        valid: false,
        error: `Insecure JWT_SECRET detected in production. Secrets must be at least ${MIN_JWT_SECRET_LENGTH} characters long and not use default placeholder values.`
      };
    }
  } else if (isTooShort || matchesInsecurePattern) {
    return {
      valid: true,
      warning: `[SECURITY WARNING] JWT_SECRET appears weak or uses a default template (length: ${secret.length}, min required in production: ${MIN_JWT_SECRET_LENGTH}).`
    };
  }

  return { valid: true };
}

/**
 * Validates all required environment variables at server startup.
 * Throws or exits if critical configuration is missing or insecure.
 */
export function validateStartupEnv() {
  const health = checkJwtSecretHealth();

  if (!health.valid) {
    console.error(`[FATAL CONFIG ERROR] ${health.error} Refusing to start.`);
    if (isProduction()) {
      process.exit(1);
    }
    throw new Error(health.error);
  }

  if (health.warning && process.env.NODE_ENV !== "test") {
    console.warn(health.warning);
  }

  return true;
}

/**
 * Safely retrieves JWT_SECRET.
 * Never falls back to a hardcoded string.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("JWT_SECRET is not configured in the environment.");
  }
  if (isProduction()) {
    const health = checkJwtSecretHealth();
    if (!health.valid) {
      throw new Error("JWT_SECRET is insecure for production use.");
    }
  }
  return secret;
}
