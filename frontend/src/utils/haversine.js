/**
 * Calculates Great-Circle distance between two sets of lat/lng coordinates in kilometers using Haversine formula.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== "number" || typeof lon1 !== "number" ||
    typeof lat2 !== "number" || typeof lon2 !== "number" ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return null;
  }

  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10;
}
