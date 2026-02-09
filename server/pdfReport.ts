import PDFDocument from "pdfkit";
import type { Patient, VirologyTest } from "../drizzle/schema";

/**
 * Generate a monochrome, printer-friendly PDF report for a patient
 * with their complete virology test history.
 */
export async function generatePatientPDF(
  patient: Patient,
  tests: VirologyTest[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `Virology Report - ${patient.name || patient.civilId}`,
          Author: "Virology Communication Dashboard",
          Subject: "Patient Virology Test Report",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      renderPatientContent(doc, patient, tests, pageWidth);
      renderFooters(doc, pageWidth);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate a combined PDF report for multiple patients.
 * Includes a cover page with patient index, then each patient on a new page.
 */
export async function generateBulkPatientPDF(
  patientsWithTests: { patient: Patient; tests: VirologyTest[] }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `Virology Bulk Report - ${patientsWithTests.length} Patients`,
          Author: "Virology Communication Dashboard",
          Subject: "Bulk Patient Virology Test Report",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const totalTests = patientsWithTests.reduce((sum, p) => sum + p.tests.length, 0);

      // ── Cover Page ──
      doc.moveDown(6);
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("VIROLOGY TEST REPORTS", { align: "center" });

      doc.moveDown(0.5);
      doc
        .fontSize(14)
        .font("Helvetica")
        .fillColor("#555555")
        .text("Bulk Patient Export", { align: "center" });

      doc.moveDown(1);
      drawHR(doc, pageWidth);
      doc.moveDown(1);

      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#333333")
        .text(`Patients included: ${patientsWithTests.length}`, { align: "center" });

      doc.fontSize(11).text(`Total tests: ${totalTests}`, { align: "center" });

      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor("#555555")
        .text(
          `Generated: ${new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          { align: "center" }
        );

      doc.moveDown(2);

      // Table of contents
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("PATIENTS INDEX", { align: "center" });
      doc.moveDown(0.5);

      patientsWithTests.forEach((p, idx) => {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#333333")
          .text(
            `${idx + 1}. ${p.patient.name || "Unknown"} \u2014 Civil ID: ${p.patient.civilId} \u2014 ${p.tests.length} test(s)`,
            { align: "left" }
          );
      });

      // ── Individual Patient Sections ──
      for (let pIdx = 0; pIdx < patientsWithTests.length; pIdx++) {
        const { patient, tests } = patientsWithTests[pIdx];

        doc.addPage();

        // Patient counter
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#999999")
          .text(`Patient ${pIdx + 1} of ${patientsWithTests.length}`, { align: "right" });

        doc.moveDown(0.3);

        renderPatientContent(doc, patient, tests, pageWidth);
      }

      renderFooters(doc, pageWidth);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Shared content renderer ──

/** Usable height before the footer area */
function usableBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom - 20; // 20px for footer
}

/** Check if there's enough room; if not, add a page. Returns true if page was added. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): boolean {
  if (doc.y + needed > usableBottom(doc)) {
    doc.addPage();
    return true;
  }
  return false;
}

function renderPatientContent(
  doc: PDFKit.PDFDocument,
  patient: Patient,
  tests: VirologyTest[],
  pageWidth: number
) {
  // ── Header ──
  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("VIROLOGY TEST REPORT", { align: "center" });

  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#555555")
    .text("Virology Communication Dashboard", { align: "center" });

  doc.moveDown(0.3);
  doc
    .fontSize(8)
    .text(
      `Generated: ${new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      { align: "center" }
    );

  // Horizontal rule
  doc.moveDown(0.5);
  drawHR(doc, pageWidth);
  doc.moveDown(0.5);

  // ── Patient Demographics ──
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("PATIENT INFORMATION");

  doc.moveDown(0.4);

  const demoData: [string, string][] = [
    ["Civil ID", patient.civilId],
    ["Full Name", patient.name || "Not recorded"],
    ["Date of Birth", patient.dateOfBirth || "Not recorded"],
    ["Nationality", patient.nationality || "Not recorded"],
    ["Gender", patient.gender || "Not recorded"],
    ["Passport Number", patient.passportNo || "Not recorded"],
  ];

  drawKeyValueTable(doc, demoData, pageWidth);

  doc.moveDown(0.5);
  drawHR(doc, pageWidth);
  doc.moveDown(0.5);

  // ── Test Summary ──
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("TEST SUMMARY");

  doc.moveDown(0.4);

  // Count by test type
  const testTypeCounts = new Map<string, number>();
  for (const t of tests) {
    testTypeCounts.set(t.testType, (testTypeCounts.get(t.testType) || 0) + 1);
  }

  const summaryData: [string, string][] = [
    ["Total Tests on Record", String(tests.length)],
  ];

  for (const [type, count] of Array.from(testTypeCounts.entries()).sort()) {
    summaryData.push([type, String(count)]);
  }

  // Date range
  const datesWithValues = tests
    .filter((t) => t.accessionDate)
    .map((t) => new Date(t.accessionDate!).getTime());

  if (datesWithValues.length > 0) {
    const earliest = new Date(Math.min(...datesWithValues));
    const latest = new Date(Math.max(...datesWithValues));
    summaryData.push([
      "Date Range",
      `${earliest.toLocaleDateString("en-GB")} to ${latest.toLocaleDateString("en-GB")}`,
    ]);
  }

  drawKeyValueTable(doc, summaryData, pageWidth);

  doc.moveDown(0.5);
  drawHR(doc, pageWidth);
  doc.moveDown(0.5);

  // ── Detailed Test Results ──
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("DETAILED TEST RESULTS");

  doc.moveDown(0.4);

  if (tests.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica-Oblique")
      .fillColor("#666666")
      .text("No virology tests have been recorded for this patient.");
  } else {
    // Sort tests by accession date descending (most recent first)
    const sortedTests = [...tests].sort((a, b) => {
      const dateA = a.accessionDate ? new Date(a.accessionDate).getTime() : 0;
      const dateB = b.accessionDate ? new Date(b.accessionDate).getTime() : 0;
      return dateB - dateA;
    });

    for (let i = 0; i < sortedTests.length; i++) {
      const test = sortedTests[i];

      // Estimate space needed for this test entry (~16px per row + header)
      const rowCount = 2 + (test.viralLoad ? 1 : 0) + (test.sampleNo ? 1 : 0) +
        (test.accessionNo ? 1 : 0) + (test.departmentNo ? 1 : 0) +
        (test.location ? 1 : 0) + (test.signedBy ? 1 : 0) + (test.signedAt ? 1 : 0);
      const estimatedHeight = 20 + rowCount * 16 + 10; // header + rows + spacing

      ensureSpace(doc, estimatedHeight);

      // Test number and type
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text(`Test ${i + 1}: ${test.testType}`);

      doc.moveDown(0.2);

      // Build test detail rows
      const testRows: [string, string][] = [];

      if (test.accessionDate) {
        testRows.push([
          "Accession Date",
          new Date(test.accessionDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        ]);
      }

      testRows.push(["Result", test.result]);

      if (test.viralLoad) {
        testRows.push([
          "Viral Load",
          `${test.viralLoad} ${test.unit || "Copies/mL"}`,
        ]);
      }

      if (test.sampleNo) testRows.push(["Sample Number", test.sampleNo]);
      if (test.accessionNo) testRows.push(["Accession Number", test.accessionNo]);
      if (test.departmentNo) testRows.push(["Department Number", test.departmentNo]);
      if (test.location) testRows.push(["Location", test.location]);
      if (test.signedBy) testRows.push(["Signed By", test.signedBy]);
      if (test.signedAt) {
        testRows.push([
          "Signed At",
          new Date(test.signedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        ]);
      }

      drawKeyValueTable(doc, testRows, pageWidth);

      // Add separator between tests (not after the last one)
      if (i < sortedTests.length - 1) {
        doc.moveDown(0.3);
        drawDottedHR(doc, pageWidth);
        doc.moveDown(0.3);
      }
    }
  }

  // ── Summary Table at End ──
  if (tests.length > 0) {
    doc.moveDown(0.5);
    drawHR(doc, pageWidth);
    doc.moveDown(0.5);

    ensureSpace(doc, 60); // header + at least 1 row

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("TEST HISTORY TABLE");

    doc.moveDown(0.4);

    // Sort by date ascending for the table (chronological order)
    const chronologicalTests = [...tests].sort((a, b) => {
      const dateA = a.accessionDate ? new Date(a.accessionDate).getTime() : 0;
      const dateB = b.accessionDate ? new Date(b.accessionDate).getTime() : 0;
      return dateA - dateB;
    });

    drawTestSummaryTable(doc, chronologicalTests, pageWidth);
  }
}

// ── Footer renderer (applied to all pages) ──

function renderFooters(doc: PDFKit.PDFDocument, pageWidth: number) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);

    const savedY = doc.y;

    doc
      .save()
      .moveTo(doc.page.margins.left, doc.page.height - 35)
      .lineTo(doc.page.margins.left + pageWidth, doc.page.height - 35)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke()
      .restore();

    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#999999")
      .text(
        "CONFIDENTIAL - This document contains protected health information.",
        doc.page.margins.left,
        doc.page.height - 30,
        { width: pageWidth * 0.7, align: "left" }
      );

    doc
      .fontSize(7)
      .text(
        `Page ${i + 1} of ${pages.count}`,
        doc.page.margins.left,
        doc.page.height - 30,
        { width: pageWidth, align: "right" }
      );

    doc.y = savedY;
  }
}

// ── Drawing helpers ──

function drawHR(doc: PDFKit.PDFDocument, width: number) {
  const x = doc.page.margins.left;
  doc
    .save()
    .moveTo(x, doc.y)
    .lineTo(x + width, doc.y)
    .strokeColor("#000000")
    .lineWidth(1)
    .stroke()
    .restore();
}

function drawDottedHR(doc: PDFKit.PDFDocument, width: number) {
  const x = doc.page.margins.left;
  doc
    .save()
    .moveTo(x, doc.y)
    .lineTo(x + width, doc.y)
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .dash(3, { space: 3 })
    .stroke()
    .undash()
    .restore();
}

function drawKeyValueTable(
  doc: PDFKit.PDFDocument,
  rows: [string, string][],
  tableWidth: number
) {
  const x = doc.page.margins.left;
  const labelWidth = 160;
  const valueWidth = tableWidth - labelWidth;
  const rowPadding = 4;

  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i];

    // Alternate row background (light gray for even rows)
    if (i % 2 === 0) {
      doc
        .save()
        .rect(x, doc.y - 1, tableWidth, 16)
        .fillColor("#f5f5f5")
        .fill()
        .restore();
    }

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#333333")
      .text(label, x + rowPadding, doc.y, {
        width: labelWidth - rowPadding * 2,
        continued: false,
      });

    // Move back up to same line for value
    doc.moveUp();

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#000000")
      .text(value, x + labelWidth + rowPadding, doc.y, {
        width: valueWidth - rowPadding * 2,
      });

    doc.moveDown(0.15);
  }
}

