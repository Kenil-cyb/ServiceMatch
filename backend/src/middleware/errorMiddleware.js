/**
 * Centralized error handler middleware
 */
export function errorHandler(err, req, res, next) {
  console.error("Unhandled Error:", err);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.name || "InternalServerError",
    message: err.message || "An unexpected error occurred on the server."
  });
}

/**
 * 404 Not Found route handler middleware
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: "NotFound",
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
}
