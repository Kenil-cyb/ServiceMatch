import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { seedDemoData } from "./config/seed.js";
import { isProduction, validateStartupEnv } from "./config/env.js";

const PORT = process.env.PORT || 5000;

export async function startServer() {
  validateStartupEnv();
  const connected = await connectDB();

  if (isProduction() && !connected) {
    throw new Error("MongoDB is required to start in production.");
  }

  if (connected && !isProduction()) {
    await seedDemoData();
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 ServiceMatch AI Backend server running on http://localhost:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📡 Readiness Check: http://localhost:${PORT}/api/ready`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch(error => {
    console.error(`FATAL STARTUP ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
