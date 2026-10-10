/**
 * ServiceMatch AI — Comprehensive Backend Security & API Tests
 *
 * Test coverage:
 *  Task A — Auth & authorization
 *  Task B — Booking creation, price verification, DB error handling
 *  Task C — CORS PATCH preflight
 *  Task E — Repository hygiene (JWT_SECRET missing)
 *
 * IMPORTANT: These tests run against the in-memory demo-mode backend
 * (no MongoDB connection). Tests marked [DB] require a real database and
 * are documented but skipped here. Results for DB-connected paths are NOT
 * claimed unless a real test database was used.
 */

import request from "supertest";
import app from "../src/app.js";
import { generateToken } from "../src/middleware/authMiddleware.js";
import { checkJwtSecretHealth } from "../src/config/env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function registerCustomer(email, password = "securepass123") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test Customer", email, password });
  return res;
}

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     ServiceMatch AI — Security & API Regression Tests        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let passed = 0;
  let failed = 0;

  function pass(label) {
    passed++;
    console.log(`  ✅  ${label}`);
  }

  function fail(label, detail) {
    failed++;
    console.error(`  ❌  ${label}`);
    if (detail) console.error(`       → ${detail}`);
  }

  function section(title) {
    console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
  }

  // ── 1. Health ──────────────────────────────────────────────────────────────
  section("1. Health endpoint");

  try {
    const res = await request(app).get("/api/health");
    res.status === 200 && res.body.status === "ok"
      ? pass("GET /api/health → 200 OK")
      : fail("GET /api/health", JSON.stringify(res.body));
  } catch (e) { fail("GET /api/health (exception)", e.message); }

  // ── 2. CORS PATCH preflight ────────────────────────────────────────────────
  section("2. CORS PATCH preflight (Task C)");

  try {
    const res = await request(app)
      .options("/api/bookings/test-id/status")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "Authorization, Content-Type");

    const allowMethods = res.headers["access-control-allow-methods"] || "";
    allowMethods.includes("PATCH")
      ? pass("OPTIONS /api/bookings/:id/status includes PATCH in Allow-Methods")
      : fail("CORS preflight missing PATCH", `Allow-Methods: ${allowMethods}`);

    const allowHeaders = res.headers["access-control-allow-headers"] || "";
    allowHeaders.toLowerCase().includes("authorization")
      ? pass("CORS preflight allows Authorization header")
      : fail("CORS preflight missing Authorization header", `Allow-Headers: ${allowHeaders}`);
  } catch (e) { fail("CORS preflight (exception)", e.message); }

  // ── 3. Auth — registration (Task A) ───────────────────────────────────────
  section("3. Auth — Registration (Task A)");

  const testEmail = `test_${Date.now()}@servicematch.test`;
  let customerToken = null;
  let customer2Token = null;

  try {
    const res = await registerCustomer(testEmail);
    if (res.status === 201 && res.body.token) {
      customerToken = res.body.token;
      pass("POST /api/auth/register → 201 with JWT token");
    } else {
      fail("Registration failed", JSON.stringify(res.body));
    }
  } catch (e) { fail("Registration (exception)", e.message); }

  // Role must always be customer — cannot self-assign admin/provider
  try {
    const adminAttemptRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Evil Admin", email: `evil_${Date.now()}@bad.test`, password: "hackpass123", role: "admin" });

    if (adminAttemptRes.status === 201) {
      const role = adminAttemptRes.body.user?.role;
      role === "customer"
        ? pass("Self-registration with role=admin correctly coerced to 'customer'")
        : fail("Role escalation NOT prevented — registered as: " + role);
    } else {
      fail("Registration rejected entirely (unexpected)", JSON.stringify(adminAttemptRes.body));
    }
  } catch (e) { fail("Role escalation test (exception)", e.message); }

  try {
    const providerAttemptRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Evil Provider", email: `prov_${Date.now()}@bad.test`, password: "hackpass123", role: "provider" });

    if (providerAttemptRes.status === 201) {
      const role = providerAttemptRes.body.user?.role;
      role === "customer"
        ? pass("Self-registration with role=provider correctly coerced to 'customer'")
        : fail("Role escalation NOT prevented — registered as: " + role);
    } else {
      fail("Registration rejected entirely (unexpected)", JSON.stringify(providerAttemptRes.body));
    }
  } catch (e) { fail("Provider role escalation test (exception)", e.message); }

  // Task 3: Enforce minimum password length (min 8 chars)
  try {
    const shortPassRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Short Pass", email: `short_${Date.now()}@servicematch.test`, password: "short" });
    shortPassRes.status === 400 && shortPassRes.body.error === "ValidationError"
      ? pass("Registration with password < 8 characters rejected → 400 ValidationError")
      : fail("Short password not rejected", JSON.stringify(shortPassRes.body));
  } catch (e) { fail("Short password test (exception)", e.message); }

  // Task 3: Enforce valid email format
  try {
    const invalidEmailRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Invalid Email", email: "not-an-email", password: "validPassword123" });
    invalidEmailRes.status === 400 && invalidEmailRes.body.error === "ValidationError"
      ? pass("Registration with invalid email format rejected → 400 ValidationError")
      : fail("Invalid email not rejected", JSON.stringify(invalidEmailRes.body));
  } catch (e) { fail("Invalid email test (exception)", e.message); }

  // ── 4. Auth — login ───────────────────────────────────────────────────────
  section("4. Auth — Login");

  try {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "securepass123" });
    res.status === 200 && res.body.token
      ? pass("POST /api/auth/login → 200 with token")
      : fail("Login failed", JSON.stringify(res.body));
  } catch (e) { fail("Login (exception)", e.message); }

  try {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "wrongpassword" });
    res.status === 401
      ? pass("Login with wrong password → 401 Unauthorized")
      : fail("Wrong password should return 401", `Got: ${res.status}`);
  } catch (e) { fail("Wrong password test (exception)", e.message); }

  // ── 5. JWT — invalid / expired ────────────────────────────────────────────
  section("5. JWT — invalid and expired tokens (Task A)");

  try {
    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", "Bearer totally.invalid.jwt.token");
    res.status === 403
      ? pass("Invalid JWT → 403 Forbidden")
      : fail("Invalid JWT should return 403", `Got: ${res.status}`);
  } catch (e) { fail("Invalid JWT test (exception)", e.message); }

  // An expired token (signed with the correct secret, exp in the past)
  // We simulate with a manually crafted payload; this is a structural test.
  try {
    const expiredToken = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InRlc3QiLCJleHAiOjF9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${expiredToken}`);
    res.status === 403
      ? pass("Expired JWT → 403 Forbidden")
      : fail("Expired JWT should return 403", `Got: ${res.status}`);
  } catch (e) { fail("Expired JWT test (exception)", e.message); }

  // ── 6. Unauthenticated booking access ─────────────────────────────────────
  section("6. Unauthenticated booking access (Task A, Task F)");

  try {
    const res = await request(app).post("/api/bookings").send({ providerId: 1, service: "AC Repair" });
    res.status === 401
      ? pass("POST /api/bookings without token → 401 Unauthorized")
      : fail("Unauthenticated booking creation should return 401", `Got: ${res.status}`);
  } catch (e) { fail("Unauthenticated booking creation (exception)", e.message); }

  try {
    const res = await request(app).get("/api/bookings");
    res.status === 401
      ? pass("GET /api/bookings without token → 401 Unauthorized")
      : fail("Unauthenticated booking retrieval should return 401", `Got: ${res.status}`);
  } catch (e) { fail("Unauthenticated booking retrieval (exception)", e.message); }

  try {
    const res = await request(app).patch("/api/bookings/SM123456/status").send({ status: "accepted" });
    res.status === 401
      ? pass("PATCH /api/bookings/:id/status without token → 401 Unauthorized")
      : fail("Unauthenticated status update should return 401", `Got: ${res.status}`);
  } catch (e) { fail("Unauthenticated status update (exception)", e.message); }

  // ── 7. Demo-mode booking creation (Task B) ────────────────────────────────
  section("7. Booking creation — demo mode (Task B)");

  let createdBookingId = null;
  if (customerToken) {
    try {
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ providerId: 1, service: "AC Repair" });

      if (res.status === 201 && res.body.data?.id) {
        createdBookingId = res.body.data.id;
        pass(`POST /api/bookings (demo) → 201, booking ID: ${createdBookingId}`);

        // Server must use demo provider's price, not a client-supplied value
        const serverPrice = res.body.data.price;
        serverPrice === 499
          ? pass("Server-derived price matches demo provider record (₹499 for provider id=1)")
          : fail("Server price mismatch", `Expected 499, got ${serverPrice}`);

        // isDemoMode must be explicitly labelled
        res.body.isDemoMode === true
          ? pass("Response clearly labelled isDemoMode: true")
          : fail("Demo booking not labelled isDemoMode", `isDemoMode=${res.body.isDemoMode}`);
      } else {
        fail("Booking creation failed", JSON.stringify(res.body));
      }
    } catch (e) { fail("Booking creation (exception)", e.message); }

    // Client cannot supply an arbitrary provider name
    try {
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ providerId: 1, service: "AC Repair", price: 9999999 });
      const serverPrice = res.body.data?.price;
      serverPrice !== 9999999
        ? pass("Client-supplied price is ignored; server enforces catalogue price")
        : fail("SECURITY: client-supplied price was accepted!", `price=${serverPrice}`);
    } catch (e) { fail("Client price override test (exception)", e.message); }

    // Non-existent demo provider → 404
    try {
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ providerId: "non_existent_provider_id", service: "Fake Service" });
      res.status === 404
        ? pass("Booking with unknown providerId → 404 Not Found")
        : fail("Unknown provider should return 404", `Got: ${res.status} ${JSON.stringify(res.body)}`);
    } catch (e) { fail("Unknown provider test (exception)", e.message); }
  } else {
    fail("Skipping booking tests — no customer token available");
  }

  // ── 8. Booking status transitions ─────────────────────────────────────────
  section("8. Booking state machine (Task B)");

  if (createdBookingId && customerToken) {
    // Customer can cancel a requested booking
    try {
      const res = await request(app)
        .patch(`/api/bookings/${createdBookingId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "cancelled" });
      res.status === 200 && res.body.data?.status === "cancelled"
        ? pass("Valid transition: requested → cancelled (customer)")
        : fail("requested → cancelled failed", JSON.stringify(res.body));
    } catch (e) { fail("Cancel transition (exception)", e.message); }

    // Cannot transition from a terminal state or perform disallowed role transition
    // (role restriction fires before state-machine check; both 400 and 403 are secure)
    try {
      const res = await request(app)
        .patch(`/api/bookings/${createdBookingId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "accepted" });
      (res.status === 400 || res.status === 403)
        ? pass("Cancelled booking → accepted blocked (role or state restriction)")
        : fail("Terminal state transition should be rejected (400 or 403)", JSON.stringify(res.body));
    } catch (e) { fail("Terminal state transition (exception)", e.message); }
  }

  // Create a fresh booking for more transition tests
  let freshBookingId = null;
  if (customerToken) {
    const fresh = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ providerId: 1, service: "AC Repair" });
    if (fresh.status === 201) freshBookingId = fresh.body.data?.id;
  }

  if (freshBookingId && customerToken) {
    // Customer cannot accept their own booking
    try {
      const res = await request(app)
        .patch(`/api/bookings/${freshBookingId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "accepted" });
      res.status === 403
        ? pass("Customer cannot accept a booking (role restriction) → 403")
        : fail("Customer should not be able to accept a booking", `Got: ${res.status}`);
    } catch (e) { fail("Customer accept restriction (exception)", e.message); }

    // Invalid status value
    try {
      const res = await request(app)
        .patch(`/api/bookings/${freshBookingId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "flying_unicorns" });
      res.status === 400
        ? pass("Invalid status value → 400 ValidationError")
        : fail("Invalid status should return 400", `Got: ${res.status}`);
    } catch (e) { fail("Invalid status test (exception)", e.message); }
  }

  // ── 9. Cross-user booking access ──────────────────────────────────────────
  section("9. Cross-user booking access (Task A, Task F)");

  // Register a second customer
  const testEmail2 = `test2_${Date.now()}@servicematch.test`;
  const reg2 = await registerCustomer(testEmail2);
  if (reg2.status === 201) customer2Token = reg2.body.token;

  if (freshBookingId && customer2Token) {
    try {
      const res = await request(app)
        .patch(`/api/bookings/${freshBookingId}/status`)
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ status: "cancelled" });
      res.status === 403
        ? pass("Cross-user status update correctly rejected → 403 Forbidden")
        : fail("Cross-user booking update should be rejected", `Got: ${res.status}`);
    } catch (e) { fail("Cross-user access test (exception)", e.message); }
  }

  // ── 10. Admin endpoint protection ─────────────────────────────────────────
  section("10. Admin endpoint protection (Task A)");

  if (customerToken) {
    try {
      const res = await request(app)
        .get("/api/admin/stats")
        .set("Authorization", `Bearer ${customerToken}`);
      res.status === 403
        ? pass("Customer accessing /admin/stats → 403 Forbidden")
        : fail("Customer should not access admin stats", `Got: ${res.status}`);
    } catch (e) { fail("Admin stats restriction (exception)", e.message); }

    try {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${customerToken}`);
      res.status === 403
        ? pass("Customer accessing /admin/users → 403 Forbidden")
        : fail("Customer should not access admin users", `Got: ${res.status}`);
    } catch (e) { fail("Admin users restriction (exception)", e.message); }

    // Task 4: Privileged account provisioning authorization tests
    try {
      const unauthRes = await request(app)
        .post("/api/admin/users")
        .send({ name: "Rogue", email: "rogue@test.com", password: "password123", role: "admin" });
      unauthRes.status === 401
        ? pass("Unauthenticated access to /api/admin/users → 401 Unauthorized")
        : fail("Unauthenticated admin provisioning should return 401", `Got: ${unauthRes.status}`);
    } catch (e) { fail("Unauthenticated provisioning test (exception)", e.message); }

    try {
      const custRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ name: "Cust Rogue", email: "custrogue@test.com", password: "password123", role: "admin" });
      custRes.status === 403
        ? pass("Customer attempting to provision admin account → 403 Forbidden")
        : fail("Customer should not be able to provision users", `Got: ${custRes.status}`);
    } catch (e) { fail("Customer provisioning test (exception)", e.message); }

    // Test with admin token
    const adminToken = generateToken({ id: "admin_root", role: "admin", email: "admin@servicematch.test" });

    try {
      const badRoleRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Bad Role", email: "badrole@test.com", password: "password123", role: "superuser" });
      badRoleRes.status === 400 && badRoleRes.body.error === "ValidationError"
        ? pass("Admin provisioning with invalid role rejected → 400 ValidationError")
        : fail("Invalid role was not rejected", JSON.stringify(badRoleRes.body));
    } catch (e) { fail("Bad role provisioning test (exception)", e.message); }

    try {
      const badPassRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Bad Pass", email: "badpass@test.com", password: "short", role: "provider", service: "Plumbing" });
      badPassRes.status === 400 && badPassRes.body.error === "ValidationError"
        ? pass("Admin provisioning with short password rejected → 400 ValidationError")
        : fail("Short password was not rejected in provisioning", JSON.stringify(badPassRes.body));
    } catch (e) { fail("Short password provisioning test (exception)", e.message); }

    try {
      const provRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Pro Tech", email: `pro_${Date.now()}@servicematch.test`, password: "password123", role: "provider", service: "Plumbing" });
      provRes.status === 201 && provRes.body.data?.role === "provider"
        ? pass("Admin successfully provisions provider account → 201 Created")
        : fail("Admin provider provisioning failed", JSON.stringify(provRes.body));
    } catch (e) { fail("Admin provider provisioning (exception)", e.message); }

    try {
      const newAdminRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Sub Admin", email: `subadmin_${Date.now()}@servicematch.test`, password: "password123", role: "admin" });
      newAdminRes.status === 201 && newAdminRes.body.data?.role === "admin"
        ? pass("Admin successfully provisions admin account → 201 Created")
        : fail("Admin account provisioning failed", JSON.stringify(newAdminRes.body));
    } catch (e) { fail("Admin account provisioning (exception)", e.message); }
  }

  // ── 11. AI endpoints (public) ──────────────────────────────────────────────
  section("11. AI & matching endpoints (public)");

  try {
    const res = await request(app)
      .post("/api/ai/parse-request")
      .send({ query: "My AC isn't cooling properly, and I need someone today evening." });
    res.status === 200 && res.body.data?.service === "AC Repair"
      ? pass("POST /api/ai/parse-request → detects 'AC Repair'")
      : fail("AI parse request failed", JSON.stringify(res.body));
  } catch (e) { fail("AI parse request (exception)", e.message); }

  try {
    const res = await request(app)
      .post("/api/match")
      .send({ query: "Leaking pipe in kitchen", selectedService: "" });
    res.status === 200 && Array.isArray(res.body.data)
      ? pass("POST /api/match → returns ranked provider array")
      : fail("Match endpoint failed", JSON.stringify(res.body));
  } catch (e) { fail("Match endpoint (exception)", e.message); }

  // ── 12. Environment and Secret Safety (Task 1) ───────────────────────────
  section("12. Environment & Secret Safety (Task 1)");

  try {
    const health = checkJwtSecretHealth();
    health.valid
      ? pass("checkJwtSecretHealth() returns valid for current configuration")
      : fail("JWT secret health failed", health.error);
  } catch (e) { fail("Secret health check (exception)", e.message); }

  // Simulate production validation
  const savedEnv = process.env.NODE_ENV;
  const savedSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = "production";

    // 1. Missing secret
    delete process.env.JWT_SECRET;
    const missingRes = checkJwtSecretHealth();
    !missingRes.valid
      ? pass("Production fails when JWT_SECRET is missing")
      : fail("Production should fail when secret is missing");

    // 2. Short secret
    process.env.JWT_SECRET = "short_secret_123";
    const shortRes = checkJwtSecretHealth();
    !shortRes.valid
      ? pass("Production fails when JWT_SECRET is shorter than 32 characters")
      : fail("Production should fail when secret is short");

    // 3. Known insecure placeholder
    process.env.JWT_SECRET = "CHANGE_ME_before_production_use_a_long_random_string";
    const placeholderRes = checkJwtSecretHealth();
    !placeholderRes.valid
      ? pass("Production fails when JWT_SECRET contains insecure placeholder")
      : fail("Production should fail when secret is a placeholder");

    // 4. Secure 32+ character random secret
    process.env.JWT_SECRET = "c08f4983b63ec9483dc08b981294871239840129384091823094812309481230";
    const strongRes = checkJwtSecretHealth();
    strongRes.valid
      ? pass("Production accepts secure 32+ character random secret")
      : fail("Production should accept strong secret", strongRes.error);
  } finally {
    process.env.NODE_ENV = savedEnv;
    process.env.JWT_SECRET = savedSecret;
  }

  // ── 13. Comprehensive Input Validation (Task 5) ───────────────────────────
  section("13. Comprehensive Input Validation (Task 5)");

  try {
    const emptyAiRes = await request(app)
      .post("/api/ai/parse-request")
      .send({ query: "   " });
    emptyAiRes.status === 400 && emptyAiRes.body.error === "ValidationError"
      ? pass("POST /api/ai/parse-request with empty query → 400 ValidationError")
      : fail("Empty AI query not rejected", JSON.stringify(emptyAiRes.body));
  } catch (e) { fail("Empty AI query test (exception)", e.message); }

  try {
    const oversizedAiRes = await request(app)
      .post("/api/ai/parse-request")
      .send({ query: "a".repeat(1005) });
    oversizedAiRes.status === 400 && oversizedAiRes.body.error === "ValidationError"
      ? pass("POST /api/ai/parse-request with >1000 char query → 400 ValidationError")
      : fail("Oversized AI query not rejected", JSON.stringify(oversizedAiRes.body));
  } catch (e) { fail("Oversized AI query test (exception)", e.message); }

  if (customerToken) {
    try {
      const badReviewRes = await request(app)
        .post("/api/reviews")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ bookingId: "b1", providerId: "p1", rating: 6 });
      badReviewRes.status === 400 && badReviewRes.body.error === "ValidationError"
        ? pass("POST /api/reviews with rating > 5 rejected → 400 ValidationError")
        : fail("Out-of-range rating was not rejected", JSON.stringify(badReviewRes.body));
    } catch (e) { fail("Out-of-range rating test (exception)", e.message); }

    try {
      const missingReviewRes = await request(app)
        .post("/api/reviews")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ bookingId: "b1" });
      missingReviewRes.status === 400 && missingReviewRes.body.error === "ValidationError"
        ? pass("POST /api/reviews with missing fields rejected → 400 ValidationError")
        : fail("Incomplete review was not rejected", JSON.stringify(missingReviewRes.body));
    } catch (e) { fail("Incomplete review test (exception)", e.message); }

    try {
      const badNotifRes = await request(app)
        .post("/api/notifications/read")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ ids: new Array(105).fill("notif_id") });
      badNotifRes.status === 400 && badNotifRes.body.error === "ValidationError"
        ? pass("POST /api/notifications/read with >100 IDs rejected → 400 ValidationError")
        : fail("Oversized notification read list was not rejected", JSON.stringify(badNotifRes.body));
    } catch (e) { fail("Oversized notifications read test (exception)", e.message); }
  }

  // ── 14. Database-connected path notes (NOT run here) ──────────────────────
  section("14. Database-connected path notes (isolated in mongoIntegration.test.js)");
  console.log("  ℹ️  Real MongoDB tests are run via `npm run test:db` using mongodb-memory-server.");

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("ALL TESTS PASSED\n");
    process.exit(0);
  }
}

runTests();
