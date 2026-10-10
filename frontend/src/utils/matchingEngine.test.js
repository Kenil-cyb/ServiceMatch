import {
  calculateRatingScore,
  calculateDistanceScore,
  calculateAvailabilityScore,
  calculateSkillScore,
  calculateQualityScore,
  calculateProviderScore,
  rankProviders,
  WEIGHTS,
  DEFAULT_QUALITY_SCORE
} from "./matchingEngine.js";
import { calculateHaversineDistance } from "./haversine.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function runTests() {
  console.log("Running ServiceMatch Matching Engine Unit Tests...\n");

  // Test 1: Weight Verification (100% total)
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert(Math.abs(totalWeight - 1.0) < 0.0001, `Total weights must sum to 1.0 (got ${totalWeight})`);
  console.log("✓ Test 1: Weights correctly sum to 100%");

  // Test 2: Rating Normalization
  assert(calculateRatingScore(5.0) === 100, "5.0 rating should normalize to 100");
  assert(calculateRatingScore(4.0) === 80, "4.0 rating should normalize to 80");
  assert(calculateRatingScore(0) === 0, "0 rating should normalize to 0");
  assert(calculateRatingScore(null) === 0, "Invalid rating should normalize to 0");
  console.log("✓ Test 2: Rating score normalization (5-star -> 100pt)");

  // Test 3: Distance Decay Normalization
  assert(calculateDistanceScore(0) === 100, "0km distance should yield 100 points");
  assert(calculateDistanceScore(1.8) === 76, "1.8km distance should yield ~76 points");
  assert(calculateDistanceScore(10) === 22, "10km distance should yield ~22 points");
  assert(calculateDistanceScore(-5) === 0, "Negative distance should handle safely (0)");
  assert(calculateDistanceScore(undefined) === 0, "Undefined distance should return 0");
  console.log("✓ Test 3: Distance decay formula normalization");

  // Test 4: Haversine Geographic Distance Calculation
  // Coordinates for NYC (40.7128, -74.0060) to Brooklyn (40.6782, -73.9442) ~ 6.5 km
  const haversineDist = calculateHaversineDistance(40.7128, -74.0060, 40.6782, -73.9442);
  assert(haversineDist !== null && haversineDist > 6 && haversineDist < 7, `Haversine distance should be ~6.5km, got ${haversineDist}`);
  console.log(`✓ Test 4: Haversine geographic distance formula calculation (${haversineDist} km)`);

  // Test 5: Availability Score
  assert(calculateAvailabilityScore(true) === 100, "Available provider should get 100");
  assert(calculateAvailabilityScore(false) === 0, "Unavailable provider should get 0");
  console.log("✓ Test 5: Availability score handling");

  // Test 6: Quality Score Handling & Missing Values
  const provWithQuality = { name: "P1", qualityScore: 92 };
  const provWithoutQuality = { name: "P2" };
  
  const q1 = calculateQualityScore(provWithQuality);
  assert(q1.score === 92 && !q1.isDemoFallback, "Verified quality score should be used");

  const q2 = calculateQualityScore(provWithoutQuality);
  assert(q2.score === DEFAULT_QUALITY_SCORE && q2.isDemoFallback, "Missing quality score should use explicitly labeled fallback");
  console.log("✓ Test 6: Verified vs Demo fallback quality scores");

  // Test 7: Provider Calculation & Formula Accuracy
  const perfectProvider = {
    name: "Perfect Pro",
    service: "AC Repair",
    skills: ["AC Repair"],
    distance: 0,
    available: true,
    rating: 5.0,
    qualityScore: 100
  };
  const perfResult = calculateProviderScore(perfectProvider, { selectedService: "AC Repair" });
  assert(perfResult.finalScore === 100, `Perfect score should be 100, got ${perfResult.finalScore}`);
  console.log("✓ Test 7: Formula evaluation on perfect provider");

  // Test 8: Ranking & Sorting
  const providersList = [
    { id: 1, name: "Far Pro", service: "Plumbing", skills: ["Plumbing"], distance: 15, available: true, rating: 4.0 },
    { id: 2, name: "Close Top Pro", service: "Plumbing", skills: ["Plumbing"], distance: 1.0, available: true, rating: 4.9 },
    { id: 3, name: "Busy Pro", service: "Plumbing", skills: ["Plumbing"], distance: 0.5, available: false, rating: 5.0 }
  ];

  const ranked = rankProviders(providersList, { selectedService: "Plumbing" });
  assert(ranked[0].id === 2, "Close Top Pro should be ranked first");
  assert(ranked[0].calculatedScore >= ranked[1].calculatedScore, "List should be sorted in descending order");
  console.log("✓ Test 8: Provider ranking and descending score sorting");

  // Test 9: Strict Availability Exclusion & Max Distance Radius
  const strictRanked = rankProviders(providersList, { selectedService: "Plumbing" }, { strictAvailability: true });
  assert(!strictRanked.some(p => p.id === 3), "Unavailable provider should be excluded when strictAvailability is true");

  const radiusFiltered = rankProviders(providersList, { selectedService: "Plumbing" }, { maxDistanceKm: 10 });
  assert(!radiusFiltered.some(p => p.id === 1), "Far Pro (15km) should be excluded when maxDistanceKm is 10");
  console.log("✓ Test 9: Strict availability filtering & max radius cutoff");

  // Test 10: Missing / Corrupted Data Safety
  const corruptedList = [null, undefined, {}, { name: "Incomplete" }];
  const safeRanked = rankProviders(corruptedList, {});
  assert(Array.isArray(safeRanked), "Should handle corrupted data without throwing errors");
  console.log("✓ Test 10: Safe handling of missing/invalid records");

  console.log("\nALL 10 UNIT TESTS PASSED SUCCESSFULLY!");
}

runTests();
