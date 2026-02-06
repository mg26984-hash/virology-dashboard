import PDFDocument from "pdfkit";

interface DashboardStats {
  totalPatients: number;
  totalTests: number;
  totalDocuments: number;
  pendingDocuments: number;
}

interface VolumeByMonth {
  month: string;
  count: number;
}

interface ResultDistribution {
  result: string;
  count: number;
}

interface TopTestType {
  testType: string;
  count: number;
}

interface TestsByNationality {
  nationality: string;
  count: number;
}

export interface DashboardReportData {
  stats: DashboardStats;
  volumeByMonth: VolumeByMonth[];
  resultDistribution: ResultDistribution[];
  topTestTypes: TopTestType[];
  testsByNationality: TestsByNationality[];
  dateRange?: { from?: string; to?: string };
}

/**
 * Generate a monochrome, printer-friendly PDF summary report
 * of the dashboard analytics view.
 */
export async function generateDashboardPDF(
  data: DashboardReportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: "Virology Dashboard Analytics Report",
          Author: "Virology Communication Dashboard",
          Subject: "Dashboard Analytics Summary",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ── Title Page / Header ──
      doc.moveDown(2);
      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("VIROLOGY DASHBOARD", { align: "center" });

      doc
        .fontSize(16)
        .font("Helvetica")
        .fillColor("#333333")
        .text("Analytics Summary Report", { align: "center" });

      doc.moveDown(0.5);

      // Date range label
      let dateLabel = "All Time";
      if (data.dateRange?.from && data.dateRange?.to) {
        dateLabel = `${formatDate(data.dateRange.from)} to ${formatDate(data.dateRange.to)}`;
      } else if (data.dateRange?.from) {
        dateLabel = `From ${formatDate(data.dateRange.from)}`;
      } else if (data.dateRange?.to) {
        dateLabel = `Until ${formatDate(data.dateRange.to)}`;
      }

      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#555555")
        .text(`Period: ${dateLabel}`, { align: "center" });

      doc.moveDown(0.3);
      doc
        .fontSize(9)
        .fillColor("#777777")
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

      doc.moveDown(1);
      drawHR(doc, pageWidth);
      doc.moveDown(1);

      // ── Summary Statistics ──
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("SUMMARY STATISTICS");

      doc.moveDown(0.5);

      drawStatsGrid(doc, data.stats, pageWidth);

      doc.moveDown(1);
      drawHR(doc, pageWidth);
      doc.moveDown(1);

      // ── Test Volume by Month ──
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("TEST VOLUME BY MONTH");

      doc.moveDown(0.5);

      if (data.volumeByMonth.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor("#666666")
          .text("No test volume data available for the selected period.");
      } else {
        // Draw a text-based bar chart
        drawHorizontalBarChart(
          doc,
          data.volumeByMonth.map((v) => ({
            label: formatMonthLabel(v.month),
            value: v.count,
          })),
          pageWidth
        );
      }

      doc.moveDown(1);
      drawHR(doc, pageWidth);
      doc.moveDown(1);

      // ── Result Distribution ──
      if (doc.y > doc.page.height - 250) doc.addPage();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("RESULT DISTRIBUTION");

      doc.moveDown(0.5);

      if (data.resultDistribution.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor("#666666")
          .text("No result distribution data available for the selected period.");
      } else {
        const totalResults = data.resultDistribution.reduce(
          (s, r) => s + r.count,
          0
        );
        drawDataTable(
          doc,
          ["Result", "Count", "Percentage"],
          data.resultDistribution.map((r) => [
            r.result || "Unknown",
            String(r.count),
            `${((r.count / totalResults) * 100).toFixed(1)}%`,
          ]),
          pageWidth,
          [0.5, 0.25, 0.25]
        );
      }

      doc.moveDown(1);
      drawHR(doc, pageWidth);
      doc.moveDown(1);

      // ── Top Test Types ──
      if (doc.y > doc.page.height - 250) doc.addPage();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("TOP TEST TYPES");

      doc.moveDown(0.5);

      if (data.topTestTypes.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor("#666666")
          .text("No test type data available for the selected period.");
      } else {
        const totalTypes = data.topTestTypes.reduce(
          (s, t) => s + t.count,
          0
        );
        drawDataTable(
          doc,
          ["Test Type", "Count", "Percentage"],
          data.topTestTypes.map((t) => [
            t.testType || "Unknown",
            String(t.count),
            `${((t.count / totalTypes) * 100).toFixed(1)}%`,
          ]),
          pageWidth,
          [0.5, 0.25, 0.25]
        );
      }

      doc.moveDown(1);
      drawHR(doc, pageWidth);
      doc.moveDown(1);

      // ── Tests by Nationality ──
      if (doc.y > doc.page.height - 250) doc.addPage();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("TESTS BY NATIONALITY");

      doc.moveDown(0.5);

      if (data.testsByNationality.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor("#666666")
          .text("No nationality data available for the selected period.");
      } else {
        const totalNat = data.testsByNationality.reduce(
          (s, n) => s + n.count,
          0
        );
        drawDataTable(
          doc,
          ["Nationality", "Count", "Percentage"],
          data.testsByNationality.map((n) => [
            n.nationality || "Unknown",
            String(n.count),
            `${((n.count / totalNat) * 100).toFixed(1)}%`,
          ]),
          pageWidth,
          [0.5, 0.25, 0.25]
        );
      }

      // ── Footers ──
      renderFooters(doc, pageWidth);

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

function drawStatsGrid(
  doc: PDFKit.PDFDocument,
  stats: DashboardStats,
  pageWidth: number
) {
  const items = [
    { label: "Total Patients", value: stats.totalPatients.toLocaleString() },
    { label: "Total Tests", value: stats.totalTests.toLocaleString() },
    { label: "Documents", value: stats.totalDocuments.toLocaleString() },
    { label: "Pending", value: stats.pendingDocuments.toLocaleString() },
  ];

  const colWidth = pageWidth / 4;
  const x = doc.page.margins.left;
  const startY = doc.y;

  for (let i = 0; i < items.length; i++) {
    const colX = x + i * colWidth;

    // Box background
    doc
      .save()
      .rect(colX + 2, startY, colWidth - 4, 50)
      .fillColor("#f5f5f5")
      .fill()
      .restore();

    // Box border
    doc
      .save()
      .rect(colX + 2, startY, colWidth - 4, 50)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke()
      .restore();

    // Value
    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(items[i].value, colX + 2, startY + 8, {
        width: colWidth - 4,
        align: "center",
      });

    // Label
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#666666")
      .text(items[i].label, colX + 2, startY + 32, {
        width: colWidth - 4,
        align: "center",
      });
  }

  doc.y = startY + 60;
}

function drawHorizontalBarChart(
  doc: PDFKit.PDFDocument,
  items: { label: string; value: number }[],
  pageWidth: number
) {
  const x = doc.page.margins.left;
  const labelWidth = 80;
  const valueWidth = 50;
  const barAreaWidth = pageWidth - labelWidth - valueWidth - 10;
  const maxValue = Math.max(...items.map((i) => i.value), 1);
  const barHeight = 12;
  const rowHeight = 18;

  for (let i = 0; i < items.length; i++) {
    const rowY = doc.y;

    // Check page break
    if (rowY > doc.page.height - 80) {
      doc.addPage();
    }

    // Alternate row background
    if (i % 2 === 0) {
      doc
        .save()
        .rect(x, doc.y - 1, pageWidth, rowHeight)
        .fillColor("#f8f8f8")
        .fill()
        .restore();
    }

    // Label
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#333333")
      .text(items[i].label, x, doc.y + 2, {
        width: labelWidth,
        continued: false,
      });

    doc.moveUp();

    // Bar
    const barWidth = Math.max(
      (items[i].value / maxValue) * barAreaWidth,
      1
    );
    doc
      .save()
      .rect(x + labelWidth, doc.y + 2, barWidth, barHeight)
      .fillColor("#333333")
      .fill()
      .restore();

    // Value
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(
        items[i].value.toLocaleString(),
        x + labelWidth + barAreaWidth + 5,
        doc.y + 2,
        { width: valueWidth, align: "right" }
      );

    doc.y = doc.y + rowHeight;
  }
}

function drawDataTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  pageWidth: number,
  colRatios: number[]
) {
  const x = doc.page.margins.left;
  const rowPadding = 4;
  const rowHeight = 18;

  // Header row
  doc
    .save()
    .rect(x, doc.y, pageWidth, rowHeight)
    .fillColor("#e0e0e0")
    .fill()
    .restore();

  let colX = x;
  for (let c = 0; c < headers.length; c++) {
    const colW = pageWidth * colRatios[c];
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(headers[c], colX + rowPadding, doc.y + 4, {
        width: colW - rowPadding * 2,
        align: c === 0 ? "left" : "right",
      });
    if (c < headers.length - 1) doc.moveUp();
    colX += colW;
  }

  doc.y += rowHeight + 2;

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    // Check page break
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
    }

    // Alternate background
    if (r % 2 === 0) {
      doc
        .save()
        .rect(x, doc.y - 1, pageWidth, rowHeight)
        .fillColor("#f5f5f5")
        .fill()
        .restore();
    }

    colX = x;
    for (let c = 0; c < rows[r].length; c++) {
      const colW = pageWidth * colRatios[c];
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#333333")
        .text(rows[r][c], colX + rowPadding, doc.y + 3, {
          width: colW - rowPadding * 2,
          align: c === 0 ? "left" : "right",
        });
      if (c < rows[r].length - 1) doc.moveUp();
      colX += colW;
    }

    doc.y += rowHeight;
  }

  // Total row
  const totalCount = rows.reduce(
    (sum, row) => sum + parseInt(row[1], 10),
    0
  );

  doc
    .save()
    .rect(x, doc.y, pageWidth, rowHeight)
    .fillColor("#e0e0e0")
    .fill()
    .restore();

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("Total", x + rowPadding, doc.y + 3, {
      width: pageWidth * colRatios[0] - rowPadding * 2,
      align: "left",
    });

  doc.moveUp();

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text(
      totalCount.toLocaleString(),
      x + pageWidth * colRatios[0] + rowPadding,
      doc.y + 3,
      {
        width: pageWidth * colRatios[1] - rowPadding * 2,
        align: "right",
      }
    );

  doc.moveUp();

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text(
      "100.0%",
      x + pageWidth * (colRatios[0] + colRatios[1]) + rowPadding,
      doc.y + 3,
      {
        width: pageWidth * colRatios[2] - rowPadding * 2,
        align: "right",
      }
    );

  doc.y += rowHeight + 2;
}

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
        "CONFIDENTIAL - Virology Communication Dashboard Analytics Report",
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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatMonthLabel(monthStr: string): string {
  // Input is like "2024-01" or "2024-12"
  try {
    const [year, month] = monthStr.split("-");
    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  } catch {
    return monthStr;
  }
}
