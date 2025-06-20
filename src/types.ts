/**
 * Type definitions for MCP PDF Server
 */

// Import the actual types from pdf2json
import type { Output as PDFData } from "pdf2json";

// Re-export the main type
export type { PDFData };

// Tool argument types
export interface ExtractTextArgs {
  path: string;
  format?: "text" | "json" | "detailed";
}

export interface ExtractFormFieldsArgs {
  path: string;
}

// Response types
export interface ExtractTextJSONResponse {
  pages: number;
  text: string;
  metadata: {
    title: string;
    author: string;
    subject: string;
    creator: string;
    producer: string;
    creationDate: string;
    modificationDate: string;
  };
}

export interface FormFieldInfo {
  name: string;
  type: string;
  value: string;
  options: string[];
}
