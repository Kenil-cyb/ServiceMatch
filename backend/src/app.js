import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./routes/apiRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import { getTrustedProxyHops } from "./config/proxyTrust.js";

const app = express();

app.set("trust proxy", getTrustedProxyHops());

// Configure CORS
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: Origin '${origin}' is not permitted.`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to ServiceMatch AI Backend API",
    health: "/api/health",
    providers: "/api/providers",
    frontend: process.env.FRONTEND_ORIGIN || "http://localhost:5173"
  });
});

// Register API Routes
app.use("/api", apiRoutes);

// Catch-all 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;
