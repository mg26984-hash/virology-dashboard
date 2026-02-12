import { invokeGemini } from "./gemini";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { storageDelete } from './storage';
import { updateDocumentStatus, 
  upsertPatient, 
  createVirologyTest,
  checkDuplicateTest
} from "./db";

/**
 * Normalize nationality strings to consistent values.
 * Handles common typos and casing variations from OCR/LLM extraction.
 */
function normalizeNationality(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (/^non[\s-]*ku(w(a(i(t[i]?[t]?)?)?)?)?$/i.test(lower)) return 'Non-Kuwaiti';
  if (lower === 'non') return 'Non-Kuwaiti';
  if (/^ku(w(a(i(t[i]?[t]?)?)?)?)?$/i.test(lower) || lower === 'khy') return 'Kuwaiti';
  return trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Normalize test result strings to consistent values.
 */
function normalizeResult(value: string | null | undefined): string {
  if (!value || !value.trim()) return 'Not Available';
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'not detected' || lower === 'non reactive' || lower === 'nonreactive' || lower === 'non-reactive') return 'Not Detected';
  if (lower === 'negative') return 'Negative';
  if (lower === 'positive') return 'Positive';
  if (lower === 'reactive') return 'Reactive';
  if (lower === 'detected') return 'Detected';
  if (lower === 'indeterminate') return 'Indeterminate';
  if (lower === 'not available' || lower === 'n/a' || lower === 'na') return 'Not Available';
  return trimmed;
}

export interface ExtractedVirologyData {
  hasTestResults: boolean;
  patient: {
    civilId: string;
    name?: string;
    dateOfBirth?: string;
    nationality?: string;
    gender?: string;
    passportNo?: string;
  };
  tests: Array<{
    testType: string;
    result: string;
    viralLoad?: string;
    unit?: string;
    sampleNo?: string;
    accessionNo?: string;
    departmentNo?: string;
    accessionDate?: string;
    signedBy?: string;
    signedAt?: string;
    location?: string;
  }>;
  rawExtraction?: string;
  /** Which AI provider was used for this extraction */
  provider?: "gemini" | "platform";
}

// ─── Gemini response schema (native format) ─────────────────────────────────

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    hasTestResults: { type: "BOOLEAN", description: "Whether the document contains valid virology test results" },
    patient: {
      type: "OBJECT",
      properties: {
        civilId: { type: "STRING", description: "Patient's Civil ID number" },
        name: { type: "STRING", description: "Patient's full name" },
        dateOfBirth: { type: "STRING", description: "Date of birth in DD/MM/YYYY format" },
        nationality: { type: "STRING", description: "Patient's nationality" },
        gender: { type: "STRING", description: "Patient's gender (Male/Female)" },
        passportNo: { type: "STRING", description: "Passport number if available" }
      },
      required: ["civilId"]
    },
    tests: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          testType: { type: "STRING", description: "Type of virology test performed" },
          result: { type: "STRING", description: "Test result description" },
          viralLoad: { type: "STRING", description: "Viral load value if applicable" },
          unit: { type: "STRING", description: "Unit of measurement (e.g., Copies/mL)" },
          sampleNo: { type: "STRING", description: "Sample number" },
          accessionNo: { type: "STRING", description: "Accession number" },
          departmentNo: { type: "STRING", description: "Department number" },
          accessionDate: { type: "STRING", description: "Accession date in ISO format (YYYY-MM-DD HH:mm:ss)" },
          signedBy: { type: "STRING", description: "Name of signing physician" },
          signedAt: { type: "STRING", description: "Signature date in ISO format" },
          location: { type: "STRING", description: "Location/department code" }
        },
        required: ["testType", "result"]
      }
    }
  },
  required: ["hasTestResults", "patient", "tests"]
};

// ─── Platform LLM JSON schema (OpenAI-compatible format) ────────────────────

