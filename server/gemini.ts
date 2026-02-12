/**
 * Gemini API client for document processing.
 * Calls Google's Generative Language API directly using the user's Gemini API key,
 * bypassing the platform LLM proxy to reduce platform-based AI spending.
 *
 * Supports:
 * - Vision (image analysis) via inline_data or file_data
 * - PDF processing via file_data with application/pdf mime type
 * - Structured JSON output via responseSchema
 */

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it via Settings > Secrets.");
  }
  return key;
}

export interface GeminiExtractionRequest {
  systemPrompt: string;
  userPrompt: string;
  fileUrl: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  responseSchema: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
      }>;
    };
    finishReason: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Fetch a file from URL and convert to base64 for Gemini inline_data.
 * Used for images (JPEG, PNG). For PDFs, we also use this approach.
 */
async function fetchFileAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

/**
 * Call Gemini API for document extraction with vision capabilities.
 * Returns the raw text content from Gemini's response.
 */
export async function invokeGemini(request: GeminiExtractionRequest): Promise<string> {
  const apiKey = getGeminiApiKey();

  // Fetch the file and convert to base64
  console.log(`[Gemini] Fetching file: ${request.fileUrl.substring(0, 80)}...`);
  const base64Data = await fetchFileAsBase64(request.fileUrl);
  console.log(`[Gemini] File fetched, base64 size: ${(base64Data.length / 1024).toFixed(0)}KB`);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: request.userPrompt,
          },
          {
            inline_data: {
              mime_type: request.mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: request.systemPrompt }],
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: request.responseSchema,
      temperature: 0.1,
    },
  };

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  console.log(`[Gemini] Calling ${GEMINI_MODEL} for ${request.mimeType} extraction...`);
  const startTime = Date.now();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini] API error (${elapsed}s): ${response.status} ${response.statusText} – ${errorText.substring(0, 300)}`);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} – ${errorText.substring(0, 200)}`);
  }

  const result = (await response.json()) as GeminiResponse;

  if (result.error) {
    console.error(`[Gemini] Response error (${elapsed}s):`, result.error.message);
    throw new Error(`Gemini error: ${result.error.message}`);
  }

  if (!result.candidates || result.candidates.length === 0) {
    console.error(`[Gemini] No candidates returned (${elapsed}s)`);
    throw new Error("Gemini returned no candidates");
  }

  const textPart = result.candidates[0].content.parts.find(p => p.text);
  if (!textPart?.text) {
    console.error(`[Gemini] No text in response (${elapsed}s)`);
    throw new Error("Gemini returned no text content");
  }

  console.log(`[Gemini] Extraction complete (${elapsed}s), response length: ${textPart.text.length} chars`);
  return textPart.text;
}
