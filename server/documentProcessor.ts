import { invokeLLM } from "./_core/llm";
import { 
  updateDocumentStatus, 
  upsertPatient, 
  createVirologyTest
} from "./db";

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
}

const EXTRACTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "virology_report_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        hasTestResults: {
          type: "boolean",
          description: "Whether the document contains valid virology test results"
        },
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
- Test Type: The specific virology test name (e.g., "Polyomaviruses (BKV & JCV) DNA in Urine")
- Result: The complete result text (e.g., "JC Virus Detected (76 Copies/mL)")
- Viral Load: Extract numeric value with comparison operators if present (e.g., "76", ">50,000,000")
- Unit: Usually "Copies/mL" for viral load tests
- Accession Date: Convert to ISO format YYYY-MM-DD HH:mm:ss
- Signed By: Name of the physician who signed the report
- Signed At: Date/time of signature in ISO format

Be thorough and accurate. Medical data accuracy is critical.`;

export async function extractVirologyData(imageUrl: string): Promise<ExtractedVirologyData> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { 
          role: "user", 
          content: [
            {
              type: "text",
              text: "Extract all virology test data from this laboratory report image. If this is not a valid virology report or doesn't contain test results, set hasTestResults to false."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high"
              }
            }
          ]
        }
      ],
      response_format: EXTRACTION_SCHEMA
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      return {
        hasTestResults: false,
        patient: { civilId: "" },
        tests: [],
        rawExtraction: "No response from LLM"
      };
    }

    // Handle both string and array content types
    const content = typeof rawContent === 'string' 
      ? rawContent 
      : rawContent.map(part => 'text' in part ? part.text : JSON.stringify(part)).join('');

    const extracted = JSON.parse(content) as ExtractedVirologyData;
    extracted.rawExtraction = content;
    return extracted;

  } catch (error) {
    console.error("[DocumentProcessor] Extraction error:", error);
    return {
      hasTestResults: false,
      patient: { civilId: "" },
      tests: [],
      rawExtraction: `Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function extractFromPdf(pdfUrl: string): Promise<ExtractedVirologyData> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { 
          role: "user", 
          content: [
            {
              type: "text",
              text: "Extract all virology test data from this laboratory report PDF. If this is not a valid virology report or doesn't contain test results, set hasTestResults to false."
            },
            {
              type: "file_url",
              file_url: {
                url: pdfUrl,
                mime_type: "application/pdf"
              }
            }
          ]
        }
      ],
      response_format: EXTRACTION_SCHEMA
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      return {
        hasTestResults: false,
        patient: { civilId: "" },
        tests: [],
        rawExtraction: "No response from LLM"
      };
    }

    // Handle both string and array content types
    const content = typeof rawContent === 'string' 
      ? rawContent 
      : rawContent.map(part => 'text' in part ? part.text : JSON.stringify(part)).join('');

    const extracted = JSON.parse(content) as ExtractedVirologyData;
    extracted.rawExtraction = content;
    return extracted;

  } catch (error) {
    console.error("[DocumentProcessor] PDF extraction error:", error);
    return {
      hasTestResults: false,
      patient: { civilId: "" },
      tests: [],
      rawExtraction: `Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export interface ProcessDocumentResult {
  success: boolean;
  documentId: number;
  status: 'completed' | 'failed' | 'discarded';
  patientId?: number;
  testsCreated?: number;
  error?: string;
}

export async function processUploadedDocument(
  documentId: number,
  fileUrl: string,
  mimeType: string
): Promise<ProcessDocumentResult> {
  try {
    await updateDocumentStatus(documentId, 'processing');

    // Extract data based on file type
    let extracted: ExtractedVirologyData;
    if (mimeType === 'application/pdf') {
      extracted = await extractFromPdf(fileUrl);
    } else {
      extracted = await extractVirologyData(fileUrl);
    }

    // Check if document has valid test results
    if (!extracted.hasTestResults || !extracted.patient.civilId || extracted.tests.length === 0) {
      await updateDocumentStatus(
        documentId, 
        'discarded', 
        'Document does not contain valid virology test results',
        extracted.rawExtraction
      );
      return {
        success: false,
        documentId,
        status: 'discarded',
        error: 'Document does not contain valid virology test results'
      };
    }

    // Upsert patient
    const patient = await upsertPatient({
      civilId: extracted.patient.civilId,
      name: extracted.patient.name || null,
      dateOfBirth: extracted.patient.dateOfBirth || null,
      nationality: extracted.patient.nationality || null,
      gender: extracted.patient.gender || null,
      passportNo: extracted.patient.passportNo || null,
    });

    // Create virology tests
    let testsCreated = 0;
    for (const test of extracted.tests) {
      await createVirologyTest({
        patientId: patient.id,
        documentId: documentId,
        testType: test.testType,
        result: test.result,
        viralLoad: test.viralLoad || null,
        unit: test.unit || 'Copies/mL',
        sampleNo: test.sampleNo || null,
        accessionNo: test.accessionNo || null,
        departmentNo: test.departmentNo || null,
        accessionDate: test.accessionDate ? new Date(test.accessionDate) : null,
        signedBy: test.signedBy || null,
        signedAt: test.signedAt ? new Date(test.signedAt) : null,
        location: test.location || null,
      });
      testsCreated++;
    }

    await updateDocumentStatus(documentId, 'completed', undefined, extracted.rawExtraction);

    return {
      success: true,
      documentId,
      status: 'completed',
      patientId: patient.id,
      testsCreated
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
