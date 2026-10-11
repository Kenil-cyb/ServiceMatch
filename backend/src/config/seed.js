import mongoose from "mongoose";
import Provider from "../models/Provider.js";
import { isProduction } from "./env.js";

const demoProviderFields = [
  {
    seedKey: "ac-cooling-01",
    name: "Northstar Demo Cooling",
    service: "AC Repair Specialist",
    skills: ["AC Repair", "HVAC", "Cooling system maintenance"],
    services: ["AC Repair", "AC servicing", "Filter cleaning"],
    location: "Baner, Pune",
    distance: 1.2,
    experience: 3,
    price: 899,
    available: true,
    color: "#dbeafe"
  },
  {
    seedKey: "ac-cooling-02",
    name: "Breeze Sample Service",
    service: "AC Repair Specialist",
    skills: ["AC Repair", "Split AC", "Gas leak diagnosis"],
    services: ["AC Repair", "Seasonal AC servicing"],
    location: "Aundh, Pune",
    distance: 2.6,
    experience: 6,
    price: 749,
    available: true,
    color: "#dcfce7"
  },
  {
    seedKey: "ac-cooling-03",
    name: "Cool Circuit Test Works",
    service: "AC Repair Specialist",
    skills: ["AC Repair", "Window AC", "Condenser coil servicing"],
    services: ["AC Repair", "AC deep cleaning"],
    location: "Kothrud, Pune",
    distance: 4.4,
    experience: 8,
    price: 999,
    available: false,
    color: "#ffedd5"
  },
  {
    seedKey: "plumbing-01",
    name: "Pipewise Demo Plumbing",
    service: "Plumbing Specialist",
    skills: ["Plumbing", "Leak repair", "Tap installation"],
    services: ["Plumbing", "Pipe and drain repair"],
    location: "Baner, Pune",
    distance: 1.4,
    experience: 4,
    price: 499,
    available: true,
    color: "#dbeafe"
  },
  {
    seedKey: "plumbing-02",
    name: "Clearflow Sample Works",
    service: "Plumbing Specialist",
    skills: ["Plumbing", "Drain clearing", "Water heater"],
    services: ["Plumbing", "Bathroom fixture repair"],
    location: "Aundh, Pune",
    distance: 3.7,
    experience: 7,
    price: 599,
    available: true,
    color: "#dcfce7"
  },
  {
    seedKey: "plumbing-03",
    name: "Copperline Test Services",
    service: "Plumbing Specialist",
    skills: ["Plumbing", "Pipe fitting", "Water pressure"],
    services: ["Plumbing", "Leak detection"],
    location: "Kothrud, Pune",
    distance: 5.5,
    experience: 10,
    price: 699,
    available: false,
    color: "#f3e8ff"
  },
  {
    seedKey: "electrical-01",
    name: "Bright Circuit Demo Co.",
    service: "Electrical Repair Specialist",
    skills: ["Electrical", "Wiring", "Switch and socket repair"],
    services: ["Electrical", "Lighting installation"],
    location: "Baner, Pune",
    distance: 1.8,
    experience: 2,
    price: 449,
    available: true,
    color: "#fef3c7"
  },
  {
    seedKey: "electrical-02",
    name: "SafeSpark Sample Electric",
    service: "Electrical Repair Specialist",
    skills: ["Electrical", "Circuit breaker", "Fault finding"],
    services: ["Electrical", "Electrical safety checks"],
    location: "Aundh, Pune",
    distance: 3.2,
    experience: 5,
    price: 549,
    available: true,
    color: "#dcfce7"
  },
  {
    seedKey: "electrical-03",
    name: "Voltwise Test Repairs",
    service: "Electrical Repair Specialist",
    skills: ["Electrical", "Fan repair", "Power troubleshooting"],
    services: ["Electrical", "Fan and appliance wiring"],
    location: "Kothrud, Pune",
    distance: 5.0,
    experience: 9,
    price: 649,
    available: false,
    color: "#f3e8ff"
  },
  {
    seedKey: "cleaning-01",
    name: "FreshNest Demo Cleaning",
    service: "Home Cleaning Specialist",
    skills: ["Cleaning", "Deep cleaning", "Kitchen cleaning"],
    services: ["Cleaning", "Home deep cleaning"],
    location: "Baner, Pune",
    distance: 1.1,
    experience: 3,
    price: 799,
    available: true,
    color: "#dbeafe"
  },
  {
    seedKey: "cleaning-02",
    name: "Tidy Table Sample Care",
    service: "Home Cleaning Specialist",
    skills: ["Cleaning", "Bathroom cleaning", "Move-in cleaning"],
    services: ["Cleaning", "Move-in and move-out cleaning"],
    location: "Aundh, Pune",
    distance: 2.8,
    experience: 5,
    price: 899,
    available: true,
    color: "#dcfce7"
  },
  {
    seedKey: "cleaning-03",
    name: "NeatPath Test Home Care",
    service: "Home Cleaning Specialist",
    skills: ["Cleaning", "Dusting", "Floor care"],
    services: ["Cleaning", "Regular home cleaning"],
    location: "Kothrud, Pune",
    distance: 4.1,
    experience: 7,
    price: 699,
    available: false,
    color: "#ffedd5"
  },
  {
    seedKey: "computer-01",
    name: "ByteBridge Demo Repairs",
    service: "Computer Repair Specialist",
    skills: ["Computer Repair", "Laptop diagnostics", "Hardware upgrades"],
    services: ["Computer Repair", "Laptop repair"],
    location: "Baner, Pune",
    distance: 2.3,
    experience: 4,
    price: 799,
    available: true,
    color: "#dbeafe"
  },
  {
    seedKey: "computer-02",
    name: "PixelBench Sample Tech",
    service: "Computer Repair Specialist",
    skills: ["Computer Repair", "Desktop repair", "Operating system setup"],
    services: ["Computer Repair", "Desktop troubleshooting"],
    location: "Aundh, Pune",
    distance: 3.9,
    experience: 6,
    price: 699,
    available: true,
    color: "#f3e8ff"
  },
  {
    seedKey: "computer-03",
    name: "CircuitLeaf Test Computing",
    service: "Computer Repair Specialist",
    skills: ["Computer Repair", "Data transfer", "Wi-Fi troubleshooting"],
    services: ["Computer Repair", "Home computer setup"],
    location: "Kothrud, Pune",
    distance: 6.1,
    experience: 11,
    price: 899,
    available: false,
    color: "#ffedd5"
  },
  {
    seedKey: "car-01",
    name: "RoadReady Demo Garage",
    service: "Car Repair Specialist",
    skills: ["Car Repair", "Brake inspection", "Oil change"],
    services: ["Car Repair", "Basic vehicle servicing"],
    location: "Baner, Pune",
    distance: 3.0,
    experience: 5,
    price: 999,
    available: true,
    color: "#dbeafe"
  },
  {
    seedKey: "car-02",
    name: "Gearway Sample Auto Care",
    service: "Car Repair Specialist",
    skills: ["Car Repair", "Battery check", "Engine diagnostics"],
    services: ["Car Repair", "Battery and engine checks"],
    location: "Aundh, Pune",
    distance: 4.8,
    experience: 8,
    price: 1199,
    available: true,
    color: "#dcfce7"
  },
  {
    seedKey: "car-03",
    name: "MotorMap Test Workshop",
    service: "Car Repair Specialist",
    skills: ["Car Repair", "Clutch inspection", "Tire service"],
    services: ["Car Repair", "Vehicle inspection"],
    location: "Kothrud, Pune",
    distance: 7.2,
    experience: 12,
    price: 1099,
    available: false,
    color: "#f3e8ff"
  }
];

export const demoSeedProviders = demoProviderFields.map(provider => ({
  ...provider,
  isDemoData: true,
  rating: 0,
  reviewsCount: 0,
  completedJobs: 0,
  qualityScore: 0,
  initials: provider.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()
}));

export async function seedDemoData() {
  if (isProduction()) return false;
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Connect to a development or test database before seeding demo providers.");
  }

  for (const provider of demoSeedProviders) {
    const seededProvider = await Provider.findOneAndUpdate(
      { seedKey: provider.seedKey },
      { $setOnInsert: provider },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    if (!seededProvider.isDemoData) {
      throw new Error(`Seed key '${provider.seedKey}' belongs to a non-demo provider; no data was changed.`);
    }
  }

  console.log(`Seeded ${demoSeedProviders.length} fictional demo providers.`);
  return true;
}