const PLATFORM_EXTRACTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "virology_report_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        hasTestResults: { type: "boolean", description: "Whether the document contains valid virology test results" },
        patient: {
          type: "object",
          properties: {
            civilId: { type: "string", description: "Patient's Civil ID number" },
            name: { type: "string", description: "Patient's full name" },
            dateOfBirth: { type: "string", description: "Date of birth in DD/MM/YYYY format" },
            nationality: { type: "string", description: "Patient's nationality" },
            gender: { type: "string", description: "Patient's gender (Male/Female)" },
            passportNo: { type: "string", description: "Passport number if available" }
          },
          required: ["civilId"],
          additionalProperties: false
        },
        tests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              testType: { type: "string", description: "Type of virology test performed" },
              result: { type: "string", description: "Test result description" },
              viralLoad: { type: "string", description: "Viral load value if applicable" },
              unit: { type: "string", description: "Unit of measurement (e.g., Copies/mL)" },
              sampleNo: { type: "string", description: "Sample number" },
              accessionNo: { type: "string", description: "Accession number" },
              departmentNo: { type: "string", description: "Department number" },
              accessionDate: { type: "string", description: "Accession date in ISO format (YYYY-MM-DD HH:mm:ss)" },
              signedBy: { type: "string", description: "Name of signing physician" },
              signedAt: { type: "string", description: "Signature date in ISO format" },
              location: { type: "string", description: "Location/department code" }
            },
            required: ["testType", "result"],
            additionalProperties: false
          }
        }
      },
      required: ["hasTestResults", "patient", "tests"],
      additionalProperties: false
    }
  }
};

// ─── Shared prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a medical document extraction specialist. Your task is to extract structured virology test data from laboratory reports.

IMPORTANT RULES:
1. Extract ALL information visible in the document accurately
2. If a field is not visible or unclear, leave it as an empty string
3. Set hasTestResults to true ONLY if the document contains actual virology test results (e.g., virus detection, viral load measurements)
4. Set hasTestResults to false if the document is:
   - Not a medical report
   - A medical report but without virology test results
   - Unreadable or corrupted
   - A form without filled results

EXTRACTION GUIDELINES:
- Civil ID: Look for "Civil ID", "CID", or similar identifiers (usually a long number)
- Patient Name: Full name as shown on the report
- Date of Birth: Convert to DD/MM/YYYY format
- Nationality: Country of citizenship
- Test Type: The specific virology test name (e.g., "Polyomaviruses (BKV & JCV) DNA in Urine", "Polyomaviruses (BKV & JCV) DNA in Blood")
- Result: The complete result text (e.g., "JC Virus Detected (76 Copies/mL)")
- Viral Load: Extract numeric value with comparison operators if present (e.g., "76", ">50,000,000")
- Unit: Usually "Copies/mL" for viral load tests
- Accession Date: Convert to ISO format YYYY-MM-DD HH:mm:ss
- Signed By: Name of the physician who signed the report
- Signed At: Date/time of signature in ISO format

MULTI-PAGE DOCUMENTS:
- A single PDF or document may contain MULTIPLE test results across MULTIPLE pages
- Each page may represent a DIFFERENT test (e.g., page 1 = Blood BKV, page 2 = Urine BKV)
- You MUST extract ALL tests from ALL pages and include them in the tests array
- The patient information is usually the same across pages but the test type, result, accession date, and accession number will differ
- Do NOT stop after the first page or first test found

