import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApiUrl,
  normalizeProvider,
  resolveApiBaseUrl,
  sanitizeApiBaseUrl,
} from "./apiConfig.js";
import { requestJson } from "./http.js";

test("API base URL configuration", async t => {
  await t.test("uses the configured production API origin and normalizes /api", () => {
    assert.equal(
      resolveApiBaseUrl({ VITE_API_BASE_URL: "https://backend.example.test/api/" }),
      "https://backend.example.test"
    );
    assert.equal(
      resolveApiBaseUrl({ VITE_API_BASE_URL: "https://backend.example.test/" }),
      "https://backend.example.test"
    );
  });

  await t.test("uses localhost only as the Vite development fallback", () => {
    assert.equal(
      resolveApiBaseUrl({ DEV: true, DEVELOPMENT_API_BASE_URL: "http://localhost:5000" }),
      "http://localhost:5000"
    );
  });

  await t.test("does not fall back to localhost when the production URL is missing", () => {
    const diagnostics = [];
    assert.equal(resolveApiBaseUrl({ PROD: true }, message => diagnostics.push(message)), "");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /VITE_API_BASE_URL/);
  });

  await t.test("rejects local backend URLs from production builds", () => {
    const diagnostics = [];
    assert.equal(
      resolveApiBaseUrl(
        { PROD: true, VITE_API_BASE_URL: "http://127.0.0.1:5000/api" },
        message => diagnostics.push(message)
      ),
      ""
    );
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /public backend URL/);
  });

  await t.test("rejects invalid and credential-bearing API URLs without echoing them", () => {
    const diagnostics = [];
    assert.equal(
      resolveApiBaseUrl(
        { VITE_API_BASE_URL: "https://user:secret@backend.example.test" },
        message => diagnostics.push(message)
      ),
      ""
    );
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].includes("secret"), false);
  });

  await t.test("sanitizes unsafe or local production build-time API values", () => {
    assert.equal(
      sanitizeApiBaseUrl("http://localhost:5000/api", true),
      ""
    );
    assert.equal(
      sanitizeApiBaseUrl("https://user:secret@backend.example.test/path", true),
      ""
    );
    assert.equal(
      sanitizeApiBaseUrl("https://backend.example.test/path?token=secret", true),
      ""
    );
    assert.equal(
      sanitizeApiBaseUrl("https://backend.example.test/api", true),
      "https://backend.example.test/api"
    );
  });

  await t.test("adds exactly one /api prefix", () => {
    assert.equal(
      buildApiUrl("https://backend.example.test", "/providers"),
      "https://backend.example.test/api/providers"
    );
    assert.equal(
      buildApiUrl("https://backend.example.test", "/api/providers"),
      "https://backend.example.test/api/providers"
    );
    assert.throws(() => buildApiUrl("", "/providers"), /VITE_API_BASE_URL/);
  });
});

test("provider response normalization matches backend fields", () => {
  const provider = normalizeProvider({
    _id: "507f1f77bcf86cd799439011",
    name: "Amit Sharma",
    reviewsCount: 12,
    skills: ["AC Repair"],
  });

  assert.equal(provider.id, "507f1f77bcf86cd799439011");
  assert.equal(provider.reviews, 12);
  assert.equal(provider.initials, "AS");
  assert.deepEqual(provider.skills, ["AC Repair"]);
});

test("API failures are surfaced rather than converted into success data", async t => {
  await t.test("preserves a successful empty matching result as an empty result", async () => {
    const response = await requestJson(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, count: 0, data: [] }),
    }), "https://backend.example.test/api/match", {});

    assert.equal(response.success, true);
    assert.equal(response.count, 0);
    assert.deepEqual(response.data, []);
  });

  await t.test("preserves backend error responses and status codes", async () => {
    await assert.rejects(
      requestJson(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: "DatabaseUnavailable",
          message: "Database is unavailable.",
        }),
      }), "https://backend.example.test/api/providers", {}),
      error => {
        assert.equal(error.message, "Database is unavailable.");
        assert.equal(error.status, 503);
        assert.equal(error.code, "DatabaseUnavailable");
        return true;
      }
    );
  });

  await t.test("rejects network failures with a safe configuration diagnostic", async () => {
    await assert.rejects(
      requestJson(async () => {
        throw new TypeError("fetch failed");
      }, "https://backend.example.test/api/providers", {}),
      error => {
        assert.match(error.message, /VITE_API_BASE_URL/);
        assert.equal(error.code, "NetworkError");
        return true;
      }
    );
  });
});
