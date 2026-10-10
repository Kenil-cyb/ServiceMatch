export async function requestJson(fetchImpl, url, options, onResponse) {
  let response;

  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    if (error instanceof TypeError) {
      const connectionError = new Error("Cannot connect to the backend. Check its availability and VITE_API_BASE_URL.");
      connectionError.code = "NetworkError";
      throw connectionError;
    }
    throw error;
  }

  onResponse?.(response);
  return parseJsonResponse(response);
}

export async function parseJsonResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status} error`);
    error.status = response.status;
    error.code = data.error;
    throw error;
  }

  return data;
}
