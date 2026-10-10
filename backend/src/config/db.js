import mongoose from "mongoose";
import { isProduction } from "./env.js";

export async function connectDB() {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    if (isProduction()) {
      throw new Error("MONGODB_URI is required in production.");
    }
    console.warn("⚠️ MONGODB_URI not defined. Running in development demo mode.");
    return false;
  }

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch {
    if (isProduction()) {
      throw new Error("MongoDB connection failed; refusing to start in production.");
    }
    console.warn("⚠️ MongoDB connection failed. Running in development demo mode.");
    return false;
  }
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

export function isDemoMode() {
  return !isProduction() && !isDBConnected();
}

export function createDatabaseUnavailableError() {
  const error = new Error("Database is unavailable.");
  error.name = "DatabaseUnavailableError";
  error.statusCode = 503;
  error.code = "DatabaseUnavailable";
  return error;
}

export function sendDatabaseUnavailable(res) {
  return res.status(503).json({
    success: false,
    error: "DatabaseUnavailable",
    message: "Database is unavailable."
  });
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
