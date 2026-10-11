import "dotenv/config";
import mongoose from "mongoose";
import { seedDemoData } from "../src/config/seed.js";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo data seeding is disabled when NODE_ENV=production.");
  }
  if (!["development", "test"].includes(process.env.NODE_ENV)) {
    throw new Error("Set NODE_ENV=development or NODE_ENV=test before seeding demo data.");
  }
  if (process.env.SEED_DEMO_DATA !== "true") {
    throw new Error("Set SEED_DEMO_DATA=true to explicitly confirm demo seeding.");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required; configure a local development/test database.");
  }

  const target = new URL(process.env.MONGODB_URI);
  const targetHost = target.hostname.toLowerCase();
  const databaseName = target.pathname.replace(/^\/+/, "").split("/")[0];
  if (!localHosts.has(targetHost)) {
    throw new Error("Demo seeding only allows local MongoDB hosts; remote databases are blocked.");
  }
  if (!databaseName) {
    throw new Error("MONGODB_URI must specify the target database name.");
  }

  console.log(`Demo seed target: ${targetHost}/${databaseName}`);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  console.log(`Connected database: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const seeded = await seedDemoData();
  if (!seeded) {
    throw new Error("Demo data seeding was refused.");
  }
}

main()
  .catch(error => {
    console.error(`Demo seeding failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
