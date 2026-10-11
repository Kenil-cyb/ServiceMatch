/**
 * ServiceMatch AI — MongoDB Isolated Integration Tests
 *
 * Tests real Mongoose models and MongoDB persistence using mongodb-memory-server.
 * Completely isolated from production data and demo in-memory fallback.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Provider from "../src/models/Provider.js";
import Booking from "../src/models/Booking.js";
import Review from "../src/models/Review.js";
import { generateToken } from "../src/middleware/authMiddleware.js";
import { submitReview } from "../src/services/reviewService.js";
import { isDBConnected } from "../src/config/db.js";
import { demoSeedProviders, seedDemoData } from "../src/config/seed.js";

async function runMongoIntegrationTests() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║    ServiceMatch AI — Real MongoDB Integration Test Suite     ║");
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

  let mongoServer = null;
  let mongoUri = null;

  try {
    process.env.NODE_ENV = "test";

    // ── Setup in-memory test database ──────────────────────────────────────
    section("1. Test Database Environment Setup");
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    await mongoose.connect(mongoUri);
    await User.syncIndexes();
    await Provider.syncIndexes();
    await Booking.syncIndexes();
    await Review.syncIndexes();

    isDBConnected()
      ? pass("Connected to isolated MongoMemoryServer instance")
      : fail("Mongoose connection failed");

    // ── 1.1 Explicit, repeatable demo provider seed ─────────────────────────
    section("1.1 Demo Provider Seed & API Integration");
    try {
      assert.equal(await seedDemoData(), true);
      assert.equal(await seedDemoData(), true);
      assert.equal(await Provider.countDocuments({ isDemoData: true }), demoSeedProviders.length);
      pass(`Seeded ${demoSeedProviders.length} demo providers without duplicates on rerun`);

      const providersResponse = await request(app).get("/api/providers");
      assert.equal(providersResponse.status, 200);
      assert.equal(providersResponse.body.count, demoSeedProviders.length);
      assert.equal(providersResponse.body.data.every(provider => provider.isDemoData), true);
      pass("GET /api/providers returns all explicitly seeded demo providers");

      const previousGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        const acResponse = await request(app)
          .post("/api/match")
          .send({ query: "ac cleaning", selectedService: "", useAI: true });
        assert.equal(acResponse.status, 200);
        assert.equal(acResponse.body.query.selectedService, "AC Repair");
        assert.ok(acResponse.body.count > 0);
        assert.ok(acResponse.body.data[0].service.includes("AC Repair"));
        pass("POST /api/match recognizes 'ac cleaning' and ranks AC repair providers first");
      } finally {
        if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previousGeminiKey;
      }

      for (const category of ["AC Repair", "Plumbing", "Electrical", "Cleaning", "Computer Repair", "Car Repair"]) {
        const categoryResponse = await request(app)
          .post("/api/match")
          .send({ query: "", selectedService: category, useAI: false });
        assert.equal(categoryResponse.status, 200);
        assert.ok(
          categoryResponse.body.data[0].service.includes(category),
          `${category} ranked ${categoryResponse.body.data[0].service} first`
        );
      }
      pass("Matching ranks a relevant provider first for every supported service category");
    } catch (error) {
      fail("Demo seed and API integration", error.message);
    }

    // Seed authoritative test provider
    const testProvider = await Provider.create({
      name: "Ramesh Electrician",
      service: "Electrical Repair",
      price: 550,
      skills: ["Electrical", "Wiring"],
      available: true,
      rating: 4.8,
      qualityScore: 90
    });
    pass(`Authoritative test provider created in MongoDB (ID: ${testProvider._id})`);

    // Seed test customer user
    const customerUser = await User.create({
      name: "DB Test Customer",
      email: "dbcustomer@test.com",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890",
      role: "customer"
    });
    const customerToken = generateToken(customerUser);

    // Seed test provider user
    const providerUser = await User.create({
      name: "Ramesh User",
      email: "ramesh@test.com",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890",
      role: "provider"
    });
    const providerToken = generateToken(providerUser);

    // ── 2. Real Booking Creation & Price Integrity ──────────────────────────
    section("2. Real Mongoose Booking Creation & Price Integrity");

    let dbBookingId = null;
    let dbBookingObjectId = null;

    try {
      const res = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          providerId: testProvider._id.toString(),
          service: "Electrical Repair",
          date: "2026-10-15",
          time: "14:00",
          price: 99999 // Malicious client price
        });

      if (res.status === 201 && res.body.data) {
        dbBookingId = res.body.data.id;
        dbBookingObjectId = res.body.data._id;

        // Verify document actually exists in MongoDB
        const persistedBooking = await Booking.findById(dbBookingObjectId);
        if (persistedBooking) {
          pass("Booking document successfully persisted to real MongoDB collection");
        } else {
          fail("Booking document not found in MongoDB after 201 response");
        }

        // Verify price derived from DB record
        persistedBooking.price === 550
          ? pass("Server derived price from DB provider record (₹550), ignored client price (₹99999)")
          : fail("Price integrity failed", `Expected 550, got ${persistedBooking.price}`);

        // Verify customerId matches JWT
        persistedBooking.customerId.toString() === customerUser._id.toString()
          ? pass("Database booking customerId correctly matches authenticated user")
          : fail("customerId mismatch in MongoDB document");

        // Verify response is not demo mode
        !res.body.isDemoMode
          ? pass("Response confirmed as persistent database write (isDemoMode is falsy)")
          : fail("Response incorrectly marked as demo mode despite active database");
      } else {
        fail("POST /api/bookings failed", JSON.stringify(res.body));
      }
    } catch (e) { fail("Booking creation test (exception)", e.message); }

    // ── 3. Real Booking Updates & State Machine ──────────────────────────────
    section("3. Real Mongoose Booking Status Updates");

    try {
      const res = await request(app)
        .patch(`/api/bookings/${dbBookingId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "cancelled" });

      if (res.status === 200 && res.body.data?.status === "cancelled") {
        const updatedDoc = await Booking.findById(dbBookingObjectId);
        updatedDoc.status === "cancelled"
          ? pass("Booking status transition 'cancelled' persisted to MongoDB document")
          : fail("MongoDB status not updated");
      } else {
        fail("Booking status update failed", JSON.stringify(res.body));
      }
    } catch (e) { fail("Booking update test (exception)", e.message); }

    // ── 4. Persistence Across Simulated Reconnection ─────────────────────────
    section("4. Persistence Across Server/Connection Lifecycle");

    try {
      // Disconnect Mongoose
      await mongoose.disconnect();
      isDBConnected() === false
        ? pass("Mongoose cleanly disconnected (simulating server shutdown)")
        : fail("Mongoose still connected after disconnect");

      // Reconnect to the same MongoDB instance
      await mongoose.connect(mongoUri);
      isDBConnected() === true
        ? pass("Mongoose reconnected to MongoDB instance (simulating server restart)")
        : fail("Mongoose failed to reconnect");

      // Query previously created booking
      const foundDoc = await Booking.findById(dbBookingObjectId);
      foundDoc && foundDoc.bookingId === dbBookingId && foundDoc.status === "cancelled"
        ? pass("Persisted booking verified intact across connection lifecycle")
        : fail("Booking lost across connection lifecycle");
    } catch (e) { fail("Reconnection persistence test (exception)", e.message); }

    // ── 5. Unique Constraints & Duplicate-Review Prevention ──────────────────
    section("5. Unique Constraints & Duplicate-Review Prevention");

    // 5.1 User email uniqueness constraint
    try {
      let duplicateCaught = false;
      try {
        await User.create({
          name: "Duplicate User",
          email: "dbcustomer@test.com", // Same email as earlier
          passwordHash: "hash123",
          role: "customer"
        });
      } catch (err) {
        if (err.code === 11000) duplicateCaught = true;
      }

      duplicateCaught
        ? pass("MongoDB unique index enforces User email uniqueness (error 11000)")
        : fail("User email duplicate was not prevented by MongoDB unique constraint");
    } catch (e) { fail("Email unique index test (exception)", e.message); }

    // 5.2 Create a completed booking for review tests
    const reviewBooking = await Booking.create({
      bookingId: `SM_REV_${Date.now()}`,
      customerId: customerUser._id,
      providerId: testProvider._id,
      providerName: testProvider.name,
      service: "Electrical Repair",
      price: 550,
      status: "completed"
    });

    // 5.3 First review succeeds
    try {
      const rev1 = await submitReview(customerUser._id.toString(), {
        bookingId: reviewBooking._id.toString(),
        providerId: testProvider._id.toString(),
        rating: 5,
        comment: "Excellent service!"
      });
      rev1 && rev1.rating === 5
        ? pass("First review on completed booking successfully persisted to MongoDB")
        : fail("First review submission failed");
    } catch (e) { fail("First review submission (exception)", e.message); }

    // 5.4 Duplicate review prevented at application service layer
    try {
      let appDuplicateCaught = false;
      try {
        await submitReview(customerUser._id.toString(), {
          bookingId: reviewBooking._id.toString(),
          providerId: testProvider._id.toString(),
          rating: 4,
          comment: "Trying to submit second review"
        });
      } catch (err) {
        if (err.message.includes("Duplicate Review Prevention")) {
          appDuplicateCaught = true;
        }
      }

      appDuplicateCaught
        ? pass("Duplicate review prevented at application layer with clear error message")
        : fail("Application layer permitted duplicate review");
    } catch (e) { fail("App duplicate review test (exception)", e.message); }

    // 5.5 Database-level unique constraint on Review.bookingId
    try {
      let dbDuplicateCaught = false;
      try {
        await Review.create({
          customerId: customerUser._id,
          providerId: testProvider._id,
          bookingId: reviewBooking._id, // Duplicate bookingId
          rating: 3,
          comment: "Direct DB duplicate"
        });
      } catch (err) {
        if (err.code === 11000) dbDuplicateCaught = true;
      }

      dbDuplicateCaught
        ? pass("MongoDB unique index enforces Review bookingId uniqueness (error 11000)")
        : fail("Database level did not enforce unique bookingId on Review");
    } catch (e) { fail("DB review unique index test (exception)", e.message); }

    // ── 6. Database Error & Unavailable Behavior ─────────────────────────────
    section("6. Database Unavailable & Failed Write Guarantees");

    // 6.1 Failed writes do NOT appear as successful persistent writes
    try {
      // Trigger a validation failure at Mongoose level
      const badBookingRes = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          providerId: "non_existent_fake_id_123",
          service: "Electrical Repair"
        });

      badBookingRes.status === 400 && badBookingRes.body.error === "ValidationError"
        ? pass("Invalid provider ID fails fast with 400 (never silently saved)")
        : fail("Invalid provider ID should return 400", `Got: ${badBookingRes.status}`);
    } catch (e) { fail("Invalid booking ID test (exception)", e.message); }

    // 6.2 When write fails unexpectedly, error 500 is returned (never fallback in DB mode)
    const originalCreate = Booking.create;
    try {
      Booking.create = async () => {
        throw new Error("Simulated storage write failure");
      };

      const failRes = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          providerId: testProvider._id.toString(),
          service: "Electrical Repair"
        });

      failRes.status === 500 && failRes.body.error === "DatabaseError"
        ? pass("Failed DB write surfaces as 500 DatabaseError — NEVER silently saved in memory")
        : fail("Failed DB write did not return 500", JSON.stringify(failRes.body));
    } finally {
      Booking.create = originalCreate;
    }

  } catch (err) {
    console.error("FATAL ERROR during MongoDB integration tests:", err);
    failed++;
  } finally {
    // ── Clean up ───────────────────────────────────────────────────────────
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log("\n🍃 Isolated MongoDB test server stopped cleanly.");
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  MongoDB Integration Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("ALL MONGODB INTEGRATION TESTS PASSED\n");
    process.exit(0);
  }
}

runMongoIntegrationTests();
