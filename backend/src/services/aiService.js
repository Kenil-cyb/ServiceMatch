import { GoogleGenAI } from "@google/genai";
import { rankProviders } from "./matchingService.js";

const CATEGORIES = [
  "AC Repair",
  "Plumbing",
  "Electrical",
  "Cleaning",
  "Computer Repair",
  "Car Repair"
];

/**
 * Deterministic fallback parser when LLM is unavailable or unconfigured
 */
export function parseRequestFallback(text = "") {
  const lower = text.toLowerCase();
  
  const serviceKeywords = {
    "AC Repair": ["ac", "air conditioner", "cooling", "hvac", "compressor"],
    "Plumbing": ["plumb", "tap", "pipe", "leak", "water", "drain", "sink"],
    "Electrical": ["electric", "wiring", "switch", "light", "power", "fuse", "short circuit"],
    "Cleaning": ["clean", "dust", "deep cleaning", "mopping", "maid"],
    "Computer Repair": ["computer", "laptop", "pc", "keyboard", "screen", "macbook", "software"],
    "Car Repair": ["car", "vehicle", "engine", "brake", "clutch", "oil change"]
  };

  const detectedCategory = Object.keys(serviceKeywords).find(cat =>
    serviceKeywords[cat].some(kw => lower.includes(kw))
  );

  let preferredTime = "anytime";
  if (lower.includes("evening")) preferredTime = "evening";
  else if (lower.includes("morning")) preferredTime = "morning";
  else if (lower.includes("afternoon")) preferredTime = "afternoon";

  let urgency = "medium";
  if (lower.includes("urgent") || lower.includes("today") || lower.includes("immediately") || lower.includes("asap")) {
    urgency = "high";
  }

  return {
    service: detectedCategory || "General Maintenance",
    problem: text || "Service request",
    preferredTime,
    urgency,
    isAIGenerated: false,
    confidence: detectedCategory ? 0.8 : 0.4
  };
}

/**
 * LLM Request Understanding Service using Google Gen AI SDK
 */
export async function parseServiceRequestAI(queryText = "") {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY not configured. Using deterministic fallback parser.");
    return parseRequestFallback(queryText);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Analyze the following customer service request and extract structured details.
Only select a service from this exact list: ${JSON.stringify(CATEGORIES)}. If none match, use "General Maintenance".

Customer request: "${queryText}"

Return JSON matching this exact structure:
{
  "service": "AC Repair",
  "problem": "AC is not cooling properly",
  "preferredTime": "evening",
  "urgency": "high"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedJson = JSON.parse(response.text);

    return {
      service: CATEGORIES.includes(parsedJson.service) ? parsedJson.service : "General Maintenance",
      problem: parsedJson.problem || queryText,
      preferredTime: parsedJson.preferredTime || "anytime",
      urgency: ["low", "medium", "high"].includes(parsedJson.urgency) ? parsedJson.urgency : "medium",
      isAIGenerated: true,
      confidence: 0.95
    };
  } catch (err) {
    console.warn("LLM API parsing failed, falling back to deterministic parser:", err.message);
    return parseRequestFallback(queryText);
  }
}
