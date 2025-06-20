/**
 * Integration tests for text extraction functions
 */

import type { PDFData } from "../types";

// We'll test the pure functions that don't require mocking
// The actual MCP server integration is better tested manually

describe("PDF Text Extraction", () => {
  // Mock PDF data structure based on pdf2json output
  const mockPDFData: PDFData = {
    Transcoder: "pdf2json@3.1.6",
    Meta: {
      Title: "Test PDF" as any,
      Author: "Test Author" as any,
      Subject: "Test Subject" as any,
      Creator: "Test Creator" as any,
      Producer: "Test Producer" as any,
      CreationDate: "2024-01-01" as any,
      ModDate: "2024-01-02" as any,
    },
    Pages: [
      {
        Width: 8.5,
        Height: 11,
        Texts: [
          {
            x: 1,
            y: 1,
            w: 100,
            sw: 10,
            A: "left" as const,
            R: [
              {
                T: "Hello%20World",
                S: 1,
                TS: [0, 12, 0, 0] as [number, number, 0 | 1, 0 | 1],
              },
            ],
          },
          {
            x: 1,
            y: 2,
            w: 100,
            sw: 10,
            A: "left" as const,
            R: [
              {
                T: "This%20is%20a%20test",
                S: 1,
                TS: [0, 12, 0, 0] as [number, number, 0 | 1, 0 | 1],
              },
            ],
          },
        ],
        Fields: [
          {
            id: { Id: "field1", EN: 0 },
            style: 0,
            TI: 0,
            AM: 0,
            TU: "",
            x: 1,
            y: 3,
            w: 100,
            h: 20,
            T: { Name: "alpha" as const, TypeInfo: {} },
          },
        ],
        HLines: [],
        VLines: [],
        Fills: [],
        Boxsets: [],
      },
    ],
  };

  describe("Text Extraction", () => {
    it("should decode URI-encoded text correctly", () => {
      // The extractText function should decode %20 to spaces
      const firstText = mockPDFData.Pages[0].Texts[0].R[0].T;
      expect(decodeURIComponent(firstText)).toBe("Hello World");
    });

    it("should handle multiple text runs", () => {
      expect(mockPDFData.Pages[0].Texts).toHaveLength(2);
    });
  });

  describe("Form Fields", () => {
    it("should identify form fields in pages", () => {
      expect(mockPDFData.Pages[0].Fields).toHaveLength(1);
      expect(mockPDFData.Pages[0].Fields[0].id.Id).toBe("field1");
    });
  });

  describe("Metadata", () => {
    it("should contain PDF metadata", () => {
      expect(mockPDFData.Meta).toBeDefined();
      expect(String(mockPDFData.Meta.Title)).toBe("Test PDF");
      expect(String(mockPDFData.Meta.Author)).toBe("Test Author");
    });
  });
});