Be thorough and accurate. Medical data accuracy is critical.`;

const USER_PROMPT_IMAGE = "Extract all virology test data from this laboratory report image. If this is not a valid virology report or doesn't contain test results, set hasTestResults to false.";

const USER_PROMPT_PDF = "Extract ALL virology test data from this laboratory report PDF. The PDF may contain MULTIPLE PAGES, each with a SEPARATE test result for the SAME patient. You MUST examine EVERY page and include ALL tests found across ALL pages in the tests array. Do NOT stop after the first page. If this is not a valid virology report or doesn't contain test results, set hasTestResults to false.";

// ─── Gemini extraction (primary) ────────────────────────────────────────────

function getImageMimeType(url: string): "image/jpeg" | "image/png" {
  return url.toLowerCase().includes('.png') ? "image/png" : "image/jpeg";
}

async function extractWithGemini(fileUrl: string, mimeType: string): Promise<ExtractedVirologyData> {
  const isPdf = mimeType === 'application/pdf';
  const responseText = await invokeGemini({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: isPdf ? USER_PROMPT_PDF : USER_PROMPT_IMAGE,
    fileUrl,
    mimeType: isPdf ? "application/pdf" : getImageMimeType(fileUrl),
    responseSchema: GEMINI_RESPONSE_SCHEMA,
  });

  const extracted = JSON.parse(responseText) as ExtractedVirologyData;
  extracted.rawExtraction = responseText;
  extracted.provider = "gemini";
  return extracted;
}

// ─── Platform LLM extraction (fallback) ─────────────────────────────────────

async function extractWithPlatformLLM(fileUrl: string, mimeType: string): Promise<ExtractedVirologyData> {
  const isPdf = mimeType === 'application/pdf';

  const userContent = isPdf
    ? [
        { type: "text" as const, text: USER_PROMPT_PDF },
        { type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" as const } }
      ]
    : [
        { type: "text" as const, text: USER_PROMPT_IMAGE },
        { type: "image_url" as const, image_url: { url: fileUrl, detail: "high" as const } }
      ];

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ],
    response_format: PLATFORM_EXTRACTION_SCHEMA
  });

  if (!response?.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
    throw new Error(`Platform LLM returned no choices: ${JSON.stringify(response).substring(0, 200)}`);
  }

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Platform LLM returned no content");
  }

  const content = typeof rawContent === 'string'
    ? rawContent
    : rawContent.map(part => 'text' in part ? part.text : JSON.stringify(part)).join('');

  const extracted = JSON.parse(content) as ExtractedVirologyData;
  extracted.rawExtraction = content;
  extracted.provider = "platform";
  return extracted;
}

// ─── Hybrid extraction: Gemini first, platform LLM fallback ─────────────────

/**
 * Extract virology data using a hybrid approach:
 * 1. Try Gemini API first (uses user's own API key, no platform credits)
 * 2. If Gemini fails (rate limit, API error, key issue), fall back to platform LLM
 * 
 * Logs which provider was used for cost tracking.
 */
export async function extractVirologyData(fileUrl: string, mimeType: string = "image/jpeg"): Promise<ExtractedVirologyData> {
  // Check if Gemini API key is configured
  const hasGeminiKey = !!ENV.geminiApiKey;

  if (hasGeminiKey) {
    try {
      const result = await extractWithGemini(fileUrl, mimeType);
      console.log(`[DocumentProcessor] ✅ Gemini extraction successful (provider: gemini)`);
      return result;
    } catch (geminiError) {
      const errMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
      console.warn(`[DocumentProcessor] ⚠️ Gemini failed, falling back to platform LLM. Error: ${errMsg}`);
      // Fall through to platform LLM
    }
  } else {
    console.log(`[DocumentProcessor] No GEMINI_API_KEY configured, using platform LLM directly`);
  }

  // Fallback: use platform LLM
  try {
    const result = await extractWithPlatformLLM(fileUrl, mimeType);
    console.log(`[DocumentProcessor] ✅ Platform LLM extraction successful (provider: platform)`);
    return result;
  } catch (platformError) {
    console.error("[DocumentProcessor] ❌ Both Gemini and platform LLM failed:", platformError);
    return {
      hasTestResults: false,
      patient: { civilId: "" },
      tests: [],
      rawExtraction: `All providers failed. Last error: ${platformError instanceof Error ? platformError.message : String(platformError)}`,
      provider: "platform"
    };
  }
}

// Legacy named exports for backward compatibility
export async function extractFromPdf(pdfUrl: string): Promise<ExtractedVirologyData> {
  return extractVirologyData(pdfUrl, "application/pdf");
}

// ─── Process document (unchanged logic, now uses hybrid extraction) ─────────

export interface ProcessDocumentResult {
  success: boolean;
  documentId: number;
  status: 'completed' | 'failed' | 'discarded' | 'duplicate';
  patientId?: number;
  testsCreated?: number;
  testsSkipped?: number;
  error?: string;
  duplicateInfo?: string;
  /** Which AI provider was used */
  provider?: "gemini" | "platform";
}

/**
 * Delete the uploaded file from S3 after processing is complete.
 */
async function deleteProcessedFile(fileUrl: string): Promise<void> {
  try {
    const urlObj = new URL(fileUrl);
    const pathParts = urlObj.pathname.split('/');
    const reportsIdx = pathParts.findIndex(p => p === 'virology-reports');
    if (reportsIdx >= 0) {
      const relKey = pathParts.slice(reportsIdx).join('/');
      const deleted = await storageDelete(relKey);
      if (deleted) {
        console.log(`[DocumentProcessor] Deleted processed file from S3: ${relKey}`);
      } else {
        console.log(`[DocumentProcessor] Could not delete file from S3 (non-critical): ${relKey}`);
      }
    } else {
      console.log(`[DocumentProcessor] Could not extract file key from URL: ${fileUrl}`);
    }
  } catch (error) {
    console.error(`[DocumentProcessor] Error deleting processed file:`, error);
  }
}

export async function processUploadedDocument(
  documentId: number,
  fileUrl: string,
  mimeType: string
): Promise<ProcessDocumentResult> {
  try {
    await updateDocumentStatus(documentId, 'processing');

    // Extract data using hybrid approach (Gemini first, platform LLM fallback)
    const extracted = await extractVirologyData(fileUrl, mimeType);

    // Check if document has valid test results
    if (!extracted.hasTestResults || !extracted.patient.civilId || extracted.tests.length === 0) {
      await updateDocumentStatus(
        documentId, 
        'discarded', 
        'Document does not contain valid virology test results',
        extracted.rawExtraction,
        extracted.provider
      );
      await deleteProcessedFile(fileUrl);
      return {
        success: false,
        documentId,
        status: 'discarded',
        error: 'Document does not contain valid virology test results',
        provider: extracted.provider
      };
    }

    // Upsert patient
    const patient = await upsertPatient({
      civilId: extracted.patient.civilId,
      name: extracted.patient.name || null,
      dateOfBirth: extracted.patient.dateOfBirth || null,
      nationality: normalizeNationality(extracted.patient.nationality || null),
      gender: extracted.patient.gender || null,
      passportNo: extracted.patient.passportNo || null,
    });

    // Create virology tests with duplicate detection
    let testsCreated = 0;
    let testsSkipped = 0;
    const duplicateTests: string[] = [];

    for (const test of extracted.tests) {
      const accessionDate = test.accessionDate ? new Date(test.accessionDate) : new Date();
      
      const existingTest = await checkDuplicateTest(
        patient.id,
        test.testType,
        accessionDate
      );

      if (existingTest) {
        testsSkipped++;
        duplicateTests.push(`${test.testType} on ${accessionDate.toISOString().split('T')[0]}`);
        console.log(`[DocumentProcessor] Skipping duplicate test: ${test.testType} for patient ${patient.civilId} on ${accessionDate.toISOString()}`);
        continue;
      }

      await createVirologyTest({
        patientId: patient.id,
        documentId: documentId,
        testType: test.testType,
        result: normalizeResult(test.result),
        viralLoad: test.viralLoad || null,
        unit: test.unit || 'Copies/mL',
        sampleNo: test.sampleNo || null,
        accessionNo: test.accessionNo || null,
        departmentNo: test.departmentNo || null,
        accessionDate: accessionDate,
        signedBy: test.signedBy || null,
        signedAt: test.signedAt ? new Date(test.signedAt) : null,
        location: test.location || null,
      });
      testsCreated++;
    }

    // If all tests were duplicates, mark document as duplicate
    if (testsCreated === 0 && testsSkipped > 0) {
      await updateDocumentStatus(
        documentId, 
        'discarded', 
        `All ${testsSkipped} test(s) already exist in database: ${duplicateTests.join(', ')}`,
        extracted.rawExtraction,
        extracted.provider
      );
      await deleteProcessedFile(fileUrl);
      return {
        success: false,
        documentId,
        status: 'duplicate',
        patientId: patient.id,
        testsCreated: 0,
        testsSkipped,
        duplicateInfo: `Duplicate tests: ${duplicateTests.join(', ')}`,
        provider: extracted.provider
      };
    }

    await updateDocumentStatus(documentId, 'completed', undefined, extracted.rawExtraction, extracted.provider);
    await deleteProcessedFile(fileUrl);

    return {
      success: true,
      documentId,
      status: 'completed',
      patientId: patient.id,
      testsCreated,
      testsSkipped,
      duplicateInfo: testsSkipped > 0 ? `Skipped ${testsSkipped} duplicate(s): ${duplicateTests.join(', ')}` : undefined,
      provider: extracted.provider
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateDocumentStatus(documentId, 'failed', errorMessage);
    return {
      success: false,
      documentId,
      status: 'failed',
      error: errorMessage
    };
  }
}