/**
 * Draw a 3-column summary table: Test Date | Test Name | Result
 * with proper headers, alternating row backgrounds, and page break handling.
 */
function drawTestSummaryTable(
  doc: PDFKit.PDFDocument,
  tests: VirologyTest[],
  tableWidth: number
) {
  const x = doc.page.margins.left;
  const colWidths = [110, tableWidth - 110 - 160, 160]; // Date, Test Name, Result
  const rowHeight = 16;
  const padding = 4;

  // ── Draw header row ──
  function drawHeader() {
    // Header background
    doc
      .save()
      .rect(x, doc.y - 1, tableWidth, rowHeight + 2)
      .fillColor("#333333")
      .fill()
      .restore();

    const headers = ["Test Date", "Test Name", "Result"];
    let colX = x;
    for (let c = 0; c < headers.length; c++) {
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor("#ffffff")
        .text(headers[c], colX + padding, doc.y, {
          width: colWidths[c] - padding * 2,
          height: rowHeight,
          ellipsis: true,
        });
      if (c < headers.length - 1) {
        doc.moveUp();
      }
      colX += colWidths[c];
    }
    doc.moveDown(0.2);
  }

  drawHeader();

  // ── Draw data rows ──
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];

    // Check if we need a new page
    if (doc.y + rowHeight > usableBottom(doc)) {
      doc.addPage();
      drawHeader(); // re-draw header on new page
    }

    // Alternate row background
    if (i % 2 === 0) {
      doc
        .save()
        .rect(x, doc.y - 1, tableWidth, rowHeight)
        .fillColor("#f8f8f8")
        .fill()
        .restore();
    }

    const dateStr = test.accessionDate
      ? new Date(test.accessionDate).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "N/A";

    const values = [dateStr, test.testType, test.result];
    let colX = x;
    for (let c = 0; c < values.length; c++) {
      doc
        .fontSize(8)
        .font(c === 2 ? "Helvetica-Bold" : "Helvetica")
        .fillColor("#000000")
        .text(values[c], colX + padding, doc.y, {
          width: colWidths[c] - padding * 2,
          height: rowHeight,
          ellipsis: true,
        });
      if (c < values.length - 1) {
        doc.moveUp();
      }
      colX += colWidths[c];
    }
    doc.moveDown(0.1);
  }
}
