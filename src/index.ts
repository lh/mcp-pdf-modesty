#!/usr/bin/env node

/**
 * MCP PDF Server - PDF text extraction using pdf2json
 *
 * This MCP server wraps the pdf2json library (https://github.com/modesty/pdf2json)
 * to provide PDF text extraction capabilities through the Model Context Protocol.
 *
 * Original pdf2json library created by Modesty Zhang
 * MCP wrapper implementation by Rose
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import PDFParser from "pdf2json";
import { promises as fs } from "fs";
import { resolve, normalize } from "path";
import { statSync } from "fs";
import type {
  PDFData,
  ExtractTextArgs,
  ExtractFormFieldsArgs,
  ExtractTextJSONResponse,
  FormFieldInfo,
} from "./types.js";

// Security constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
const ALLOWED_EXTENSIONS = [".pdf"];
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

// Security validation functions
export function isPathSafe(filePath: string): boolean {
  // Normalize the path to prevent directory traversal
  const normalizedPath = normalize(filePath);
  const resolvedPath = resolve(normalizedPath);

  // Check if the resolved path contains any directory traversal attempts
  if (normalizedPath.includes("..") || normalizedPath.includes("~")) {
    return false;
  }

  // Additional check for absolute paths trying to access system directories
  const dangerousPaths = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/dev",
    "/proc",
    "/sys",
    "C:\\Windows",
    "C:\\Program Files",
  ];
  const lowerPath = resolvedPath.toLowerCase();

  for (const dangerous of dangerousPaths) {
    if (lowerPath.startsWith(dangerous.toLowerCase())) {
      return false;
    }
  }

  return true;
}

export async function validatePDFFile(filePath: string): Promise<void> {
  // Check path safety
  if (!isPathSafe(filePath)) {
    throw new Error("Invalid file path: potential security risk detected");
  }

  const resolvedPath = resolve(filePath);

  // Check file exists
  try {
    await fs.access(resolvedPath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  // Check file extension
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf("."));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid file type. Only PDF files are allowed. Got: ${ext}`);
  }

  // Check file size
  const stats = statSync(resolvedPath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Check if it's actually a file (not a directory)
  if (!stats.isFile()) {
    throw new Error("Path must point to a file, not a directory");
  }

  // Check PDF magic bytes
  const fileHandle = await fs.open(resolvedPath, "r");
  try {
    const buffer = Buffer.alloc(4);
    await fileHandle.read(buffer, 0, 4, 0);

    if (!buffer.equals(PDF_MAGIC_BYTES)) {
      throw new Error("Invalid PDF file: missing PDF signature");
    }
  } finally {
    await fileHandle.close();
  }
}

// Define our tools
const TOOLS: Tool[] = [
  {
    name: "extract_text",
    description: "Extract text content from a PDF file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the PDF file",
        },
        format: {
          type: "string",
          enum: ["text", "json", "detailed"],
          description:
            "Output format: 'text' for plain text, 'json' for structured data, 'detailed' for full metadata",
          default: "text",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "extract_form_fields",
    description: "Extract form fields from a PDF file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the PDF file",
        },
      },
      required: ["path"],
    },
  },
];

// Create the server instance
const server = new Server(
  {
    name: "mcp-pdf-modesty",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Helper function to parse PDF with timeout
async function parsePDF(filePath: string): Promise<PDFData> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    // Set a timeout to prevent hanging on malformed PDFs
    const timeout = setTimeout(() => {
      reject(new Error("PDF parsing timeout: file took too long to process"));
    }, 30000); // 30 second timeout

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      clearTimeout(timeout);
      resolve(pdfData);
    });

    pdfParser.on("pdfParser_dataError", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    try {
      void pdfParser.loadPDF(filePath);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Helper function to extract text from parsed PDF data
function extractText(pdfData: PDFData): string {
  let text = "";

  if (pdfData.Pages) {
    for (const page of pdfData.Pages) {
      if (page.Texts) {
        for (const textItem of page.Texts) {
          if (textItem.R) {
            for (const textRun of textItem.R) {
              if (textRun.T) {
                // Decode URI component to handle special characters
                text += decodeURIComponent(textRun.T) + " ";
              }
            }
          }
        }
        text += "\n";
      }
    }
  }

  return text.trim();
}

// Helper function to extract form fields
function extractFormFields(pdfData: PDFData): FormFieldInfo[] {
  const fields: FormFieldInfo[] = [];

  // PDF form fields are stored in Pages, not at the root level
  if (pdfData.Pages) {
    for (const page of pdfData.Pages) {
      if (page.Fields) {
        for (const field of page.Fields) {
          // Map the pdf2json field structure to our simplified structure
          fields.push({
            name: field.id?.Id || "unnamed",
            type: field.T?.Name || "unknown",
            value: "", // pdf2json doesn't directly expose field values in the type
            options: [], // pdf2json doesn't directly expose options in the type
          });
        }
      }
    }
  }

  return fields;
}

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "extract_text": {
        const { path: filePath, format = "text" } = args as unknown as ExtractTextArgs;

        // Validate the PDF file (includes security checks)
        await validatePDFFile(filePath);

        // Resolve the file path
        const resolvedPath = resolve(filePath);

        // Parse the PDF
        const pdfData = await parsePDF(resolvedPath);

        let result: string | ExtractTextJSONResponse | PDFData;

        switch (format) {
          case "text":
            result = extractText(pdfData);
            break;
          case "json":
            result = {
              pages: pdfData.Pages?.length || 0,
              text: extractText(pdfData),
              metadata: {
                title: String(pdfData.Meta?.Title || ""),
                author: String(pdfData.Meta?.Author || ""),
                subject: String(pdfData.Meta?.Subject || ""),
                creator: String(pdfData.Meta?.Creator || ""),
                producer: String(pdfData.Meta?.Producer || ""),
                creationDate: String(pdfData.Meta?.CreationDate || ""),
                modificationDate: String(pdfData.Meta?.ModDate || ""),
              },
            };
            break;
          case "detailed":
            result = pdfData;
            break;
          default:
            result = extractText(pdfData);
        }

        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "extract_form_fields": {
        const { path: filePath } = args as unknown as ExtractFormFieldsArgs;

        // Validate the PDF file (includes security checks)
        await validatePDFFile(filePath);

        // Resolve the file path
        const resolvedPath = resolve(filePath);

        // Parse the PDF
        const pdfData = await parsePDF(resolvedPath);

        // Extract form fields
        const fields = extractFormFields(pdfData);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fields, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP PDF Server (using pdf2json) running on stdio");
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
