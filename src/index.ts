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
import { resolve } from "path";

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
          description: "Path to the PDF file"
        },
        format: {
          type: "string",
          enum: ["text", "json", "detailed"],
          description: "Output format: 'text' for plain text, 'json' for structured data, 'detailed' for full metadata",
          default: "text"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "extract_form_fields",
    description: "Extract form fields from a PDF file",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the PDF file"
        }
      },
      required: ["path"]
    }
  }
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

// Helper function to parse PDF
async function parsePDF(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      resolve(pdfData);
    });
    
    pdfParser.on("pdfParser_dataError", (error) => {
      reject(error);
    });
    
    pdfParser.loadPDF(filePath);
  });
}

// Helper function to extract text from parsed PDF data
function extractText(pdfData: any): string {
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
function extractFormFields(pdfData: any): any[] {
  const fields: any[] = [];
  
  if (pdfData.Fields) {
    for (const field of pdfData.Fields) {
      fields.push({
        name: field.id?.Id || "unnamed",
        type: field.id?.Type || "unknown",
        value: field.V || "",
        options: field.Opts || []
      });
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
        const { path: filePath, format = "text" } = args as any;
        
        // Resolve the file path
        const resolvedPath = resolve(filePath);
        
        // Check if file exists
        await fs.access(resolvedPath);
        
        // Parse the PDF
        const pdfData = await parsePDF(resolvedPath);
        
        let result: any;
        
        switch (format) {
          case "text":
            result = extractText(pdfData);
            break;
          case "json":
            result = {
              pages: pdfData.Pages?.length || 0,
              text: extractText(pdfData),
              metadata: {
                title: pdfData.Meta?.Title || "",
                author: pdfData.Meta?.Author || "",
                subject: pdfData.Meta?.Subject || "",
                creator: pdfData.Meta?.Creator || "",
                producer: pdfData.Meta?.Producer || "",
                creationDate: pdfData.Meta?.CreationDate || "",
                modificationDate: pdfData.Meta?.ModDate || ""
              }
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
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      }
      
      case "extract_form_fields": {
        const { path: filePath } = args as any;
        
        // Resolve the file path
        const resolvedPath = resolve(filePath);
        
        // Check if file exists
        await fs.access(resolvedPath);
        
        // Parse the PDF
        const pdfData = await parsePDF(resolvedPath);
        
        // Extract form fields
        const fields = extractFormFields(pdfData);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fields, null, 2)
            }
          ]
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
          text: `Error: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP PDF Server (using pdf2json) running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});