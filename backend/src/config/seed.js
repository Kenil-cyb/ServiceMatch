import mongoose from "mongoose";
import dotenv from "dotenv";
import Provider from "../models/Provider.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { isProduction } from "./env.js";

dotenv.config();

export const demoSeedProviders = [
  {
    name: "Amit Sharma",
    service: "AC Repair Specialist",
    rating: 4.9,
    reviewsCount: 128,
    distance: 1.8,
    experience: 5,
    available: true,
    skills: ["AC Repair", "HVAC", "Maintenance"],
    services: ["AC Repair", "HVAC Maintenance"],
    price: 499,
    initials: "AS",
    color: "#dbeafe",
    qualityScore: 92
  },
  {
    name: "Rahul Patel",
    service: "Home Appliance Expert",
    rating: 4.7,
    reviewsCount: 96,
    distance: 2.5,
    experience: 4,
    available: true,
    skills: ["AC Repair", "Refrigerator"],
    services: ["Appliance Repair"],
    price: 399,
    initials: "RP",
    color: "#dcfce7",
    qualityScore: 88
  },
  {
    name: "Priya Shah",
    service: "Electrical Specialist",
    rating: 4.8,
    reviewsCount: 112,
    distance: 3.2,
    experience: 6,
    available: true,
    skills: ["Electrical", "Wiring", "Maintenance"],
    services: ["Electrical Repair", "Wiring"],
    price: 449,
    initials: "PS",
    color: "#f3e8ff",
    qualityScore: 90
  },
  {
    name: "Vikram Singh",
    service: "Professional Technician",
    rating: 4.6,
    reviewsCount: 74,
    distance: 4.1,
    experience: 3,
    available: false,
    skills: ["AC Repair", "Maintenance"],
    services: ["AC Repair"],
    price: 349,
    initials: "VS",
    color: "#ffedd5",
    qualityScore: 82
  }
];

export async function seedDemoData() {
  if (isProduction()) return false;
  if (mongoose.connection.readyState !== 1) return;

  try {
    for (const prov of demoSeedProviders) {
      // Idempotent upsert by provider name and service
      await Provider.findOneAndUpdate(
        { name: prov.name, service: prov.service },
        prov,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log("🌱 Idempotent demo provider seed verified.");
    return true;
  } catch (err) {
    console.error("Seed error:", err.message);
  }
}
