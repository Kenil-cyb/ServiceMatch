export function resolveApiBaseUrl(env = {}, reportError = console.error) {
  const configuredUrl = env.VITE_API_BASE_URL?.trim();
  const apiBaseUrl = configuredUrl || (env.DEV ? env.DEVELOPMENT_API_BASE_URL : "");

  if (!apiBaseUrl) {
    reportError("VITE_API_BASE_URL is missing; backend requests are disabled.");
    return "";
  }

  try {
    const parsedUrl = new URL(apiBaseUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      throw new Error("Invalid API URL");
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (env.PROD && isLoopbackHostname(hostname)) {
      reportError("VITE_API_BASE_URL must use a public backend URL in production; backend requests are disabled.");
      return "";
    }

    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "").replace(/\/api$/i, "");
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString().replace(/\/+$/, "");
  } catch {
    reportError("VITE_API_BASE_URL must be an absolute HTTP(S) URL; backend requests are disabled.");
    return "";
  }
}

export function isLoopbackHostname(hostname) {
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(normalizedHostname) ||
    normalizedHostname === "0.0.0.0" ||
    normalizedHostname === "[::1]";
}

export function sanitizeApiBaseUrl(value, production = false) {
  if (!value?.trim()) return "";

  try {
    const parsedUrl = new URL(value.trim());
    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash ||
      (production && isLoopbackHostname(parsedUrl.hostname))
    ) {
      return "";
    }
    return parsedUrl.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function buildApiUrl(apiBaseUrl, endpoint) {
  if (!apiBaseUrl) {
    throw new Error("Backend API is not configured. Set VITE_API_BASE_URL and rebuild the frontend.");
  }

  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const apiPath = path.replace(/^\/api(?:\/|$)/i, "/");
  return `${apiBaseUrl}/api${apiPath}`;
}

export function normalizeProvider(provider) {
  return {
    ...provider,
    id: provider.id || provider._id,
    reviews: provider.reviews ?? provider.reviewsCount ?? 0,
    initials: provider.initials || provider.name?.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?",
    skills: Array.isArray(provider.skills) ? provider.skills : [],
  };
}
