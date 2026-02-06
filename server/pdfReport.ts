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

      // ── Header ──
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
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

          // Check if we need a new page (leave room for at least the test header + some rows)
          if (doc.y > doc.page.height - 180) {
            doc.addPage();
          }

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

          if (test.sampleNo) {
            testRows.push(["Sample Number", test.sampleNo]);
          }
          if (test.accessionNo) {
            testRows.push(["Accession Number", test.accessionNo]);
          }
          if (test.departmentNo) {
            testRows.push(["Department Number", test.departmentNo]);
          }
          if (test.location) {
            testRows.push(["Location", test.location]);
          }
          if (test.signedBy) {
            testRows.push(["Signed By", test.signedBy]);
          }
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

      // ── Footer on each page ──
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        // Save current position
        const savedY = doc.y;

        // Footer line
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

        // Restore position
        doc.y = savedY;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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
