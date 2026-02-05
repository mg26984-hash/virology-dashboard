import { extractVirologyData } from "./server/documentProcessor.js";

const testUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030645861/n8MPugiTXDQnrheaaMVyV7/virology-reports/1/DMiby2cA91gh-9o1pnHC0-test-report.jpg";

console.log("Testing LLM extraction...");
console.log("URL:", testUrl);
try {
  const result = await extractVirologyData(testUrl);
  console.log("Result:", JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Error:", error);
}
