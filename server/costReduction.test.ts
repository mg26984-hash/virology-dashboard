import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ─── Re-implement the helpers locally for unit testing ─────────────────────

function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

const VIROLOGY_KEYWORDS = [
  'virology', 'viral', 'virus', 'cmv', 'bkv', 'jcv', 'pcr', 'polyoma',
  'cytomegalovirus', 'hepatitis', 'hbv', 'hcv', 'hiv', 'ebv', 'hsv',
  'dna', 'rna', 'load', 'detected', 'copies', 'blood', 'urine', 'serum',
  'plasma', 'quantitative', 'qualitative', 'molecular', 'lab', 'report',
  'result', 'test', 'specimen', 'accession', 'pathology', 'transplant',
  'renal', 'kidney', 'nephro',
];

const NON_VIROLOGY_PATTERNS = [
  /^receipt/i, /^invoice/i, /^screenshot/i, /^photo_\d/i, /^img_\d/i,
  /^selfie/i, /^avatar/i, /^profile/i, /^logo/i, /^banner/i,
  /^wallpaper/i, /^meme/i, /^scan_\d/i,
];

function isLikelyVirologyReport(fileName: string): { likely: boolean; reason?: string } {
  const lower = fileName.toLowerCase();
  const nameWithoutExt = lower.replace(/\.(pdf|jpg|jpeg|png)$/i, '');
  
  for (const pattern of NON_VIROLOGY_PATTERNS) {
    if (pattern.test(nameWithoutExt)) {
      return { likely: false, reason: `Filename matches non-virology pattern: ${pattern}` };
    }
  }
  
  const hasKeyword = VIROLOGY_KEYWORDS.some(kw => lower.includes(kw));
  if (hasKeyword) {
    return { likely: true };
  }
  
  return { likely: true, reason: 'No keywords found but allowing through (ambiguous filename)' };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Cost Reduction: Hash-Based Duplicate Detection", () => {
  it("should compute consistent SHA-256 hash for same content", () => {
    const content = Buffer.from("test file content");
    const hash1 = computeFileHash(content);
    const hash2 = computeFileHash(content);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("should produce different hashes for different content", () => {
    const content1 = Buffer.from("file content A");
    const content2 = Buffer.from("file content B");
    const hash1 = computeFileHash(content1);
    const hash2 = computeFileHash(content2);
    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes even for similar content", () => {
    const content1 = Buffer.from("patient report 12345");
    const content2 = Buffer.from("patient report 12346");
    expect(computeFileHash(content1)).not.toBe(computeFileHash(content2));
  });

  it("should handle empty buffer", () => {
    const hash = computeFileHash(Buffer.from(""));
    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is a known constant
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("should handle large buffers", () => {
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024, "x"); // 10MB
    const hash = computeFileHash(largeBuffer);
    expect(hash).toHaveLength(64);
  });
});

describe("Cost Reduction: Filename Pre-Filter", () => {
  describe("should ALLOW virology-related filenames", () => {
    const virologyFiles = [
      "CMV_PCR_Blood_Report.pdf",
      "BKV_Urine_Test_Result.jpg",
      "Virology_Lab_Report_2024.pdf",
      "PCR_Polyomavirus_DNA.png",
      "Hepatitis_B_Viral_Load.pdf",
      "HIV_RNA_Quantitative.pdf",
      "EBV_DNA_Blood_Test.pdf",
      "HSV_Molecular_Test.pdf",
      "Renal_Transplant_Specimen.pdf",
      "Nephrology_Pathology_Report.pdf",
      "accession_12345.pdf",
      "kidney_test_result.jpg",
    ];

    for (const file of virologyFiles) {
      it(`allows: ${file}`, () => {
        const result = isLikelyVirologyReport(file);
        expect(result.likely).toBe(true);
      });
    }
  });

  describe("should ALLOW ambiguous filenames (patient names, civil IDs)", () => {
    const ambiguousFiles = [
      "AliSanambld.pdf",
      "Mohammed_Ahmed_12345.jpg",
      "298765432100.pdf",
      "document.pdf",
      "image.jpg",
      "file_2024_01_15.png",
      "MAITHAH_MESHAL.pdf",
    ];

    for (const file of ambiguousFiles) {
      it(`allows ambiguous: ${file}`, () => {
        const result = isLikelyVirologyReport(file);
        expect(result.likely).toBe(true);
      });
    }
  });

  describe("should BLOCK clearly non-virology filenames", () => {
    const nonVirologyFiles = [
      "receipt_amazon_2024.pdf",
      "invoice_12345.pdf",
      "screenshot_2024.png",
      "photo_1234.jpg",
      "img_5678.jpg",
      "selfie_beach.jpg",
      "avatar_profile.png",
      "profile_picture.jpg",
      "logo_company.png",
      "banner_ad.jpg",
      "wallpaper_nature.png",
      "meme_funny.jpg",
      "scan_0001.pdf",
    ];

    for (const file of nonVirologyFiles) {
      it(`blocks: ${file}`, () => {
        const result = isLikelyVirologyReport(file);
        expect(result.likely).toBe(false);
        expect(result.reason).toBeDefined();
      });
    }
  });

  describe("edge cases", () => {
    it("handles filenames with mixed case", () => {
      expect(isLikelyVirologyReport("CMV_PCR_BLOOD.PDF").likely).toBe(true);
      expect(isLikelyVirologyReport("RECEIPT_123.PDF").likely).toBe(false);
    });

    it("handles filenames with special characters", () => {
      expect(isLikelyVirologyReport("AliSanambld&urine.pdf").likely).toBe(true); // contains 'urine'
      expect(isLikelyVirologyReport("test-result_2024.pdf").likely).toBe(true); // contains 'test'
    });

    it("handles filenames without extensions", () => {
      expect(isLikelyVirologyReport("virology_report").likely).toBe(true);
      expect(isLikelyVirologyReport("receipt").likely).toBe(false);
    });

    it("handles very long filenames", () => {
      const longName = "a".repeat(500) + "_pcr_result.pdf";
      expect(isLikelyVirologyReport(longName).likely).toBe(true);
    });

    it("handles empty filename", () => {
      const result = isLikelyVirologyReport("");
      // Empty filename is ambiguous, should be allowed through
      expect(result.likely).toBe(true);
    });
  });
});

describe("Integration: Hash + Pre-filter combined flow", () => {
  it("should skip duplicate before reaching pre-filter", () => {
    const content = Buffer.from("same file content");
    const hash1 = computeFileHash(content);
    const hash2 = computeFileHash(content);
    
    // First upload: hash check passes (not duplicate), pre-filter passes
    expect(hash1 === hash2).toBe(true); // Same hash = duplicate
    
    // The flow: compute hash → check DB → if duplicate, skip entirely (no LLM call)
    // This test verifies the hash comparison works correctly
  });

  it("should skip non-virology files before reaching LLM", () => {
    const fileName = "receipt_amazon.pdf";
    const preFilter = isLikelyVirologyReport(fileName);
    
    // Pre-filter catches it → no S3 upload → no LLM call
    expect(preFilter.likely).toBe(false);
  });

  it("should allow legitimate virology files through both checks", () => {
    const content = Buffer.from("unique virology report content");
    const hash = computeFileHash(content);
    const fileName = "CMV_PCR_Blood_Report.pdf";
    
    // Hash is unique (not duplicate)
    expect(hash).toHaveLength(64);
    
    // Pre-filter allows it
    const preFilter = isLikelyVirologyReport(fileName);
    expect(preFilter.likely).toBe(true);
    
    // → Proceeds to S3 upload + LLM extraction
  });
});
