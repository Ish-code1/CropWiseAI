/// <reference types="node" />
/**
 * app/api/gemini/route.ts
 * ============================================================
 * Central AI API Route — OpenAI GPT
 * Model: gpt-4.1-mini-2025-04-14
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import type { GeminiRequestBody, GeminiResponseBody } from "@/types";
import { safeJsonParse } from "@/lib/utils";
import { getNeo4jDriver } from "@/lib/neo4j";

// ─── Model ────────────────────────────────────────────────────────────────────

// gemini-2.5-flash is current and multimodal (text + vision). Free-tier quota
// for the older gemini-2.0-flash has been reduced to 0 on many projects.
const MODEL_TEXT   = process.env.GEMINI_MODEL || "gemini-2.5-flash";  // Text: chat + crop advisor
const MODEL_VISION = process.env.GEMINI_MODEL || "gemini-2.5-flash";  // Vision: pest diagnosis (supports images)

// Allow agricultural content (pesticide names, chemical treatments) without blocking
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ─── System Prompts ───────────────────────────────────────────────────────────

function buildChatSystemPrompt(language = "en", contextData?: string): string {
  const langMap: Record<string, string> = {
    en: "Respond in clear, simple English.",
    hi: "हिंदी में जवाब दें। सरल और स्पष्ट भाषा का उपयोग करें।",
    pa: "ਪੰਜਾਬੀ ਵਿੱਚ ਜਵਾਬ ਦਿਓ। ਸਾਦੀ ਭਾਸ਼ਾ ਵਰਤੋ।",
    mr: "मराठीत उत्तर द्या. साधी भाषा वापरा.",
    te: "తెలుగులో సమాధానం ఇవ్వండి.",
    ta: "தமிழில் பதில் அளிக்கவும்.",
    bn: "বাংলায় উত্তর দিন। সহজ ও স্পষ্ট ভাষা ব্যবহার করুন।",
    gu: "ગુજરાતીમાં જવાબ આપો. સરળ અને સ્પષ્ટ ભાષાનો ઉપયોગ કરો.",
    kn: "ಕನ್ನಡದಲ್ಲಿ ಉತ್ತರಿಸಿ. ಸರಳ ಮತ್ತು ಸ್ಪಷ್ಟ ಭಾಷೆಯನ್ನು ಬಳಸಿ.",
    ml: "മലയാളത്തിൽ മറുപടി നൽകുക. ലളിതവും വ്യക്തവുമായ ഭാഷ ഉപയോഗിക്കുക.",
    od: "ଓଡ଼ିଆରେ ଉତ୍ତର ଦିଅନ୍ତୁ। ସରଳ ଓ ସ୍ପଷ୍ଟ ଭାଷା ବ୍ୟବହାର କରନ୍ତୁ।",
  };

  return `You are CropWise AI, an expert agricultural advisor for Indian farmers.

Your expertise covers:
- Crop cultivation: wheat, rice, maize, cotton, pulses, oilseeds, vegetables
- Soil health, fertilisation, and irrigation best practices
- Integrated Pest Management (IPM) and organic farming
- Indian agricultural seasons: Kharif, Rabi, and Zaid
- Government schemes: PM-KISAN, PMFBY, KCC, Soil Health Card
- Market prices and Minimum Support Prices (MSP) for major crops
- Climate-smart agriculture for Indian agro-climatic zones

${contextData ? `REAL-TIME FARM CONTEXT (use this to give personalised advice):
${contextData}

Use this context to make responses specific and relevant:
- High humidity → mention fungal disease risk
- Low soil moisture → recommend irrigation
- Price below MSP → mention procurement options
- Rain forecast → advise on spray timing` : ""}

LANGUAGE: ${langMap[language] ?? langMap["en"]}

RESPONSE GUIDELINES:
- CRITICAL: Keep your response EXTREMELY short, crisp, and to the point (maximum 2-3 short sentences).
- If you need more information to give accurate advice, FIRST ask 1 or 2 essential questions. Do not provide a long generic answer.
- Be concise, practical, and actionable.
- Use Indian units: acres, quintals, bags (50kg). Currency in INR (₹)
- Limit the use of bullet points; keep the total response under 500 characters.
- Always suggest consulting a local agronomist for critical decisions`;
}

const PEST_SYSTEM = `You are CropWise AI's Sustainable Pest Management Expert.

Your role is to provide environmentally responsible, climate-smart pest management recommendations based on detected crop diseases or pests.

PRIMARY OBJECTIVE:
Minimize pesticide usage while maximizing crop protection and sustainability.

OUTPUT FORMAT RULES:
1. Prioritize Organic → Biological → Cultural → Mechanical → Chemical solutions.
2. If sustainable/organic alternatives are provided from the Knowledge Graph, you MUST explicitly recommend them FIRST and highlight their "soilHealthBenefit" to explain why they are better for the soil ecosystem than harsh chemicals.
3. Chemical pesticides must always appear last.
4. Explain environmental impact whenever possible.
5. Use farmer-friendly language.

RETURN VALID JSON ONLY. You must follow this exact schema, mapping your sustainability advice into the appropriate JSON keys:

{
  "diseaseName": "string",
  "scientificName": "string",
  "confidencePercent": number,
  "severity": "Low" | "Moderate" | "High" | "Critical", // Map Risk Level here
  "affectedArea": "string", // From Pest Detection Summary
  "symptoms": ["string"], // Map Knowledge Graph insights here
  "treatment": {
    "immediate": ["string"], // Map your Organic Solutions and Biological Controls here. Prefix each with "ORGANIC: " or "BIOLOGICAL: "
    "preventive": ["string"], // Map your Cultural and Mechanical controls here. Prefix with "CULTURAL: " or "MECHANICAL: "
    "recommendedPesticides": ["string"] // Chemical control (last resort only)
  },
  "disclaimer": "Consult a local agronomist before applying treatments.",
  "detailedReportSections": [
    {
      "title": "string", // Must be exactly one of: "Diagnosis", "Severity Assessment", "Environmental Impact", "Organic Strategy", "Biological Strategy", "Cultural Strategy", "Mechanical Strategy", "Pesticide Caution", "Monitoring", "Sustainability Note"
      "content": "string" // Concise 1-2 sentence explanation.
    }
  ] // IMPORTANT: You MUST generate exactly 10 sections using the exact titles listed above in order.
}`;

const CROP_ADVISOR_SYSTEM = `You are an expert agronomist for Indian farm economics and sustainability.
Return VALID JSON ONLY — no text outside JSON.

{
  "recommendations": [{
    "cropName": "string",
    "localName": "string",
    "suitabilityScore": number,
    "climateRiskScore": number,
    "climateRiskLevel": "Low" | "Medium" | "High",
    "carbonFootprint": "string",
    "sustainabilityTags": ["string"],
    "expectedYield": "string",
    "estimatedROI": {
      "investmentPerAcre": number,
      "expectedRevenuePerAcre": number,
      "profitPerAcre": number,
      "paybackMonths": number
    },
    "growingPeriodDays": number,
    "waterRequirement": "Low" | "Medium" | "High",
    "soilCompatibility": "string",
    "reasonsForRecommendation": ["string"],
    "risks": ["string"]
  }],
  "generalAdvice": "string",
  "bestCrop": "string"
}`;

// ─── Native-language output for structured (JSON) responses ───────────────────

const LANG_NAME: Record<string, string> = {
  en: "English", hi: "Hindi", pa: "Punjabi", mr: "Marathi", te: "Telugu",
  ta: "Tamil", bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam",
  od: "Odia",
};

// Tells the model to translate the human-readable VALUES of the pest-diagnosis
// JSON into the selected language, while keeping code-critical fields English.
function pestLangInstruction(language: string): string {
  const name = LANG_NAME[language];
  if (!name || language === "en") return "";
  return `

LANGUAGE REQUIREMENT:
Write ALL human-readable string VALUES in ${name}. This includes: "affectedArea",
every item in "symptoms", every item in "treatment.immediate" and
"treatment.preventive", "disclaimer", and every "detailedReportSections[].title"
and "detailedReportSections[].content".

KEEP THESE EXACTLY AS-IS (do NOT translate):
- All JSON keys, spelled exactly as in the schema.
- "severity": must remain one of the exact English values Low | Moderate | High | Critical.
- "diseaseName": keep the standard English/Latin name. If the plant is healthy,
  use exactly "Healthy Plant"; if it cannot be diagnosed, use exactly "Unable to Diagnose".
- "scientificName": keep in Latin.
- The prefixes "ORGANIC: ", "BIOLOGICAL: ", "CULTURAL: ", "MECHANICAL: " at the start
  of treatment items must stay in English — translate only the text after the prefix.
- Product/brand names in "recommendedPesticides" stay unchanged.

Use simple, farmer-friendly ${name}.`;
}

// Localizes the readable values of the crop-advisor JSON; keeps keys, enums
// (climateRiskLevel, waterRequirement), and numbers in English.
function cropLangInstruction(language: string): string {
  const name = LANG_NAME[language];
  if (!name || language === "en") return "";
  return `

LANGUAGE REQUIREMENT:
Write all human-readable string VALUES in ${name} — including "localName",
"carbonFootprint", "sustainabilityTags", "expectedYield", "soilCompatibility",
"reasonsForRecommendation", "risks", and "generalAdvice".
KEEP IN ENGLISH: all JSON keys; the enum values for "climateRiskLevel"
(Low | Medium | High) and "waterRequirement" (Low | Medium | High); all numbers;
and "cropName"/"bestCrop" (use the common English crop name). Use simple ${name}.`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<GeminiResponseBody>> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY not set in .env.local" },
        { status: 503 }
      );
    }

    let body: GeminiRequestBody;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 }); }

    const { prompt, mode, language = "en", imageBase64, imageMimeType, context, history } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ success: false, error: "Prompt required." }, { status: 400 });
    }

    const client = new GoogleGenerativeAI(apiKey);

    if (mode === "chat") {
      return await handleChat(client, prompt, language, context, history);
    }
    if (mode === "pest_diagnosis") {
      if (!imageBase64 || !imageMimeType) {
        return NextResponse.json(
          { success: false, error: "Image required for pest diagnosis." },
          { status: 400 }
        );
      }
      return await handlePestDiagnosis(client, prompt, imageBase64, imageMimeType, language);
    }
    if (mode === "crop_advisor") {
      return await handleCropAdvisor(client, prompt, context, language);
    }

    return NextResponse.json({ success: false, error: `Invalid mode: ${mode}` }, { status: 400 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[OpenAI API] Unhandled error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── Handler: Chat ────────────────────────────────────────────────────────────

async function handleChat(
  client: GoogleGenerativeAI,
  prompt: string,
  language: string,
  context?: string,
  history?: { role: "user" | "model"; content: string }[]
): Promise<NextResponse<GeminiResponseBody>> {
  const model = client.getGenerativeModel({
    model: MODEL_TEXT,
    systemInstruction: buildChatSystemPrompt(language, context),
    safetySettings: SAFETY_SETTINGS,
  });

  const formattedHistory = history?.map(h => ({
    role: h.role,
    parts: [{ text: h.content }]
  }));

  const chat = model.startChat({
    history: formattedHistory
  });

  const completion = await chat.sendMessage(prompt);
  const text = completion.response.text();
  return NextResponse.json({ success: true, text });
}

// ─── Handler: Pest Diagnosis (Vision) ────────────────────────────────────────

async function handlePestDiagnosis(
  client: GoogleGenerativeAI,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  language = "en"
): Promise<NextResponse<GeminiResponseBody>> {
  const model = client.getGenerativeModel({
    model: MODEL_VISION,
    systemInstruction: PEST_SYSTEM + pestLangInstruction(language),
    safetySettings: SAFETY_SETTINGS,
    generationConfig: { responseMimeType: "application/json" }
  });

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: imageMimeType
    }
  };

  const completion = await model.generateContent([
    prompt || "Diagnose any disease or pest visible in this crop image using the sustainable pest management guidelines.",
    imagePart
  ]);

  const rawText    = completion.response.text();
  const structured = safeJsonParse<Record<string, unknown>>(rawText);

  if (!structured) {
    console.error("[Pest Diagnosis] Failed to parse JSON:", rawText);
    return NextResponse.json(
      { success: false, error: "AI returned unparseable response. Try again.", text: rawText },
      { status: 500 }
    );
  }

  // --- NEO4J SUSTAINABILITY KNOWLEDGE GRAPH INTEGRATION ---
  try {
    const diseaseName = structured.diseaseName as string;
    if (diseaseName && process.env.NEO4J_URI) {
      const driver = getNeo4jDriver();
      const session = driver.session();
      
      // Query Neo4j for sustainable treatments for this pest
      const query = `
        MATCH (p:Pest)-[:TREATED_BY]->(t:Treatment)
        // Simple fuzzy match for demo purposes
        WHERE toLower(p.name) CONTAINS toLower($diseaseName) OR toLower($diseaseName) CONTAINS toLower(p.name)
        RETURN t.name AS name, t.type AS type, t.isEcoFriendly AS isEcoFriendly, t.description AS description, t.soilHealthBenefit AS soilHealthBenefit, t.sustainabilityScore AS score
        ORDER BY t.sustainabilityScore DESC
      `;
      
      const result = await session.run(query, { diseaseName });
      
      const sustainableTreatments = result.records.map((record: any) => ({
        name: record.get('name'),
        type: record.get('type'),
        isEcoFriendly: record.get('isEcoFriendly'),
        description: record.get('description'),
        soilHealthBenefit: record.get('soilHealthBenefit'),
        score: record.get('score').toNumber()
      }));

      // Inject Neo4j graph data into the Gemini response
      if (sustainableTreatments.length > 0) {
        if (!structured.treatment) structured.treatment = {};
        (structured.treatment as Record<string, unknown>).sustainableAlternativesFromGraph = sustainableTreatments;
      }
      
      await session.close();
    }
  } catch (error) {
    console.error("[Neo4j] Failed to enrich pest diagnosis:", error);
    // Continue without failing the request if Neo4j is down or not configured
  }
  // ---------------------------------------------------------

  return NextResponse.json({ success: true, structured });
}

// ─── Handler: Crop Advisor ────────────────────────────────────────────────────

async function handleCropAdvisor(
  client: GoogleGenerativeAI,
  prompt: string,
  context?: string,
  language = "en"
): Promise<NextResponse<GeminiResponseBody>> {
  const fullPrompt = context
    ? `Farmer Profile:\n${context}\n\nRequest:\n${prompt}`
    : prompt;

  const model = client.getGenerativeModel({
    model: MODEL_TEXT,
    systemInstruction: CROP_ADVISOR_SYSTEM + cropLangInstruction(language),
    safetySettings: SAFETY_SETTINGS,
    generationConfig: { responseMimeType: "application/json" }
  });

  const completion = await model.generateContent(fullPrompt);

  const rawText    = completion.response.text();
  const structured = safeJsonParse<Record<string, unknown>>(rawText);

  if (!structured) {
    return NextResponse.json(
      { success: false, error: "AI returned unparseable response.", text: rawText },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, structured });
}

// ─── CORS preflight ───────────────────────────────────────────────────────────

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
