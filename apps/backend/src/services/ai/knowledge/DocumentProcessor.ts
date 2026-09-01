import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
// @ts-ignore
import PDFParser from 'pdf2json';

export class DocumentProcessor {
  private splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  }

  async processPdf(buffer: Buffer): Promise<string[]> {
    try {
      const text = await this.extractText(buffer);

      // Clean text while preserving Unicode characters (Indonesian, etc.)
      const cleanText = text
        .replace(/\r\n/g, "\n")           // Normalize line endings
        .replace(/\n{3,}/g, "\n\n")       // Max 2 consecutive newlines
        .replace(/[ \t]+/g, " ")          // Collapse multiple spaces/tabs to single space
        .replace(/ +\n/g, "\n")           // Remove trailing spaces before newlines
        .replace(/\n +/g, "\n")           // Remove leading spaces after newlines
        .trim();

      if (!cleanText) {
        throw new Error("No text content extracted from PDF");
      }

      return await this.splitter.splitText(cleanText);
    } catch (error) {
      // Handle specific PDF errors with user-friendly messages
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("unsupported encryption algorithm")) {
        throw new Error(
          "PDF is encrypted or password-protected. Please upload an unprotected PDF."
        );
      }

      if (errorMessage.includes("Invalid count value: Infinity")) {
        throw new Error(
          "PDF has unsupported formatting. Please try re-exporting the PDF or use a simpler format."
        );
      }

      console.error("Error processing PDF:", error);
      throw error;
    }
  }

  private extractText(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser(null, 1 as any);

      pdfParser.on("pdfParser_dataError", (errData: any) => {
        reject(errData.parserError);
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          // Manual extraction to avoid getRawTextContent() bug with Infinity
          const text = this.extractTextFromPdfData(pdfData);
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });

      pdfParser.parseBuffer(buffer);
    });
  }

  private extractTextFromPdfData(pdfData: any): string {
    const textParts: string[] = [];
    let lastY: number | null = null;
    let lastX: number | null = null;

    // pdfData.Pages contains array of pages
    const pages = pdfData.Pages || [];

    for (const page of pages) {
      const texts = page.Texts || [];

      // Sort texts by Y position (top to bottom), then X (left to right)
      const sortedTexts = [...texts].sort((a: any, b: any) => {
        const yDiff = (a.y || 0) - (b.y || 0);
        if (Math.abs(yDiff) > 0.5) return yDiff;
        return (a.x || 0) - (b.x || 0);
      });

      for (const textItem of sortedTexts) {
        if (textItem.R && Array.isArray(textItem.R)) {
          // Check if this is a new line (Y position changed significantly)
          const currentY = textItem.y || 0;
          const currentX = textItem.x || 0;
          
          if (lastY !== null && Math.abs(currentY - lastY) > 0.5) {
            textParts.push("\n");
          } else if (lastX !== null && currentX - lastX > 2) {
            // Add space if there's a significant horizontal gap
            textParts.push(" ");
          }
          
          lastY = currentY;
          lastX = currentX;

          for (const run of textItem.R) {
            if (run.T) {
              // Decode URI-encoded text, fallback to raw if malformed
              try {
                const decoded = decodeURIComponent(run.T);
                textParts.push(decoded);
              } catch {
                // If URI malformed, use raw text (replace %XX patterns)
                const raw = run.T.replace(/%[0-9A-Fa-f]{2}/g, " ");
                textParts.push(raw);
              }
            }
          }
        }
      }

      // Add page break
      textParts.push("\n\n");
      lastY = null;
      lastX = null;
    }

    return textParts.join("");
  }
}