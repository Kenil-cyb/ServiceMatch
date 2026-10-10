/**
 * Frontend API client for ServiceMatch AI
 *
 * Authentication flow:
 *  - Call `loginApi()` or `registerApi()` to obtain a JWT token.
 *  - The token is stored in memory (module-level `authToken`).
 *  - Use `setAuthToken(token)` to restore a previously saved token (e.g. from
 *    sessionStorage on page reload).
 *  - All protected endpoints are called via `apiFetchAuth()`, which
 *    automatically attaches the `Authorization: Bearer <token>` header and
 *    clears the stored token on 401/403 responses.
 *  - Secrets are never stored in VITE_ environment variables.
 */

import { buildApiUrl, normalizeProvider, resolveApiBaseUrl } from "./apiConfig.js";
import { requestJson } from "./http.js";

const API_BASE_URL = resolveApiBaseUrl({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
  DEVELOPMENT_API_BASE_URL: import.meta.env.DEV ? "http://localhost:5000" : "",
});

// ── Auth token — stored in module scope, never in a VITE_ variable ───────────
let authToken = null;

/** Restore a token obtained from a previous session (e.g. sessionStorage). */
export function setAuthToken(token) {
  authToken = token || null;
}

/** Return the currently stored token (null if not authenticated). */
export function getAuthToken() {
  return authToken;
}

/** Clear the stored token (logout). */
export function clearAuthToken() {
  authToken = null;
}

// ── Core fetch helpers ────────────────────────────────────────────────────────

/**
 * Execute an HTTP request to the backend API.
 * Does NOT attach an Authorization header.
 */
async function apiFetch(endpoint, options = {}) {
  const url = buildApiUrl(API_BASE_URL, endpoint);
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  return requestJson(fetch, url, config);
}

/**
 * Execute an authenticated HTTP request.
 * Attaches the stored Bearer token. Clears the token on 401/403 so the app
 * can redirect to login instead of looping with bad credentials.
 */
async function apiFetchAuth(endpoint, options = {}) {
  if (!authToken) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const url = buildApiUrl(API_BASE_URL, endpoint);
  const config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
    ...options,
  };

  return requestJson(fetch, url, config, response => {
    // Token is invalid or expired — clear it so the UI can react.
    if (response.status === 401 || response.status === 403) {
      clearAuthToken();
    }
  });
}

// ── Public endpoints ──────────────────────────────────────────────────────────

/** GET /api/health */
export async function checkBackendHealth() {
  return apiFetch("/health");
}

/** GET /api/providers */
export async function fetchProviders() {
  const response = await apiFetch("/providers");
  return {
    ...response,
    data: (response.data || []).map(normalizeProvider),
  };
}

/** POST /api/match */
export async function matchProvidersApi(requestBody) {
  return apiFetch("/match", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

/** POST /api/ai/parse-request */
export async function parseAIRequestApi(queryText) {
  return apiFetch("/ai/parse-request", {
    method: "POST",
    body: JSON.stringify({ query: queryText }),
  });
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Registers a new customer account and stores the returned token.
 */
export async function registerApi({ name, email, password }) {
  const data = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  if (data.token) {
    authToken = data.token;
  }
  return data;
}

/**
 * POST /api/auth/login
 * Logs in and stores the returned token.
 */
export async function loginApi({ email, password }) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.token) {
    authToken = data.token;
  }
  return data;
}

// ── Protected endpoints ───────────────────────────────────────────────────────

/**
 * POST /api/bookings
 * Creates a booking for the authenticated customer.
 * The caller should only supply providerId, service, date, and time.
 * Provider name and price are resolved on the server.
 */
export async function createBookingApi(bookingData) {
  return apiFetchAuth("/bookings", {
    method: "POST",
    body: JSON.stringify(bookingData),
  });
}

/**
 * GET /api/bookings
 * Retrieves bookings for the authenticated user.
 */
export async function getBookingsApi() {
  return apiFetchAuth("/bookings");
}

/**
 * PATCH /api/bookings/:id/status
 * Updates the status of a booking. Permitted transitions depend on the user's role.
 */
export async function updateBookingStatusApi(bookingId, newStatus) {
  return apiFetchAuth(`/bookings/${encodeURIComponent(bookingId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: newStatus }),
  });
}

/**
 * GET /api/notifications
 */
export async function getNotificationsApi() {
  return apiFetchAuth("/notifications");
}

/**
 * POST /api/notifications/read
 */
export async function markNotificationsReadApi(ids = []) {
  return apiFetchAuth("/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}
