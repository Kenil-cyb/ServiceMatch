/**
 * ServiceMatch AI Matching & Ranking Engine
 * 
 * Weights:
 * - Skill match: 30%
 * - Distance: 25%
 * - Availability: 20%
 * - Rating: 15%
 * - Past service quality: 10%
 */

import { calculateHaversineDistance } from "./haversine.js";

export const WEIGHTS = {
  SKILL: 0.30,
  DISTANCE: 0.25,
  AVAILABILITY: 0.20,
  RATING: 0.15,
  QUALITY: 0.10,
};

export const DEFAULT_QUALITY_SCORE = 75;

export function calculateRatingScore(rating) {
  if (typeof rating !== "number" || isNaN(rating)) return 0;
  const clamped = Math.max(0, Math.min(5, rating));
  return Math.round((clamped / 5) * 100);
}

export function calculateDistanceScore(distance) {
  if (typeof distance !== "number" || isNaN(distance) || distance < 0) return 0;
  const score = 100 * Math.exp(-0.15 * distance);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateAvailabilityScore(available) {
  return available === true ? 100 : 0;
}

export function calculateSkillScore(provider, request = {}) {
  const { selectedService = "", query = "" } = request;
  const skills = Array.isArray(provider?.skills) ? provider.skills : [];
  const serviceTitle = provider?.service || "";

  const searchText = `${query} ${selectedService}`.trim().toLowerCase();
  if (!searchText) return 50;

  const targetServiceLower = selectedService.toLowerCase();
  
  const matchesCategory = targetServiceLower && (
    serviceTitle.toLowerCase().includes(targetServiceLower) ||
    skills.some(s => s.toLowerCase().includes(targetServiceLower))
  );

  if (matchesCategory) return 100;

  const words = searchText.split(/\s+/).filter(w => w.length > 2);
  let matchedCount = 0;

  words.forEach(word => {
    if (
      serviceTitle.toLowerCase().includes(word) ||
      skills.some(s => s.toLowerCase().includes(word))
    ) {
      matchedCount++;
    }
  });

  if (matchedCount > 0) {
    const ratio = matchedCount / Math.max(1, words.length);
    return Math.min(100, Math.round(50 + ratio * 50));
  }

  return 0;
}

export function calculateQualityScore(provider) {
  if (typeof provider?.qualityScore === "number" && !isNaN(provider.qualityScore)) {
    return {
      score: Math.max(0, Math.min(100, provider.qualityScore)),
      isDemoFallback: false
    };
  }

  return {
    score: DEFAULT_QUALITY_SCORE,
    isDemoFallback: true
  };
}

export function calculateProviderScore(provider, request = {}, options = {}) {
  const { strictAvailability = false, maxDistanceKm = 50, customerCoords = null } = options;

  if (!provider || typeof provider !== "object") {
    return {
      finalScore: 0,
      breakdown: { skill: 0, distance: 0, availability: 0, rating: 0, quality: 0 },
      explanation: "Invalid provider record",
      isEligible: false
    };
  }

  // Geographic distance computation (Haversine or provider.distance)
  let effectiveDistance = provider.distance ?? 2.0;
  if (customerCoords && provider.coordinates?.lat && provider.coordinates?.lng) {
    const calcDist = calculateHaversineDistance(
      customerCoords.lat, customerCoords.lng,
      provider.coordinates.lat, provider.coordinates.lng
    );
    if (calcDist !== null) {
      effectiveDistance = calcDist;
    }
  }

  // Radius filtering
  if (effectiveDistance > maxDistanceKm) {
    return {
      finalScore: 0,
      breakdown: { skill: 0, distance: 0, availability: 0, rating: 0, quality: 0 },
      explanation: `Exceeds max radius (${maxDistanceKm} km)`,
      isEligible: false
    };
  }

  const available = Boolean(provider.available);
  if (strictAvailability && !available) {
    return {
      finalScore: 0,
      breakdown: { skill: 0, distance: 0, availability: 0, rating: 0, quality: 0 },
      explanation: "Unavailable for requested timeframe",
      isEligible: false
    };
  }

  const skillScore = calculateSkillScore(provider, request);
  const distanceScore = calculateDistanceScore(effectiveDistance);
  const availabilityScore = calculateAvailabilityScore(available);
  const ratingScore = calculateRatingScore(provider.rating);
  const { score: qualityScore, isDemoFallback } = calculateQualityScore(provider);

  const finalScoreRaw =
    WEIGHTS.SKILL * skillScore +
    WEIGHTS.DISTANCE * distanceScore +
    WEIGHTS.AVAILABILITY * availabilityScore +
    WEIGHTS.RATING * ratingScore +
    WEIGHTS.QUALITY * qualityScore;

  const finalScore = Math.max(0, Math.min(100, Math.round(finalScoreRaw)));

  const reasons = [];
  if (skillScore >= 80) reasons.push("High skill relevance");
  if (distanceScore >= 70) reasons.push(`Close proximity (${effectiveDistance} km)`);
  if (available) reasons.push("Available today");
  if (ratingScore >= 90) reasons.push(`Top rating (${provider.rating ?? '?'}★)`);

  const explanation = reasons.length > 0
    ? `Matches due to: ${reasons.join(", ")}.`
    : "General service provider match.";

  return {
    finalScore,
    effectiveDistance,
    breakdown: {
      skill: skillScore,
      distance: distanceScore,
      availability: availabilityScore,
      rating: ratingScore,
      quality: qualityScore,
      isQualityDemoFallback: isDemoFallback
    },
    explanation,
    isEligible: true
  };
}

export function rankProviders(providers = [], request = {}, options = {}) {
  if (!Array.isArray(providers)) return [];

  return providers
    .map(provider => {
      const matchResult = calculateProviderScore(provider, request, options);
      return {
        ...provider,
        distance: matchResult.effectiveDistance ?? provider?.distance ?? 0,
        calculatedScore: matchResult.finalScore,
        matchDetails: matchResult
      };
    })
    .filter(p => p.matchDetails.isEligible)
    .sort((a, b) => b.calculatedScore - a.calculatedScore);
}
