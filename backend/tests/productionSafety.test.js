import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import { seedDemoData } from "../src/config/seed.js";
import { startServer } from "../src/server.js";
import Provider from "../src/models/Provider.js";
import { generateToken } from "../src/middleware/authMiddleware.js";
import { fallbackUsers } from "../src/controllers/authController.js";
import { getTrustedProxyHops } from "../src/config/proxyTrust.js";

test("proxy trust is limited to the production Render proxy hop", () => {
  assert.equal(getTrustedProxyHops("production"), 1);
  assert.equal(getTrustedProxyHops("development"), false);
  assert.equal(getTrustedProxyHops("test"), false);
});

async function withProductionEnv(run, mongoURI) {
  const keys = ["NODE_ENV", "JWT_SECRET", "MONGODB_URI"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  if (mongoURI === undefined) {
    delete process.env.MONGODB_URI;
  } else {
    process.env.MONGODB_URI = mongoURI;
  }

  try {
    return await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("production database and demo-mode safety", async t => {
  await t.test("missing MongoDB configuration rejects instead of selecting demo fallback", async () => {
    await withProductionEnv(async () => {
      assert.equal(mongoose.connection.readyState, 0);
      await assert.rejects(connectDB(), {
        message: "MONGODB_URI is required in production."
      });
    });
  });

  await t.test("failed MongoDB connectivity rejects without exposing the URI", async () => {
    const uri = "mongodb://audit-user:private-password@127.0.0.1:1/servicematch?authSource=admin";
    await withProductionEnv(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      await assert.rejects(connectDB(), error => {
        assert.match(error.message, /MongoDB connection failed/);
        assert.equal(error.message.includes(uri), false);
        assert.equal(error.message.includes("private-password"), false);
        return true;
      });
      assert.notEqual(mongoose.connection.readyState, 1);
    }, uri);
  });

  await t.test("server does not listen before production database initialization succeeds", async () => {
    await withProductionEnv(async () => {
      let listenAttempted = false;
      const originalListen = app.listen;
      app.listen = () => {
        listenAttempted = true;
        throw new Error("Unexpected listen attempt");
      };

      try {
        await assert.rejects(startServer(), {
          message: "MONGODB_URI is required in production."
        });
      } finally {
        app.listen = originalListen;
      }
      assert.equal(listenAttempted, false);
    });
  });

  await t.test("health and readiness report disconnected production state without secrets", async () => {
    const mongoURI = "mongodb://health-user:private-password@example.invalid/servicematch";
    await withProductionEnv(async () => {
      const health = await request(app).get("/api/health");
      assert.equal(health.status, 503);
      assert.equal(health.body.status, "degraded");
      assert.equal(health.body.application, "operational");
      assert.equal(health.body.database, "disconnected");

      const readiness = await request(app).get("/api/ready");
      assert.equal(readiness.status, 503);
      assert.equal(readiness.body.status, "not_ready");
      assert.equal(readiness.body.application, "operational");
      assert.equal(readiness.body.database, "disconnected");

      const responseText = JSON.stringify([health.body, readiness.body]);
      assert.equal(responseText.includes(mongoURI), false);
      assert.equal(responseText.includes("private-password"), false);
      assert.equal(responseText.includes(process.env.JWT_SECRET), false);
    }, mongoURI);
  });

  await t.test("production API paths never substitute demo or in-memory data", async () => {
    await withProductionEnv(async () => {
      const customerToken = generateToken({
        id: "production-customer",
        role: "customer",
        email: "customer@example.test"
      });
      const adminToken = generateToken({
        id: "production-admin",
        role: "admin",
        email: "admin@example.test"
      });
      const fallbackUsersBefore = fallbackUsers.length;

      const providerResponse = await request(app).get("/api/providers");
      assert.equal(providerResponse.status, 503);
      assert.equal(providerResponse.body.error, "DatabaseUnavailable");

      const matchResponse = await request(app)
        .post("/api/match")
        .send({ query: "", selectedService: "", useAI: false });
      assert.equal(matchResponse.status, 503);

      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Production Customer",
          email: "production-customer@example.test",
          password: "valid-password-123"
        });
      assert.equal(registerResponse.status, 503);
      assert.equal(fallbackUsers.length, fallbackUsersBefore);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "production-customer@example.test", password: "valid-password-123" });
      assert.equal(loginResponse.status, 503);

      const bookingHeaders = { Authorization: `Bearer ${customerToken}` };
      assert.equal((await request(app).get("/api/bookings").set(bookingHeaders)).status, 503);
      assert.equal((await request(app)
        .post("/api/bookings")
        .set(bookingHeaders)
        .send({ providerId: "1", service: "AC Repair" })).status, 503);
      assert.equal((await request(app)
        .patch("/api/bookings/SM123456/status")
        .set(bookingHeaders)
        .send({ status: "cancelled" })).status, 503);

      assert.equal((await request(app)
        .post("/api/reviews")
        .set(bookingHeaders)
        .send({ bookingId: "booking-id", providerId: "provider-id", rating: 5 })).status, 503);
      assert.equal((await request(app).get("/api/notifications").set(bookingHeaders)).status, 503);
      assert.equal((await request(app)
        .post("/api/notifications/read")
        .set(bookingHeaders)
        .send({ ids: [] })).status, 503);

      const adminHeaders = { Authorization: `Bearer ${adminToken}` };
      assert.equal((await request(app).get("/api/admin/stats").set(adminHeaders)).status, 503);
      assert.equal((await request(app).get("/api/admin/users").set(adminHeaders)).status, 503);
      assert.equal((await request(app).get("/api/admin/reports").set(adminHeaders)).status, 503);
      assert.equal((await request(app)
        .post("/api/admin/users")
        .set(adminHeaders)
        .send({
          name: "Production Provider",
          email: "production-provider@example.test",
          password: "valid-password-123",
          role: "provider",
          service: "Electrical Repair"
        })).status, 503);
    });
  });

  await t.test("demo provider seeding is disabled in production", async () => {
    await withProductionEnv(async () => {
      let upsertCalls = 0;
      const originalUpsert = Provider.findOneAndUpdate;
      Provider.findOneAndUpdate = async () => {
        upsertCalls++;
      };

      try {
        assert.equal(await seedDemoData(), false);
      } finally {
        Provider.findOneAndUpdate = originalUpsert;
      }
      assert.equal(upsertCalls, 0);
    });
  });
});
